import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/relationships/graph
 *
 * Đồ thị quan hệ của user: nodes là liên hệ + công ty, edges là
 * "làm việc tại" (contact.company_id). Dùng để vẽ đồ thị kết nối
 * và tìm đường giới thiệu 2 bước.
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
      .select('id, full_name, job_title, company_id, relationship_stage')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .limit(500),
    supabase
      .from('companies')
      .select('id, display_name, industry')
      .eq('user_id', user.id)
      .limit(200),
  ]);

  const nodes: Array<{
    id: string;
    kind: 'contact' | 'company';
    label: string;
    sub: string | null;
  }> = [];
  const edges: Array<{ from: string; to: string; label: string }> = [];

  for (const co of companies ?? []) {
    nodes.push({
      id: `company:${co.id}`,
      kind: 'company',
      label: co.display_name,
      sub: co.industry,
    });
  }
  for (const c of contacts ?? []) {
    nodes.push({
      id: `contact:${c.id}`,
      kind: 'contact',
      label: c.full_name,
      sub: c.job_title,
    });
    if (c.company_id) {
      edges.push({
        from: `contact:${c.id}`,
        to: `company:${c.company_id}`,
        label: 'làm việc tại',
      });
    }
  }

  return NextResponse.json({ nodes, edges, request_id: requestId });
}
