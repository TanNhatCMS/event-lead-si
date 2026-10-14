import 'server-only';

import { SpanStatusCode, trace } from '@opentelemetry/api';

/** Tên attribute dùng để gắn user_id lên span (exporter đọc để điền user_id). */
export const USER_ID_ATTR = 'app.user_id';

const tracer = trace.getTracer('eventlead-web');

/**
 * Chạy fn trong một parent span có gắn user_id.
 * Các span con của AI SDK (experimental_telemetry) sẽ cùng trace_id,
 * exporter tự điền user_id cho chúng (xem lib/otel/supabase-exporter.ts).
 */
export async function withUserSpan<T>(
  name: string,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { attributes: { [USER_ID_ATTR]: userId } },
    async (span) => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : 'unknown error',
        });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    },
  );
}
