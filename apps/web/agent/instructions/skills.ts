import { defineDynamic, defineInstructions } from "eve/instructions";
import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";

import {
  appendSkillsToPrompt,
  loadAgentTooling,
} from "../../lib/ai/agent-tooling";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Skills EventLead (bảng `agent_skills`, quản lý ở /admin/agent) được nối vào
 * system prompt của agent eve — cùng cách `appendSkillsToPrompt` đang dùng
 * cho các agent loop khác của app.
 *
 * Cơ chế eve: file trong `agent/instructions/` bọc `defineDynamic` là
 * RUNTIME resolver (khác `instructions.md` tĩnh ở thư mục gốc — file tĩnh
 * chạy một lần lúc build). Resolver chạy ở `turn.started` nên sửa/tắt skill
 * có hiệu lực từ tin nhắn kế tiếp mà không cần mở session mới; system-role
 * instructions nằm ngoài lịch sử hội thoại và được gửi kèm mọi lượt gọi
 * model trong turn.
 *
 * Fail-open: lỗi đọc cấu hình chỉ ghi warn, không trả skill — không được
 * làm fail turn (resolver instructions ném lỗi sẽ làm hỏng turn).
 */
export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const userId = ctx.session.auth.current?.principalId ?? "";
      if (!UUID_PATTERN.test(userId)) {
        return null;
      }
      try {
        const supabase = getSupabaseServerAdminClient();
        const { skills } = await loadAgentTooling(userId, supabase);
        const content = appendSkillsToPrompt("", skills).trim();
        if (!content) {
          return null;
        }
        return defineInstructions({ content, role: "system" });
      } catch (err) {
        console.warn(
          "[agent] Lỗi đọc skills cho eve, bỏ qua:",
          err instanceof Error ? err.message : err,
        );
        return null;
      }
    },
  },
});
