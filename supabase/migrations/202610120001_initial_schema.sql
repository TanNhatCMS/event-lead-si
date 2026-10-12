create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  default_locale text not null default 'vi-VN',
  timezone text not null default 'Asia/Ho_Chi_Minh',
  retention_days integer check (retention_days is null or retention_days between 1 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);

create index memberships_user_active_idx on public.memberships(user_id, organization_id) where status = 'active';

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

create or replace function public.create_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_org_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if length(trim(org_name)) < 1 or length(trim(org_name)) > 160 then
    raise exception using errcode = '22023', message = 'Organization name must be 1-160 characters';
  end if;
  insert into public.organizations (name) values (trim(org_name)) returning id into created_org_id;
  insert into public.memberships (organization_id, user_id, role, status)
  values (created_org_id, auth.uid(), 'owner', 'active');
  return created_org_id;
end;
$$;

revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  owner_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legal_name text,
  display_name text not null check (length(trim(display_name)) between 1 and 240),
  country_code char(2),
  website text,
  industry text,
  market_summary text,
  employee_size_range text,
  founded_year smallint check (founded_year is null or founded_year between 1000 and 2200),
  products_summary text,
  tax_or_registration_id text,
  profile_state text not null default 'user_provided'
    check (profile_state in ('user_provided', 'partially_verified', 'verified', 'needs_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create index companies_org_name_idx on public.companies(organization_id, lower(display_name));

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid,
  full_name text not null check (length(trim(full_name)) between 1 and 240),
  job_title text,
  email text,
  phone text,
  address text,
  preferred_language text,
  owner_user_id uuid not null references auth.users(id),
  relationship_stage text not null default 'new',
  labels text[] not null default '{}',
  schema_version integer not null default 1 check (schema_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, company_id) references public.companies(organization_id, id)
);

create index contacts_org_name_idx on public.contacts(organization_id, lower(full_name)) where archived_at is null;
create index contacts_org_email_idx on public.contacts(organization_id, lower(email)) where email is not null and archived_at is null;
create index contacts_org_company_idx on public.contacts(organization_id, company_id) where archived_at is null;

create table public.event_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  contact_id uuid not null,
  met_at timestamptz,
  context_summary text,
  needs text,
  opportunity text,
  next_step text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, event_id) references public.events(organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id) on delete cascade
);

create index event_contacts_org_event_idx on public.event_contacts(organization_id, event_id);
create index event_contacts_org_contact_idx on public.event_contacts(organization_id, contact_id);

create table public.card_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  storage_path text not null,
  media_type text not null check (media_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  file_size bigint not null check (file_size between 1 and 10485760),
  batch_id uuid,
  state text not null default 'uploaded'
    check (state in ('uploaded', 'processing', 'needs_review', 'confirmed', 'rejected', 'failed')),
  schema_version integer not null default 1 check (schema_version > 0),
  recognition_provider text,
  recognition_model text,
  recognition_result jsonb,
  confirmed_contact_id uuid,
  error_code text,
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, confirmed_contact_id) references public.contacts(organization_id, id)
);

create index card_imports_org_state_idx on public.card_imports(organization_id, state, created_at desc);
create index card_imports_batch_idx on public.card_imports(organization_id, batch_id) where batch_id is not null;

create table public.contact_field_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  field_name text not null,
  raw_value text,
  normalized_value text,
  value_snapshot text,
  schema_version integer not null default 1 check (schema_version > 0),
  source_type text not null check (source_type in ('card_ocr', 'user', 'public_source', 'ai_inference', 'integration')),
  source_reference text,
  retrieved_at timestamptz,
  verification_state text not null default 'unreviewed'
    check (verification_state in ('unreviewed', 'user_confirmed', 'source_verified', 'inferred', 'uncertain', 'unavailable')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id) on delete cascade
);

create index contact_field_evidence_lookup_idx on public.contact_field_evidence(organization_id, contact_id, field_name, created_at desc);

