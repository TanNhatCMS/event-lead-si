import { defineTool } from "eve/tools";
import { z } from "zod";
import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tra cứu danh bạ của CHÍNH người đang trò chuyện (lọc theo user_id lấy
 * từ phiên đã xác thực của kênh — không tin tham số từ model). Chỉ đọc,
 * tối đa 5 kết quả, bỏ qua liên hệ đã lưu trữ (archived).
 */
export default defineTool({
  description:
    "Tra cứu danh bạ EventLead của người dùng theo tên hoặc email (chỉ đọc, tối đa 5 kết quả).",
  inputSchema: z.object({
    query: z.string().min(1).max(120),
  }),
  async execute({ query }, ctx) {
    const userId = ctx.session.auth.current?.principalId ?? "";
    if (!UUID_PATTERN.test(userId)) {
      return {
        available: false,
        message:
          "Cần đăng nhập bằng tài khoản EventLead thật để tra cứu danh bạ.",
      };
    }
    const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const supabase = getSupabaseServerAdminClient();
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, full_name, job_title, email, phone, address, relationship_stage, companies(name)",
      )
      .eq("user_id", userId)
      .is("archived_at", null)
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(5);
    if (error) {
      return {
        available: false,
        message: "Tra cứu danh bạ thất bại: " + error.message,
      };
    }
    return { available: true, contacts: data ?? [] };
  },
});
