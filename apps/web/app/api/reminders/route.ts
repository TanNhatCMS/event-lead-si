import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/reminders
 *
 * Danh sách nhắc việc của user: các ghi chú loại `next_step` có hạn,
 * chưa xong, chưa xóa — sắp xếp theo hạn gần nhất. Kèm thông tin liên hệ.
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
    .from('meeting_notes')
    .select(
      'id, body, note_type, due_at, done_at, created_at, contact_id, contacts(id, full_name, job_title)',
    )
    .eq('user_id', user.id)
    .eq('note_type', 'next_step')
    .is('deleted_at', null)
    .is('done_at', null)
    .not('due_at', 'is', null)
    .order('due_at', { ascending: true })
    .limit(50);

  if (error) {
    return errorJson(requestId, 'list_failed', 'Chưa tải được nhắc việc.', 500);
  }

  const now = Date.now();
  const reminders = (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    due_at: row.due_at,
    created_at: row.created_at,
    overdue: row.due_at ? new Date(row.due_at).getTime() < now : false,
    contact: Array.isArray(row.contacts) ? row.contacts[0] ?? null : row.contacts,
  }));

  const overdueCount = reminders.filter((r) => r.overdue).length;

  return NextResponse.json({ reminders, overdue_count: overdueCount, request_id: requestId });
}
