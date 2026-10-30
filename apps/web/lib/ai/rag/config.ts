import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";

import {
  getAiModelConfig,
} from "../enrichment/model-config";
import {
  parseModelFallbacks,
  type ModelFallbackSpec,
} from "../model-config";

export type RagModelSource = "database" | "env";

export interface ResolvedRagModel {
  /** Model id dùng cho AI Gateway, ví dụ "anthropic/claude-sonnet-4-5". */
  model: string | null;
  /** Người dùng tắt capability này trong trang Mô hình AI. */
  enabled: boolean;
  source: RagModelSource;
}

const DEFAULT_CHAT_MODEL = "openai/gpt-4o-mini";

/**
 * Cấu hình chat RAG đa provider cho failover (setup-level): provider là
 * "gateway" (mặc định), một provider trực tiếp (openai, anthropic…) hoặc
 * "openai-compatible" (kèm base_url). Model/baseUrl/fallbacks đọc từ
 * `ai_model_configs` capability `rag_chat`, fallback env khi chưa có dòng DB.
 */
export interface ResolvedRagChatConfig {
  /**
   * Provider sẽ gọi model: "gateway", một DirectProviderId hoặc
   * "openai-compatible". Chuỗi lạ được giữ nguyên ở đây — việc chuẩn hoá
   * (normalizeEnrichmentProvider) nằm trong createChatModelForLink của
   * failover engine.
   */
  provider: string;
  model: string | null;
  /** Base URL tuỳ chọn cho provider trực tiếp/openai-compatible. */
  baseUrl: string | null;
  enabled: boolean;
  source: RagModelSource;
  /** Chuỗi model dự phòng (config.fallbacks trong DB) — rỗng khi từ env. */
  fallbacks: ModelFallbackSpec[];
}

/**
 * Phân giải model chat RAG (capability `rag_chat` trong ai_model_configs,
 * fallback env `RAG_CHAT_MODEL`, cuối cùng mặc định `openai/gpt-4o-mini`).
 *
 * Lưu ý: T002 chỉ chốt fallback env; ở đây thêm mặc định cứng để route chat
 * hoạt động ngay cả khi chưa cấu hình gì — key AI Gateway (AI_GATEWAY_API_KEY)
 * vẫn bắt buộc và được kiểm tra riêng ở route.
 */
export async function resolveRagChatModel(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<ResolvedRagModel> {
  const config = await resolveChatModelConfig(userId, supabase);
  return {
    model: config.model,
    enabled: config.enabled,
    source: config.source,
  };
}

/**
 * Phân giải cấu hình chat RAG ĐA PROVIDER cho failover setup-level:
 *
 * 1. Ưu tiên dòng DB `ai_model_configs` capability `rag_chat` của người dùng —
 *    provider/model/enabled + `config.base_url` + `config.fallbacks`
 *    (array `{ provider, model, baseUrl? }`, jsonb — không cần migration).
 * 2. Fallback env: `RAG_CHAT_PROVIDER` (mặc định "gateway") + `RAG_CHAT_MODEL`
 *    (mặc định `openai/gpt-4o-mini`).
 *
 * Danh sách API key KHÔNG nằm ở đây — route dựng chuỗi failover bằng
 * `buildModelChain` (lib/ai/model-failover) vốn gọi `resolveProviderKeys`
 * (DB `agent_config.credentials` → key đơn legacy → env của provider).
 */
export async function resolveChatModelConfig(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<ResolvedRagChatConfig> {
  const row = await getAiModelConfig("rag_chat", userId, supabase);
  if (row) {
    return {
      provider: (row.provider ?? "").trim() || "gateway",
      model: row.model?.trim() || null,
      baseUrl:
        typeof row.config.base_url === "string" && row.config.base_url.trim()
          ? row.config.base_url.trim()
          : null,
      enabled: row.enabled,
      source: "database",
      fallbacks: parseModelFallbacks(row.config.fallbacks),
    };
  }
  return {
    provider:
      (process.env.RAG_CHAT_PROVIDER ?? "").trim().toLowerCase() || "gateway",
    model: (process.env.RAG_CHAT_MODEL ?? "").trim() || DEFAULT_CHAT_MODEL,
    baseUrl: null,
    enabled: true,
    source: "env",
    fallbacks: [],
  };
}
