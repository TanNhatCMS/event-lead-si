import { FatalError } from "workflow";
import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";
import type { RecognizedCard } from "~/lib/ai/card-recognition";
import { EnrichmentNotConfiguredError, runEnrichmentLoop } from "./loop";
import { applyCompanyFindings } from "./apply";
import type { EnrichmentResult } from "./types";

/**
 * Đích áp kết quả company (FR-008) cho đường nền: contact đang gắn với công
 * ty nào. Cả hai trường đều tùy chọn — thiếu companyId nghĩa là không có gì
 * để áp (input tự do, chưa lưu danh bạ).
 */
export interface EnrichmentTarget {
  contactId?: string;
  companyId?: string;
}

export async function enrichLeadWorkflow(
  recognized: RecognizedCard,
  userId: string,
  target?: EnrichmentTarget,
) {
  "use workflow";
  return runEnrichmentStep(recognized, userId, target);
}

async function runEnrichmentStep(
  recognized: RecognizedCard,
  userId: string,
  target?: EnrichmentTarget,
): Promise<EnrichmentResult> {
  "use step";
  const supabase = getSupabaseServerAdminClient();
  try {
    const result = await runEnrichmentLoop({ recognized, userId, supabase });

    // Áp company findings cho đường nền (FR-008): contact có company_id thì
    // tự điền các trường công ty CÒN TRỐNG + nâng profile_state +
    // audit 'company.enriched'. Best-effort — lỗi apply KHÔNG làm fail run
    // (gợi ý vẫn trả về UI cho người dùng xem/áp tay). Apply chỉ điền trường
    // trống nên retry của step không gây ghi đè dữ liệu người dùng.
    if (target?.companyId && result.company) {
      try {
        const applied = await applyCompanyFindings(
          userId,
          target.companyId,
          result.company,
          supabase,
        );
        if (applied.error) {
          console.warn(
            "[enrichment] apply company findings báo lỗi: " + applied.error,
          );
        } else if (applied.appliedFields.length > 0) {
          console.log(
            "[enrichment] đã áp company findings: " +
              applied.appliedFields.join(", "),
          );
        }
      } catch (err) {
        console.warn(
          "[enrichment] áp company findings thất bại (bỏ qua): " +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    return result;
  } catch (err) {
    if (err instanceof EnrichmentNotConfiguredError) throw new FatalError(err.message);
    throw err; // lỗi còn lại: RetryableError mặc định của SDK (tối đa 3 lần retry sau lần đầu — tổng tối đa 4 lần thực thi; plan §8.1)
  }
}
