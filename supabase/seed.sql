-- Dữ liệu tổng hợp chỉ dùng cho môi trường development cục bộ.
-- Các UUID cố định giúp fixture dễ tái tạo. Không thêm email/số điện thoại thật.
insert into public.organizations (id, name, default_locale)
values
  ('10000000-0000-4000-8000-000000000001', 'Tổ chức mẫu EventLead', 'vi-VN'),
  ('10000000-0000-4000-8000-000000000002', 'Tổ chức mẫu độc lập', 'vi-VN')
on conflict (id) do nothing;

insert into public.events (id, organization_id, name, location, starts_at, owner_user_id)
select '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Hội chợ mẫu 2026', 'Thành phố Hồ Chí Minh', now(), u.id
from auth.users u
where u.email = 'dev-owner@example.invalid'
on conflict (id) do nothing;

insert into public.companies (id, organization_id, display_name, country_code, industry, profile_state)
values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Công ty minh họa An Phú', 'VN', 'Sản xuất (dữ liệu giả)', 'user_provided')
on conflict (id) do nothing;

insert into public.contacts (id, organization_id, company_id, full_name, job_title, preferred_language, owner_user_id)
select '40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Nguyễn Minh Họa', 'Quản lý đối tác', 'vi', u.id
from auth.users u
where u.email = 'dev-owner@example.invalid'
on conflict (id) do nothing;

insert into public.event_contacts (organization_id, event_id, contact_id, context_summary, next_step)
select '10000000-0000-4000-8000-000000000001', e.id, c.id, 'Dữ liệu minh họa; không phải ghi chú cuộc gặp thật.', 'Xác nhận nhu cầu mẫu'
from public.events e
join public.contacts c on c.organization_id = e.organization_id
where e.id = '20000000-0000-4000-8000-000000000001'
  and c.id = '40000000-0000-4000-8000-000000000001'
on conflict do nothing;
