import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { listPrompts } from '~/lib/ai/prompts/manager';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/prompts
 *
 * Liệt kê 7 prompts hệ thống kèm nội dung hiện tại của user
 * (bản custom nếu có, ngược lại bản mặc định).
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const items = await listPrompts(user.id, supabase);
  return NextResponse.json({ items, request_id: requestId });
}
