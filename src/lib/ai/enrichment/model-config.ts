import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Đọc cấu hình model cho capability `lead_enrichment`.
 *
 * Tái dùng pattern từ module `src/lib/ai/model-config.ts` của nhánh
 * feat/ai-model-management (PR #10) mà KHÔNG cherry-pick cả nhánh:
 * - Ưu tiên bảng `ai_model_configs` của tổ chức (nếu có).
 * - Fallback sang biến môi trường `ENRICHMENT_MODEL` khi bảng/chưa có dòng cấu hình.
 *
 * GHI CHÚ: migration tạo bảng `ai_model_configs` thuộc PR #10 (chưa merge).
 * Khi bảng chưa tồn tại, truy vấn trả lỗi → hàm trả `null` an toàn và
 * caller tự fallback env, nên code vẫn chạy được trên main.
 */

export type AiModelConfigSource = "database" | "env";

export interface AiModelConfigRow {
  id: string;
  organization_id: string;
  capability: string;
  provider: string;
  model: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Đọc dòng cấu hình AI của tổ chức từ bảng `ai_model_configs`.
 * Trả về `null` khi chưa có cấu hình HOẶC khi DB lỗi (kể cả bảng chưa tồn tại),
 * để caller có thể fallback sang env.
 */
export async function getAiModelConfig(
  capability: string,
  organizationId: string,
  supabase: SupabaseClient,
): Promise<AiModelConfigRow | null> {
  try {
    const { data, error } = await supabase
      .from("ai_model_configs")
      .select(
        "id, organization_id, capability, provider, model, enabled, config, created_at, updated_at",
      )
      .eq("organization_id", organizationId)
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
 * - Ưu tiên dòng DB (`capability = 'lead_enrichment'` của tổ chức), kể cả khi
 *   `enabled = false` — admin đã quyết định tắt thì tôn trọng.
 * - Fallback sang env `ENRICHMENT_MODEL` khi chưa có dòng cấu hình.
 */
export async function resolveEnrichmentConfig(
  organizationId: string | null | undefined,
  supabase?: SupabaseClient,
): Promise<ResolvedEnrichmentConfig> {
  if (organizationId && supabase) {
    const row = await getAiModelConfig("lead_enrichment", organizationId, supabase);
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
