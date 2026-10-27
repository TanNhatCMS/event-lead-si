-- Agent tooling: cấu hình năng lực cho các agent (MCP servers, Skills,
-- Hooks, Plugins) — quản lý ở trang /admin/agent.
--
-- Bảng đều user-scoped (RLS auth.uid() = user_id): mỗi người dùng tự cấu
-- hình agent của mình. Secrets (header auth của MCP server) lưu 1 chiều —
-- API không trả lại giá trị headers sau khi tạo.

-- ---------------------------------------------------------------------------
-- MCP servers: endpoint streamable-http/sse mà agent được nối tới để lấy tool
-- ---------------------------------------------------------------------------
create table public.agent_mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null
    check (char_length(name) between 1 and 80),
  url text not null
    check (char_length(url) between 1 and 500),
  headers jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.agent_mcp_servers enable row level security;

create policy agent_mcp_servers_select
  on public.agent_mcp_servers for select
  using (auth.uid() = user_id);
create policy agent_mcp_servers_insert
  on public.agent_mcp_servers for insert
  with check (auth.uid() = user_id);
create policy agent_mcp_servers_update
  on public.agent_mcp_servers for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy agent_mcp_servers_delete
  on public.agent_mcp_servers for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Skills: hướng dẫn dạng markdown do người dùng viết, được inject vào system
-- prompt của agent loop (bên cạnh skill file mặc định trong skills/)
-- ---------------------------------------------------------------------------
create table public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null
    check (char_length(name) between 1 and 80),
  description text not null default ''
    check (char_length(description) <= 300),
  content text not null
    check (char_length(content) between 1 and 20000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.agent_skills enable row level security;

create policy agent_skills_select
  on public.agent_skills for select
  using (auth.uid() = user_id);
create policy agent_skills_insert
  on public.agent_skills for insert
  with check (auth.uid() = user_id);
create policy agent_skills_update
  on public.agent_skills for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy agent_skills_delete
  on public.agent_skills for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Config: hooks + plugins (toggle) — mỗi user một dòng, jsonb để thêm loại
-- cấu hình mới mà không cần migration
-- ---------------------------------------------------------------------------
create table public.agent_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hooks jsonb not null default '{}'::jsonb,
  plugins jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.agent_config enable row level security;

create policy agent_config_select
  on public.agent_config for select
  using (auth.uid() = user_id);
create policy agent_config_insert
  on public.agent_config for insert
  with check (auth.uid() = user_id);
create policy agent_config_update
  on public.agent_config for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
