import { defineTool } from "eve/tools";
import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";

import { recognizedCardSchema } from "../../lib/ai/card-recognition";
import {
  EnrichmentNotConfiguredError,
  runEnrichmentLoop,
} from "../../lib/ai/enrichment/loop";

/**
 * Làm giàu lead từ dữ liệu danh thiếp đã quét — bọc nguyên
 * `runEnrichmentLoop` của EventLead (cùng logic mà route
 * POST /api/enrichment/run và workflow bền của spec 003 đang dùng;
 * model gọi thẳng OpenAI theo cấu hình `lead_enrichment`).
 *
 * Kết quả chỉ là findings kèm confidence + nguồn để người dùng duyệt
 * trong EventLead — tool này KHÔNG ghi gì vào danh bạ.
 */
export default defineTool({
  description:
    "Làm giàu thông tin lead từ dữ liệu danh thiếp đã quét (RecognizedCard JSON): " +
    "chuẩn hoá và bổ sung các trường còn thiếu, trả findings kèm độ tin cậy và nguồn. " +
    "Chỉ gợi ý, không tự ghi vào danh bạ.",
  inputSchema: recognizedCardSchema,
  async execute(recognized, ctx) {
    const userId = ctx.session.auth.current?.principalId ?? null;
    try {
      const supabase = getSupabaseServerAdminClient();
      const result = await runEnrichmentLoop({
        recognized,
        userId,
        supabase,
      });
      return { available: true, ...result };
    } catch (err) {
      if (err instanceof EnrichmentNotConfiguredError) {
        return { available: false, message: err.message };
      }
      return {
        available: false,
        message:
          "Chạy làm giàu dữ liệu thất bại: " +
          (err instanceof Error ? err.message : "lỗi không xác định"),
      };
    }
  },
});
