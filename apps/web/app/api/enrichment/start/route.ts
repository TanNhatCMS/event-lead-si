import 'server-only';

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { recognizedCardSchema, type RecognizedCard } from "~/lib/ai/card-recognition";
import { ENRICHABLE_FIELDS } from "~/lib/ai/enrichment/types";
import { checkEnrichmentConfigured } from "~/lib/ai/enrichment/loop";
import { recordRunOwner } from "~/lib/ai/enrichment/run-ownership";
import { start } from "workflow/api";
import { enrichLeadWorkflow } from "~/lib/ai/enrichment/workflow";

const bodySchema = z
  .object({
    recognized: recognizedCardSchema.optional(),
    // Alias theo spec task — tương đương `recognized`.
    fields: recognizedCardSchema.optional(),
    cardImportId: z.string().uuid("Mã cardImportId không hợp lệ.").optional(),
  })
  .refine((v) => v.recognized ?? v.fields ?? v.cardImportId, {
    message: "Thiếu dữ liệu: cần `recognized`/`fields` hoặc `cardImportId`.",
  });

/**
 * Dựng RecognizedCard từ `recognition_result.confirmed` (object chuỗi đơn giản
 * mà route /confirm lưu) khi chưa có recognized_snapshot.
 */
function confirmedToRecognized(
  confirmed: Record<string, unknown>,
): RecognizedCard | null {
  const fields = {} as RecognizedCard["fields"];
  for (const key of ENRICHABLE_FIELDS) {
    const raw = confirmed[key];
    const value = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    fields[key] = {
      rawValue: null,
      normalizedValue: value,
      state: value ? "extracted" : "missing",
    };
  }
  const parsed = recognizedCardSchema.safeParse({
    schemaVersion: 1,
    detectedLanguage: "unknown",
    fields,
  });
  return parsed.success ? parsed.data : null;
}

function unauthorized(requestId: string) {
  return NextResponse.json(
    { code: "unauthorized", message: "Vui lòng đăng nhập.", request_id: requestId },
    { status: 401 },
  );
}

/**
 * POST /api/enrichment/start
 *
 * Khởi chạy làm giàu dữ liệu ở chế độ nền (durable workflow) và trả `runId`
 * ngay, không chờ kết quả. Input được chốt ngay tại start (FR-014): nhận
 * `{ recognized }` (hoặc alias `{ fields }`) hoặc `{ cardImportId }` (đọc
 * snapshot đã lưu trong card_imports của đúng người dùng).
 *
 * Mọi trường hợp lỗi (401/400/404/422/503) đều không tạo run nào (FR-001).
 * Kết quả enrichment chỉ là gợi ý — route này không ghi dữ liệu contact.
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

  let recognized: RecognizedCard | undefined = parsed.data.recognized ?? parsed.data.fields;
  if (!recognized && parsed.data.cardImportId) {
    const { data, error } = await supabase
      .from("card_imports")
      .select("recognition_result")
      .eq("id", parsed.data.cardImportId)
      .eq("user_id", user.id)
      .maybeSingle();
    const recognitionResult = (data?.recognition_result ?? null) as {
      recognized_snapshot?: unknown;
      confirmed?: Record<string, unknown>;
    } | null;
    if (error || !recognitionResult) {
      return NextResponse.json(
        { code: "import_not_found", message: "Không tìm thấy bản ghi quét danh thiếp.", request_id: requestId },
        { status: 404 },
      );
    }
    const snapshot = recognizedCardSchema.safeParse(recognitionResult.recognized_snapshot);
    if (snapshot.success) {
      recognized = snapshot.data;
    } else if (recognitionResult.confirmed) {
      recognized = confirmedToRecognized(recognitionResult.confirmed) ?? undefined;
    }
    if (!recognized) {
      return NextResponse.json(
        { code: "invalid_snapshot", message: "Dữ liệu quét đã lưu không dùng được cho làm giàu.", request_id: requestId },
        { status: 422 },
      );
    }
  }

  if (!recognized) {
    return NextResponse.json(
      { code: "invalid_request", message: "Thiếu dữ liệu danh thiếp.", request_id: requestId },
      { status: 400 },
    );
  }

  // Cổng cấu hình D4 (spec FR-001, plan §6): kiểm tra TRƯỚC khi tạo run và
  // SAU khi đã chốt input — chưa cấu hình thì trả 503 và DỪNG, không gọi
  // start(), không tạo run nào.
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

  const run = await start(enrichLeadWorkflow, [recognized, user.id]);

  // Sở hữu lần chạy — quyết định cuối D5 phương án (b) (FR-015): ghi
  // mapping run→user ngay khi start để route tra cứu kiểm tra được sở
  // hữu. Không ghi được mapping (vd migration 20261024053000 chưa áp
  // dụng) thì trả 500 thay vì phát hành một runId không ai tra cứu
  // được — run vẫn chạy nền nhưng bị coi là không tồn tại khi tra cứu
  // (fail-closed, xem run-ownership.ts).
  const recorded = await recordRunOwner(
    getSupabaseServerAdminClient(),
    run.runId,
    user.id,
  );
  if (!recorded) {
    return NextResponse.json(
      {
        code: "run_tracking_failed",
        message:
          "Đã khởi chạy nhưng không lưu được thông tin lần chạy để tra cứu, vui lòng thử lại sau.",
        request_id: requestId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ runId: run.runId, request_id: requestId }, { status: 201 });
}
