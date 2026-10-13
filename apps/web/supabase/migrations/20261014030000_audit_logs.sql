-- Audit log — nhật ký hành động của người dùng (phase 1: ghi DB + UI xem/lọc).
--
-- Single-user: mọi dòng thuộc về người dùng trực tiếp qua user_id.
-- RLS owner-only theo mẫu migration single-user.
-- Phase 2 (sau): bổ sung span OpenTelemetry cho các bước LLM (embed → retrieve → generate)
-- và trang xem trace; audit_logs này là nền sự kiện cấp hành động.
--
-- audit_logs: một dòng cho mỗi hành động đáng ghi nhận (tạo/sửa/xóa danh bạ,
-- công ty, ghi chú; xác nhận card; upload/xóa tài liệu; chạy enrichment; đổi
-- cấu hình AI...). metadata jsonb chứa chi tiết phụ (không chứa secret).

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null
    check (char_length(action) between 1 and 80),
  entity_type text not null
    check (char_length(entity_type) between 1 and 40),
  entity_id text,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_user_created_idx
  on public.audit_logs (user_id, created_at desc);

create index audit_logs_user_action_idx
  on public.audit_logs (user_id, action);

alter table public.audit_logs enable row level security;

create policy audit_logs_owner_access on public.audit_logs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