create table public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid,
  contact_id uuid not null,
  author_user_id uuid not null references auth.users(id),
  body text not null check (length(body) <= 20000),
  note_type text not null default 'meeting_note'
    check (note_type in ('meeting_note', 'need', 'opportunity', 'next_step')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (organization_id, event_id) references public.events(organization_id, id),
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id) on delete cascade
);

create index meeting_notes_contact_idx on public.meeting_notes(organization_id, contact_id, created_at desc) where deleted_at is null;

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  event_id uuid,
  owner_user_id uuid not null references auth.users(id),
  channel text not null default 'email',
  subject text,
  body text not null,
  source_context_ids uuid[] not null default '{}',
  prompt_version text,
  state text not null default 'draft' check (state in ('draft', 'approved', 'dismissed', 'manually_sent', 'expired')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  remind_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, contact_id) references public.contacts(organization_id, id) on delete cascade,
  foreign key (organization_id, event_id) references public.events(organization_id, id),
  check ((state <> 'approved') or (approved_by is not null and approved_at is not null))
);

create index follow_ups_due_idx on public.follow_ups(organization_id, remind_at) where remind_at is not null and state = 'approved';

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  format text not null check (format in ('vcard', 'csv')),
  state text not null default 'queued' check (state in ('queued', 'processing', 'completed', 'partial', 'failed', 'expired')),
  selected_contact_ids uuid[] not null,
  selected_count integer not null default 0 check (selected_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  result_path text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  record_type text not null,
  record_id uuid,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_log_org_created_idx on public.audit_log(organization_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['organizations', 'events', 'companies', 'contacts', 'card_imports', 'meeting_notes', 'follow_ups', 'export_jobs'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.events enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.event_contacts enable row level security;
alter table public.card_imports enable row level security;
alter table public.contact_field_evidence enable row level security;
alter table public.meeting_notes enable row level security;
alter table public.follow_ups enable row level security;
alter table public.export_jobs enable row level security;
alter table public.audit_log enable row level security;

create policy organizations_select_member on public.organizations for select to authenticated using (public.is_org_member(id));
create policy organizations_update_admin on public.organizations for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy memberships_select_org on public.memberships for select to authenticated using (public.is_org_member(organization_id));
create policy memberships_manage_admin on public.memberships for all to authenticated using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy events_org_access on public.events for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy companies_org_access on public.companies for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy contacts_org_access on public.contacts for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy event_contacts_org_access on public.event_contacts for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy card_imports_org_access on public.card_imports for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy contact_field_evidence_org_access on public.contact_field_evidence for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy meeting_notes_org_access on public.meeting_notes for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy follow_ups_org_access on public.follow_ups for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy export_jobs_org_access on public.export_jobs for all to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy audit_log_select_admin on public.audit_log for select to authenticated using (public.is_org_admin(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-cards', 'business-cards', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy business_cards_read_org on storage.objects for select to authenticated
using (bucket_id = 'business-cards' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy business_cards_upload_org on storage.objects for insert to authenticated
with check (bucket_id = 'business-cards' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy business_cards_update_org on storage.objects for update to authenticated
using (bucket_id = 'business-cards' and public.is_org_member((storage.foldername(name))[1]::uuid))
with check (bucket_id = 'business-cards' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy business_cards_delete_admin on storage.objects for delete to authenticated
using (bucket_id = 'business-cards' and public.is_org_admin((storage.foldername(name))[1]::uuid));

create or replace function public.confirm_card_import(
  p_import_id uuid,
  p_confirmed_fields jsonb,
  p_event_id uuid default null,
  p_meeting_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  import_row public.card_imports%rowtype;
  new_contact_id uuid;
  new_company_id uuid;
  company_label text;
  full_name_value text;
  language_value text;
  field_row record;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  select * into import_row
  from public.card_imports
  where id = p_import_id
  for update;

  if not found or not public.is_org_member(import_row.organization_id) then
    raise exception using errcode = '42501', message = 'Import not available';
  end if;
  if import_row.state <> 'needs_review' then
    raise exception using errcode = '55000', message = 'Import is not ready for confirmation';
  end if;

  full_name_value := nullif(trim(p_confirmed_fields #>> '{fields,fullName,normalizedValue}'), '');
  if full_name_value is null then
    raise exception using errcode = '22023', message = 'A confirmed full name is required';
  end if;

  company_label := nullif(trim(p_confirmed_fields #>> '{fields,companyName,normalizedValue}'), '');
  language_value := nullif(p_confirmed_fields ->> 'detectedLanguage', 'unknown');

  if company_label is not null then
    insert into public.companies (organization_id, display_name, profile_state)
    values (import_row.organization_id, company_label, 'user_provided')
    returning id into new_company_id;
  end if;

  insert into public.contacts (
    organization_id, company_id, full_name, job_title, email, phone, address,
    preferred_language, owner_user_id, schema_version
  ) values (
    import_row.organization_id,
    new_company_id,
    full_name_value,
    nullif(trim(p_confirmed_fields #>> '{fields,jobTitle,normalizedValue}'), ''),
    nullif(trim(p_confirmed_fields #>> '{fields,email,normalizedValue}'), ''),
    nullif(trim(p_confirmed_fields #>> '{fields,phone,normalizedValue}'), ''),
    nullif(trim(p_confirmed_fields #>> '{fields,address,normalizedValue}'), ''),
    language_value,
    auth.uid(),
    import_row.schema_version
  ) returning id into new_contact_id;

  for field_row in
    select * from (values
      ('fullName', 'full_name'),
      ('jobTitle', 'job_title'),
      ('companyName', 'company_name'),
      ('email', 'email'),
      ('phone', 'phone'),
      ('address', 'address'),
      ('website', 'website')
    ) as field_map(json_key, field_name)
  loop
    insert into public.contact_field_evidence (
      organization_id, contact_id, field_name, raw_value, normalized_value,
      value_snapshot, schema_version, source_type, source_reference,
      verification_state, reviewed_by, reviewed_at
    ) values (
      import_row.organization_id,
      new_contact_id,
      field_row.field_name,
      nullif(trim(p_confirmed_fields #>> array['fields', field_row.json_key, 'rawValue']), ''),
      nullif(trim(p_confirmed_fields #>> array['fields', field_row.json_key, 'normalizedValue']), ''),
      nullif(trim(p_confirmed_fields #>> array['fields', field_row.json_key, 'normalizedValue']), ''),
      import_row.schema_version,
      'card_ocr',
      p_import_id::text,
      case
        when nullif(trim(p_confirmed_fields #>> array['fields', field_row.json_key, 'normalizedValue']), '') is null then 'unavailable'
        else 'user_confirmed'
      end,
      auth.uid(),
      now()
    );
  end loop;

  if p_event_id is not null then
    if not exists (
      select 1 from public.events e
      where e.id = p_event_id and e.organization_id = import_row.organization_id
    ) then
      raise exception using errcode = '42501', message = 'Event not available';
    end if;
    insert into public.event_contacts (
      organization_id, event_id, contact_id, context_summary, needs, opportunity, next_step
    ) values (
      import_row.organization_id,
      p_event_id,
      new_contact_id,
      nullif(p_meeting_context ->> 'contextSummary', ''),
      nullif(p_meeting_context ->> 'needs', ''),
      nullif(p_meeting_context ->> 'opportunity', ''),
      nullif(p_meeting_context ->> 'nextStep', '')
    );
  end if;

  update public.card_imports
  set state = 'confirmed', confirmed_contact_id = new_contact_id, processed_at = now()
  where id = p_import_id;

  insert into public.audit_log (organization_id, actor_user_id, action, record_type, record_id)
  values (import_row.organization_id, auth.uid(), 'card_import.confirmed', 'contact', new_contact_id);

  return new_contact_id;
end;
$$;

revoke all on function public.confirm_card_import(uuid, jsonb, uuid, jsonb) from public;
grant execute on function public.confirm_card_import(uuid, jsonb, uuid, jsonb) to authenticated;
