import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  executeMcpTool,
  handleJsonRpc,
  INVALID_PARAMS,
  INVALID_REQUEST,
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  METHOD_NOT_FOUND,
  type McpToolContext,
} from "../handler";

/**
 * Test JSON-RPC 2.0 handler của EventLead MCP Server với Supabase client giả.
 * Điểm cần chốt: chỉ 3 tool chỉ đọc; mọi truy vấn lọc user_id của chủ key;
 * notification (không id) không trả body; batch bị từ chối.
 */

const USER_ID = "11111111-1111-4111-8111-111111111111";

interface RecordedCall {
  method: string;
  args: unknown[];
}

function fakeSupabase(response: {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}): { client: SupabaseClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const row = () => ({
    data: response.data ?? null,
    error: response.error ?? null,
    count: response.count ?? null,
  });
  function makeBuilder() {
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      };
    const builder = {
      select: record("select"),
      eq: record("eq"),
      is: record("is"),
      or: record("or"),
      order: record("order"),
      limit: record("limit"),
      maybeSingle: () => {
        calls.push({ method: "maybeSingle", args: [] });
        return Promise.resolve(row());
      },
      // supabase-js trả PostgrestBuilder (thenable) — giả lập để await cuối
      // chuỗi (count_contacts không gọi .limit) hoạt động.
      then: (
        onFulfilled?: (value: ReturnType<typeof row>) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(row()).then(onFulfilled, onRejected),
    };
    return builder;
  }
  const client = {
    from(_table: string) {
      return makeBuilder();
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function ctxWith(client: SupabaseClient): McpToolContext {
  return { userId: USER_ID, supabase: client };
}

describe("handleJsonRpc — initialize & protocol", () => {
  it("initialize: echo protocolVersion client yêu cầu + capabilities + serverInfo", async () => {
    const { client } = fakeSupabase({});
    const outcome = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
      },
      ctxWith(client),
    );
    expect(outcome.status).toBe(200);
    const body = outcome.body as {
      jsonrpc: string;
      id: number | string | null;
      result: Record<string, unknown>;
    };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(body.result.serverInfo).toEqual(MCP_SERVER_INFO);
  });

  it("initialize không có params → trả phiên bản protocol mới nhất của server", async () => {
    const { client } = fakeSupabase({});
    const outcome = await handleJsonRpc(
      { jsonrpc: "2.0", id: "abc", method: "initialize" },
      ctxWith(client),
    );
    const body = outcome.body as { result: Record<string, unknown> };
    expect(body.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
  });

  it("notification (không id) → HTTP 202, không có body", async () => {
    const { client } = fakeSupabase({});
    const outcome = await handleJsonRpc(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      ctxWith(client),
    );
    expect(outcome.status).toBe(202);
    expect(outcome.body).toBeNull();
  });

  it("payload sai (batch array / thiếu jsonrpc) → INVALID_REQUEST", async () => {
    const { client } = fakeSupabase({});
    const batch = await handleJsonRpc(
      [{ jsonrpc: "2.0", id: 1, method: "tools/list" }],
      ctxWith(client),
    );
    expect(batch.body).toMatchObject({ error: { code: INVALID_REQUEST } });

    const missing = await handleJsonRpc(
      { id: 2, method: "tools/list" },
      ctxWith(client),
    );
    expect(missing.body).toMatchObject({ error: { code: INVALID_REQUEST } });
  });
});

describe("handleJsonRpc — tools/list & tools/call", () => {
  it("tools/list trả đúng 3 tool chỉ đọc với inputSchema", async () => {
    const { client } = fakeSupabase({});
    const outcome = await handleJsonRpc(
      { jsonrpc: "2.0", id: 3, method: "tools/list" },
      ctxWith(client),
    );
    const body = outcome.body as {
      result: { tools: Array<{ name: string; inputSchema: Record<string, unknown> }> };
    };
    expect(body.result.tools.map((t) => t.name)).toEqual([
      "lookup_contact",
      "list_recent_contacts",
      "count_contacts",
    ]);
    for (const tool of body.result.tools) {
      expect(tool.inputSchema).toHaveProperty("properties");
    }
  });

  it("tools/call lookup_contact: lọc user_id + pattern ilike + limit 5", async () => {
    const rows = [
      { id: "c1", full_name: "Nguyen Thi Lan", email: "lan@abc.vn" },
    ];
    const { client, calls } = fakeSupabase({ data: rows });
    const outcome = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "lookup_contact", arguments: { query: "Lan" } },
      },
      ctxWith(client),
    );
    expect(outcome.status).toBe(200);
    const body = outcome.body as {
      result: { isError: boolean; content: Array<{ type: string; text: string }> };
    };
    expect(body.result.isError).toBe(false);
    const first = body.result.content[0]!;
    const payload = JSON.parse(first.text) as {
      available: boolean;
      contacts: unknown[];
    };
    expect(payload.available).toBe(true);
    expect(payload.contacts).toHaveLength(1);

    const eq = calls.find((c) => c.method === "eq");
    expect(eq?.args).toEqual(["user_id", USER_ID]);
    const or = calls.find((c) => c.method === "or");
    expect(String(or?.args[0])).toContain("full_name.ilike.%Lan%");
    const limit = calls.find((c) => c.method === "limit");
    expect(limit?.args).toEqual([5]);
  });

  it("tools/call list_recent_contacts: mặc định limit 10, nhận limit tùy chọn", async () => {
    const { client, calls } = fakeSupabase({ data: [] });
    await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "list_recent_contacts", arguments: {} },
      },
      ctxWith(client),
    );
    expect(calls.find((c) => c.method === "limit")?.args).toEqual([10]);

    const { client: client2, calls: calls2 } = fakeSupabase({ data: [] });
    await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "list_recent_contacts",
          arguments: { limit: 3 },
        },
      },
      ctxWith(client2),
    );
    expect(calls2.find((c) => c.method === "limit")?.args).toEqual([3]);
  });

  it("tools/call count_contacts trả count từ service-role client", async () => {
    const { client } = fakeSupabase({ count: 42 });
    const outcome = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "count_contacts", arguments: {} },
      },
      ctxWith(client),
    );
    const body = outcome.body as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };
    expect(body.result.isError).toBe(false);
    expect(JSON.parse(body.result.content[0]!.text)).toEqual({
      available: true,
      count: 42,
    });
  });

  it("tools/call tool lạ → INVALID_PARAMS; method lạ → METHOD_NOT_FOUND", async () => {
    const { client } = fakeSupabase({});
    const badTool = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "enrich_lead", arguments: {} },
      },
      ctxWith(client),
    );
    expect(badTool.body).toMatchObject({ error: { code: INVALID_PARAMS } });

    const badMethod = await handleJsonRpc(
      { jsonrpc: "2.0", id: 9, method: "resources/list" },
      ctxWith(client),
    );
    expect(badMethod.body).toMatchObject({ error: { code: METHOD_NOT_FOUND } });
  });

  it("lỗi tham số tool (query rỗng) → INVALID_PARAMS, không chạm Supabase", async () => {
    const { client, calls } = fakeSupabase({});
    const outcome = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "lookup_contact", arguments: { query: "" } },
      },
      ctxWith(client),
    );
    expect(outcome.body).toMatchObject({ error: { code: INVALID_PARAMS } });
    expect(calls).toHaveLength(0);
  });
});

describe("executeMcpTool — lỗi runtime", () => {
  it("Supabase lỗi → isError: true kèm thông điệp (không ném ra ngoài)", async () => {
    const { client } = fakeSupabase({ error: { message: "boom" } });
    const result = await executeMcpTool(
      "lookup_contact",
      { query: "Lan" },
      ctxWith(client),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("boom");
  });
});
