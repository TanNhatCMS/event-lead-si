import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { processIndexQueue } from '~/lib/ai/rag/contact-index';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/knowledge/worker
 *
 * Worker re-index danh bạ (FR-010): xử lý tối đa `batch_size` mục đang chờ
 * trong `rag_index_queue` (mặc định 50, tối đa 200), upsert/delete
 * `business_chunks`. Trả về thống kê `{ processed, upserted, deleted, failed, duration_ms }`.
 *
 * Xác thực 2 cách:
 * - Header `x-worker-secret` trùng `RAG_WORKER_SECRET` (dành cho scheduler/cron
 *   ngoài, chạy bằng service-role client để xử lý hàng đợi của mọi user).
 * - Hoặc session người dùng đã đăng nhập (kích hoạt thủ công, chỉ xử lý được
 *   trong phạm vi RLS của chính user đó).
 *
 * Cách kích hoạt theo lịch ≤ 5 phút:
 * 1. Cron ngoài (Vercel Cron / cron-job.org / crontab trên server):
 *    `curl -H "x-worker-secret: $RAG_WORKER_SECRET" https://<domain>/api/knowledge/worker`
 *    mỗi 5 phút. Đặt biến môi trường `RAG_WORKER_SECRET` (chuỗi ngẫu nhiên dài)
 *    trên hosting.
 * 2. Hoặc `GET /api/knowledge/worker` khi đã đăng nhập (chế độ thủ công/dev).
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const batchSize = Math.max(
    1,
    Math.min(200, Number(url.searchParams.get('batch_size')) || 50),
  );

  const workerSecret = (process.env.RAG_WORKER_SECRET ?? '').trim();
  const providedSecret = (request.headers.get('x-worker-secret') ?? '').trim();
  const isSchedulerCall = Boolean(workerSecret && providedSecret === workerSecret);

  try {
    if (isSchedulerCall) {
      const admin = getSupabaseServerAdminClient();
      const stats = await processIndexQueue(admin, batchSize);
      return NextResponse.json({ ...stats, request_id: requestId });
    }

    // Chế độ thủ công: yêu cầu đăng nhập.
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errorJson(
        requestId,
        'unauthorized',
        'Thiếu x-worker-secret hợp lệ và chưa đăng nhập.',
        401,
      );
    }
    const stats = await processIndexQueue(supabase, batchSize);
    return NextResponse.json({ ...stats, request_id: requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorJson(
      requestId,
      'internal',
      message.includes('relation') || message.includes('schema cache')
        ? 'Chức năng index chưa sẵn sàng: migration bảng RAG chưa được áp dụng trên Supabase (xem issue #35).'
        : `Worker index thất bại: ${message}`,
      500,
    );
  }
}
