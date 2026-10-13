import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const querySchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
  archived: z.enum(['true', 'false']).optional().default('false'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/contacts
 *
 * Danh sách liên hệ của user đăng nhập. Hỗ trợ tìm kiếm (tên/email/SĐT/chức danh),
 * lọc liên hệ đã lưu trữ, phân trang. Sắp xếp theo cập nhật mới nhất.
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
    .from('contacts')
    .select(
      'id, full_name, job_title, email, phone, relationship_stage, archived_at, updated_at, created_at, companies(id, display_name)',
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (params.archived === 'true') {
    query = query.not('archived_at', 'is', null);
  } else {
    query = query.is('archived_at', null);
  }

  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, '')}%`;
    query = query.or(
      `full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},job_title.ilike.${like}`,
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return errorJson(requestId, 'list_failed', 'Chưa tải được danh sách liên hệ.', 500);
  }

  return NextResponse.json({ contacts: data ?? [], total: count ?? 0, request_id: requestId });
}
