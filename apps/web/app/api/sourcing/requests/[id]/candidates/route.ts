import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const evidenceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().max(2000).optional().default(''),
  note: z.string().trim().max(1000).optional().default(''),
});

const createSchema = z.object({
  name: z.string().trim().min(1, 'Tên ứng viên không được để trống.').max(240),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(5000).optional().default(''),
  evidence: z.array(evidenceSchema).max(20).optional().default([]),
  fit_summary: z.string().trim().max(2000).optional().default(''),
  shortlisted: z.boolean().optional().default(false),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/sourcing/requests/[id]/candidates
 *
 * Thêm ứng viên cho yêu cầu sourcing: link tới contact/company có sẵn
 * hoặc nhập tay (name). Mỗi ứng viên kèm bằng chứng (evidence) để so sánh.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'invalid_id', 'Mã yêu cầu không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

  const { data: req } = await supabase
    .from('sourcing_requests')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!req) return errorJson(requestId, 'not_found', 'Không tìm thấy yêu cầu.', 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_body', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.', 400);
  }

  const { data, error } = await supabase
    .from('sourcing_candidates')
    .insert({
      user_id: user.id,
      request_id: id,
      name: parsed.data.name,
      contact_id: parsed.data.contact_id ?? null,
      company_id: parsed.data.company_id ?? null,
      notes: parsed.data.notes,
      evidence: parsed.data.evidence,
      fit_summary: parsed.data.fit_summary || null,
      shortlisted: parsed.data.shortlisted,
    })
    .select('id, name, shortlisted, created_at')
    .single();

  if (error || !data) return errorJson(requestId, 'create_failed', 'Chưa thêm được ứng viên.', 500);
  return NextResponse.json({ candidate: data, request_id: requestId }, { status: 201 });
}
