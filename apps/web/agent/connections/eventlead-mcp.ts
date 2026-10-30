import {
  defineDynamic,
  defineMcpClientConnection,
} from "eve/connections";
import { getSupabaseServerAdminClient } from "@kit/supabase/server-admin-client";

import {
  loadAgentTooling,
  type AgentMcpServerRow,
} from "../../lib/ai/agent-tooling";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quy tắc tên connection của eve: chữ thường/số/gạch ngang, mở đầu bằng chữ, ≤64 ký tự. */
const CONNECTION_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Đổi tên MCP server thành tên connection hợp lệ cho eve, đảm bảo không trùng
 * nhau trong một lượt resolve: bỏ dấu tiếng Việt (NFD), ký tự lạ → "-",
 * tiền tố "mcp-" để không đụng tool nghiệp vụ (lookup_contact, enrich_lead)
 * cũng như namespace "eve" dành riêng của framework; trùng tên thì thêm -2, -3…
 */
function connectionName(rawName: string, used: Set<string>): string {
  const base =
    ("mcp-" +
      rawName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")).slice(0, 63).replace(/-+$/g, "") || "mcp-server";
  if (CONNECTION_NAME_PATTERN.test(base) && !used.has(base)) {
    used.add(base);
    return base;
  }
  let index = 2;
  let candidate = `${base.slice(0, 61)}-${index}`;
  while (used.has(candidate) || !CONNECTION_NAME_PATTERN.test(candidate)) {
    index += 1;
    candidate = `${base.slice(0, 62 - String(index).length)}-${index}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * MCP servers của người dùng EventLead (bảng `agent_mcp_servers`, quản lý ở
 * /admin/agent — chỉ các server `enabled`) trở thành CONNECTIONS của eve:
 * eve tự liệt kê tool từ server (Streamable HTTP/SSE), model tìm qua
 * `eve__search` và gọi qua `eve__tool` với tên đầy đủ `<connection>__<tool>`
 * — tên connection là tên server đã slug hoá, model KHÔNG bao giờ thấy URL
 * hay header auth của server.
 *
 * Vì sao dùng connections thay vì động + mergeMcpTools của agent-tooling:
 * eve có cơ chế native cho MCP (định tuyến, durable state, auth broker) và
 * cơ chế đó yêu cầu tool đi qua eve__search/eve__tool thay vì tool list tường
 * minh — convert từng tool MCP sang defineTool động sẽ mất phần đó và phải
 * tự lo replay/durability. Tool built-in của EventLead (plugins) vẫn KHÔNG
 * được lắp cho eve — giữ đặc quyền tối thiểu; plugins chỉ áp dụng cho
 * enrichment loop.
 *
 * `instanceKey` = id server + URL: đổi endpoint/server khác → đổi định danh
 * instance (yêu cầu của eve cho connection động có auth). Header auth đọc
 * trực tiếp từ DB mỗi lượt resolve (write-only — không nằm trong durable
 * state của eve).
 *
 * Lưu ý tên FILE chính là tên connection của eve (chữ thường/số/gạch ngang —
 * underscore bị eve từ chối lúc discovery, crash dev server).
 *
 * Fail-open: resolver connections ném lỗi sẽ PARK cả turn của eve nên mọi
 * lỗi đọc cấu hình được nuốt và trả null (không có connection nào) — một
 * server riêng lẻ lỗi thì eve tự bỏ qua khi liệt kê tool.
 */
export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const userId = ctx.session.auth.current?.principalId ?? "";
      if (!UUID_PATTERN.test(userId)) {
        return null;
      }
      let servers: AgentMcpServerRow[];
      try {
        const supabase = getSupabaseServerAdminClient();
        const tooling = await loadAgentTooling(userId, supabase);
        servers = tooling.mcpServers.filter((server) => server.enabled);
      } catch (err) {
        console.warn(
          "[agent] Lỗi đọc MCP servers cho eve, bỏ qua:",
          err instanceof Error ? err.message : err,
        );
        return null;
      }
      if (servers.length === 0) {
        return null;
      }
      const used = new Set<string>();
      return Object.fromEntries(
        servers.map((server) => {
          const headers = Object.keys(server.headers).length
            ? server.headers
            : undefined;
          return [
            connectionName(server.name, used),
            defineMcpClientConnection({
              url: server.url,
              description: `MCP server "${server.name}" được cấu hình trong EventLead (/admin/agent — Agent tooling).`,
              instanceKey: `${server.id}:${server.url}`,
              ...(headers ? { headers } : {}),
            }),
          ];
        }),
      );
    },
  },
});
