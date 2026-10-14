import 'server-only';

import { after, NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { ingestDocument } from '~/lib/ai/rag/ingest';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/knowledge/documents/[id]/reingest
 *
 * Xử lý lại tài liệu: reset status về `uploaded` rồi chạy ingest nền
 * (dùng khi tài liệu `failed`/`needs_ocr`, hoặc sau khi cập nhật logic
 * chunking). Idempotent — ingest xóa chunks cũ trước khi index lại.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'validation_error', 'Mã tài liệu không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError) {
    return errorJson(requestId, 'internal', 'Không lấy được thông tin tài liệu.', 500);
  }
  if (!doc) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy tài liệu.', 404);
  }
  if (doc.status === 'processing') {
    return errorJson(
      requestId,
      'conflict',
      'Tài liệu đang được xử lý, vui lòng đợi.',
      409,
    );
  }

  const { error: resetError } = await supabase
    .from('documents')
    .update({
      status: 'uploaded',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id);

  if (resetError) {
    return errorJson(requestId, 'internal', 'Không reset được trạng thái tài liệu.', 500);
  }

  // Chạy ingest nền sau khi đã trả response.
  after(() => ingestDocument({ documentId: id, userId: user.id, supabase }));

  return NextResponse.json(
    { id, status: 'uploaded', request_id: requestId },
    { status: 202 },
  );
}
