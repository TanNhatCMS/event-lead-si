-- Thêm token chia sẻ công khai cho bảng companies.
--
-- share_token dùng trong URL /chia-se/<token>: ai có link đều xem được
-- profile công ty mà không cần đăng nhập. Token là UUID v4, duy nhất,
-- tự sinh cho các dòng đã tồn tại nhờ DEFAULT gen_random_uuid().
--
-- QUY ƯỚC: không thêm RLS policy public cho bảng companies. Trang chia sẻ
-- đọc qua service-role ở phía server để tránh bị enumerate toàn bộ công ty.

alter table public.companies
  add column share_token uuid not null default gen_random_uuid() unique;
