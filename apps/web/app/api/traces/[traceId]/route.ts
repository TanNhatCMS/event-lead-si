import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ traceId: string }> };

/**
 * GET /api/traces/[traceId]
 *
 * Toàn bộ span của một trace, sắp xếp theo thời gian bắt đầu.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { traceId } = await params;
  if (!/^[0-9a-f]{32}$/i.test(traceId)) {
    return errorJson(requestId, 'invalid_id', 'Mã trace không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const { data, error } = await supabase
    .from('otel_spans')
    .select(
      'trace_id, span_id, parent_span_id, name, kind, status_code, status_message, started_at, ended_at, duration_ms, attributes, events',
    )
    .eq('user_id', user.id)
    .eq('trace_id', traceId.toLowerCase())
    .order('started_at', { ascending: true })
    .limit(500);

  if (error) {
    return errorJson(requestId, 'list_failed', 'Chưa tải được trace.', 500);
  }

  return NextResponse.json({ spans: data ?? [], request_id: requestId });
}
