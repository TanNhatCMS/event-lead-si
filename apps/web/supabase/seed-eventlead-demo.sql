-- =============================================================================
-- EventLead — seed data demo (file riêng, KHÔNG dùng supabase/seed.sql của kit)
--
-- Mục đích: dữ liệu demo cho local (Supabase CLI) — 4 companies ngữ cảnh sự
-- kiện công nghệ VN, 8 contacts (1 đã lưu trữ), 2 card_imports state
-- 'confirmed' với recognition_result đúng shape `recognizedCardSchema`
-- (lib/ai/card-recognition.ts: schemaVersion 1, 7 trường
-- rawValue/normalizedValue/state extracted|uncertain|missing), 4 meeting_notes
-- (note_type: meeting_note/need/opportunity/next_step) trong đó 1 row có
-- due_at tương lai cho widget nhắc việc.
--
-- Chạy bằng (psql as postgres = superuser, bypass RLS):
--   docker exec -i supabase_db_next-supabase-saas-kit-turbo-lite \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < apps/web/supabase/seed-eventlead-demo.sql
--
-- IDEMPOTENT: mọi row dùng uuid cố định (00000000-0000-4000-8000-0000000000XX)
-- + `on conflict (id) do nothing` — chạy lại không nhân đôi dữ liệu.
--
-- user_id admin demo (admin@eventlead.local):
--   f16c078f-0e23-419e-8afd-6fdfe1185132
-- =============================================================================

-- Bảo vệ: dừng ngay nếu admin demo chưa tồn tại trong auth.users.
do $$
begin
  if not exists (
    select 1 from auth.users
    where id = 'f16c078f-0e23-419e-8afd-6fdfe1185132'
      and email = 'admin@eventlead.local'
  ) then
    raise exception
      'Thiếu admin demo admin@eventlead.local (f16c078f-0e23-419e-8afd-6fdfe1185132). Tạo user trước khi seed.';
  end if;
end $$;

-- ============================== companies (4) ================================
-- share_token sinh riêng từng công ty (gen_random_uuid) để trang
-- /chia-se/[token] có dữ liệu demo. Chạy lại: row đã tồn tại -> giữ nguyên token.

insert into public.companies (id, user_id, legal_name, display_name, country_code,
                              website, industry, employee_size_range, profile_state, share_token)
values
  ('00000000-0000-4000-8000-000000000001',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'Công ty Cổ phần Công nghệ Sao Việt',
   'Công ty Cổ phần Công nghệ Sao Việt',
   'VN', 'https://saoviet.com.vn', 'Công nghệ thông tin', '201-500',
   'partially_verified', gen_random_uuid()),
  ('00000000-0000-4000-8000-000000000002',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'Ngân hàng TMCP Phương Đông',
   'Ngân hàng TMCP Phương Đông',
   'VN', 'https://ocb.com.vn', 'Ngân hàng - Tài chính', '1000+',
   'verified', gen_random_uuid()),
  ('00000000-0000-4000-8000-000000000003',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   null,
   'FPT Software',
   'VN', 'https://fpt-software.com', 'Công nghệ thông tin', '1000+',
   'verified', gen_random_uuid()),
  ('00000000-0000-4000-8000-000000000004',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   null,
   'VinCSS',
   'VN', 'https://vincss.net', 'An ninh mạng / IoT', '201-500',
   'user_provided', gen_random_uuid())
on conflict (id) do nothing;

-- ============================== contacts (8) =================================
-- relationship_stage theo enum UI (features/contacts/contact-detail.tsx STAGES):
-- new | contacted | meeting | negotiating | customer | lost.
-- Contact 0018 có archived_at -> demo bộ lọc lưu trữ.

insert into public.contacts (id, user_id, company_id, full_name, job_title, email, phone,
                             preferred_language, owner_user_id, relationship_stage, labels,
                             archived_at)
