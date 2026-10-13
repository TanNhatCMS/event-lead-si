import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/companies
 *
 * Danh sách công ty của user đăng nhập, kèm số liên hệ của mỗi công ty
 * và share_token để tạo link chia sẻ.
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

  const { data, error } = await supabase
    .from('companies')
    .select(
      'id, display_name, website, industry, profile_state, share_token, updated_at, created_at, contacts(count)',
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    return errorJson(requestId, 'list_failed', 'Chưa tải được danh sách công ty.', 500);
  }

  const companies = (data ?? []).map((row) => ({
    id: row.id,
    display_name: row.display_name,
    website: row.website,
    industry: row.industry,
    profile_state: row.profile_state,
    share_token: row.share_token,
    updated_at: row.updated_at,
    created_at: row.created_at,
    contacts_count: Array.isArray(row.contacts) ? row.contacts[0]?.count ?? 0 : 0,
  }));

  return NextResponse.json({ companies, request_id: requestId });
}
