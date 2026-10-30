import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { Database } from '@kit/supabase/database';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ensureAgentConfigRow,
  listBuiltInTools,
  loadAgentTooling,
} from '~/lib/ai/agent-tooling';

/**
 * API cấu hình Hooks + Plugins + Budgets cho agent:
 * - GET: trạng thái hooks/plugins của user, danh sách tool built-in
 *   (từ toolRegistry) để UI vẽ tab Plugins và ngưỡng ngân sách (budgets)
 *   theo capability.
 * - PATCH: ghi hooks/plugins/budgets (jsonb).
 *
 * Shape budgets (migration 20261027100000_features_batch.sql):
 * { "<capability>": { "monthly_usd": number } } — capability thiếu trong
 * object nghĩa là KHÔNG giới hạn.
 */

const budgetEntrySchema = z.object({
  monthly_usd: z
    .number()
    .min(0, 'Ngân sách không được âm.')
    .max(1_000_000, 'Ngân sách quá lớn.')
    .nullable(),
});

const patchSchema = z.object({
  hooks: z.record(z.string(), z.boolean()).optional(),
  plugins: z.record(z.string(), z.boolean()).optional(),
  budgets: z.record(z.string().min(1).max(80), budgetEntrySchema).optional(),
});

type AgentBudgets = Record<string, { monthly_usd: number }>;

/** Đọc budgets hiện có của user (loadAgentTooling không trả budgets). */
async function readBudgets(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AgentBudgets> {
  const { data } = await supabase
    .from('agent_config')
    .select('budgets')
    .eq('user_id', userId)
    .maybeSingle();
  return ((data?.budgets as AgentBudgets | null) ?? {}) as AgentBudgets;
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

/** GET /api/agent/config — hooks/plugins/budgets + danh sách tool built-in. */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const [tooling, budgets] = await Promise.all([
    loadAgentTooling(auth.user.id, auth.supabase),
    readBudgets(auth.supabase, auth.user.id),
  ]);
  return NextResponse.json({
    hooks: tooling.hooks,
    plugins: tooling.plugins,
    budgets,
    mcpServers: tooling.mcpServers.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      enabled: s.enabled,
    })),
    builtInTools: listBuiltInTools(),
  });
}

/**
 * PATCH /api/agent/config — ghi hooks/plugins/budgets.
 * Body: { hooks?, plugins?, budgets? }
 *
 * budgets MERGE theo capability: capability gửi `monthly_usd: null` bị XÓA
 * (không giới hạn); gửi số thì đặt/cập nhật ngưỡng; capability không nằm
 * trong payload giữ nguyên giá trị cũ.
 */
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
  if (parsed.data.budgets !== undefined) {
    const merged = await readBudgets(auth.supabase, auth.user.id);
    for (const [capability, entry] of Object.entries(parsed.data.budgets)) {
      if (entry.monthly_usd === null) {
        delete merged[capability];
      } else {
        merged[capability] = { monthly_usd: entry.monthly_usd };
      }
    }
    patch.budgets = merged;
  }

  const { error } = await auth.supabase
    .from('agent_config')
    .update(patch)
    .eq('user_id', auth.user.id);

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}
