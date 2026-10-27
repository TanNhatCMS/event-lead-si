-- TinyFish dashboard 管理（/admin/agent）：key 存 DB（write-only，不走
-- env）+ webhook 回调事件表。
--
-- Agent/Fetch 回调认证无 signature —— docs 方案是回调后用 key 回查
-- GET agent.tinyfish.ai/v1/runs/{run_id} 验证；未通过验证的 payload 不落库。

-- agent_config 增加凭据列：{ "tinyfish_api_key": "sk-tinyfish-..." }
-- RLS 沿用原表（user_id = auth.uid()）。
alter table public.agent_config
  add column if not exists credentials jsonb not null default '{}'::jsonb;

-- Webhook 回调事件（TinyFish → app）
create table public.agent_tinyfish_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id text not null,
  event text not null,
  status text,
  verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, event)
);

create index agent_tinyfish_events_user_created
  on public.agent_tinyfish_events (user_id, created_at desc);

alter table public.agent_tinyfish_events enable row level security;

create policy agent_tinyfish_events_select
  on public.agent_tinyfish_events for select
  using (auth.uid() = user_id);
create policy agent_tinyfish_events_insert
  on public.agent_tinyfish_events for insert
  with check (auth.uid() = user_id);
