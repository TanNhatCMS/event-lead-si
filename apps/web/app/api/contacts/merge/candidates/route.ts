import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  findMergeReasons,
  type MergeContactCore,
} from '~/lib/contacts/merge';

const querySchema = z.object({
  contact_id: z.string().uuid('Mã liên hệ không hợp lệ.'),
});

/** Giới hạn số liên hệ quét để tìm ứng viên (đủ cho danh bạ cá nhân). */
const SCAN_LIMIT = 1000;

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/contacts/merge/candidates?contact_id=
 *
 * Tìm ứng viên gộp cho một liên hệ: cùng công ty, HOẶC trùng email/SĐT chuẩn
 * hoá, HOẶC tên giống nhau (inclusion hoặc Levenshtein ≤ 3 — xem
 * lib/contacts/merge.ts). Chỉ quét liên hệ đang hoạt động (chưa lưu trữ).
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_query', 'Tham số không hợp lệ.', 400);
  }
  const { contact_id: contactId } = parsed.data;

  const select =
    'id, full_name, job_title, email, phone, address, labels, company_id, companies(display_name)';

  const { data: source, error: sourceError } = await supabase
    .from('contacts')
    .select(select)
    .eq('user_id', user.id)
    .eq('id', contactId)
    .is('archived_at', null)
    .maybeSingle();
  if (sourceError) {
    return errorJson(requestId, 'candidates_failed', 'Chưa tìm được ứng viên gộp.', 500);
  }
  if (!source) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);
  }

  const { data: others, error: othersError } = await supabase
    .from('contacts')
    .select(select)
    .eq('user_id', user.id)
    .is('archived_at', null)
    .neq('id', contactId)
    .order('updated_at', { ascending: false })
    .limit(SCAN_LIMIT);
  if (othersError) {
    return errorJson(requestId, 'candidates_failed', 'Chưa tìm được ứng viên gộp.', 500);
  }

  const sourceCore = source as unknown as MergeContactCore;
  const candidates: Array<{
    id: string;
    full_name: string;
    job_title: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    labels: string[] | null;
    company_name: string | null;
    reasons: string[];
  }> = [];
  for (const row of (others ?? []) as Array<MergeContactCore & {
    companies: { display_name: string } | null;
  }>) {
    const reasons = findMergeReasons(sourceCore, row);
    if (reasons.length === 0) continue;
    candidates.push({
      id: row.id,
      full_name: row.full_name,
      job_title: row.job_title,
      email: row.email,
      phone: row.phone,
      address: row.address ?? null,
      labels: row.labels ?? null,
      company_name: row.companies?.display_name ?? null,
      reasons,
    });
  }

  return NextResponse.json({ candidates, request_id: requestId });
}
