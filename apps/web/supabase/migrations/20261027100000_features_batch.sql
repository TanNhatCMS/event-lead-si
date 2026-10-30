-- Nền tảng cho 4 tính năng mới: Event session, Follow-up queue (US3),
-- Webhook outgoing, Share link cho contact. Các agent code trên schema này.

-- ---------------------------------------------------------------------------
-- Events: phiên sự kiện — gom contact theo lần đi sự kiện
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy events_select on public.events for select using (auth.uid() = user_id);
create policy events_insert on public.events for insert with check (auth.uid() = user_id);
create policy events_update on public.events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy events_delete on public.events for delete using (auth.uid() = user_id);

-- Contact gắn vào sự kiện khi quét.
alter table public.contacts
  add column if not exists event_id uuid references public.events(id) on delete set null;

-- Share link công khai cho contact (pattern như companies.share_token).
alter table public.contacts
  add column if not exists share_token uuid unique default gen_random_uuid();

-- ---------------------------------------------------------------------------
-- Follow-ups: US3 — AI soạn nháp, người duyệt, đánh dấu đã gửi
-- ---------------------------------------------------------------------------
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sent', 'dismissed')),
  channel text not null default 'email',
  subject text,
  body text not null,
  generated_by text not null default 'ai',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index follow_ups_user_status on public.follow_ups (user_id, status, created_at desc);

alter table public.follow_ups enable row level security;

create policy follow_ups_select on public.follow_ups for select using (auth.uid() = user_id);
create policy follow_ups_insert on public.follow_ups for insert with check (auth.uid() = user_id);
create policy follow_ups_update on public.follow_ups for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy follow_ups_delete on public.follow_ups for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Budgets: ngưỡng chi phí/tháng theo capability (jsonb — không cần migration
-- cho từng loại). Shape: { "<capability>": { "monthly_usd": number } }
-- ---------------------------------------------------------------------------
alter table public.agent_config
  add column if not exists budgets jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Outgoing webhooks: app gọi ra ngoài khi có sự kiện (contact.created,
-- followup.sent, card.confirmed) — đối xứng với TinyFish webhook receiver.
-- ---------------------------------------------------------------------------
create table public.outgoing_webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null check (url like 'https://%'),
  events jsonb not null default '["contact.created","followup.sent","card.confirmed"]'::jsonb,
  secret text not null default gen_random_uuid()::text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.outgoing_webhooks enable row level security;

create policy outgoing_webhooks_select
  on public.outgoing_webhooks for select using (auth.uid() = user_id);
create policy outgoing_webhooks_insert
  on public.outgoing_webhooks for insert with check (auth.uid() = user_id);
create policy outgoing_webhooks_update
  on public.outgoing_webhooks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy outgoing_webhooks_delete
  on public.outgoing_webhooks for delete using (auth.uid() = user_id);
