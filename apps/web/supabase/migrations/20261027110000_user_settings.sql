-- FR-014: cấu hình nhãn + giai đoạn quan hệ per user (jsonb — thêm loại
-- cấu hình mới không cần migration sau này).
alter table public.agent_config
  add column if not exists settings jsonb not null default '{}'::jsonb;
