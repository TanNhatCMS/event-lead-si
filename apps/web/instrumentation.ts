/**
 * This file is used to register monitoring instrumentation
 * for your Next.js application.
 */
import { type Instrumentation } from 'next';

/**
 * Đăng ký OpenTelemetry: mọi span của AI SDK (experimental_telemetry)
 * và parent span thủ công (lib/otel/trace.ts) được exporter ghi vào
 * bảng public.otel_spans qua service-role.
 *
 * Chỉ chạy trên Node.js runtime. Nếu SUPABASE_SERVICE_ROLE_KEY chưa có,
 * exporter bỏ qua việc ghi (xem lib/otel/supabase-exporter.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
    const { SupabaseSpanExporter } = await import('./lib/otel/supabase-exporter');

    const provider = new NodeTracerProvider({
      spanProcessors: [
        new BatchSpanProcessor(new SupabaseSpanExporter(), {
          // Xuất nhanh để UI xem trace gần như realtime (mặc định 5000ms).
          scheduledDelayMillis: 1000,
        }),
      ],
    });
    provider.register();
  }
}

/**
 * @name onRequestError
 * @description This function is called when an error occurs during the request lifecycle.
 * It is used to capture the error and send it to the monitoring service.
 * @param err
 */
export const onRequestError: Instrumentation.onRequestError = (err) => {
  console.error(`Server Side Error:`, err);
};
