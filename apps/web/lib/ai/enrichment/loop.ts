import { generateText, Output, stepCountIs, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";
import { withUserSpan } from "~/lib/otel/trace";

import type { RecognizedCard } from "~/lib/ai/card-recognition";
import {
  ENRICHABLE_FIELDS,
  enrichmentOutputSchema,
  enrichmentResultSchema,
  type EnrichmentResult,
  type EnrichmentStep,
  type EnrichmentToolCall,
} from "./types";
import { loadEnrichmentMarkdown } from "./load-markdown";
import { buildEnrichmentTools } from "./tools";
import {
  appendSkillsToPrompt,
  buildAgentToolset,
  loadAgentTooling,
} from "../agent-tooling";
import {
  getEnrichmentConfigIssue,
  resolveEnrichmentConfig,
  type ResolvedEnrichmentConfig,
} from "~/lib/ai/model-config";
import {
  buildModelChain,
  ModelFailoverError,
  runWithModelFailover,
  type ModelChainLink,
} from "../model-failover";
import { recordUsage } from "../usage";
import { getPrompt } from "../prompts/manager";
import { getPromptDefault } from "../prompts/defaults";

/**
 * Vòng lặp agent thu thập/bổ sung thông tin từ dữ liệu quét danh thiếp.
 *
 * - Tối đa 6 steps: mỗi step LLM chọn tools → thực thi → kết quả được append
 *   vào context → lặp lại cho đến khi LLM trả kết luận (structured output)
 *   hoặc hết số step.
 * - Model + provider lấy từ cấu hình `ai_model_configs` (capability
 *   `lead_enrichment`) của người dùng, fallback env (`ENRICHMENT_PROVIDER`,
 *   `ENRICHMENT_MODEL`).
 * - FAILOVER: gọi model qua chuỗi dự phòng (`config.fallbacks` của capability)
 *   và xoay TỪNG API key của provider (DB đa key + legacy + env) bằng
 *   `runWithModelFailover` — lỗi retryable (401/402/429/5xx/mạng/quota/
 *   model_not_found) thì thử key kế rồi model kế; lỗi 400/422 (input sai)
 *   dừng ngay.
 * - NGUYÊN TẮC: agent CHỈ trả findings kèm confidence + nguồn, KHÔNG tự ghi
 *   đè dữ liệu contact (hiến chương "AI gợi ý, người quyết định").
 */

const MAX_STEPS = 6;

/** Skill hướng dẫn agent nghiên cứu hồ sơ công ty (FR-008) — file .md editable. */
const COMPANY_RESEARCH_SKILL_PATH = "skills/company-research.md";

export class EnrichmentNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrichmentNotConfiguredError";
  }
}

export interface EnrichmentLoopInput {
  recognized: RecognizedCard;
  /** Id người dùng để đọc cấu hình model; null khi chưa đăng nhập. */
  userId: string | null;
  supabase?: SupabaseClient<Database>;
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
    "Nếu có tên công ty (companyName): sau khi xong phần liên hệ, nghiên cứu tiếp hồ sơ doanh nghiệp",
    "theo skill company-research và trả thêm object `company` (các trường còn thiếu, mỗi trường kèm",
    "confidence + evidence là nguồn web thật).",
  ].join("\n");
}

/** Kiểu tối giản của một step mà AI SDK trả về (đủ để suy trạng thái tool). */
interface SdkToolCall {
  toolCallId: string;
  toolName: string;
}

interface SdkToolResult {
  toolCallId: string;
  toolName: string;
  type: "tool-result" | "tool-error";
  output?: unknown;
  error?: unknown;
}

interface SdkStep {
  toolCalls?: SdkToolCall[];
  toolResults?: SdkToolResult[];
}

