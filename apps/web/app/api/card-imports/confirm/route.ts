import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAudit } from '~/lib/audit/log-audit';
import { recognizedCardSchema } from '~/lib/ai/card-recognition';
import { enqueueBusinessIndexSafe } from '~/lib/ai/rag/contact-index';

const fieldKeys = [
  'fullName',
  'jobTitle',
  'companyName',
  'email',
  'phone',
  'address',
  'website',
] as const;

type FieldKey = (typeof fieldKeys)[number];

/**
 * Tên cột trong bảng contacts/contact_field_evidence tương ứng
 * với mỗi trường người dùng xác nhận.
 */
const fieldColumnMap: Record<FieldKey, string> = {
  fullName: 'full_name',
  jobTitle: 'job_title',
  companyName: 'company_name',
  email: 'email',
  phone: 'phone',
  address: 'address',
  website: 'website',
};

const fieldValuesSchema = z.object({
  fullName: z.string().trim().min(1, 'Thiếu họ và tên.').max(240),
  jobTitle: z.string().trim().max(240).optional(),
  companyName: z.string().trim().max(240).optional(),
  email: z.string().trim().max(240).optional(),
  phone: z.string().trim().max(60).optional(),
  address: z.string().trim().max(500).optional(),
  website: z.string().trim().max(240).optional(),
});

