-- EventLead single-user schema.
--
-- Quyết định kiến trúc: BỎ organizations/memberships. Mọi bảng thuộc về
-- người dùng trực tiếp qua user_id (uuid, references auth.users, on delete cascade).
-- Không tạo organizations, memberships, events, event_contacts, follow_ups,
-- export_jobs, audit_log (ngoài scope single-user MVP).
--
-- Không xung đột với migration gốc của kit (20241219010757_schema.sql):
-- kit chỉ tạo public.accounts, bucket 'account_image' và function kit.*.

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

-- ============================== companies ==============================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
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
  share_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_user_name_idx on public.companies(user_id, lower(display_name));

-- ============================== contacts ==============================

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 1 and 240),
  job_title text,
  email text,
  phone text,
  address text,
  preferred_language text,
  owner_user_id uuid references auth.users(id),
  relationship_stage text not null default 'new',
  labels text[] not null default '{}',
  schema_version integer not null default 1 check (schema_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index contacts_user_name_idx on public.contacts(user_id, lower(full_name)) where archived_at is null;
create index contacts_user_email_idx on public.contacts(user_id, lower(email)) where email is not null and archived_at is null;
create index contacts_user_company_idx on public.contacts(user_id, company_id) where archived_at is null;

-- ============================ card_imports =============================

create table public.card_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submitted_by uuid references auth.users(id),
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
  confirmed_contact_id uuid references public.contacts(id),
  error_code text,
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index card_imports_user_state_idx on public.card_imports(user_id, state, created_at desc);

-- ======================== contact_field_evidence =======================

create table public.contact_field_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
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
  created_at timestamptz not null default now()
);

create index contact_field_evidence_lookup_idx on public.contact_field_evidence(user_id, contact_id, field_name, created_at desc);

-- ============================ meeting_notes ============================

create table public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  author_user_id uuid not null references auth.users(id),
  body text not null check (length(body) <= 20000),
  note_type text not null default 'meeting_note'
    check (note_type in ('meeting_note', 'need', 'opportunity', 'next_step')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index meeting_notes_contact_idx on public.meeting_notes(user_id, contact_id, created_at desc) where deleted_at is null;

-- =========================== ai_model_configs ==========================

-- Cấu hình model AI theo người dùng (vd: provider nhận dạng danh thiếp).
--
-- QUAN TRỌNG: bảng này CHỈ lưu config KHÔNG nhạy cảm (tên provider, tên model,
-- cờ bật/tắt, tham số chung). TUYỆT ĐỐI KHÔNG lưu secrets (API keys, token)
-- ở đây. Secrets phải nằm trong biến môi trường server hoặc vault riêng.

create table public.ai_model_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  provider text not null,
  model text,
  enabled boolean not null default true,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, capability)
);

create index ai_model_configs_user_idx on public.ai_model_configs(user_id);

comment on table public.ai_model_configs is 'Cấu hình model AI theo người dùng và capability. Chỉ config không nhạy cảm — KHÔNG lưu API keys/secrets.';
comment on column public.ai_model_configs.capability is 'Tên năng lực AI, vd: card_recognition.';
comment on column public.ai_model_configs.provider is 'Tên provider, vd: mock. Không chứa credential.';
comment on column public.ai_model_configs.config is 'Tham số bổ sung dạng JSON object. Không chứa secret.';

-- ============================== triggers ===============================

do $$
declare table_name text;
begin
  foreach table_name in array array['companies', 'contacts', 'card_imports', 'meeting_notes', 'ai_model_configs'] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

-- ================================ RLS ==================================

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.card_imports enable row level security;
alter table public.contact_field_evidence enable row level security;
alter table public.meeting_notes enable row level security;
alter table public.ai_model_configs enable row level security;

create policy companies_owner_access on public.companies for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy contacts_owner_access on public.contacts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy card_imports_owner_access on public.card_imports for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy contact_field_evidence_owner_access on public.contact_field_evidence for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy meeting_notes_owner_access on public.meeting_notes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_model_configs_owner_access on public.ai_model_configs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ============================== storage ================================

-- Bucket business-cards: ảnh danh thiếp. Quy ước storage path: {user_id}/{import_id}
-- nên foldername(name)[1] luôn là uuid của chủ sở hữu file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-cards', 'business-cards', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy business_cards_select on storage.objects for select to authenticated
using (bucket_id = 'business-cards' and (storage.foldername(name))[1]::uuid = (select auth.uid()));
create policy business_cards_insert on storage.objects for insert to authenticated
with check (bucket_id = 'business-cards' and (storage.foldername(name))[1]::uuid = (select auth.uid()));
create policy business_cards_update on storage.objects for update to authenticated
using (bucket_id = 'business-cards' and (storage.foldername(name))[1]::uuid = (select auth.uid()))
with check (bucket_id = 'business-cards' and (storage.foldername(name))[1]::uuid = (select auth.uid()));
create policy business_cards_delete on storage.objects for delete to authenticated
using (bucket_id = 'business-cards' and (storage.foldername(name))[1]::uuid = (select auth.uid()));
