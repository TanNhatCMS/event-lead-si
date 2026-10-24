import 'server-only';

import { SpanStatusCode, trace, type Attributes, type Span } from '@opentelemetry/api';

/** Tên attribute dùng để gắn user_id lên span (exporter đọc để điền user_id). */
export const USER_ID_ATTR = 'app.user_id';

const tracer = trace.getTracer('eventlead-web');

/**
 * Tạo span thủ công có gắn user_id và trả về cho caller tự quản lý vòng đời.
 *
 * Dùng cho các flow streaming (chat RAG): streamText() của AI SDK là lazy —
 * model chỉ được gọi khi response stream được tiêu thụ, tức là sau khi route
 * handler đã trả về. withUserSpan sẽ đóng span ngay khi streamText() trả về
 * (duration ~0 và các span con của AI SDK không còn active context để bám vào),
 * nên với streaming phải giữ span mở thủ công và đóng trong onFinish/onError.
 */
export function startUserSpan(
  name: string,
  userId: string,
  attributes?: Attributes,
): Span {
  return tracer.startSpan(name, {
    attributes: { [USER_ID_ATTR]: userId, ...attributes },
  });
}

/** Kết thúc span với trạng thái OK. Gọi end() lần 2 là no-op an toàn. */
export function endSpanOk(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/** Kết thúc span với trạng thái ERROR và ghi nhận exception (nếu có). */
export function endSpanError(span: Span, err: unknown): void {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: err instanceof Error ? err.message : 'unknown error',
  });
  if (err instanceof Error) {
    span.recordException(err);
  }
  span.end();
}
/**
 * Chạy fn trong một parent span có gắn user_id.
 * Các span con của AI SDK (experimental_telemetry) sẽ cùng trace_id,
 * exporter tự điền user_id cho chúng (xem lib/otel/supabase-exporter.ts).
 *
 * Chỉ dùng cho các flow KHÔNG streaming (generateText awaited...). Với flow
 * streaming, dùng startUserSpan + tự đóng span trong onFinish/onError.
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