values
  ('00000000-0000-4000-8000-000000000011',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000001',
   'Nguyễn Văn An', 'Giám đốc Kinh doanh', 'nguyen.van.an@saoviet.com.vn',
   '+84 90 123 45 67', 'vi', 'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'customer', array['quyết định viên'], null),
  ('00000000-0000-4000-8000-000000000012',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000001',
   'Trần Thị Bích', 'Trưởng phòng Hành chính', 'tran.thi.bich@saoviet.com.vn',
   '+84 91 234 56 78', 'vi', 'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'contacted', array['hành chính'], null),
  ('00000000-0000-4000-8000-000000000013',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000002',
   'Lê Hoàng Nam', 'Giám đốc Khối Công nghệ', 'hoang.nam@ocb.com.vn',
   '+84 92 345 67 89', 'vi', 'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'meeting', array['quyết định viên', 'cntt'], null),
  ('00000000-0000-4000-8000-000000000014',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000002',
   'Phạm Thu Hà', 'Chuyên viên Mua sắm CNTT', 'pham.thu.ha@ocb.com.vn',
   '+84 93 456 78 90', 'vi', 'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'negotiating', array['cntt', 'tiềm năng'], null),
  ('00000000-0000-4000-8000-000000000015',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000003',
   'Vũ Minh Tuấn', 'Giám đốc Sản phẩm', 'minhtuan.vu@fpt-software.com',
   '+84 94 567 89 01', 'vi', 'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'meeting', array['quyết định viên'], null),
  ('00000000-0000-4000-8000-000000000016',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000003',
   'Đỗ Thị Mai Lan', 'Quản lý Đối tác', 'mailan.do@fpt-software.com',
   '+84 95 678 90 12', 'vi', 'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'new', array['đối tác'], null),
  ('00000000-0000-4000-8000-000000000017',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000004',
   'Hoàng Quang Huy', 'Trưởng nhóm Nghiên cứu', 'quang.huy@vincss.net',
   '+84 96 789 01 23', 'vi', 'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'contacted', array['cntt', 'tiềm năng'], null),
  ('00000000-0000-4000-8000-000000000018',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000004',
   'Ngô Thanh Trúc', 'Chuyên viên Phát triển Kinh doanh', 'thanh.truc@vincss.net',
   '+84 97 890 12 34', 'vi', 'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'lost', array[]::text[],
   now() - interval '3 days')
on conflict (id) do nothing;

-- ============================ card_imports (2) ===============================
-- state 'confirmed', gắn confirmed_contact_id về contact đã seed.
-- storage_path 'demo/sample-card.jpg' chỉ là metadata (không cần file thật).
-- recognition_result khớp recognizedCardSchema (schemaVersion 1, 'vi', 7 trường).

insert into public.card_imports (id, user_id, submitted_by, storage_path, media_type, file_size,
                                 batch_id, state, schema_version, recognition_provider,
                                 recognition_model, recognition_result, confirmed_contact_id,
                                 processing_started_at, processed_at)
values
  ('00000000-0000-4000-8000-000000000021',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'demo/sample-card.jpg', 'image/jpeg', 245760,
   null, 'confirmed', 1, 'mock', null,
   '{
     "schemaVersion": 1,
     "detectedLanguage": "vi",
     "fields": {
       "fullName":    {"rawValue": "NGUYỄN VĂN AN",              "normalizedValue": "Nguyễn Văn An",                        "state": "extracted"},
       "jobTitle":    {"rawValue": "GIÁM ĐỐC KINH DOANH",        "normalizedValue": "Giám đốc Kinh doanh",                  "state": "extracted"},
       "companyName": {"rawValue": "CÔNG TY CP CÔNG NGHỆ SAO VIỆT", "normalizedValue": "Công ty Cổ phần Công nghệ Sao Việt", "state": "extracted"},
       "email":       {"rawValue": "nguyen.van.an@saoviet.com.vn", "normalizedValue": "nguyen.van.an@saoviet.com.vn",      "state": "extracted"},
       "phone":       {"rawValue": "+84 90 123 45 67",           "normalizedValue": "+84 90 123 45 67",                     "state": "extracted"},
       "address":     {"rawValue": null,                          "normalizedValue": null,                                  "state": "missing"},
       "website":     {"rawValue": "saoviet.com.vn",              "normalizedValue": "https://saoviet.com.vn",              "state": "uncertain"}
     }
   }'::jsonb,
   '00000000-0000-4000-8000-000000000011',
   now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000022',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'demo/sample-card-2.jpg', 'image/jpeg', 198450,
   null, 'confirmed', 1, 'mock', null,
   '{
     "schemaVersion": 1,
     "detectedLanguage": "vi",
     "fields": {
       "fullName":    {"rawValue": "VŨ MINH TUẤN",               "normalizedValue": "Vũ Minh Tuấn",                        "state": "extracted"},
       "jobTitle":    {"rawValue": "GIÁM ĐỐC SẢN PHẨM",          "normalizedValue": "Giám đốc Sản phẩm",                   "state": "extracted"},
       "companyName": {"rawValue": "FPT Software",               "normalizedValue": "FPT Software",                        "state": "extracted"},
       "email":       {"rawValue": "minhtuan.vu@fpt-software.com", "normalizedValue": "minhtuan.vu@fpt-software.com",      "state": "extracted"},
       "phone":       {"rawValue": null,                          "normalizedValue": null,                                 "state": "missing"},
       "address":     {"rawValue": null,                          "normalizedValue": null,                                 "state": "missing"},
       "website":     {"rawValue": "fpt-software.com",            "normalizedValue": "https://fpt-software.com",           "state": "extracted"}
     }
   }'::jsonb,
   '00000000-0000-4000-8000-000000000015',
   now() - interval '1 day', now() - interval '1 day')
on conflict (id) do nothing;

-- ============================ meeting_notes (4) ==============================
-- note_type theo constraint bảng: meeting_note | need | opportunity | next_step.
-- Row 0033 có due_at tương lai -> widget nhắc việc có nội dung demo.

insert into public.meeting_notes (id, user_id, contact_id, author_user_id, body, note_type,
                                  due_at)
values
  ('00000000-0000-4000-8000-000000000031',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000011',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'Sự kiện: Vietnam Tech Summit 2026' || chr(10) ||
   'Gặp anh An tại gian hàng F22. Anh quan tâm gói quản lý danh bạ sự kiện, hẹn demo lại vào tuần sau.',
   'meeting_note', null),
  ('00000000-0000-4000-8000-000000000032',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000013',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'Ngân hàng cần giải pháp thu thập lead tại hội thảo khách hàng thường niên, quy mô khoảng 500 khách.',
   'need', null),
  ('00000000-0000-4000-8000-000000000033',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000015',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'Gửi đề xuất tích hợp API danh bạ cho FPT Software trước buổi họp nội bộ phòng sản phẩm.',
   'next_step', now() + interval '7 days'),
  ('00000000-0000-4000-8000-000000000034',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   '00000000-0000-4000-8000-000000000017',
   'f16c078f-0e23-419e-8afd-6fdfe1185132',
   'VinCSS đang mở rộng mảng IoT cho doanh nghiệp — cơ hội hợp tác dùng trang /chia-se để chia sẻ hồ sơ công ty.',
   'opportunity', null)
on conflict (id) do nothing;

-- =============================== kiểm chứng ==================================
-- Đếm số row seeded cho admin demo (kỳ vọng: 4/8/2/4).

select 'companies'     as bang, count(*) as so_row
  from public.companies
 where user_id = 'f16c078f-0e23-419e-8afd-6fdfe1185132'
union all
select 'contacts', count(*)
  from public.contacts
 where user_id = 'f16c078f-0e23-419e-8afd-6fdfe1185132'
union all
select 'card_imports', count(*)
  from public.card_imports
 where user_id = 'f16c078f-0e23-419e-8afd-6fdfe1185132'
union all
select 'meeting_notes', count(*)
  from public.meeting_notes
 where user_id = 'f16c078f-0e23-419e-8afd-6fdfe1185132';

-- share_token mẫu (dùng để test trang /chia-se/[token]).
select display_name, share_token
  from public.companies
 where user_id = 'f16c078f-0e23-419e-8afd-6fdfe1185132'
 order by display_name;
