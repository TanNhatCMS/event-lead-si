import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";

import { getAiModelConfig } from "../enrichment/model-config";

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
  const row = await getAiModelConfig("rag_chat", userId, supabase);
  if (row) {
    return {
      model: row.model?.trim() || null,
      enabled: row.enabled,
      source: "database",
    };
  }
  const envModel = (process.env.RAG_CHAT_MODEL ?? "").trim() || null;
  if (envModel) {
    return { model: envModel, enabled: true, source: "env" };
  }
  return { model: DEFAULT_CHAT_MODEL, enabled: true, source: "env" };
}