const confirmSchema = z.object({
  importId: z.string().uuid('Mã importId không hợp lệ.'),
  provider: z.string().min(1).max(80),
  detectedLanguage: z.enum(['vi', 'en', 'ko', 'ja', 'zh', 'unknown']),
  // Ảnh chụp kết quả nhận dạng gốc — dùng để ghi evidence (giá trị máy đọc thô).
  recognized: recognizedCardSchema,
  fields: fieldValuesSchema,
  // Bằng chứng người dùng đã xem qua TỪNG trường (hiến chương "con người kiểm soát").
  reviewedFields: z.array(z.enum(fieldKeys)).refine(
    (list) => fieldKeys.every((key) => list.includes(key)),
    'Phải xác nhận đã xem qua tất cả các trường.',
  ),
  eventName: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

type ConfirmInput = z.infer<typeof confirmSchema>;

/**
 * POST /api/card-imports/confirm
 *
 * Tạo hồ sơ liên hệ từ các giá trị ĐÃ ĐƯỢC NGƯỜI DÙNG xem/sửa và bấm XÁC NHẬN.
 *
 * HIẾN CHƯƠNG "con người kiểm soát": đây là code path DUY NHẤT được phép tạo
 * hồ sơ từ kết quả nhận dạng. Route /recognize không bao giờ tự lưu.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        code: 'unauthorized',
        message: 'Vui lòng đăng nhập.',
        request_id: requestId,
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        code: 'invalid_json',
        message: 'Nội dung yêu cầu không phải JSON hợp lệ.',
        request_id: requestId,
      },
      { status: 400 },
    );
  }

  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: 'validation_error',
        message: 'Dữ liệu xác nhận không hợp lệ.',
        details: parsed.error.flatten().fieldErrors,
        request_id: requestId,
      },
      { status: 400 },
    );
  }
  const input = parsed.data as ConfirmInput;

  // Bản ghi nhập phải thuộc đúng user và chưa được xác nhận trước đó.
  const { data: cardImport, error: importError } = await supabase
    .from('card_imports')
    .select('id, state')
    .eq('id', input.importId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (importError || !cardImport) {
    return NextResponse.json(
      {
        code: 'import_not_found',
        message: 'Không tìm thấy bản ghi nhập danh thiếp.',
        request_id: requestId,
      },
      { status: 404 },
    );
  }
  if (cardImport.state === 'confirmed') {
    return NextResponse.json(
      {
        code: 'already_confirmed',
        message: 'Danh thiếp này đã được xác nhận trước đó.',
        request_id: requestId,
      },
      { status: 409 },
    );
  }

  const normalized = (value: string | undefined) =>
    value?.trim() ? value.trim() : null;

  // 1) Lưu / liên kết công ty (nếu có tên công ty trong trường đã xác nhận).
  let companyId: string | null = null;
  let companyShareToken: string | null = null;
  let companyDisplayName: string | null = null;
  const companyName = normalized(input.fields.companyName);
  if (companyName) {
    const lookup = companyName.toLowerCase();
    const escaped = companyName.replace(/[%_\\]/g, (m) => `\\${m}`);
    const { data: candidates, error: lookupError } = await supabase
      .from('companies')
      .select('id, display_name, website, share_token')
      .eq('user_id', user.id)
      .ilike('display_name', escaped)
      .limit(10);

    if (lookupError) {
      return NextResponse.json(
        {
          code: 'company_lookup_failed',
          message: 'Chưa kiểm tra được công ty đã có.',
          request_id: requestId,
        },
        { status: 500 },
      );
    }

    const existing = (candidates ?? []).find(
      (row) => row.display_name.trim().toLowerCase() === lookup,
    );

    if (existing) {
      companyId = existing.id;
      companyShareToken = existing.share_token;
      companyDisplayName = existing.display_name;
      const website = normalized(input.fields.website);
      if (!existing.website?.trim() && website) {
        const { error: websiteError } = await supabase
          .from('companies')
          .update({ website })
          .eq('id', existing.id)
          .eq('user_id', user.id);
        if (websiteError) {
          return NextResponse.json(
            {
              code: 'company_update_failed',
              message: 'Chưa cập nhật được website công ty.',
              request_id: requestId,
            },
            { status: 500 },
          );
        }
      }
    } else {
      const { data: created, error: createError } = await supabase
        .from('companies')
        .insert({
          user_id: user.id,
          display_name: companyName,
          website: normalized(input.fields.website),
          profile_state: 'user_provided',
        })
        .select('id, display_name, share_token')
        .single();

      if (createError || !created) {
        return NextResponse.json(
          {
            code: 'company_create_failed',
            message: 'Chưa lưu được công ty.',
            request_id: requestId,
          },
          { status: 500 },
        );
      }
      companyId = created.id;
      companyShareToken = created.share_token;
      companyDisplayName = created.display_name;
    }
  }

  // Enqueue index RAG cho công ty vừa lưu/liên kết (fire-and-forget).
  if (companyId) {
    void enqueueBusinessIndexSafe(user.id, 'company', companyId, 'upsert', supabase);
  }

  // 2) Tạo contact từ các giá trị người dùng đã xác nhận.
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .insert({
      user_id: user.id,
      company_id: companyId,
      full_name: input.fields.fullName.trim(),
      job_title: normalized(input.fields.jobTitle),
      email: normalized(input.fields.email),
      phone: normalized(input.fields.phone),
      address: normalized(input.fields.address),
      preferred_language:
        input.detectedLanguage === 'unknown' ? null : input.detectedLanguage,
      owner_user_id: user.id,
      schema_version: 1,
    })
    .select('id')
    .single();

  if (contactError || !contact) {
    return NextResponse.json(
      {
        code: 'contact_create_failed',
        message: 'Chưa tạo được hồ sơ liên hệ.',
        request_id: requestId,
      },
      { status: 500 },
    );
  }

  // Enqueue index RAG cho liên hệ vừa tạo (fire-and-forget).
  void enqueueBusinessIndexSafe(user.id, 'contact', contact.id, 'upsert', supabase);

  // 3) Ghi evidence từng trường: giá trị máy đọc thô + giá trị đã xác nhận.
  const reviewedAt = new Date().toISOString();
  const evidenceRows = fieldKeys.map((key) => {
    const confirmedValue = normalized(input.fields[key]);
    const recognizedField = input.recognized.fields[key];
    const rawValue = recognizedField.rawValue ?? null;
    return {
      user_id: user.id,
      contact_id: contact.id,
      field_name: fieldColumnMap[key],
      raw_value: rawValue,
      normalized_value: confirmedValue,
      value_snapshot: confirmedValue,
      schema_version: 1,
      source_type: 'card_ocr',
      source_reference: input.importId,
      verification_state: confirmedValue ? 'user_confirmed' : 'unavailable',
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
    };
  });

  if (evidenceRows.length > 0) {
    const { error: evidenceError } = await supabase
      .from('contact_field_evidence')
      .insert(evidenceRows);
    if (evidenceError) {
      return NextResponse.json(
        {
          code: 'evidence_save_failed',
          message: 'Đã tạo hồ sơ nhưng chưa lưu được bằng chứng trường.',
          request_id: requestId,
        },
        { status: 500 },
      );
    }
  }

  // 4) Đánh dấu card_import đã xác nhận.
  const { error: confirmError } = await supabase
    .from('card_imports')
    .update({
      state: 'confirmed',
      confirmed_contact_id: contact.id,
      processed_at: reviewedAt,
    })
    .eq('id', input.importId)
    .eq('user_id', user.id);

  if (confirmError) {
    return NextResponse.json(
      {
        code: 'import_confirm_failed',
        message: 'Đã tạo hồ sơ nhưng chưa cập nhật được trạng thái bản ghi nhập.',
        request_id: requestId,
      },
      { status: 500 },
    );
  }

  await logAudit(supabase, user.id, {
    action: 'card_import.confirm',
    entityType: 'contact',
    entityId: contact.id,
    summary: `Xác nhận danh thiếp, tạo liên hệ: ${input.fields.fullName.trim()}`,
    metadata: { import_id: input.importId },
  });

  return NextResponse.json(
    {
      contact_id: contact.id,
      company_id: companyId,
      company_name: companyDisplayName,
      share_url: companyShareToken ? `/chia-se/${companyShareToken}` : null,
      request_id: requestId,
    },
    { status: 200 },
  );
}
