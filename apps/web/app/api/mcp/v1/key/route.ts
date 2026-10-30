import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import type { Json } from '@kit/supabase/database';

/**
 * Quản lý API key của EventLead MCP Server (tự host tại /api/mcp/v1):
 * - GET   : trạng thái đã cấu hình + key masked ("***abcd") — không bao giờ
 *           trả key gốc sau khi tạo.
 * - PUT   : sinh key mới (đè key cũ — mỗi user chỉ có MỘT key) và trả key
 *           gốc ĐÚNG MỘT LẦN duy nhất để admin copy vào client MCP.
 * - DELETE: thu hồi key (xóa khỏi credentials — server trả 401 ngay).
 *
 * Key nằm trong `agent_config.credentials.mcp_server_api_key` — KHÔNG dùng
 * route /api/ai-keys vì provider list của route đó chỉ nhận direct providers
 * (tránh rủi ro conflict với file đang được sửa song song).
 */

const CREDENTIAL_FIELD = 'mcp_server_api_key';
const KEY_PREFIX = 'elmcp_';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

function maskKey(key: string): string {
  return '***' + key.slice(-4);
}

async function requireUser(requestId: string) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401) };
  }
  return { user };
}

/** Sinh key ngẫu nhiên: elmcp_ + 48 ký tự hex (24 byte từ crypto an toàn). */
function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex: string[] = [];
  for (const byte of bytes) {
    hex.push(byte.toString(16).padStart(2, '0'));
  }
  return KEY_PREFIX + hex.join('');
}

/** GET /api/mcp/v1/key — trạng thái key (masked). */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const admin = getSupabaseServerAdminClient();
  const { data, error } = await admin
    .from('agent_config')
    .select('credentials')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  const credentials = (data?.credentials as Record<string, unknown>) ?? {};
  const raw = credentials[CREDENTIAL_FIELD];
  const key = typeof raw === 'string' && raw.trim() ? raw.trim() : null;

  return NextResponse.json({
    configured: key !== null,
    masked: key ? maskKey(key) : null,
  });
}

/**
 * PUT /api/mcp/v1/key — sinh key mới và trả key gốc đúng một lần.
 * Body rỗng {} — mỗi user chỉ giữ MỘT key active.
 */
export async function PUT() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const key = generateApiKey();
  const admin = getSupabaseServerAdminClient();

  const { data: rows, error: readError } = await admin
    .from('agent_config')
    .select('credentials')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (readError) {
    return errorJson(requestId, 'database_error', readError.message, 500);
  }

  const credentials = {
    ...((rows?.credentials as Record<string, unknown>) ?? {}),
    [CREDENTIAL_FIELD]: key,
  };

  const { error } = await admin.from('agent_config').upsert(
    {
      user_id: auth.user.id,
      credentials: credentials as NonNullable<Json>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }

  return NextResponse.json({ key, masked: maskKey(key) });
}

/** DELETE /api/mcp/v1/key — thu hồi key (MCP server trả 401 ngay sau đó). */
export async function DELETE() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const admin = getSupabaseServerAdminClient();
  const { data: rows, error: readError } = await admin
    .from('agent_config')
    .select('credentials')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (readError) {
    return errorJson(requestId, 'database_error', readError.message, 500);
  }

  const credentials = {
    ...((rows?.credentials as Record<string, unknown>) ?? {}),
  };
  delete credentials[CREDENTIAL_FIELD];

  const { error } = await admin.from('agent_config').upsert(
    {
      user_id: auth.user.id,
      credentials: credentials as NonNullable<Json>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }

  return NextResponse.json({ ok: true });
}
