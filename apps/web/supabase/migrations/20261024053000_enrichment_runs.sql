-- Mapping sở hữu lần chạy enrichment nền (spec 003, FR-015 — quyết định
-- cuối D5 phương án (b) của người dùng tại cổng T014 ngày 2026-10-24).
--
-- Route POST /api/enrichment/start ghi một dòng (run_id, user_id) ngay sau
-- khi tạo run; route GET /api/enrichment/runs/[runId] kiểm tra sở hữu
-- trước khi hỏi Workflow SDK: không có mapping hoặc mapping thuộc người
-- dùng khác → 404 (không lộ sự tồn tại của run của người khác).
--
-- Bảng CHỈ chứa quan hệ sở hữu tối thiểu — input/kết quả của lần chạy vẫn
-- thuộc về event log của Workflow World, không sao vào đây.
--
-- Truy cập chỉ qua server admin client (service-role) kèm so user_id
-- trong code route; RLS bật và KHÔNG có policy cho authenticated/anon
-- nên các vai trò thường bị deny mặc định.

create table public.enrichment_runs (
  run_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index enrichment_runs_user_id_idx on public.enrichment_runs (user_id);

alter table public.enrichment_runs enable row level security;

comment on table public.enrichment_runs is
  'Sở hữu lần chạy enrichment nền (run_id -> user_id) — spec 003 FR-015, D5 phương án (b). Chỉ service-role truy cập.';
