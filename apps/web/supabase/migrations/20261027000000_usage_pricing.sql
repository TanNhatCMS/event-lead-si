-- Migration: thống kê token/chi phí AI + hệ thống giá model (2026-10-27)
--
-- 2 bảng:
-- - ai_usage: mỗi lượt gọi AI (enrichment / card_recognition / rag_chat /
--   embeddings) ghi một dòng token + cost. User-scoped: RLS select/insert
--   theo auth.uid() = user_id (service-role bỏ qua RLS).
-- - model_prices: bảng giá GLOBAL (không user_id) theo (provider, model),
--   đơn vị USD / 1 triệu token. RLS bật, policy SELECT cho authenticated
--   (frontend đọc để hiển thị); INSERT/UPDATE/DELETE KHÔNG có policy cho
--   authenticated — chỉ service-role (API /api/admin/prices) được ghi.
--
-- cost_usd NULL = model chưa có giá trong model_prices lúc ghi record.

-- ---------------------------------------------------------------------------
-- Bảng ai_usage: nhật ký tiêu thụ token theo lượt gọi
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 'enrichment' | 'card_recognition' | 'rag_chat' | 'embeddings'
  source text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_usd numeric(12, 6),
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_provider_model_idx on public.ai_usage (provider, model);

alter table public.ai_usage enable row level security;

create policy "ai_usage select own"
  on public.ai_usage for select to authenticated
  using (auth.uid() = user_id);

create policy "ai_usage insert own"
  on public.ai_usage for insert to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Bảng model_prices: giá model toàn cục (USD / 1M token)
-- ---------------------------------------------------------------------------
create table public.model_prices (
  provider text not null,
  model text not null,
  input_per_million numeric(14, 6) not null default 0,
  -- NULL = model không hỗ trợ cache giá rẻ hơn (cached tính như input thường)
  cached_input_per_million numeric(14, 6),
  output_per_million numeric(14, 6) not null default 0,
  -- 'manual' (admin nhập tay) | 'api' (sync AI Gateway) | 'scrape' (sync LiteLLM)
  source text not null check (source in ('manual', 'api', 'scrape')),
  updated_at timestamptz not null default now(),
  primary key (provider, model)
);

alter table public.model_prices enable row level security;

create policy "model_prices select authenticated"
  on public.model_prices for select to authenticated
  using (true);

comment on table public.ai_usage is
  'Nhật ký token/chi phí từng lượt gọi AI (single-user: user_id = chủ sở hữu). cost_usd NULL khi model chưa có giá.';
comment on table public.model_prices is
  'Bảng giá model toàn cục USD/1M token theo (provider, model) — ghi chỉ qua service-role (sync Gateway/LiteLLM hoặc admin nhập tay).';
