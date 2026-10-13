import 'server-only';

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { recognizedCardSchema, type RecognizedCard } from "~/lib/ai/card-recognition";
import { ENRICHABLE_FIELDS } from "~/lib/ai/enrichment/types";
import {
  checkEnrichmentConfigured,
  EnrichmentNotConfiguredError,
  runEnrichmentLoop,
} from "~/lib/ai/enrichment/loop";

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
 * POST /api/enrichment/run
 *
 * Chạy agent loop làm giàu dữ liệu từ kết quả quét danh thiếp.
 * Nhận `{ recognized }` (hoặc alias `{ fields }` — RecognizedCard) hoặc
 * `{ cardImportId }` (đọc snapshot đã lưu trong card_imports của đúng người dùng).
 *
 * Kết quả trả về là DANH SÁCH GỢI Ý (findings) kèm độ tin cậy và nguồn —
 * route này KHÔNG tự ghi đè bất kỳ dữ liệu liên hệ nào. Người dùng tự quyết
 * định "Áp dụng" từng gợi ý trên giao diện.
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

  // Kiểm tra cấu hình trước khi gọi model — trả lỗi thân thiện cho UI.
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

  try {
    const result = await runEnrichmentLoop({
      recognized,
      userId: user.id,
      supabase,
    });
    return NextResponse.json({ ...result, request_id: requestId }, { status: 200 });
  } catch (err) {
    if (err instanceof EnrichmentNotConfiguredError) {
      return NextResponse.json(
        { code: "enrichment_not_configured", message: err.message, request_id: requestId },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        code: "enrichment_failed",
        message: err instanceof Error ? err.message : "Bổ sung thông tin thất bại, vui lòng thử lại.",
        request_id: requestId,
      },
      { status: 502 },
    );
  }
}
