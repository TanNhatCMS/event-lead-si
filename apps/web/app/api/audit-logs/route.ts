import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const querySchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
  action: z.string().trim().max(80).optional().default(''),
  entity_type: z.string().trim().max(40).optional().default(''),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/audit-logs
 *
 * Nhật ký hành động của user đăng nhập. Hỗ trợ tìm kiếm theo nội dung,
 * lọc theo action / entity_type, phân trang. Mới nhất trước.
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
    return errorJson(requestId, 'invalid_query', 'Tham số tìm kiếm không hợp lệ.', 400);
  }
  const params = parsed.data;

  let query = supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, summary, metadata, created_at', {
      count: 'exact',
    })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (params.action) {
    query = query.eq('action', params.action);
  }
  if (params.entity_type) {
    query = query.eq('entity_type', params.entity_type);
  }
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, '')}%`;
    query = query.ilike('summary', like);
  }

  const { data, error, count } = await query;

  if (error) {
    return errorJson(requestId, 'list_failed', 'Chưa tải được nhật ký.', 500);
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0, request_id: requestId });
}
