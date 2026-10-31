import 'server-only';

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { checkEnrichmentConfigured } from "~/lib/ai/enrichment/loop";
import {
  MAX_BATCH_ENRICHMENT_CONTACTS,
  startBatchEnrichment,
} from "~/lib/ai/enrichment/batch-start";

/**
 * POST /api/enrichment/batch — làm giàu dữ liệu cho N contact có sẵn trong
 * danh bạ (tối đa 20) theo pattern durable run của POST /api/enrichment/start:
 * mỗi contact tạo MỘT run nền (fire-and-forget) + ghi sở hữu run→user.
 *
 * Input được chốt ngay tại start (FR-014): dữ liệu contact đọc trực tiếp từ
 * bảng contacts của đúng người dùng (RLS + eq user_id) rồi dựng RecognizedCard
 * — trường contact có giá trị là "extracted", còn lại "missing" để agent suy ra.
 *
 * Logic start run dùng chung helper `startBatchEnrichment`
 * (lib/ai/enrichment/batch-start.ts) — cùng nguồn với auto-enrich sau khi
 * xác nhận danh thiếp. Kết quả enrichment chỉ là gợi ý — route này KHÔNG ghi
 * dữ liệu contact.
 */

const bodySchema = z.object({
  contact_ids: z
    .array(z.string().uuid("Mã contact không hợp lệ."))
    .min(1, "Cần ít nhất một contact.")
    .max(MAX_BATCH_ENRICHMENT_CONTACTS, "Tối đa 20 contact mỗi lượt."),
});

function unauthorized(requestId: string) {
  return NextResponse.json(
    { code: "unauthorized", message: "Vui lòng đăng nhập.", request_id: requestId },
    { status: 401 },
  );
}

/**
 * POST /api/enrichment/batch
 * Body: { contact_ids: string[] } (1–20)
 * Trả: { started, runIds, skipped }
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized(requestId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "invalid_request", message: "Yêu cầu phải là JSON.", request_id: requestId },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: "invalid_request", message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.", request_id: requestId },
      { status: 400 },
    );
  }

  // Cổng cấu hình (FR-001): kiểm tra MỘT lần trước khi tạo run nào — chưa
  // cấu hình thì trả 503, không start workflow nào cả. (Helper tự kiểm tra
  // lại bên trong nên trường hợp này runIds luôn rỗng.)
  const check = await checkEnrichmentConfigured(user.id, supabase);
  if (!check.configured) {
    return NextResponse.json(
      {
        code: "enrichment_not_configured",
        message: check.message,
        request_id: requestId,
      },
      { status: 503 },
    );
  }

  const outcome = await startBatchEnrichment({
    userId: user.id,
    contactIds: parsed.data.contact_ids,
    supabase,
  });

  return NextResponse.json(
    {
      started: outcome.started,
      runIds: outcome.runIds,
      skipped: outcome.skipped,
      request_id: requestId,
    },
    { status: 200 },
  );
}
