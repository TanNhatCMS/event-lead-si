/**
 * EventLead MCP Server — lõi JSON-RPC 2.0 (streamable-http tối thiểu).
 *
 * Implement THỦ CÔNG JSON-RPC (không thêm dep @modelcontextprotocol/sdk):
 * - initialize            → trả protocolVersion/capabilities/serverInfo.
 * - notifications/*       → không có id ⇒ KHÔNG trả body (HTTP 202).
 * - tools/list            → 3 tool chỉ đọc (lookup/list/count) của danh bạ.
 * - tools/call            → chạy tool với ctx (userId + service-role client).
 * - ping                  → result rỗng.
 *
 * NGUYÊN TẮC AN TOÀN: chỉ expose tool CHỈ ĐỌC, mọi truy vấn đều lọc
 * `user_id` của chủ API key (service-role bỏ RLS nên phải lọc thủ công).
 * Tool ghi dữ liệu (enrich_lead…) KHÔNG được expose qua MCP.
 *
 * Route mỏng (app/api/mcp/v1/route.ts) lo auth Bearer + parse body; handler
 * này thuần logic để test vitest với Supabase client giả.
 *
 * Tham khảo giao thức: MCP spec "Streamable HTTP" (2025-03-26/2025-06-18) —
 * response JSON cho request có id; 202 cho notification.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Phiên bản protocol mới nhất server hỗ trợ (echo theo client khi khớp). */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** Các phiên protocol server chấp nhận echo lại. */
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const MCP_SERVER_INFO = {
  name: 'eventlead-mcp',
  title: 'EventLead MCP Server',
  version: '1.0.0',
} as const;

// Mã lỗi JSON-RPC 2.0 chuẩn.
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export interface McpToolContext {
  /** Chủ sở hữu dữ liệu — resolve từ API key trước khi gọi handler. */
  userId: string;
  /** Service-role client — handler tự lọc user_id trong từng truy vấn. */
  supabase: SupabaseClient;
}

// ---------------------------------------------------------------------------
// Định nghĩa tool (JSON Schema cho tools/list)
// ---------------------------------------------------------------------------

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'lookup_contact',
    description:
      'Tra cứu danh bạ EventLead của chủ API key theo tên, email hoặc SĐT ' +
      '(chỉ đọc, tối đa 5 kết quả, bỏ qua liên hệ đã lưu trữ).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
          description: 'Tên / email / SĐT (khớp một phần, không phân biệt hoa thường).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_recent_contacts',
    description:
      'Liệt kê liên hệ mới nhất trong danh bạ (chỉ đọc, mặc định 10, tối đa 50).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Số kết quả (mặc định 10).',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'count_contacts',
    description:
      'Đếm số liên hệ đang hoạt động (chưa lưu trữ) trong danh bạ của chủ API key.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Thực thi tool
// ---------------------------------------------------------------------------

/** Ký tự cần escape để pattern .or(ilike) không bị PostgREST hiểu sai. */
const LIKE_SPECIALS = /[%_\\,()]/g;

function likePattern(query: string): string {
  return '%' + query.replace(LIKE_SPECIALS, (c) => '\\' + c) + '%';
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

function textResult(payload: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: false,
  };
}

function errorResult(message: string): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

const CONTACT_SELECT =
  'id, full_name, job_title, email, phone, address, relationship_stage, companies(name)';

/**
 * Chạy một tool theo tên. Ném Error cho lỗi đầu vào (route đổi thành
 * INVALID_PARAMS); lỗi runtime Supabase trả isError: true trong result.
 */
export async function executeMcpTool(
  name: string,
  rawArgs: unknown,
  ctx: McpToolContext,
): Promise<McpToolResult> {
  const args =
    typeof rawArgs === 'object' && rawArgs !== null
      ? (rawArgs as Record<string, unknown>)
      : {};

  if (name === 'lookup_contact') {
    const query = args.query;
    if (typeof query !== 'string' || query.trim().length === 0 || query.length > 120) {
      throw new Error('Tham số "query" phải là chuỗi 1–120 ký tự.');
    }
    const pattern = likePattern(query.trim());
    const { data, error } = await ctx.supabase
      .from('contacts')
      .select(CONTACT_SELECT)
      .eq('user_id', ctx.userId)
      .is('archived_at', null)
      .or(
        'full_name.ilike.' +
          pattern +
          ',email.ilike.' +
          pattern +
          ',phone.ilike.' +
          pattern,
      )
      .limit(5);
    if (error) {
      return errorResult('Tra cứu danh bạ thất bại: ' + error.message);
    }
    return textResult({ available: true, contacts: data ?? [] });
  }

  if (name === 'list_recent_contacts') {
    const rawLimit = args.limit;
    let limit = 10;
    if (rawLimit !== undefined) {
      if (
        typeof rawLimit !== 'number' ||
        !Number.isInteger(rawLimit) ||
        rawLimit < 1 ||
        rawLimit > 50
      ) {
        throw new Error('Tham số "limit" phải là số nguyên 1–50.');
      }
      limit = rawLimit;
    }
    const { data, error } = await ctx.supabase
      .from('contacts')
      .select(CONTACT_SELECT)
      .eq('user_id', ctx.userId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      return errorResult('Liệt kê danh bạ thất bại: ' + error.message);
    }
    return textResult({ available: true, contacts: data ?? [] });
  }

  if (name === 'count_contacts') {
    const { count, error } = await ctx.supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.userId)
      .is('archived_at', null);
    if (error) {
      return errorResult('Đếm danh bạ thất bại: ' + error.message);
    }
    return textResult({ available: true, count: count ?? 0 });
  }

  throw new Error('Tool không tồn tại: ' + name);
}

