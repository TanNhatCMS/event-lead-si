import { defineAgent, defineDynamic } from "eve";
import { openai } from "eve/models/openai";
import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";

import { createEveModelSelection } from "./lib/failover-model";
import { resolveEveModelChain } from "./lib/model-chain";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Model fallback của helper eve (hành vi cũ) — đọc env lúc chạy. */
function fallbackModel(): string {
  return process.env.EVE_OPENAI_MODEL ?? "gpt-5-mini";
}

/**
 * Agent eve của EventLead SI (tích hợp vercel/eve — xem specs/004-eve-agent).
 *
 * Model: resolver động `step.started` (chạy trước mỗi lượt gọi model) chọn
 * model theo chuỗi failover của EventLead — `resolveEveModelChain` đọc
 * capability `eve_agent` trong `ai_model_configs` (tuỳ chọn, không bắt buộc
 * migration) hoặc env `EVE_OPENAI_PROVIDER` + `EVE_OPENAI_MODEL`, rồi
 * `buildModelChain` gắn danh sách key từng provider (`resolveProviderKeys`:
 * DB agent_config.credentials → key đơn legacy → env). Wrapper
 * `createFailoverLanguageModel` luân phiên key/model khi gặp lỗi retryable
 * (401/402/429/5xx/mạng). eve chỉ cho phép trả LanguageModel "sống" từ
 * `step.started` (session/turn bắt buộc chuỗi model id — xem
 * docs/agent-config.md của eve) nên mỗi step phân giải lại — prompt cache
 * phía provider vẫn hiệu quả vì model/key cố định giữa các step.
 *
 * Khi chưa đăng nhập bằng tài khoản EventLead thật (local dev) hoặc chuỗi
 * cấu hình rỗng/lỗi: rơi về helper `openai()` của eve — hành vi cũ (gọi thẳng
 * OpenAI bằng OPENAI_API_KEY qua auth transport của eve, mặc định
 * "gpt-5-mini" theo env EVE_OPENAI_MODEL), KHÔNG qua Vercel AI Gateway.
 *
 * Tools: `defaultTools: false` — tắt toàn bộ tool mặc định của eve (bash/
 * read_file/write_file trong sandbox, web_search/web_fetch, agent): trợ lý
 * EventLead chỉ được dùng hai tool nghiệp vụ tự viết dưới `agent/tools/`
 * (lookup_contact, enrich_lead) và các MCP server do người dùng bật trong
 * trang /admin/agent (được lắp qua `agent/connections/eventlead-mcp.ts`,
 * model truy cập qua eve__search/eve__tool). Built-in tool registry của
 * EventLead (plugins) KHÔNG lắp cho eve — giữ đặc quyền tối thiểu; plugins
 * chỉ áp dụng cho enrichment loop.
 */
export default defineAgent({
  model: defineDynamic({
    events: {
      "step.started": async (_event, ctx) => {
        const userId = ctx.session.auth.current?.principalId ?? "";
        if (!UUID_PATTERN.test(userId)) {
          return openai(fallbackModel());
        }
        try {
          const supabase = getSupabaseServerAdminClient();
          const chain = await resolveEveModelChain(userId, supabase);
          if (chain.length > 0) {
            return createEveModelSelection(chain);
          }
        } catch (err) {
          // Fail-open: không chặn agent vì lỗi đọc cấu hình — dùng helper cũ.
          console.warn(
            "[agent] Lỗi dựng chuỗi model eve, fallback openai helper:",
            err instanceof Error ? err.message : err,
          );
        }
        return openai(fallbackModel());
      },
    },
  }),
  // Tắt toàn bộ tool mặc định của eve — xem chú thích trên. Tool nghiệp vụ
  // dưới agent/tools/ và connection tooling (eve__search/eve__tool) vẫn hoạt
  // động với defaultTools: false theo thiết kế của eve.
  defaultTools: false,
});