function shortNote(value: unknown, max = 140): string {
  const text =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : JSON.stringify(value) ?? "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

/**
 * Suy trạng thái từng lượt gọi tool — pattern bóc từ ZCode
 * (`ToolCallState`/`ToolResultState`): SDK đánh dấu tool throw bằng
 * `type: "tool-error"`; tool của app báo `available: false` khi chưa
 * cấu hình hoặc bị chặn — tách riêng thành "unavailable" để UI
 * phân biệt "chưa bật" với "chạy lỗi".
 */
function describeToolCall(
  call: SdkToolCall,
  result: SdkToolResult | undefined
): EnrichmentToolCall {
  const name = call.toolName;
  if (!result) return { name, status: "ok" };
  if (result.type === "tool-error") {
    return { name, status: "error", note: shortNote(result.error) || "lỗi không xác định" };
  }
  const output = result.output as
    | { available?: boolean; message?: string }
    | null
    | undefined;
  if (output && typeof output === "object" && output.available === false) {
    return {
      name,
      status: "unavailable",
      note: shortNote(output.message) || "tool không khả dụng",
    };
  }
  return { name, status: "ok" };
}

function summarizeSteps(result: { steps: SdkStep[] }): EnrichmentStep[] {
  return result.steps.map((step, index) => {
    const calls = step.toolCalls ?? [];
    const resultsById = new Map(
      (step.toolResults ?? []).map((r) => [r.toolCallId, r])
    );
    const toolCalls = calls.map((call) =>
      describeToolCall(call, resultsById.get(call.toolCallId))
    );
    const names = toolCalls.map((c) => c.name);
    return {
      step: index + 1,
      tools: names,
      toolCalls,
      summary:
        names.length > 0
          ? `Gọi ${toolCalls
              .map((c) =>
                c.status === "ok"
                  ? c.name
                  : `${c.name} (${c.status === "error" ? "lỗi" : "không khả dụng"})`
              )
              .join(", ")}`
          : "Suy luận và tổng hợp kết luận",
    };
  });
}

/**
 * Kiểm tra cấu hình sau khi đã dựng chuỗi failover — trả về thông điệp lỗi
 * cần chặn, `null` khi OK.
 *
 * LƯU Ý: `getEnrichmentConfigIssue` chỉ nhìn key đơn DB (legacy) + env nên có
 * thể báo thiếu key NHẦM với user đang dùng đa key (mảng `<provider>_api_keys`
 * — key đơn đã bị xóa khi lưu danh sách mới). Với provider cần key, chỉ chặn
 * khi chuỗi thật sự không còn key nào; với openai-compatible, issue chỉ là
 * thiếu Base URL (cấu trúc) nên luôn chặn.
 */
function resolveConfigBlockIssue(
  config: ResolvedEnrichmentConfig,
  chain: ModelChainLink[],
): string | null {
  const issue = getEnrichmentConfigIssue(config);
  if (!issue) return null;
  const primary = chain[0];
  if (!primary) return issue;
  if (config.provider === "openai-compatible") return issue;
  return primary.keys.length === 0 ? issue : null;
}

/**
 * Chạy vòng lặp enrichment. Ném `EnrichmentNotConfiguredError` khi model/key
 * chưa được cấu hình — caller chuyển thành thông báo thân thiện cho UI.
 */
export async function runEnrichmentLoop(input: EnrichmentLoopInput): Promise<EnrichmentResult> {
  const config = await resolveEnrichmentConfig(input.userId, input.supabase);
  if (!config.enabled || !config.model) {
    throw new EnrichmentNotConfiguredError(
      "Chưa cấu hình model AI cho tính năng bổ sung thông tin. " +
        (config.source === "database"
          ? "Bạn đã tắt capability lead_enrichment trong cấu hình AI."
          : "Hãy đặt ENRICHMENT_MODEL trong biến môi trường hoặc cấu hình capability lead_enrichment."),
    );
  }

  const chain = await buildModelChain({
    userId: input.userId,
    supabase: input.supabase,
    config,
  });
  const blockIssue = resolveConfigBlockIssue(config, chain);
  if (blockIssue) {
    throw new EnrichmentNotConfiguredError(blockIssue);
  }

  const baseTools = buildEnrichmentTools();
  const basePrompt = input.supabase
    ? await getPrompt('lead_enrichment', input.userId ?? '', input.supabase)
    : getPromptDefault('lead_enrichment')?.content ?? '';

  // Skill nghiên cứu hồ sơ công ty (FR-008) — gắn ngay sau system prompt gốc
  // để luôn có mặt bất kể prompt gốc lấy từ DB hay default.
  const promptWithCompanySkill =
    basePrompt + "\n\n" + loadEnrichmentMarkdown(COMPANY_RESEARCH_SKILL_PATH);

  // Năng lực agent do user cấu hình ở /admin/agent: plugins (tắt tool),
  // MCP servers (hợp nhất tool ngoài), hooks (audit), skills (markdown).
  let systemPrompt = promptWithCompanySkill;
  let tools: ToolSet = baseTools;
  if (input.userId && input.supabase) {
    const tooling = await loadAgentTooling(input.userId, input.supabase);
    const { toolset } = await buildAgentToolset({
      userId: input.userId,
      supabase: input.supabase,
      tooling,
      baseTools,
    });
    tools = toolset;
    systemPrompt = appendSkillsToPrompt(basePrompt, tooling.skills);
  }

  const spanUserId = input.userId ?? 'unknown';
  let generated;
  let usedModel = "";
  try {
    // Đo latency toàn lượt gọi (bao gồm các lượt failover bên trong).
    const startedAt = Date.now();
    const outcome = await runWithModelFailover({
      chain,
      userId: input.userId,
      supabase: input.supabase,
      execute: (model) =>
        withUserSpan("enrichment.run", spanUserId, () =>
          generateText({
            model,
            system: systemPrompt,
            prompt: buildUserPrompt(input.recognized),
            tools,
            stopWhen: stepCountIs(MAX_STEPS),
            maxOutputTokens: 2000,
            output: Output.object({ schema: enrichmentOutputSchema }),
            // Log từng step ngay khi xong (thay vì chờ cả loop) — pattern từ
            // ZCode TurnMachine (phase executing_tools → aggregating_results):
            // giúp debug khi loop chạy lâu hoặc kẹt ở tool nào.
            onStepFinish: (step) => {
              const names = (step.toolCalls ?? []).map((c) => c.toolName).join(", ");
              console.log(
                `[enrichment] step xong: tools=[${names || "suy luận"}] finishReason=${step.finishReason}`
              );
            },
            experimental_telemetry: { isEnabled: true },
          }),
        ),
    });
    generated = outcome.result;
    usedModel = outcome.used.provider + ":" + outcome.used.model;
    // Thống kê token/chi phí — best-effort (recordUsage tự nuốt lỗi).
    await recordUsage({
      userId: input.userId,
      source: "enrichment",
      provider: outcome.used.provider,
      model: outcome.used.model,
      usage: generated.usage,
      latencyMs: Date.now() - startedAt,
      supabase: input.supabase,
    });
  } catch (err) {
    if (err instanceof ModelFailoverError) {
      // Message tĩnh + chi tiết từng lần thử ở field `attempts`.
      throw err;
    }
    throw new Error(
      "Chạy agent làm giàu dữ liệu thất bại: " +
        (err instanceof Error ? err.message : "lỗi không xác định"),
    );
  }

  const findings = generated.output?.findings ?? [];
  return enrichmentResultSchema.parse({
    findings,
    company: generated.output?.company ?? undefined,
    steps: summarizeSteps(generated),
    modelUsed: usedModel,
  });
}

/** Kiểm tra nhanh cấu hình mà không chạy loop (cho API trả lỗi thân thiện). */
export async function checkEnrichmentConfigured(
  userId: string | null,
  supabase?: SupabaseClient<Database>,
): Promise<{ configured: boolean; message: string | null }> {
  const config = await resolveEnrichmentConfig(userId, supabase);
  if (!config.enabled || !config.model) {
    return {
      configured: false,
      message:
        "Chức năng bổ sung thông tin AI chưa được cấu hình. " +
        "Liên hệ quản trị viên để bật capability lead_enrichment hoặc đặt ENRICHMENT_MODEL.",
    };
  }
  const chain = await buildModelChain({ userId, supabase, config });
  const issue = resolveConfigBlockIssue(config, chain);
  if (issue) {
    return { configured: false, message: issue };
  }
  return { configured: true, message: null };
}
