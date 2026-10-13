import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const criterionSchema = z.object({
  label: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(1000).optional().default(''),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  product_description: z.string().trim().max(5000).optional(),
  target_market: z.string().trim().max(240).nullable().optional(),
  criteria: z.array(criterionSchema).max(20).optional(),
  status: z.enum(['draft', 'active', 'closed']).optional(),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedRequest(supabase: SupabaseClient<Database>, userId: string, id: string) {
  const { data } = await supabase
    .from('sourcing_requests')
    .select('id, title, product_description, target_market, criteria, status, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

/**
 * GET /api/sourcing/requests/[id] — chi tiết yêu cầu kèm ứng viên.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorJson(requestId, 'invalid_id', 'Mã yêu cầu không hợp lệ.', 400);

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

  const req = await getOwnedRequest(supabase, user.id, id);
  if (!req) return errorJson(requestId, 'not_found', 'Không tìm thấy yêu cầu.', 404);

  const { data: candidates } = await supabase
    .from('sourcing_candidates')
    .select(
      'id, name, notes, evidence, fit_summary, shortlisted, contact_id, company_id, created_at, contacts(id, full_name, job_title), companies(id, display_name)',
    )
    .eq('user_id', user.id)
    .eq('request_id', id)
    .order('shortlisted', { ascending: false })
    .order('created_at', { ascending: true });

  return NextResponse.json({ request: req, candidates: candidates ?? [], request_id: requestId });
}

/**
 * PATCH /api/sourcing/requests/[id] — sửa yêu cầu.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorJson(requestId, 'invalid_id', 'Mã yêu cầu không hợp lệ.', 400);

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

  const req = await getOwnedRequest(supabase, user.id, id);
  if (!req) return errorJson(requestId, 'not_found', 'Không tìm thấy yêu cầu.', 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_body', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.', 400);
  }
  if (Object.keys(parsed.data).length === 0) {
    return errorJson(requestId, 'no_changes', 'Không có gì để cập nhật.', 400);
  }

  const updates = { ...parsed.data };
  if (updates.target_market === '') updates.target_market = null;

  const { error } = await supabase
    .from('sourcing_requests')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return errorJson(requestId, 'update_failed', 'Chưa cập nhật được.', 500);
  return NextResponse.json({ ok: true, request_id: requestId });
}

/**
 * DELETE /api/sourcing/requests/[id] — xóa yêu cầu (kèm ứng viên).
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return errorJson(requestId, 'invalid_id', 'Mã yêu cầu không hợp lệ.', 400);

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

  const { error } = await supabase
    .from('sourcing_requests')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return errorJson(requestId, 'delete_failed', 'Chưa xóa được.', 500);
  return NextResponse.json({ ok: true, request_id: requestId });
}
