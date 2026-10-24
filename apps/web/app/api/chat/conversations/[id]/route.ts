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
 * DELETE /api/chat/conversations/[id]
 *
 * Xóa hội thoại của user đăng nhập — FK cascade xóa `chat_messages`.
 * 404 nếu không thuộc user.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'validation_error', 'Mã đoạn chat không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthenticated', 'Vui lòng đăng nhập.', 401);
  }

  const { data: conversation, error: fetchError } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError) {
    return errorJson(requestId, 'internal', 'Không lấy được đoạn chat.', 500);
  }
  if (!conversation) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy đoạn chat.', 404);
  }

  const { error: deleteError } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (deleteError) {
    return errorJson(requestId, 'internal', 'Chưa xóa được đoạn chat, vui lòng thử lại.', 500);
  }

  return NextResponse.json({ deleted: true, request_id: requestId }, { status: 200 });
}
