-- Quản lý prompts AI (cho phép user tùy chỉnh system prompt qua UI).
create table public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null,
  name text not null,
  description text,
  content text not null,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, prompt_key)
);

create index ai_prompts_user_idx on public.ai_prompts(user_id);

alter table public.ai_prompts enable row level security;

create policy ai_prompts_owner_all on public.ai_prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.ai_prompts is 'System prompts AI do user tùy chỉnh qua UI. Mỗi user có một bản cho mỗi prompt_key; nội dung mặc định nằm trong code (lib/ai/prompts/defaults.ts).';
