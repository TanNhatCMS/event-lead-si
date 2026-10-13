-- Phase 3 — Sourcing (FR-019, FR-021).
--
-- Single-user: mọi bảng thuộc về người dùng trực tiếp qua user_id.
-- RLS owner-only theo mẫu migration single-user.
--
-- sourcing_requests: yêu cầu tìm nhà cung cấp (sản phẩm, thị trường, tiêu chí).
-- sourcing_candidates: ứng viên cho từng yêu cầu — link tới contacts/companies
--   có sẵn hoặc nhập tay (name), kèm bằng chứng (evidence jsonb) và
--   shortlisted (danh sách ngắn).

create table public.sourcing_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  product_description text not null default '',
  target_market text,
  criteria jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sourcing_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null references public.sourcing_requests(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  name text not null check (char_length(name) between 1 and 240),
  notes text not null default '',
  evidence jsonb not null default '[]'::jsonb,
  fit_summary text,
  shortlisted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sourcing_requests_user_idx
  on public.sourcing_requests (user_id, created_at desc);
create index sourcing_candidates_request_idx
  on public.sourcing_candidates (user_id, request_id, created_at desc);

-- Trigger updated_at (dùng lại function public.set_updated_at()).
do $$
declare
  table_name text;
begin
  foreach table_name in array array['sourcing_requests', 'sourcing_candidates'] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I ' ||
      'for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end $$;

alter table public.sourcing_requests enable row level security;
alter table public.sourcing_candidates enable row level security;

create policy sourcing_requests_owner_access on public.sourcing_requests
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy sourcing_candidates_owner_access on public.sourcing_candidates
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
