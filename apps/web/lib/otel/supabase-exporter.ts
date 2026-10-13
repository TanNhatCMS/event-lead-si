import 'server-only';

import {
  ExportResultCode,
  type ExportResult,
} from '@opentelemetry/core';
import {
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

const USER_ID_ATTR = 'app.user_id';

function hrTimeToIso(hrTime: [number, number]): string {
  return new Date(hrTime[0] * 1000 + hrTime[1] / 1e6).toISOString();
}

function hrTimeToMs(start: [number, number], end: [number, number]): number {
  return (end[0] - start[0]) * 1000 + (end[1] - start[1]) / 1e6;
}

function kindToString(kind: SpanKind): string {
  switch (kind) {
    case SpanKind.CLIENT:
      return 'CLIENT';
    case SpanKind.SERVER:
      return 'SERVER';
    case SpanKind.PRODUCER:
      return 'PRODUCER';
    case SpanKind.CONSUMER:
      return 'CONSUMER';
    default:
      return 'INTERNAL';
  }
}

function statusToString(code: SpanStatusCode): 'UNSET' | 'OK' | 'ERROR' {
  switch (code) {
    case SpanStatusCode.OK:
      return 'OK';
    case SpanStatusCode.ERROR:
      return 'ERROR';
    default:
      return 'UNSET';
  }
}

/** Chuyển attributes/events của span thành JSON an toàn để lưu jsonb. */
function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

interface SpanRow {
  user_id: string | null;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  status_code: 'UNSET' | 'OK' | 'ERROR';
  status_message: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  attributes: unknown;
  events: unknown;
}

/**
 * SpanExporter ghi OpenTelemetry spans vào bảng public.otel_spans qua service-role.
 *
 * user_id được lấy từ attribute 'app.user_id' (do parent span thủ công gắn).
 * Span của AI SDK không có attribute này nên exporter tự điền bù:
 *  1. từ span cùng trace trong batch hiện tại,
 *  2. từ DB (span cùng trace đã ghi trước đó),
 *  3. sau khi insert, update bù các dòng cùng trace còn thiếu user_id.
 */
export class SupabaseSpanExporter implements SpanExporter {
  private warnedNoKey = false;

  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): Promise<void> {
    try {
      await this.doExport(spans);
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (err) {
      console.error('[otel] export failed:', err instanceof Error ? err.message : err);
      resultCallback({ code: ExportResultCode.FAILED });
    }
  }

  private async doExport(spans: ReadableSpan[]): Promise<void> {
    if (spans.length === 0) return;

    let supabase;
    try {
      supabase = getSupabaseServerAdminClient();
    } catch {
      if (!this.warnedNoKey) {
        this.warnedNoKey = true;
        console.warn('[otel] SUPABASE_SERVICE_ROLE_KEY chưa cấu hình — bỏ qua lưu spans.');
      }
      return;
    }

    const rows: SpanRow[] = spans.map((span) => {
      const attrs = span.attributes ?? {};
      const rawUserId = attrs[USER_ID_ATTR];
      return {
        user_id: typeof rawUserId === 'string' && rawUserId.length > 0 ? rawUserId : null,
        trace_id: span.spanContext().traceId,
        span_id: span.spanContext().spanId,
        parent_span_id: span.parentSpanId ?? null,
        name: span.name,
        kind: kindToString(span.kind),
        status_code: statusToString(span.status.code),
        status_message: span.status.message ?? null,
        started_at: hrTimeToIso(span.startTime),
        ended_at: hrTimeToIso(span.endTime),
        duration_ms: hrTimeToMs(span.startTime, span.endTime),
        attributes: toJsonSafe(attrs) ?? {},
        events: (span.events ?? []).map((e) => ({
          name: e.name,
          time: hrTimeToIso(e.time),
          attributes: toJsonSafe(e.attributes) ?? {},
        })),
      };
    });

    // 1. Điền từ batch hiện tại: trace_id -> user_id.
    const batchUser = new Map<string, string>();
    for (const row of rows) {
      if (row.user_id && !batchUser.has(row.trace_id)) {
        batchUser.set(row.trace_id, row.user_id);
      }
    }
    const stillMissing = new Set<string>();
    for (const row of rows) {
      if (!row.user_id) {
        const found = batchUser.get(row.trace_id);
        if (found) row.user_id = found;
        else stillMissing.add(row.trace_id);
      }
    }

    // 2. Điền từ DB: span cùng trace đã ghi trước đó.
    if (stillMissing.size > 0) {
      const traceIds = [...stillMissing];
      const { data } = await supabase
        .from('otel_spans')
        .select('trace_id, user_id')
        .in('trace_id', traceIds)
        .not('user_id', 'is', null)
        .limit(traceIds.length * 5);
      const dbUser = new Map<string, string>();
      for (const r of data ?? []) {
        if (r.user_id && !dbUser.has(r.trace_id)) dbUser.set(r.trace_id, r.user_id);
      }
      for (const row of rows) {
        if (!row.user_id) {
          const found = dbUser.get(row.trace_id);
          if (found) row.user_id = found;
        }
      }
    }

    const { error } = await supabase.from('otel_spans').insert(rows as never);
    if (error) {
      // Bỏ qua lỗi trùng span (retry) — không làm ồn log.
      if (!error.message.includes('duplicate')) {
        console.error('[otel] insert spans failed:', error.message);
      }
    }

    // 3. Update bù user_id cho các dòng cùng trace còn thiếu.
    const withUser = new Map<string, string>();
    for (const row of rows) {
      if (row.user_id && !withUser.has(row.trace_id)) withUser.set(row.trace_id, row.user_id);
    }
    for (const [traceId, userId] of withUser) {
      const { error: updateError } = await supabase
        .from('otel_spans')
        .update({ user_id: userId })
        .eq('trace_id', traceId)
        .is('user_id', null);
      if (updateError) {
        console.error('[otel] backfill user_id failed:', updateError.message);
      }
    }
  }

  async shutdown(): Promise<void> {
    // Không giữ tài nguyên cần dọn.
  }
}
