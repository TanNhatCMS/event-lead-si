import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { Database } from '@kit/supabase/database';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAudit } from '~/lib/audit/log-audit';

type CompanyUpdate = Database['public']['Tables']['companies']['Update'];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/** Website: URL http(s) hợp lệ — chuỗi rỗng được transform thành null (xóa trắng). */
const websiteSchema = z
  .union([z.string().trim().max(500), z.null()])
  .transform((value) => (value === '' || value === undefined ? null : value))
  .refine(
    (value) => {
      if (value === null) return true;
      try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
      } catch {
        return false;
      }
    },
    { message: 'Website phải là URL hợp lệ (https://...).' },
  );

/** Chuỗi rỗng → null: frontend gửi "" khi user xóa trắng ô nhập. */
const nullableText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .transform((value) => (value === '' || value === undefined ? null : value));

const patchSchema = z
  .object({
    legal_name: nullableText(240).optional(),
    // Mã quốc gia 2 chữ cái (ISO 3166-1 alpha-2) hoặc null để xóa.
    country_code: nullableText(2)
      .refine((v) => v === null || /^[A-Za-z]{2}$/.test(v), {
        message: 'Mã quốc gia phải là 2 chữ cái (VD: VN).',
      })
      .transform((v) => (v === null ? null : v.toUpperCase()))
      .optional(),
    website: websiteSchema.optional(),
    industry: nullableText(240).optional(),
    market_summary: nullableText(4000).optional(),
    employee_size_range: nullableText(80).optional(),
    founded_year: z
      .union([z.number().int(), z.null()])
      .refine((v) => v === null || (v >= 1000 && v <= 2200), {
        message: 'Năm thành lập phải trong khoảng 1000-2200.',
      })
      .optional(),
    products_summary: nullableText(4000).optional(),
    tax_or_registration_id: nullableText(120).optional(),
    display_name: z
      .string()
      .trim()
      .min(1, 'Tên hiển thị không được để trống.')
      .max(240)
      .optional(),
    // Xác minh hồ sơ tay: verify: true → profile_state 'verified'.
    verify: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Không có trường nào cần cập nhật.',
  });

// Lưu ý: chuỗi .select() viết inline literal duy nhất trong từng lời gọi để
// supabase-js suy được kiểu row chính xác (nối chuỗi const làm parser
// type-level trả GenericStringError).

function unauthorized(requestId: string) {
  return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
}

/**
 * GET /api/companies/[id]
 *
 * Hồ sơ doanh nghiệp đầy đủ các trường FR-008 (lĩnh vực, thị trường, quy mô,
 * năm thành lập, sản phẩm, website, mã đăng ký/thuế...) kèm profile_state
 * (FR-009: user_provided | partially_verified | verified | needs_review)
 * và số liên hệ đang gắn với công ty.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'invalid_id', 'Mã công ty không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized(requestId);

  const { data: company, error } = await supabase
    .from('companies')
    .select(
      'id, legal_name, display_name, country_code, website, industry, market_summary, employee_size_range, founded_year, products_summary, tax_or_registration_id, profile_state, share_token, created_at, updated_at, contacts(count)',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !company) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy công ty.', 404);
  }

  const { contacts, ...companyFields } = company;
  return NextResponse.json({
    company: {
      ...companyFields,
      contacts_count: Array.isArray(contacts) ? contacts[0]?.count ?? 0 : 0,
    },
    request_id: requestId,
  });
}

/**
 * PATCH /api/companies/[id]
 *
 * Cập nhật hồ sơ doanh nghiệp (FR-008). Chỉ các trường có trong body được
 * đụng đến; hợp đồng với frontend: body nhận các trường company + verify,
 * response trả lại company đầy đủ (gồm profile_state).
 *
 * LOGIC profile_state (chốt đơn giản):
 * - verify: true → 'verified' + audit 'company.verified'.
 * - PATCH sửa thường KHÔNG đổi state (kể cả khi state đang
 *   'partially_verified' — người dùng chưa xác minh tay thì không tự nâng).
 * - AI-applied ('partially_verified' do enrichment điền) được set riêng ở
 *   lib/ai/enrichment/apply.ts, không qua route này.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'invalid_id', 'Mã công ty không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized(requestId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_json', 'Nội dung yêu cầu không phải JSON hợp lệ.', 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'validation_error',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }
  const input = parsed.data;

  // Công ty phải thuộc về đúng người dùng (RLS + eq user_id kiểm tra lại).
  const { data: existing, error: fetchError } = await supabase
    .from('companies')
    .select('id, profile_state, display_name')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy công ty.', 404);
  }

  // Tách `verify` ra — không phải cột DB.
  const { verify, ...fields } = input;
  const updatePayload: CompanyUpdate = { ...fields };
  const verified = verify === true;
  if (verified) {
    updatePayload.profile_state = 'verified';
  }

  const hasFieldUpdate = Object.keys(updatePayload).length > 0;
  if (!hasFieldUpdate) {
    // Chỉ verify mà không sửa trường nào thì cũng không cần UPDATE nếu đã
    // verified trước đó.
    if (!verified || existing.profile_state === 'verified') {
      return NextResponse.json({
        company: null,
        profile_state: existing.profile_state,
        unchanged: true,
        request_id: requestId,
      });
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('companies')
    .update(hasFieldUpdate ? updatePayload : { profile_state: 'verified' })
    .eq('id', id)
    .eq('user_id', user.id)
    .select(
      'id, legal_name, display_name, country_code, website, industry, market_summary, employee_size_range, founded_year, products_summary, tax_or_registration_id, profile_state, share_token, created_at, updated_at',
    )
    .single();

  if (updateError || !updated) {
    return errorJson(requestId, 'update_failed', 'Chưa cập nhật được công ty.', 500);
  }

  const updatedContacts = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', id)
    .eq('user_id', user.id);

  await logAudit(supabase, user.id, {
    action: verified ? 'company.verified' : 'company.update',
    entityType: 'company',
    entityId: id,
    summary: verified
      ? 'Xác minh hồ sơ công ty: ' + (updated.display_name ?? existing.display_name)
      : 'Cập nhật hồ sơ công ty: ' + (updated.display_name ?? existing.display_name),
    metadata: {
      fields: Object.keys(fields),
      previous_profile_state: existing.profile_state,
      profile_state: updated.profile_state,
    },
  });

  return NextResponse.json({
    company: {
      ...updated,
      contacts_count:
        updatedContacts.count !== null && updatedContacts.count !== undefined
          ? updatedContacts.count
          : 0,
    },
    profile_state: updated.profile_state,
    request_id: requestId,
  });
}
