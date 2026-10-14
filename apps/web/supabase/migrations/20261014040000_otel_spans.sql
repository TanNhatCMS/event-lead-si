-- OpenTelemetry spans — lưu trace các bước LLM/AI (phase 2 của audit log).
--
-- Span do AI SDK (experimental_telemetry) và các parent span thủ công
-- (lib/otel/trace.ts) phát ra, exporter ghi vào đây qua service-role.
-- user_id: lấy từ attribute 'app.user_id' của span; exporter tự điền bù
-- từ span cùng trace nếu thiếu (xem lib/otel/supabase-exporter.ts).
-- RLS owner-only: chỉ đọc được span của chính mình.

create table public.otel_spans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  trace_id text not null,
  span_id text not null,
  parent_span_id text,
  name text not null,
  kind text not null default 'INTERNAL',
  status_code text not null default 'UNSET'
    check (status_code in ('UNSET', 'OK', 'ERROR')),
  status_message text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_ms double precision not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (trace_id, span_id)
);

create index otel_spans_trace_idx
  on public.otel_spans (trace_id, started_at);

create index otel_spans_user_created_idx
  on public.otel_spans (user_id, started_at desc);

alter table public.otel_spans enable row level security;

create policy otel_spans_owner_access on public.otel_spans
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
