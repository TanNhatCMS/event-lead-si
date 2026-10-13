import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { Database } from '@kit/supabase/database';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const evidenceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().max(2000).optional().default(''),
  note: z.string().trim().max(1000).optional().default(''),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(240).optional(),
  notes: z.string().trim().max(5000).optional(),
  evidence: z.array(evidenceSchema).max(20).optional(),
  fit_summary: z.string().trim().max(2000).nullable().optional(),
  shortlisted: z.boolean().optional(),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/sourcing/candidates/[id]
 *
 * Sửa ứng viên: ghi chú, bằng chứng, đánh giá phù hợp, hoặc đưa vào
 * / loại khỏi danh sách ngắn (shortlisted).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'invalid_id', 'Mã ứng viên không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

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

  type CandidateUpdate = Database['public']['Tables']['sourcing_candidates']['Update'];
  const updates: CandidateUpdate = { ...parsed.data };

  const { data, error } = await supabase
    .from('sourcing_candidates')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error || !data) return errorJson(requestId, 'not_found', 'Không tìm thấy ứng viên.', 404);
  return NextResponse.json({ ok: true, request_id: requestId });
}

/**
 * DELETE /api/sourcing/candidates/[id] — loại ứng viên khỏi yêu cầu.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'invalid_id', 'Mã ứng viên không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

  const { error } = await supabase
    .from('sourcing_candidates')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return errorJson(requestId, 'delete_failed', 'Chưa xóa được ứng viên.', 500);
  return NextResponse.json({ ok: true, request_id: requestId });
}
