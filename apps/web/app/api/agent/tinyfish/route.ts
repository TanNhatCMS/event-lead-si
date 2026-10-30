import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import type { Json } from '@kit/supabase/database';

import {
  getTinyFishStatus,
  resolveTinyFishApiKey,
} from '~/lib/ai/tinyfish';

/**
 * Quản lý TinyFish cho trang /admin/agent — KHÔNG dùng env:
 * - GET   : trạng thái (key masked, webhook URL, ví, event gần nhất).
 * - PUT   : lưu/đổi API key vào agent_config.credentials (write-only).
 * - DELETE: gỡ key.
 *
 * Key chỉ nằm ở server; UI chỉ nhận bản masked (4 ký tự cuối).
 */

function maskKey(key: string): string {
  const tail = key.slice(-4);
  const head = key.startsWith('sk-tinyfish-') ? 'sk-tinyfish-***' : '***';
  return head + tail;
}

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

/** GET /api/agent/tinyfish — trạng thái tích hợp. */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const status = await getTinyFishStatus();
  const key = await resolveTinyFishApiKey();

  return NextResponse.json({
    configured: status.configured,
    error: status.error,
    wallet: status.wallet,
    // Không trả key gốc — chỉ bản masked để UI hiển thị.
    keyMasked: key ? maskKey(key) : null,
  });
}

/** PUT /api/agent/tinyfish — lưu API key. Body: { apiKey } */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = z
    .object({ apiKey: z.string().trim().min(10, 'API key không hợp lệ.').max(200) })
    .safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  const admin = getSupabaseServerAdminClient();
  const { data: rows } = await admin
    .from('agent_config')
    .select('credentials')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const credentials = {
    ...((rows?.credentials as Record<string, unknown>) ?? {}),
    tinyfish_api_key: parsed.data.apiKey,
  };

  const { error } = await admin
    .from('agent_config')
    .upsert(
      { user_id: auth.user.id, credentials: credentials as NonNullable<Json>, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/agent/tinyfish — gỡ key đã lưu. */
export async function DELETE() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const admin = getSupabaseServerAdminClient();
  const { data: rows } = await admin
    .from('agent_config')
    .select('credentials')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const credentials = {
    ...((rows?.credentials as Record<string, unknown>) ?? {}),
  };
  delete credentials.tinyfish_api_key;

  const { error } = await admin
    .from('agent_config')
    .upsert(
      { user_id: auth.user.id, credentials: credentials as NonNullable<Json>, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}
