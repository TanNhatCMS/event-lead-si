import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { Database } from '@kit/supabase/database';

import {
  ensureAgentConfigRow,
  listBuiltInTools,
  loadAgentTooling,
} from '~/lib/ai/agent-tooling';

/**
 * API cấu hình Hooks + Plugins cho agent:
 * - GET: trạng thái hooks/plugins của user + danh sách tool built-in
 *   (từ toolRegistry) để UI vẽ tab Plugins.
 * - PATCH: ghi hooks/plugins (jsonb).
 */

const patchSchema = z.object({
  hooks: z.record(z.string(), z.boolean()).optional(),
  plugins: z.record(z.string(), z.boolean()).optional(),
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

/** GET /api/agent/config — hooks/plugins + danh sách tool built-in. */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const tooling = await loadAgentTooling(auth.user.id, auth.supabase);
  return NextResponse.json({
    hooks: tooling.hooks,
    plugins: tooling.plugins,
    mcpServers: tooling.mcpServers.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      enabled: s.enabled,
    })),
    builtInTools: listBuiltInTools(),
  });
}

/** PATCH /api/agent/config — ghi hooks/plugins. Body: { hooks?, plugins? } */
export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  await ensureAgentConfigRow(auth.user.id, auth.supabase);

  const patch: Database['public']['Tables']['agent_config']['Update'] = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.hooks !== undefined) patch.hooks = parsed.data.hooks;
  if (parsed.data.plugins !== undefined) patch.plugins = parsed.data.plugins;

  const { error } = await auth.supabase
    .from('agent_config')
    .update(patch)
    .eq('user_id', auth.user.id);

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}
