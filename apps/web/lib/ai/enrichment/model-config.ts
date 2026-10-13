import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";

/**
 * Đọc cấu hình model cho capability `lead_enrichment` (single-user).
 *
 * - Ưu tiên bảng `ai_model_configs` của người dùng (nếu có).
 * - Fallback sang biến môi trường `ENRICHMENT_MODEL` khi bảng/chưa có dòng cấu hình.
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

export interface ResolvedEnrichmentConfig {
  /** Model id dùng cho AI Gateway, ví dụ "anthropic/claude-sonnet-4-5". */
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
}

/**
 * Phân giải cấu hình lead enrichment đang có hiệu lực.
 * - Ưu tiên dòng DB (`capability = 'lead_enrichment'` của người dùng), kể cả khi
 *   `enabled = false` — người dùng đã quyết định tắt thì tôn trọng.
 * - Fallback sang env `ENRICHMENT_MODEL` khi chưa có dòng cấu hình.
 */
export async function resolveEnrichmentConfig(
  userId: string | null | undefined,
  supabase?: SupabaseClient<Database>,
): Promise<ResolvedEnrichmentConfig> {
  if (userId && supabase) {
    const row = await getAiModelConfig("lead_enrichment", userId, supabase);
    if (row) {
      return { model: row.model, enabled: row.enabled, source: "database" };
    }
  }
  const envModel = (process.env.ENRICHMENT_MODEL ?? "").trim() || null;
  return { model: envModel, enabled: Boolean(envModel), source: "env" };
}

/** API key của AI Gateway (server only). */
export function getGatewayApiKey(): string | null {
  return (process.env.AI_GATEWAY_API_KEY ?? "").trim() || null;
}
