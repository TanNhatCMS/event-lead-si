import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';

import { isCardRecognitionEnabled } from '~/lib/ai/card-recognition';

/**
 * Nguồn cấu hình AI đang có hiệu lực cho một capability.
 * - "database": lấy từ bảng `ai_model_configs` của người dùng (ưu tiên).
 * - "env": fallback sang biến môi trường server khi chưa có dòng cấu hình.
 */
export type AiModelConfigSource = 'database' | 'env';

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

export interface ResolvedCardRecognitionConfig {
  provider: string;
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
}

export interface ResolvedEnrichmentConfig {
  /** Model id dùng cho AI Gateway, ví dụ "anthropic/claude-sonnet-4-5". */
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
}

/**
 * Đọc cấu hình AI của người dùng từ bảng `ai_model_configs`.
 * Trả về `null` khi người dùng chưa cấu hình capability này (kể cả khi DB lỗi
 * hoặc bảng chưa tồn tại), để caller có thể fallback sang env.
 */
export async function getAiModelConfig(
  capability: string,
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<AiModelConfigRow | null> {
  try {
    const { data, error } = await supabase
      .from('ai_model_configs')
      .select(
        'id, user_id, capability, provider, model, enabled, config, created_at, updated_at',
      )
      .eq('user_id', userId)
      .eq('capability', capability)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Omit<AiModelConfigRow, 'config'> & { config: unknown };
    return {
      ...row,
      config: (row.config ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/**
 * Phân giải cấu hình nhận dạng danh thiếp đang có hiệu lực.
 * - Ưu tiên dòng DB (`capability = 'card_recognition'` của người dùng). Kể cả khi
 *   dòng đó có `enabled = false` thì vẫn là "database" — người dùng đã quyết định tắt.
 * - Fallback sang env (`CARD_RECOGNITION_PROVIDER`, `CARD_RECOGNITION_ENABLED`).
 */
export async function resolveCardRecognitionConfig(
  userId: string | null | undefined,
  supabase?: SupabaseClient<Database>,
): Promise<ResolvedCardRecognitionConfig> {
  if (userId && supabase) {
    const row = await getAiModelConfig('card_recognition', userId, supabase);
    if (row) {
      return {
        provider: row.provider,
        model: row.model,
        enabled: row.enabled,
        source: 'database',
      };
    }
  }
  return {
    provider:
      (process.env.CARD_RECOGNITION_PROVIDER ?? '').trim().toLowerCase() || 'mock',
    model: null,
    enabled: isCardRecognitionEnabled(),
    source: 'env',
  };
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
    const row = await getAiModelConfig('lead_enrichment', userId, supabase);
    if (row) {
      return { model: row.model, enabled: row.enabled, source: 'database' };
    }
  }
  const envModel = (process.env.ENRICHMENT_MODEL ?? '').trim() || null;
  return { model: envModel, enabled: Boolean(envModel), source: 'env' };
}

/** API key của AI Gateway (server only). */
export function getGatewayApiKey(): string | null {
  return (process.env.AI_GATEWAY_API_KEY ?? '').trim() || null;
}
