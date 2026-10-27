import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { Database } from '@kit/supabase/database';

/**
 * API quản lý Skills (markdown) cho agent — user-scoped, RLS.
 */

const skillSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Tên skill không được để trống.')
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Tên skill chỉ gồm chữ, số, gạch ngang/gạch dưới.'),
  description: z.string().trim().max(300).optional().default(''),
  content: z.string().trim().min(1, 'Nội dung skill không được để trống.').max(20000),
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

/** GET /api/agent/skills */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from('agent_skills')
    .select('id, name, description, content, enabled, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ skills: data ?? [] });
}

/** POST /api/agent/skills — tạo skill mới. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = skillSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  const { data, error } = await auth.supabase
    .from('agent_skills')
    .insert({ user_id: auth.user.id, ...parsed.data })
    .select('id, name, description, content, enabled, created_at, updated_at')
    .single();

  if (error) {
    const duplicate = error.code === '23505';
    return errorJson(
      requestId,
      duplicate ? 'duplicate' : 'database_error',
      duplicate ? `Skill "${parsed.data.name}" đã tồn tại.` : error.message,
      duplicate ? 400 : 500,
    );
  }
  return NextResponse.json({ skill: data });
}

/** PATCH /api/agent/skills — sửa skill. Body: { id, ... } */
export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = skillSchema
    .partial({ name: true, content: true })
    .extend({ id: z.string().uuid() })
    .safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }
  const { id, ...updates } = parsed.data;
  const patch: Database['public']['Tables']['agent_skills']['Update'] = {
    updated_at: new Date().toISOString(),
  };
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.content !== undefined) patch.content = updates.content;
  if (updates.enabled !== undefined) patch.enabled = updates.enabled;

  const { error } = await auth.supabase.from('agent_skills').update(patch).eq('id', id);
  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/agent/skills — xóa skill. Body: { id } */
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

  const { error } = await auth.supabase.from('agent_skills').delete().eq('id', id);
  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}
