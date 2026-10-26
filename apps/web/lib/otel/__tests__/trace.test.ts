import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { endSpanError, endSpanOk, startUserSpan, USER_ID_ATTR } from '../trace';

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  // SDK v2: BasicTracerProvider không còn addSpanProcessor()/register() —
  // processor truyền qua constructor, đăng ký global qua API trace.
  provider = new BasicTracerProvider({
    // SimpleSpanProcessor của sdk-trace-base giữ signature cũ: nhận exporter trực tiếp.
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  // Đăng ký provider này làm global để trace.getTracer('eventlead-web')
  // trong lib/otel/trace.ts tạo span qua nó.
  trace.setGlobalTracerProvider(provider);
});

afterEach(async () => {
  await provider.shutdown();
  // Gỡ global để test sau đăng ký được provider mới của nó.
  trace.disable();
});

/** Lấy span duy nhất đã export (test nào cũng chỉ tạo đúng 1 span). */
function singleSpan() {
  const spans = exporter.getFinishedSpans();
  expect(spans).toHaveLength(1);
  const span = spans[0];
  if (!span) throw new Error('expected one finished span');
  return span;
}

describe('startUserSpan', () => {
  it('gắn app.user_id và attributes tùy chọn lên span', () => {
    const span = startUserSpan('rag.chat', 'user-123', {
      'rag.chunks_count': 5,
      'rag.model': 'anthropic/claude-sonnet-4-5',
    });
    endSpanOk(span);

    const finished = singleSpan();
    expect(finished.name).toBe('rag.chat');
    expect(finished.attributes[USER_ID_ATTR]).toBe('user-123');
    expect(finished.attributes['rag.chunks_count']).toBe(5);
    expect(finished.attributes['rag.model']).toBe('anthropic/claude-sonnet-4-5');
  });

  it('endSpanOk đặt status OK', () => {
    const span = startUserSpan('rag.chat', 'user-123');
    endSpanOk(span);

    expect(singleSpan().status.code).toBe(SpanStatusCode.OK);
  });

  it('endSpanError đặt status ERROR kèm message và exception', () => {
    const span = startUserSpan('rag.chat', 'user-123');
    endSpanError(span, new Error('model lỗi'));

    const finished = singleSpan();
    expect(finished.status.code).toBe(SpanStatusCode.ERROR);
    expect(finished.status.message).toContain('model lỗi');
    expect(finished.events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('endSpanError với non-Error không ném lỗi', () => {
    const span = startUserSpan('rag.chat', 'user-123');
    expect(() => endSpanError(span, 'chuỗi lỗi')).not.toThrow();

    expect(singleSpan().status.code).toBe(SpanStatusCode.ERROR);
  });
});