// ---------------------------------------------------------------------------
// JSON-RPC dispatch
// ---------------------------------------------------------------------------

export interface JsonRpcOutcome {
  /** HTTP status nên trả cho request này. */
  status: number;
  /** null = notification / không có gì để trả (HTTP 202, body rỗng). */
  body: JsonRpcResponse | null;
}

function success(id: string | number | null, result: unknown): JsonRpcOutcome {
  return { status: 200, body: { jsonrpc: '2.0', id, result } };
}

function failure(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
  status = 200,
): JsonRpcOutcome {
  return {
    status,
    body: { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } },
  };
}

function isNotificationId(value: unknown): boolean {
  return value === null || value === undefined;
}

function isValidId(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isInteger(value)) ||
    value === null
  );
}

/**
 * Xử lý một payload JSON-RPC đã parse. Batch (mảng) bị từ chối — MCP
 * 2025-06-18 đã bỏ batch; server chỉ phục vụ request đơn.
 */
export async function handleJsonRpc(
  payload: unknown,
  ctx: McpToolContext,
): Promise<JsonRpcOutcome> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return failure(null, INVALID_REQUEST, 'JSON-RPC request phải là một object đơn (batch không được hỗ trợ).');
  }

  const req = payload as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: unknown;
  };

  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return failure(
      isValidId(req.id) ? (req.id as string | number | null) : null,
      INVALID_REQUEST,
      'Thiếu jsonrpc:"2.0" hoặc method (chuỗi).',
    );
  }

  const method: string = req.method;
  const hasId = !isNotificationId(req.id);
  const id = hasId ? (req.id as string | number | null) : null;

  // Notification (không id): chỉ nhận và bỏ qua — không bao giờ trả body.
  if (!hasId) {
    return { status: 202, body: null };
  }

  if (method === 'initialize') {
    const requested =
      typeof (req.params as { protocolVersion?: unknown } | null)
        ?.protocolVersion === 'string'
        ? ((req.params as { protocolVersion: string }).protocolVersion as string)
        : null;
    const protocolVersion =
      requested !== null && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : MCP_PROTOCOL_VERSION;
    return success(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: MCP_SERVER_INFO,
      instructions:
        'EventLead MCP Server — các tool chỉ đọc trên danh bạ của chủ API key.',
    });
  }

  if (method === 'ping') {
    return success(id, {});
  }

  if (method === 'tools/list') {
    return success(id, { tools: MCP_TOOLS });
  }

  if (method === 'tools/call') {
    const params =
      typeof req.params === 'object' && req.params !== null
        ? (req.params as { name?: unknown; arguments?: unknown })
        : {};
    if (typeof params.name !== 'string') {
      return failure(id, INVALID_PARAMS, 'Thiếu tham số "name" (tên tool).');
    }
    const known = MCP_TOOLS.some((tool) => tool.name === params.name);
    if (!known) {
      return failure(id, INVALID_PARAMS, 'Tool không tồn tại: ' + params.name);
    }
    try {
      const result = await executeMcpTool(params.name, params.arguments, ctx);
      return success(id, result);
    } catch (err) {
      // Lỗi đầu vào của tool → INVALID_PARAMS; lỗi khác → trả tool error
      // result (isError: true) theo phong cách MCP thay vì fail cả request.
      return failure(
        id,
        INVALID_PARAMS,
        err instanceof Error ? err.message : 'Tham số tool không hợp lệ.',
      );
    }
  }

  return failure(id, METHOD_NOT_FOUND, 'Method không được hỗ trợ: ' + method);
}
