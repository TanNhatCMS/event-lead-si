import 'server-only';

import { NextResponse } from "next/server";

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getRun } from "workflow/api";
import { WorkflowRunFailedError, WorkflowRunNotFoundError } from "workflow/errors";

import type { EnrichmentResult } from "~/lib/ai/enrichment/types";

type RouteContext = { params: Promise<{ runId: string }> };

const FAILED_FALLBACK_MESSAGE = "Lần chạy làm giàu đã thất bại, vui lòng thử lại.";
const LOOKUP_FAILED_MESSAGE = "Không tra cứu được lần chạy, vui lòng thử lại.";

function unauthorized(requestId: string) {
  return NextResponse.json(
    { code: "unauthorized", message: "Vui lòng đăng nhập.", request_id: requestId },
    { status: 401 },
  );
}

function runNotFound(requestId: string) {
  return NextResponse.json(
    { code: "run_not_found", message: "Không tìm thấy lần chạy.", request_id: requestId },
    { status: 404 },
  );
}

function runLookupFailed(requestId: string) {
  // Mã phụ NGOÀI contract (contract §2 chỉ định nghĩa 200/401/404 cho route
  // này): dùng khi World/SDK lỗi ngoài dự kiến để handler luôn trả JSON kèm
  // request_id thay vì để Next trả trang lỗi HTML, và để không map nhầm
  // sang 404/failed.
  return NextResponse.json(
    { code: "run_lookup_failed", message: LOOKUP_FAILED_MESSAGE, request_id: requestId },
    { status: 500 },
  );
}

/**
 * Trích message gốc từ WorkflowRunFailedError.
 *
 * SDK 5.2.3: `cause` là lỗi gốc của workflow/step (typed `unknown` — có thể
 * là Error, string, hoặc object có `message`). err.message của chính
 * WorkflowRunFailedError có dạng `Workflow run "<runId>" failed: <message>`
 * nên chỉ dùng phần hậu tố của nó làm nguồn dự phòng, tránh lộ tiền tố nội
 * bộ SDK. Không trích được → null để caller dùng fallback thân thiện cố
 * định (không lộ stack/chi tiết nội bộ ra response).
 */
function extractFailedMessage(err: WorkflowRunFailedError, runId: string): string | null {
  const cause: unknown = err.cause;
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === "string" && cause.trim()) return cause;
  if (cause && typeof cause === "object" && "message" in cause) {
    const raw = (cause as { message: unknown }).message;
    if (typeof raw === "string" && raw.trim()) return raw;
  }
  const prefix = `Workflow run "${runId}" failed: `;
  if (err.message.startsWith(prefix)) {
    const rest = err.message.slice(prefix.length).trim();
    if (rest && rest !== "Unknown error") return rest;
  }
  return null;
}

/**
 * GET /api/enrichment/runs/[runId]
 *
 * Tra cứu trạng thái và kết quả của một lần chạy làm giàu nền (durable
 * workflow). Ánh xạ trạng thái SDK → API theo contract §2 của
 * specs/003-durable-lead-enrichment.
 *
 * Quyết định D5 / FR-015 phương án (a) — v1: chỉ yêu cầu đăng nhập +
 * runId khó đoán, KHÔNG kiểm tra sở hữu, KHÔNG lưu bảng mapping
 * run→user, KHÔNG migration.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { runId } = await params;

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized(requestId);

  try {
    // SDK 5.2.3 (đã kiểm chứng trong node_modules): getRun là hàm ĐỒNG BỘ
    // trả handle Run; các getter status/returnValue/exists mới là Promise.
    // Run KHÔNG có getter .error.
    const run = getRun<EnrichmentResult>(runId);

    // Không tồn tại → 404 run_not_found (FR-010/AC-008): ưu tiên run.exists.
    // Một số World báo không-tồn-tại bằng WorkflowRunNotFoundError khi đọc
    // exists/status thay vì exists=false — catch ngoài map về cùng 404.
    if (!(await run.exists)) return runNotFound(requestId);

    const status = await run.status;

    switch (status) {
      case "completed":
        // CHỈ await returnValue ở nhánh completed/failed (đều terminal):
        // getter này long-poll chờ run kết thúc, await ở nhánh chưa kết
        // thúc sẽ treo request. result là EnrichmentResult nguyên vẹn,
        // cùng cấu trúc response 200 của POST /run (FR-008/AC-005).
        // Lỗi IO/World khi đọc ở đây rơi xuống catch ngoài → 500.
        return NextResponse.json(
          { status: "completed", result: await run.returnValue, request_id: requestId },
          { status: 200 },
        );
      case "failed": {
        // Vẫn HTTP 200 vì tra cứu thành công — lỗi thuộc về run (FR-009).
        // KHÁC mô tả sơ lược "run.error" trong contract/tasks: SDK 5.2.3
        // không có getter error trên Run (đã kiểm chứng run.d.ts). Message
        // đúng phải lấy qua ngoại lệ khi await returnValue: vì status đã
        // là 'failed' (terminal) nên await ném ngay WorkflowRunFailedError
        // (không long-poll), mang cause là lỗi gốc (vd FatalError /
        // EnrichmentNotConfiguredError hoặc lỗi model sau khi hết retry).
        let message = FAILED_FALLBACK_MESSAGE;
        try {
          await run.returnValue;
        } catch (err) {
          if (WorkflowRunFailedError.is(err)) {
            message = extractFailedMessage(err, runId) ?? FAILED_FALLBACK_MESSAGE;
          } else if (WorkflowRunNotFoundError.is(err)) {
            return runNotFound(requestId);
          } else {
            // Lỗi SDK/World ngoài dự kiến (không phải Failed/NotFound):
            // không ngụy trang thành lỗi của run — đẩy ra catch ngoài → 500.
            throw err;
          }
        }
        return NextResponse.json(
          { status: "failed", error: { message }, request_id: requestId },
          { status: 200 },
        );
      }
      default:
        // 'pending', 'running' và mọi trạng thái chưa kết thúc khác (kể cả
        // 'cancelled' của enum SDK — v1 không có chức năng hủy) → running,
        // TUYỆT ĐỐI không kèm khóa result.
        return NextResponse.json(
          { status: "running", request_id: requestId },
          { status: 200 },
        );
    }
  } catch (err) {
    if (WorkflowRunNotFoundError.is(err)) return runNotFound(requestId);
    return runLookupFailed(requestId);
  }
}
