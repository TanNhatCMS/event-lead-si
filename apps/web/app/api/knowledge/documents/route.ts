import 'server-only';

import { after, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { ingestDocument } from '~/lib/ai/rag/ingest';

const DOCUMENT_STATUSES = ['uploaded', 'processing', 'ready', 'failed', 'needs_ocr'] as const;

const DOCUMENT_TYPES = [
  'price_list',
  'catalogue',
  'contract_template',
  'capability_profile',
  'other',
] as const;

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_DOCUMENTS_PER_USER = 100;

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

const formMetaSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES, {
    message:
      'Loại tài liệu không hợp lệ. Chọn: bảng giá, catalogue, hợp đồng mẫu, hồ sơ năng lực hoặc khác.',
  }),
  effective_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'Ngày hiệu lực phải đúng định dạng YYYY-MM-DD.',
    })
    .refine(
      (s) => {
        const d = new Date(`${s}T00:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
      },
      { message: 'Ngày hiệu lực không phải ngày hợp lệ.' },
    ),
});

const querySchema = z.object({
  status: z
    .enum(DOCUMENT_STATUSES, { message: 'Trạng thái tài liệu không hợp lệ.' })
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/knowledge/documents
 *
 * Danh sách tài liệu của user đăng nhập, mới nhất trước.
 * Filter: `?status=` (uploaded | processing | ready | failed | needs_ocr).
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return errorJson(
      requestId,
      'validation_error',
      parsed.error.issues[0]?.message ?? 'Tham số truy vấn không hợp lệ.',
      400,
    );
  }
  const params = parsed.data;

  let query = supabase
    .from('documents')
    .select(
      'id, file_name, mime_type, document_type, effective_date, file_size_bytes, page_count, status, error_message, chunk_count, created_at',
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (params.status) {
    query = query.eq('status', params.status);
  }

  const { data, error, count } = await query;

  if (error) {
    return errorJson(requestId, 'internal', 'Chưa tải được danh sách tài liệu.', 500);
  }

  return NextResponse.json(
    { items: data ?? [], total: count ?? 0, request_id: requestId },
    { status: 200 },
  );
}

function formText(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * POST /api/knowledge/documents
 *
 * Upload tài liệu (multipart `file` + `document_type` + `effective_date`
 * bắt buộc theo QĐ2). Validate xong thì lưu Storage, insert
 * `documents(status='uploaded')` và trả 201 NGAY — ingest (trích xuất →
 * chunk → embed → `ready`) chạy nền bằng `after()` của Next, không block
 * response.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorJson(
      requestId,
      'validation_error',
      'Yêu cầu phải là multipart/form-data.',
      400,
    );
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return errorJson(requestId, 'validation_error', 'Thiếu file tài liệu.', 400);
  }

  const meta = formMetaSchema.safeParse({
    document_type: formText(form.get('document_type')),
    effective_date: formText(form.get('effective_date')),
  });
  if (!meta.success) {
    return errorJson(
      requestId,
      'validation_error',
      meta.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  // Xác định mime theo đuôi file (file.type của trình duyệt có thể trống).
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = EXT_TO_MIME[ext];
  if (!mimeType) {
    return errorJson(
      requestId,
      'unsupported_media_type',
      'Chỉ nhận file PDF, DOCX hoặc TXT.',
      415,
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return errorJson(
      requestId,
      'payload_too_large',
      'File vượt quá 25MB, vui lòng chọn file nhỏ hơn.',
      413,
    );
  }

  const { count, error: countError } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if (countError) {
    return errorJson(
      requestId,
      'internal',
      'Chưa kiểm tra được giới hạn tài liệu, vui lòng thử lại.',
      500,
    );
  }
  if ((count ?? 0) >= MAX_DOCUMENTS_PER_USER) {
    return errorJson(
      requestId,
      'quota_exceeded',
      'Bạn đã đạt giới hạn 100 tài liệu.',
      403,
    );
  }

  const docId = crypto.randomUUID();
  const safeName =
    file.name
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]+/g, '')
      .trim()
      .slice(0, 180) || `tai-lieu.${ext}`;
  const storagePath = `${user.id}/${docId}/${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (uploadError) {
    return errorJson(
      requestId,
      'upload_failed',
      `Chưa tải được file lên kho lưu trữ: ${uploadError.message}`,
      500,
    );
  }

  const { error: insertError } = await supabase.from('documents').insert({
    id: docId,
    user_id: user.id,
    storage_path: storagePath,
    file_name: safeName,
    mime_type: mimeType,
    file_size_bytes: file.size,
    document_type: meta.data.document_type,
    effective_date: meta.data.effective_date,
    status: 'uploaded',
  });
  if (insertError) {
    // Dọn file vừa upload để không rác storage.
    await supabase.storage.from('documents').remove([storagePath]);
    return errorJson(
      requestId,
      'internal',
      'Chưa lưu được thông tin tài liệu, vui lòng thử lại.',
      500,
    );
  }

  // Ingest nền sau response bằng after() của Next (route handler được phép
  // dùng cookies()/headers() trong after — theo docs Next 16). Client tạo
  // mới trong after() nên vẫn qua RLS bằng session của user.
  after(() => {
    const bgSupabase = getSupabaseServerClient();
    ingestDocument({
      documentId: docId,
      userId: user.id,
      supabase: bgSupabase,
    }).catch((err) =>
      console.error('[documents] ingest nền lỗi ngoài dự kiến:', err),
    );
  });

  return NextResponse.json(
    {
      id: docId,
      file_name: safeName,
      mime_type: mimeType,
      document_type: meta.data.document_type,
      effective_date: meta.data.effective_date,
      file_size_bytes: file.size,
      status: 'uploaded',
      request_id: requestId,
    },
    { status: 201 },
  );
}
