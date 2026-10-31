import 'server-only';

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import {
  recognizedCardSchema,
  type RecognizedCard,
} from "~/lib/ai/card-recognition";
import { checkEnrichmentConfigured } from "~/lib/ai/enrichment/loop";
import { recordRunOwner } from "~/lib/ai/enrichment/run-ownership";
import { start } from "workflow/api";
import { enrichLeadWorkflow } from "~/lib/ai/enrichment/workflow";
import type { EnrichmentTarget } from "~/lib/ai/enrichment/workflow";

/**
 * POST /api/enrichment/batch — làm giàu dữ liệu cho N contact có sẵn trong
 * danh bạ (tối đa 20) theo pattern durable run của POST /api/enrichment/start:
 * mỗi contact tạo MỘT run nền (fire-and-forget) + ghi sở hữu run→user.
 *
 * Input được chốt ngay tại start (FR-014): dữ liệu contact đọc trực tiếp từ
 * bảng contacts của đúng người dùng (RLS + eq user_id) rồi dựng RecognizedCard
 * — trường contact có giá trị là "extracted", còn lại "missing" để agent suy ra.
 *
 * Kết quả enrichment chỉ là gợi ý — route này KHÔNG ghi dữ liệu contact.
 */

const bodySchema = z.object({
  contact_ids: z
    .array(z.string().uuid("Mã contact không hợp lệ."))
    .min(1, "Cần ít nhất một contact.")
    .max(20, "Tối đa 20 contact mỗi lượt."),
});

const CONTACT_FIELDS = [
  "id",
  "full_name",
  "job_title",
  "email",
  "phone",
  "address",
  "company_id",
  "companies(name)",
] as const;

interface ContactRow {
  id: string;
  full_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  company_id: string | null;
  companies: { name: string | null } | { name: string | null }[] | null;
}

function field(value: string | null) {
  const normalized = value?.trim() ? value.trim() : null;
  return {
    rawValue: null,
    normalizedValue: normalized,
    state: normalized ? "extracted" : "missing",
  } as const;
}

/** Dựng RecognizedCard từ dữ liệu contact của danh bạ. */
function contactToRecognized(contact: ContactRow): RecognizedCard {
  const company = Array.isArray(contact.companies)
    ? (contact.companies[0]?.name ?? null)
    : (contact.companies?.name ?? null);
  return recognizedCardSchema.parse({
    schemaVersion: 1,
    detectedLanguage: "unknown",
    fields: {
      fullName: field(contact.full_name),
      jobTitle: field(contact.job_title),
      companyName: field(company),
      email: field(contact.email),
      phone: field(contact.phone),
      address: field(contact.address),
      website: field(null),
    },
  });
}

/**
 * Đích áp company findings: contact có gắn công ty thì run nền hoàn tất sẽ
 * tự điền các trường công ty còn trống (FR-008, xem lib/ai/enrichment/apply.ts).
 */
function targetFor(contact: ContactRow): EnrichmentTarget {
  return { contactId: contact.id, companyId: contact.company_id ?? undefined };
}

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
  // cấu hình thì trả 503, không start workflow nào cả.
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

  // Dedupe giữ thứ tự — một contact chỉ tạo một run trong lượt gọi này.
  const ids = Array.from(new Set(parsed.data.contact_ids));

  const runIds: string[] = [];
  const skipped: Array<{ contact_id: string; reason: string }> = [];

  // Tuần tự (queue đơn giản) — start() không chờ run chạy xong nên tổng thời
  // gian phản hồi vẫn ngắn; số run lớn không làm quá tải Supabase.
  for (const contactId of ids) {
    const { data, error } = await supabase
      .from("contacts")
      .select(CONTACT_FIELDS.join(", "))
      .eq("id", contactId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      skipped.push({ contact_id: contactId, reason: "not_found" });
      continue;
    }

    let recognized: RecognizedCard;
    try {
      recognized = contactToRecognized(data as unknown as ContactRow);
    } catch {
      skipped.push({ contact_id: contactId, reason: "invalid_contact" });
      continue;
    }

    try {
      const run = await start(enrichLeadWorkflow, [recognized, user.id, targetFor(data as unknown as ContactRow)]);
      // Sở hữu lần chạy (FR-015, fail-closed): không ghi được mapping thì
      // KHÔNG phát hành runId — run vẫn chạy nền nhưng bị coi là không tồn
      // tại khi tra cứu (cùng hành vi với route /start).
      const recorded = await recordRunOwner(
        getSupabaseServerAdminClient(),
        run.runId,
        user.id,
      );
      if (!recorded) {
        skipped.push({ contact_id: contactId, reason: "run_tracking_failed" });
        continue;
      }
      runIds.push(run.runId);
    } catch (err) {
      console.warn(
        "[enrichment/batch] start run cho contact " +
          contactId +
          " thất bại: " +
          (err instanceof Error ? err.message : String(err)),
      );
      skipped.push({ contact_id: contactId, reason: "start_failed" });
    }
  }

  return NextResponse.json(
    {
      started: runIds.length,
      runIds,
      skipped,
      request_id: requestId,
    },
    { status: 200 },
  );
}
