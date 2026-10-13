import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const criterionSchema = z.object({
  label: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(1000).optional().default(''),
});

const createSchema = z.object({
  title: z.string().trim().min(1, 'Tiêu đề không được để trống.').max(240),
  product_description: z.string().trim().max(5000).optional().default(''),
  target_market: z.string().trim().max(240).optional().default(''),
  criteria: z.array(criterionSchema).max(20).optional().default([]),
  status: z.enum(['draft', 'active', 'closed']).optional().default('draft'),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/sourcing/requests — danh sách yêu cầu sourcing của user.
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

  const { data, error } = await supabase
    .from('sourcing_requests')
    .select('id, title, product_description, target_market, criteria, status, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) return errorJson(requestId, 'list_failed', 'Chưa tải được danh sách.', 500);

  // Đếm ứng viên + shortlisted cho mỗi yêu cầu.
  const ids = (data ?? []).map((r) => r.id);
  let counts: Record<string, { total: number; shortlisted: number }> = {};
  if (ids.length > 0) {
    const { data: cands } = await supabase
      .from('sourcing_candidates')
      .select('request_id, shortlisted')
      .eq('user_id', user.id)
      .in('request_id', ids);
    for (const c of cands ?? []) {
      const e = (counts[c.request_id] ??= { total: 0, shortlisted: 0 });
      e.total += 1;
      if (c.shortlisted) e.shortlisted += 1;
    }
  }

  return NextResponse.json({
    requests: (data ?? []).map((r) => ({
      ...r,
      candidates_total: counts[r.id]?.total ?? 0,
      candidates_shortlisted: counts[r.id]?.shortlisted ?? 0,
    })),
    request_id: requestId,
  });
}

/**
 * POST /api/sourcing/requests — tạo yêu cầu sourcing mới (FR-019).
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_body', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.', 400);
  }

  const { data, error } = await supabase
    .from('sourcing_requests')
    .insert({
      user_id: user.id,
      title: parsed.data.title,
      product_description: parsed.data.product_description,
      target_market: parsed.data.target_market || null,
      criteria: parsed.data.criteria,
      status: parsed.data.status,
    })
    .select('id, title, status, created_at')
    .single();

  if (error || !data) return errorJson(requestId, 'create_failed', 'Chưa tạo được yêu cầu.', 500);
  return NextResponse.json({ request: data, request_id: requestId }, { status: 201 });
}
