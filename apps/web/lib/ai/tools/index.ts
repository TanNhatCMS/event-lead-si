/**
 * Điểm vào của hệ tool — bóc tách từ ZCode
 * (`apps/zcode-cli/packages/core/src/tool/handlers/index.ts`:
 * mảng `builtInTools` + `registerBuiltInTools()`).
 *
 * ZCode gom mọi tool built-in vào một chỗ rồi đăng ký vào registry;
 * các nhánh chạy khác nhau có thể ẩn/hiện tool (tool visibility).
 * Ở đây: đăng ký các tool dùng chung của app vào `toolRegistry`.
 */

export { toolRegistry, ToolRegistry } from "./registry";
export type { ToolCategory, ToolEntry, ToolMetadata, ToolRiskLevel } from "./registry";
export { assertEgressAllowed, EgressBlockedError } from "./egress-guard";
export { runWebFetch, webFetchTool } from "./webfetch";
export type { WebFetchResult } from "./webfetch";

import { toolRegistry } from "./registry";
import { webFetchTool } from "./webfetch";

let registered = false;

/**
 * Đăng ký các tool dùng chung vào registry. Gọi một lần lúc khởi động
 * agent (idempotent — gọi nhiều lần cũng chỉ đăng ký một lần).
 *
 * Các tool nội bộ của enrichment (normalize_vn_phone, extract_company_domain,
 * web_search) vẫn được định nghĩa trong `enrichment/tools.ts` — nơi gần
 * skill markdown của chúng — và được đăng ký tại đó để tránh import vòng.
 */
export function registerBuiltInTools(): void {
  if (registered) return;
  toolRegistry.register({
    metadata: {
      name: "web_fetch",
      description:
        "Đọc nội dung text của một URL công khai (sau web_search hoặc từ website suy ra).",
      category: "web",
      readOnly: true,
      riskLevel: "medium",
      needsApproval: true,
      origin: "zcode-port",
    },
    tool: webFetchTool,
  });
  registered = true;
}
