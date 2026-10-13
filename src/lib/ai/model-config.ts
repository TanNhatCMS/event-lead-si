import type { SupabaseClient } from "@supabase/supabase-js";

import { isCardRecognitionEnabled } from "./card-recognition";

/**
 * Nguồn cấu hình AI đang có hiệu lực cho một capability.
 * - "database": lấy từ bảng `ai_model_configs` của tổ chức (ưu tiên).
 * - "env": fallback sang biến môi trường server khi chưa có dòng cấu hình.
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

export interface ResolvedCardRecognitionConfig {
  provider: string;
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
}

/**
 * Đọc cấu hình AI của tổ chức từ bảng `ai_model_configs`.
 * Trả về `null` khi tổ chức chưa cấu hình capability này (kể cả khi DB lỗi,
 * để caller có thể fallback sang env).
 */
export async function getAiModelConfig(
  capability: string,
  organizationId: string,
  supabase: SupabaseClient,
): Promise<AiModelConfigRow | null> {
  const { data, error } = await supabase
    .from("ai_model_configs")
    .select("id, organization_id, capability, provider, model, enabled, config, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("capability", capability)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Omit<AiModelConfigRow, "config"> & { config: unknown };
  return {
    ...row,
    config: (row.config ?? {}) as Record<string, unknown>,
  };
}

/**
 * Phân giải cấu hình nhận dạng danh thiếp đang có hiệu lực.
 * - Ưu tiên dòng DB (`capability = 'card_recognition'` của tổ chức). Kể cả khi
 *   dòng đó có `enabled = false` thì vẫn là "database" — admin đã quyết định tắt.
 * - Fallback sang env (`CARD_RECOGNITION_PROVIDER`, `CARD_RECOGNITION_ENABLED`).
 */
export async function resolveCardRecognitionConfig(
  organizationId: string | null | undefined,
  supabase?: SupabaseClient,
): Promise<ResolvedCardRecognitionConfig> {
  if (organizationId && supabase) {
    const row = await getAiModelConfig("card_recognition", organizationId, supabase);
    if (row) {
      return {
        provider: row.provider,
        model: row.model,
        enabled: row.enabled,
        source: "database",
      };
    }
  }
  return {
    provider: (process.env.CARD_RECOGNITION_PROVIDER ?? "").trim().toLowerCase() || "mock",
    model: null,
    enabled: isCardRecognitionEnabled(),
    source: "env",
  };
}
