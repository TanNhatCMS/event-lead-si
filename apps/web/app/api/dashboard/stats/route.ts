import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

const STAGE_IDS = ['new', 'contacted', 'meeting', 'negotiating', 'customer', 'lost'];

/**
 * GET /api/dashboard/stats
 *
 * Số liệu tổng quan cho trang chủ EventLead:
 * - tổng liên hệ (đang hoạt động / đã lưu trữ)
 * - liên hệ theo giai đoạn quan hệ
 * - liên hệ mới 7 ngày / 30 ngày
 * - tổng công ty
 * - lượt quét danh thiếp (tổng / chờ xem lại)
 * - liên hệ mới nhất
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    activeCount,
    archivedCount,
    new7d,
    new30d,
    companiesCount,
    scansTotal,
    scansPending,
    byStage,
    recent,
  ] = await Promise.all([
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('archived_at', null),
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('archived_at', 'is', null),
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('archived_at', null)
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('archived_at', null)
      .gte('created_at', thirtyDaysAgo),
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('card_imports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('card_imports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('state', ['uploaded', 'processing', 'needs_review']),
    supabase
      .from('contacts')
      .select('relationship_stage')
      .eq('user_id', user.id)
      .is('archived_at', null),
    supabase
      .from('contacts')
      .select('id, full_name, job_title, created_at, companies(display_name)')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const stageCounts: Record<string, number> = Object.fromEntries(
    STAGE_IDS.map((s) => [s, 0]),
  );
  for (const row of byStage.data ?? []) {
    const stage = row.relationship_stage ?? 'new';
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
  }

  return NextResponse.json({
    stats: {
      contacts_active: activeCount.count ?? 0,
      contacts_archived: archivedCount.count ?? 0,
      contacts_new_7d: new7d.count ?? 0,
      contacts_new_30d: new30d.count ?? 0,
      companies: companiesCount.count ?? 0,
      scans_total: scansTotal.count ?? 0,
      scans_pending: scansPending.count ?? 0,
      by_stage: stageCounts,
    },
    // database.types.ts chưa có FK contacts->companies nên cast qua unknown.
    recent: ((recent.data ?? []) as unknown as Array<{
      id: string;
      full_name: string;
      job_title: string | null;
      created_at: string;
      companies: { display_name: string } | null;
    }>),
    request_id: requestId,
  });
}
