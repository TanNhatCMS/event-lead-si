import { createGateway, generateText, Output, stepCountIs } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecognizedCard } from "@/lib/ai/card-recognition";
import {
  ENRICHABLE_FIELDS,
  enrichmentOutputSchema,
  enrichmentResultSchema,
  type EnrichmentResult,
  type EnrichmentStep,
} from "./types";
import { buildEnrichmentTools } from "./tools";
import { getGatewayApiKey, resolveEnrichmentConfig } from "./model-config";
import { loadEnrichmentMarkdown } from "./load-markdown";

/**
 * Vòng lặp agent thu thập/bổ sung thông tin từ dữ liệu quét danh thiếp.
 *
 * - Tối đa 6 steps: mỗi step LLM chọn tools → thực thi → kết quả được append
 *   vào context → lặp lại cho đến khi LLM trả kết luận (structured output)
 *   hoặc hết số step.
 * - Model lấy từ cấu hình `ai_model_configs` (capability `lead_enrichment`)
 *   của tổ chức, fallback `ENRICHMENT_MODEL`; key từ AI Gateway env.
 * - NGUYÊN TẮC: agent CHỈ trả findings kèm confidence + nguồn, KHÔNG tự ghi
 *   đè dữ liệu contact (hiến chương "AI gợi ý, người quyết định").
 */

const MAX_STEPS = 6;

// System prompt được viết ra file markdown (prompts/system.md) để dễ xem/sửa
// mà không cần đụng code; nội dung do file quyết định, code chỉ load vào lúc chạy.
const SYSTEM_PROMPT = loadEnrichmentMarkdown("prompts/system.md");

export class EnrichmentNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrichmentNotConfiguredError";
  }
}

export interface EnrichmentLoopInput {
  recognized: RecognizedCard;
  /** Id tổ chức để đọc cấu hình model; null khi không thuộc tổ chức nào. */
  organizationId: string | null;
  supabase?: SupabaseClient;
}

function buildUserPrompt(recognized: RecognizedCard): string {
  const lines = ENRICHABLE_FIELDS.map((key) => {
    const field = recognized.fields[key];
    const value = field.normalizedValue ?? field.rawValue ?? "(không có)";
    return `- ${key}: ${value} [trạng thái: ${field.state}]`;
  });
  return [
    "Dữ liệu đã quét từ danh thiếp (ngôn ngữ phát hiện: " + recognized.detectedLanguage + "):",
    ...lines,
    "",
    "Hãy dùng các công cụ để chuẩn hoá và bổ sung thông tin, rồi trả kết luận cuối cùng là danh sách findings.",
  ].join("\n");
}

function summarizeSteps(result: {
  steps: Array<{ toolCalls?: Array<{ toolName: string }> }>;
}): EnrichmentStep[] {
  return result.steps.map((step, index) => {
    const names = (step.toolCalls ?? []).map((call) => call.toolName);
    return {
      step: index + 1,
      tools: names,
      summary:
        names.length > 0
          ? `Gọi ${names.join(", ")}`
          : "Suy luận và tổng hợp kết luận",
    };
  });
}

/**
 * Chạy vòng lặp enrichment. Ném `EnrichmentNotConfiguredError` khi model/key
 * chưa được cấu hình — caller chuyển thành thông báo thân thiện cho UI.
 */
export async function runEnrichmentLoop(input: EnrichmentLoopInput): Promise<EnrichmentResult> {
  const config = await resolveEnrichmentConfig(input.organizationId, input.supabase);
  if (!config.enabled || !config.model) {
    throw new EnrichmentNotConfiguredError(
      "Chưa cấu hình model AI cho tính năng bổ sung thông tin. " +
        (config.source === "database"
          ? "Tổ chức đã tắt capability lead_enrichment trong cấu hình AI."
          : "Hãy đặt ENRICHMENT_MODEL trong biến môi trường hoặc cấu hình capability lead_enrichment cho tổ chức."),
    );
  }
  const apiKey = getGatewayApiKey();
  if (!apiKey) {
    throw new EnrichmentNotConfiguredError(
      "Chưa cấu hình AI Gateway. Hãy đặt AI_GATEWAY_API_KEY trong biến môi trường.",
    );
  }

  const provider = createGateway({ apiKey });
  const tools = buildEnrichmentTools();

  let generated;
  try {
    generated = await generateText({
      model: provider(config.model),
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(input.recognized),
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      maxOutputTokens: 2000,
      output: Output.object({ schema: enrichmentOutputSchema }),
    });
  } catch (err) {
    throw new Error(
      "Chạy agent làm giàu dữ liệu thất bại: " +
        (err instanceof Error ? err.message : "lỗi không xác định"),
    );
  }

  const findings = generated.output?.findings ?? [];
  return enrichmentResultSchema.parse({
    findings,
    steps: summarizeSteps(generated),
    modelUsed: `${config.source}:${config.model}`,
  });
}

/** Kiểm tra nhanh cấu hình mà không chạy loop (cho API trả lỗi thân thiện). */
export async function checkEnrichmentConfigured(
  organizationId: string | null,
  supabase?: SupabaseClient,
): Promise<{ configured: boolean; message: string | null }> {
  const config = await resolveEnrichmentConfig(organizationId, supabase);
  if (!config.enabled || !config.model) {
    return {
      configured: false,
      message:
        "Chức năng bổ sung thông tin AI chưa được cấu hình cho tổ chức này. " +
        "Liên hệ quản trị viên để bật capability lead_enrichment hoặc đặt ENRICHMENT_MODEL.",
    };
  }
  if (!getGatewayApiKey()) {
    return {
      configured: false,
      message: "Chưa cấu hình AI Gateway (thiếu AI_GATEWAY_API_KEY).",
    };
  }
  return { configured: true, message: null };
}
