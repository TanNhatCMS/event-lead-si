import { defineHook } from "eve/hooks";
import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";

import { loadAgentTooling } from "../../lib/ai/agent-tooling";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hook `audit_tool_calls` của EventLead (agent_config.hooks, mặc định BẬT)
 * map sang cơ chế hooks của eve: mỗi sự kiện `action.result` tương ứng một
 * lượt gọi tool đã kết thúc — ghi một dòng `audit_logs` (best-effort, lỗi
 * audit không bao giờ làm fail turn).
 *
 * Lưu ý phạm vi: `toolName` là tên action mà model gọi — tool nghiệp vụ
 * (lookup_contact, enrich_lead) hiện tên gốc; tool của MCP connection đi qua
 * framework tool `eve__tool` nên action ghi nhận là "eve__tool" (eve không
 * cung cấp tên connection tool chi tiết trong event kết quả — hạn chế đã
 * biết, đủ để đếm tần suất gọi).
 */
export default defineHook({
  events: {
    "action.result": async (event, ctx) => {
      const result = event.data?.result;
      if (result?.kind !== "tool-result") {
        return;
      }
      const userId = ctx.session.auth.current?.principalId ?? "";
      if (!UUID_PATTERN.test(userId)) {
        return;
      }
      try {
        const supabase = getSupabaseServerAdminClient();
        // Tôn trọng công tắc audit_tool_calls của người dùng (mặc định BẬT).
        const { hooks } = await loadAgentTooling(userId, supabase);
        if (hooks.audit_tool_calls === false) {
          return;
        }
        await supabase.from("audit_logs").insert({
          user_id: userId,
          action: "agent.tool_call",
          entity_type: "agent_tool",
          entity_id: result.toolName,
          summary: `Eve agent gọi tool ${result.toolName}`,
          metadata: {
            status: event.data.status,
            is_error: result.isError ?? false,
          },
        });
      } catch {
        // ignore — audit best-effort.
      }
    },
  },
});
