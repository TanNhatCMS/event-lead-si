import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

interface SpanRow {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  status_code: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
}

/**
 * GET /api/traces
 *
 * Danh sách trace gần nhất của user (gom từ otel_spans).
 * Mỗi trace: root span, số span, tổng thời gian, thời điểm bắt đầu, trạng thái.
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
    return errorJson(requestId, 'invalid_query', 'Tham số không hợp lệ.', 400);
  }

  const { data, error } = await supabase
    .from('otel_spans')
    .select('trace_id, span_id, parent_span_id, name, status_code, started_at, ended_at, duration_ms')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(500);

  if (error) {
    return errorJson(requestId, 'list_failed', 'Chưa tải được danh sách trace.', 500);
  }

  const byTrace = new Map<string, SpanRow[]>();
  for (const row of (data ?? []) as SpanRow[]) {
    const list = byTrace.get(row.trace_id) ?? [];
    list.push(row);
    byTrace.set(row.trace_id, list);
  }

  const traces = [...byTrace.entries()]
    .map(([traceId, spans]) => {
      const sorted = [...spans].sort((a, b) => a.started_at.localeCompare(b.started_at));
      const root = sorted.find((s) => !s.parent_span_id) ?? sorted[0];
      const start = sorted[0]?.started_at ?? '';
      const end = sorted.reduce((m, s) => (s.ended_at > m ? s.ended_at : m), '');
      const hasError = spans.some((s) => s.status_code === 'ERROR');
      return {
        trace_id: traceId,
        root_name: root?.name ?? '(không tên)',
        span_count: spans.length,
        started_at: start,
        duration_ms: Math.round(
          new Date(end).getTime() - new Date(start).getTime(),
        ),
        has_error: hasError,
      };
    })
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, parsed.data.limit);

  return NextResponse.json({ traces, request_id: requestId });
}
