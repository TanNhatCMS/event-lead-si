-- Follow-up & chăm sóc (US3).
--
-- Nhắc việc được mô hình hóa như một ghi chú loại `next_step` có hạn
-- (`due_at`). Khi xong, đánh dấu `done_at` thay vì xóa để giữ lịch sử.
-- Không đụng tới RLS hiện có của meeting_notes (owner-only đã đủ).

alter table public.meeting_notes
  add column if not exists due_at timestamptz,
  add column if not exists done_at timestamptz;

create index if not exists meeting_notes_due_idx
  on public.meeting_notes (user_id, due_at)
  where deleted_at is null and done_at is null and due_at is not null;
