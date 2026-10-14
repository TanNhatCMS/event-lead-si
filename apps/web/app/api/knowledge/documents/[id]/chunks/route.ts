import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/knowledge/documents/[id]/chunks
 *
 * Xem các chunks đã index của một tài liệu (để kiểm tra cách chia chunk
 * theo handbook Phần 9 — "Chunk thông minh, không chỉ là chunk nhỏ").
 * Chỉ trả content/page/section (không trả embedding).
 */
export async function GET(_request: Request, { params }: RouteContext) {
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

  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('chunk_index, page_number, section_title, content')
    .eq('document_id', id)
    .eq('user_id', user.id)
    .order('chunk_index', { ascending: true })
    .limit(500);

  if (error) {
    return errorJson(requestId, 'internal', 'Không lấy được danh sách chunks.', 500);
  }

  return NextResponse.json({ items: chunks ?? [], request_id: requestId });
}
