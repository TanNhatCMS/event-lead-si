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
 * GET /api/chat/conversations/[id]/messages
 *
 * Tin nhắn của một hội thoại thuộc user đăng nhập, cũ nhất trước.
 */
export async function GET(_request: Request, { params }: RouteContext) {
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

  const { data: conversation, error: convError } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (convError) {
    return errorJson(requestId, 'internal', 'Không lấy được đoạn chat.', 500);
  }
  if (!conversation) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy đoạn chat.', 404);
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, citations, created_at')
    .eq('conversation_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    return errorJson(requestId, 'internal', 'Chưa tải được tin nhắn.', 500);
  }

  return NextResponse.json({ items: data ?? [], request_id: requestId }, { status: 200 });
}
