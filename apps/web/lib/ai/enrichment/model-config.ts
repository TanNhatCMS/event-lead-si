import { createGateway, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";

/**
 * Đọc cấu hình model cho capability `lead_enrichment` (single-user).
 *
 * - Ưu tiên bảng `ai_model_configs` của người dùng (nếu có).
 * - Fallback sang biến môi trường `ENRICHMENT_MODEL` khi bảng/chưa có dòng cấu hình.
 *
 * Provider: theo quyết định của người dùng ngày 2026-10-24, enrichment gọi
 * THẲNG OpenAI (`provider = "openai"`, mặc định mới) bằng `@ai-sdk/openai`,
 * key `OPENAI_API_KEY` — KHÔNG qua Vercel AI Gateway. Địa chỉ gốc tuỳ chọn
 * từ `config.base_url` của dòng DB hoặc env `OPENAI_BASE_URL` (bỏ trống =
 * endpoint mặc định của OpenAI). Gateway (`provider = "gateway"`, key
 * `AI_GATEWAY_API_KEY`) chỉ còn áp dụng khi cấu hình ghi tường minh.
 * Secret chỉ nằm ở env, không lưu vào DB. Khi cấu hình thuần env, chọn
 * provider bằng `ENRICHMENT_PROVIDER`.
 *
 * GHI CHÚ: migration tạo bảng `ai_model_configs` thuộc schema single-user
 * (apps/web/supabase/migrations/20261013235900_eventlead_single_user.sql).
 * Khi bảng chưa tồn tại, truy vấn trả lỗi → hàm trả `null` an toàn và
 * caller tự fallback env, nên code vẫn chạy được khi bảng chưa áp dụng.
 */

export type AiModelConfigSource = "database" | "env";

export interface AiModelConfigRow {
  id: string;
  user_id: string;
  capability: string;
  provider: string;
  model: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Đọc dòng cấu hình AI của người dùng từ bảng `ai_model_configs`.
 * Trả về `null` khi chưa có cấu hình HOẶC khi DB lỗi (kể cả bảng chưa tồn tại),
 * để caller có thể fallback sang env.
 */
export async function getAiModelConfig(
  capability: string,
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<AiModelConfigRow | null> {
  try {
    const { data, error } = await supabase
      .from("ai_model_configs")
      .select(
        "id, user_id, capability, provider, model, enabled, config, created_at, updated_at",
      )
      .eq("user_id", userId)
      .eq("capability", capability)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Omit<AiModelConfigRow, "config"> & { config: unknown };
    return {
      ...row,
      config: (row.config ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/**
 * Provider gọi model cho enrichment:
 * - "openai": gọi thẳng OpenAI bằng `@ai-sdk/openai` — mặc định theo quyết
 *   định người dùng 2026-10-24 (không dùng AI Gateway cho enrichment).
 * - "gateway": Vercel AI Gateway — chỉ khi cấu hình ghi tường minh.
 */
export type EnrichmentProvider = "openai" | "gateway";

/**
 * Chuẩn hoá giá trị provider từ DB/env. Mọi giá trị không phải Gateway
 * tường minh ("openai", "openai-compatible", "custom", rỗng, không rõ) đều
 * về "openai" — provider đích danh của enrichment.
 */
export function normalizeEnrichmentProvider(
  raw: string | null | undefined,
): EnrichmentProvider {
  const value = (raw ?? "").trim().toLowerCase();
  if (
    value === "gateway" ||
    value === "vercel-gateway" ||
    value === "ai-gateway"
  ) {
    return "gateway";
  }
  return "openai";
}

export interface ResolvedEnrichmentConfig {
  /** Provider sẽ gọi model. */
  provider: EnrichmentProvider;
  /**
   * Model id theo provider: qua OpenAI là tên model của OpenAI,
   * ví dụ "gpt-5-mini"; qua Gateway ví dụ "anthropic/claude-sonnet-4-5".
   */
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
  /**
   * Địa chỉ gốc tuỳ chọn cho OpenAI (chỉ dùng khi provider = "openai"):
   * ưu tiên `config.base_url` trong DB, fallback env `OPENAI_BASE_URL`;
   * `null` = endpoint mặc định của OpenAI do SDK tự dùng.
   */
  baseUrl: string | null;
}

/**
 * Phân giải cấu hình lead enrichment đang có hiệu lực.
 * - Ưu tiên dòng DB (`capability = 'lead_enrichment'` của người dùng), kể cả khi
 *   `enabled = false` — người dùng đã quyết định tắt thì tôn trọng.
 * - Fallback sang env (`ENRICHMENT_PROVIDER`, `ENRICHMENT_MODEL`,
 *   `OPENAI_BASE_URL`) khi chưa có dòng cấu hình.
 */
export async function resolveEnrichmentConfig(
  userId: string | null | undefined,
  supabase?: SupabaseClient<Database>,
): Promise<ResolvedEnrichmentConfig> {
  if (userId && supabase) {
    const row = await getAiModelConfig("lead_enrichment", userId, supabase);
    if (row) {
      const configBaseUrl =
        typeof row.config.base_url === "string"
          ? row.config.base_url.trim() || null
          : null;
      return {
        provider: normalizeEnrichmentProvider(row.provider),
        model: row.model,
        enabled: row.enabled,
        source: "database",
        baseUrl: configBaseUrl ?? getOpenAiBaseUrl(),
      };
    }
  }
  const envModel = (process.env.ENRICHMENT_MODEL ?? "").trim() || null;
  return {
    provider: normalizeEnrichmentProvider(process.env.ENRICHMENT_PROVIDER),
    model: envModel,
    enabled: Boolean(envModel),
    source: "env",
    baseUrl: getOpenAiBaseUrl(),
  };
}

/** API key của AI Gateway (server only). */
export function getGatewayApiKey(): string | null {
  return (process.env.AI_GATEWAY_API_KEY ?? "").trim() || null;
}

/** API key của OpenAI (server only, chỉ từ env). */
export function getOpenAiApiKey(): string | null {
  return (process.env.OPENAI_API_KEY ?? "").trim() || null;
}

/** Địa chỉ gốc tuỳ chọn cho OpenAI từ env (server only). */
export function getOpenAiBaseUrl(): string | null {
  return (process.env.OPENAI_BASE_URL ?? "").trim() || null;
}

/**
 * Kiểm tra phần credential/endpoint theo provider đã phân giải.
 * Giả định caller đã kiểm tra `enabled` + `model`. Trả về thông điệp lỗi
 * thân thiện khi thiếu cấu hình, `null` khi đã đủ.
 */
export function getEnrichmentConfigIssue(
  config: ResolvedEnrichmentConfig,
): string | null {
  if (config.provider === "openai") {
    if (!getOpenAiApiKey()) {
      return "Chưa cấu hình OpenAI (thiếu OPENAI_API_KEY).";
    }
    return null;
  }
  if (!getGatewayApiKey()) {
    return "Chưa cấu hình AI Gateway (thiếu AI_GATEWAY_API_KEY).";
  }
  return null;
}

/**
 * Tạo LanguageModel theo provider đã phân giải. Ném `Error` kèm thông điệp
 * của `getEnrichmentConfigIssue` khi thiếu credential/endpoint — caller nên
 * kiểm tra trước bằng chính hàm đó để trả lỗi thân thiện.
 */
export function createEnrichmentModel(
  config: ResolvedEnrichmentConfig & { model: string },
): LanguageModel {
  const issue = getEnrichmentConfigIssue(config);
  if (issue) throw new Error(issue);
  if (config.provider === "openai") {
    const provider = createOpenAI({
      apiKey: getOpenAiApiKey() as string,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    return provider(config.model);
  }
  return createGateway({ apiKey: getGatewayApiKey() as string })(config.model);
}
