import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  handleJsonRpc,
  PARSE_ERROR,
  type JsonRpcResponse,
  type McpToolContext,
} from '~/lib/ai/mcp-server/handler';

/**
 * EventLead MCP Server — endpoint streamable-http tối thiểu (JSON-RPC 2.0):
 * initialize / tools/list / tools/call / ping cho 3 tool CHỈ ĐỌC trên danh
 * bạ (lookup_contact, list_recent_contacts, count_contacts). Logic JSON-RPC
 * nằm ở lib/ai/mcp-server/handler.ts (có vitest).
 *
 * AUTH: header `Authorization: Bearer <key>` — key do admin tạo ở
 * /admin/agent (tab MCP Tools) qua PUT /api/mcp/v1/key, lưu trong
 * `agent_config.credentials.mcp_server_api_key` (write-only). userId được
 * resolve bằng cách tìm dòng agent_config chứa key (service-role).
 *
 * KHÔNG expose tool ghi dữ liệu (enrich_lead…) qua endpoint công khai này.
 */

/** Đọc Bearer token từ header Authorization. */
function extractBearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const lower = header.toLowerCase();
  if (!lower.startsWith('bearer ')) return null;
  const token = header.slice('bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve userId từ API key: tìm agent_config row có
 * credentials->>'mcp_server_api_key' = key (service-role — RLS không cản).
 */
async function resolveKeyUser(key: string): Promise<string | null> {
  const admin = getSupabaseServerAdminClient();
  const { data, error } = await admin
    .from('agent_config')
    .select('user_id')
    .eq('credentials->>mcp_server_api_key', key)
    .maybeSingle<{ user_id: string }>();
  if (error || !data) return null;
  return data.user_id;
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  status: number,
): NextResponse<JsonRpcResponse> {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message } },
    { status },
  );
}

/**
 * POST /api/mcp/v1 — JSON-RPC request đơn (batch không hỗ trợ).
 * Request notification (không id) → HTTP 202, body rỗng.
 */
export async function POST(request: Request) {
  const key = extractBearer(request);
  if (!key) {
    return rpcError(
      null,
      -32000,
      'Thiếu header Authorization: Bearer <API key> (tạo ở /admin/agent — tab MCP Tools).',
      401,
    );
  }

  const userId = await resolveKeyUser(key);
  if (!userId) {
    return rpcError(null, -32000, 'API key không hợp lệ hoặc đã bị thu hồi.', 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return rpcError(null, PARSE_ERROR, 'Body không phải JSON hợp lệ.', 400);
  }

  const ctx: McpToolContext = {
    userId,
    supabase: getSupabaseServerAdminClient() as unknown as SupabaseClient,
  };
  const outcome = await handleJsonRpc(payload, ctx);
  if (outcome.body === null) {
    return new NextResponse(null, { status: 202 });
  }
  return NextResponse.json(outcome.body, { status: outcome.status });
}

/**
 * GET /api/mcp/v1 — stream server-initiated (SSE) của streamable-http.
 * Server này không khởi tạo message nào → 405 theo spec.
 */
export async function GET() {
  return rpcError(
    null,
    -32000,
    'Method GET không được hỗ trợ — gửi JSON-RPC qua POST.',
    405,
  );
}
