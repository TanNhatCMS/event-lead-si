import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { Database } from '@kit/supabase/database';
import type { Json } from '@kit/supabase/database';

import { probeMcpServer } from '~/lib/ai/agent-tooling';

/**
 * API quản lý MCP servers của agent (user-scoped, RLS).
 * Headers (auth token) là WRITE-ONLY — GET không trả lại giá trị đã lưu.
 */

const serverSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Tên server không được để trống.')
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Tên server chỉ gồm chữ, số, gạch ngang/gạch dưới.'),
  url: z.string().trim().url('URL không hợp lệ (http/https).').max(500),
  headers: z.record(z.string(), z.string()).optional().default({}),
  enabled: z.boolean().optional().default(true),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

async function requireUser(requestId: string) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401) };
  }
  return { supabase, user };
}

/** GET /api/agent/mcp-servers — danh sách server (không kèm headers). */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from('agent_mcp_servers')
    .select('id, name, url, enabled, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ servers: data ?? [] });
}

/** POST /api/agent/mcp-servers — thêm server mới. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = serverSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  const { data, error } = await auth.supabase
    .from('agent_mcp_servers')
    .insert({
      user_id: auth.user.id,
      name: parsed.data.name,
      url: parsed.data.url,
      headers: parsed.data.headers as Json,
      enabled: parsed.data.enabled,
    })
    .select('id, name, url, enabled, created_at, updated_at')
    .single();

  if (error) {
    const duplicate = error.code === '23505';
    return errorJson(
      requestId,
      duplicate ? 'duplicate' : 'database_error',
      duplicate ? `Server "${parsed.data.name}" đã tồn tại.` : error.message,
      duplicate ? 400 : 500,
    );
  }
  return NextResponse.json({ server: data });
}

/** PATCH /api/agent/mcp-servers — sửa tên/url/headers/enabled. Body: { id, ... } */
export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = serverSchema.partial({ name: true, url: true }).extend({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }
  const { id, ...updates } = parsed.data;
  const patch: Database['public']['Tables']['agent_mcp_servers']['Update'] = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.url !== undefined) patch.url = updates.url;
  if (updates.enabled !== undefined) patch.enabled = updates.enabled;
  if (updates.headers !== undefined && Object.keys(updates.headers).length > 0) {
    patch.headers = updates.headers as Json;
  }

  const { error } = await auth.supabase
    .from('agent_mcp_servers')
    .update(patch)
    .eq('id', id);

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/agent/mcp-servers — xóa server. Body: { id } */
export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const id =
    typeof body === 'object' && body !== null && 'id' in body
      ? String((body as { id: unknown }).id ?? '')
      : '';
  if (!z.string().uuid().safeParse(id).success) {
    return errorJson(requestId, 'invalid_input', 'id không hợp lệ.', 400);
  }

  const { error } = await auth.supabase.from('agent_mcp_servers').delete().eq('id', id);
  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}

/**
 * PUT /api/agent/mcp-servers — kiểm tra kết nối tới server (không lưu).
 * Body: { url, headers? } → số tool + tên tool hoặc lỗi thân thiện.
 */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const url =
    typeof body === 'object' && body !== null && 'url' in body
      ? String((body as { url: unknown }).url ?? '')
      : '';
  const headers =
    typeof body === 'object' && body !== null && 'headers' in body
      ? ((body as { headers: unknown }).headers as Record<string, string>) ?? {}
      : {};

  if (!z.string().url().safeParse(url).success) {
    return errorJson(requestId, 'invalid_input', 'URL không hợp lệ.', 400);
  }

  const result = await probeMcpServer({ url, headers });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
