import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { computeInsights } from '~/lib/relationships/insights';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/relationships/insights
 *
 * Gợi ý tất định từ dữ liệu đồ thị quan hệ — KHÔNG gọi LLM:
 * - aging: liên hệ chưa chạm tới quá 90 ngày (trừ stage "customer").
 * - unlinked: công ty chưa có liên hệ nào.
 * - bridge: đường giới thiệu 2 bước (người cùng công ty làm cầu nối tới
 *   liên hệ thuộc công ty khác) — tái dùng logic "cùng công ty" của
 *   GET /api/relationships/intros.
 *
 * Tối đa 10 gợi ý, ưu tiên aging trước. Toàn bộ tính toán nằm ở
 * lib/relationships/insights.ts (thuần, có unit test).
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

  const [{ data: contacts }, { data: companies }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, full_name, relationship_stage, updated_at, company_id')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .limit(500),
    supabase
      .from('companies')
      .select('id, display_name')
      .eq('user_id', user.id)
      .limit(200),
  ]);

  const insights = computeInsights({
    contacts: contacts ?? [],
    companies: companies ?? [],
  });

  return NextResponse.json({ insights, request_id: requestId });
}
