import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";

import { logAudit } from "~/lib/audit/log-audit";

import { leadAssessmentSchema, type LeadAssessment } from "./types";

/**
 * Ghi nhận đánh giá độ nóng lead của agent enrichment.
 *
 * NGUYÊN TẮC (hiến chương "AI gợi ý, người quyết định"):
 * - KHÔNG đổi `relationship_stage` hay `labels` của contact — stage là do
 *   người dùng quản, assessment chỉ là GỢI Ý hiển thị.
 * - Đường nền (durable workflow) ghi 1 dòng `audit_logs` action
 *   'lead.assessed' kèm metadata heat/confidence/labels/reason — trang
 *   timeline của contact đọc audit này và render entry kind
 *   'lead_assessment'. Đường sync (panel quét thẻ) KHÔNG ghi gì — kết quả
 *   trả về UI để hiển thị badge, người dùng tự quyết.
 * - Chỉ ghi khi `heat_confidence` >= LEAD_ASSESSMENT_MIN_CONFIDENCE (0.6) —
 *   assessment thấp tin cậy không nên tạo dấu vết chính thức.
 * - Best-effort: lỗi ghi chỉ trả về qua kết quả, không bao giờ làm fail run
 *   enrichment (kết quả findings/company vẫn hữu ích cho người dùng).
 */

/** Ngưỡng heat_confidence tối thiểu để ghi nhận assessment vào timeline. */
export const LEAD_ASSESSMENT_MIN_CONFIDENCE = 0.6;

/** Assessment đủ tin cậy để ghi nhận hay chỉ hiển thị? */
export function isAssessmentActionable(assessment: LeadAssessment): boolean {
  return assessment.heat_confidence >= LEAD_ASSESSMENT_MIN_CONFIDENCE;
}

export interface RecordLeadAssessmentResult {
  recorded: boolean;
  /** Lý do bỏ qua khi không ghi ('low_confidence' | 'invalid_assessment' | 'update_failed'). */
  skippedReason: string | null;
}

/**
 * Ghi audit 'lead.assessed' cho một contact của đúng `userId`.
 *
 * - Assessment sai schema / thấp ngưỡng → bỏ qua (không ghi, không lỗi).
 * - Lỗi insert audit chỉ log console + trả recorded=false (best-effort).
 */
export async function recordLeadAssessment(input: {
  userId: string;
  contactId: string;
  assessment: unknown;
  modelUsed?: string;
  supabase: SupabaseClient<Database>;
}): Promise<RecordLeadAssessmentResult> {
  // Parse chống dữ liệu bẩn từ LLM — schema sai coi như không có assessment.
  const parsed = leadAssessmentSchema.safeParse(input.assessment);
  if (!parsed.success) {
    return { recorded: false, skippedReason: "invalid_assessment" };
  }
  const assessment = parsed.data;

  if (!isAssessmentActionable(assessment)) {
    return { recorded: false, skippedReason: "low_confidence" };
  }

  try {
    await logAudit(input.supabase, input.userId, {
      action: "lead.assessed",
      entityType: "contact",
      entityId: input.contactId,
      summary:
        "AI đánh giá lead: " +
        assessment.heat.toUpperCase() +
        " — " +
        assessment.reason,
      metadata: {
        heat: assessment.heat,
        heat_confidence: assessment.heat_confidence,
        suggested_labels: assessment.suggested_labels,
        reason: assessment.reason,
        model_used: input.modelUsed ?? null,
      },
    });
    return { recorded: true, skippedReason: null };
  } catch (err) {
    console.warn(
      "[enrichment] ghi lead.assessed thất bại (bỏ qua): " +
        (err instanceof Error ? err.message : String(err))
    );
    return { recorded: false, skippedReason: "update_failed" };
  }
}
