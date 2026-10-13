-- Cấu hình model AI theo tổ chức (vd: provider nhận dạng danh thiếp).
--
-- QUAN TRỌNG: bảng này CHỈ lưu config KHÔNG nhạy cảm (tên provider, tên model,
-- cờ bật/tắt, tham số chung). TUYỆT ĐỐI KHÔNG lưu secrets (API keys, token)
-- ở đây. Secrets phải nằm trong biến môi trường server hoặc vault riêng.

create table public.ai_model_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability text not null,
  provider text not null,
  model text,
  enabled boolean not null default true,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, capability)
);

create index ai_model_configs_org_idx on public.ai_model_configs(organization_id);

comment on table public.ai_model_configs is 'Cấu hình model AI theo tổ chức và capability. Chỉ config không nhạy cảm — KHÔNG lưu API keys/secrets.';
comment on column public.ai_model_configs.capability is 'Tên năng lực AI, vd: card_recognition.';
comment on column public.ai_model_configs.provider is 'Tên provider, vd: mock. Không chứa credential.';
comment on column public.ai_model_configs.config is 'Tham số bổ sung dạng JSON object. Không chứa secret.';

create trigger ai_model_configs_set_updated_at
  before update on public.ai_model_configs
  for each row execute function public.set_updated_at();

alter table public.ai_model_configs enable row level security;

-- Thành viên tổ chức được xem cấu hình của tổ chức mình.
create policy ai_model_configs_select_member
  on public.ai_model_configs for select to authenticated
  using (public.is_org_member(organization_id));

-- Chỉ owner/admin được tạo/sửa/xóa cấu hình.
create policy ai_model_configs_manage_admin
  on public.ai_model_configs for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
