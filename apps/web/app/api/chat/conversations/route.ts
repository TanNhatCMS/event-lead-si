import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

const createSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: 'Tiêu đề đoạn chat không được để trống.' })
    .max(200, { message: 'Tiêu đề đoạn chat tối đa 200 ký tự.' })
    .optional(),
});

/**
 * GET /api/chat/conversations
 *
 * Danh sách hội thoại của user đăng nhập, mới nhất trước.
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthenticated', 'Vui lòng đăng nhập.', 401);
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return errorJson(requestId, 'internal', 'Chưa tải được lịch sử hội thoại.', 500);
  }

  return NextResponse.json({ items: data ?? [], request_id: requestId }, { status: 200 });
}

/**
 * POST /api/chat/conversations
 *
 * Tạo hội thoại mới. `title` tùy chọn (mặc định "Đoạn chat mới").
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthenticated', 'Vui lòng đăng nhập.', 401);
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Body rỗng cũng được — dùng tiêu đề mặc định.
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'validation_error',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({
      user_id: user.id,
      title: parsed.data.title ?? 'Đoạn chat mới',
    })
    .select('id, title, created_at')
    .single();

  if (error || !data) {
    return errorJson(requestId, 'internal', 'Chưa tạo được đoạn chat, vui lòng thử lại.', 500);
  }

  return NextResponse.json({ ...data, request_id: requestId }, { status: 201 });
}
