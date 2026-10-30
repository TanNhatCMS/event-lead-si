import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";

import {
  getAiModelConfig,
  parseModelFallbacks,
} from "../../lib/ai/model-config";
import {
  buildModelChain,
  type ModelChainLink,
} from "../../lib/ai/model-failover";

/**
 * Chuỗi model của agent eve — dùng chung engine failover của app
 * (lib/ai/model-failover) để eve gọi model đa provider + đa key.
 *
 * Nguồn cấu hình:
 * 1. Dòng DB `ai_model_configs` capability `eve_agent` của người dùng
 *    (TUỲ CHỌN — jsonb nên không cần migration; không có dòng nào hôm nay).
 *    provider/model + `config.base_url` + `config.fallbacks`.
 *    Dòng `enabled = false` được hiểu là "không ghi đè" → rơi về env
 *    (khác với các capability khác: eve luôn cần một model để chạy).
 * 2. Fallback env: `EVE_OPENAI_PROVIDER` (mặc định "openai") +
 *    `EVE_OPENAI_MODEL` (mặc định "gpt-5-mini") + `OPENAI_BASE_URL`.
 *
 * Danh sách key từng provider do `buildModelChain` gắn qua
 * `resolveProviderKeys`: DB `agent_config.credentials["<provider>_api_keys"]`
 * → key đơn legacy `<provider>_api_key` → key env của provider (cuối cùng).
 * Chuỗi rỗng (không phân giải được model nào) → caller fallback về helper
 * `openai()` của eve.
 */
export async function resolveEveModelChain(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<ModelChainLink[]> {
  const row = await getAiModelConfig("eve_agent", userId, supabase);
  if (row && row.enabled) {
    const model = row.model?.trim() || null;
    const provider = (row.provider ?? "").trim();
    if (model && provider) {
      return buildModelChain({
        userId,
        supabase,
        config: {
          provider,
          model,
          baseUrl:
            typeof row.config.base_url === "string" && row.config.base_url.trim()
              ? row.config.base_url.trim()
              : null,
          source: "database",
          fallbacks: parseModelFallbacks(row.config.fallbacks),
        },
      });
    }
  }
  // Cùng mặc định với FALLBACK_MODEL ở agent/agent.ts (hành vi cũ).
  const envModel =
    (process.env.EVE_OPENAI_MODEL ?? "").trim() || "gpt-5-mini";
  const envProvider =
    (process.env.EVE_OPENAI_PROVIDER ?? "").trim().toLowerCase() || "openai";
  return buildModelChain({
    userId,
    supabase,
    config: {
      provider: envProvider,
      model: envModel,
      baseUrl: (process.env.OPENAI_BASE_URL ?? "").trim() || null,
      source: "env",
    },
  });
}
