import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/** Giới hạn số dòng mỗi bảng trong bản backup (chống trả payload khổng lồ). */
const TABLE_LIMIT = 5000;

/**
 * GET /api/backup
 *
 * Xuất toàn bộ dữ liệu user-scoped dạng JSON để tải về: contacts, companies,
 * events, follow_ups, meeting_notes, card_imports (GIỮ NGUYÊN
 * recognition_result — đó là dữ liệu quét của user). Mỗi bảng tối đa 5000 dòng.
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

  const [contacts, companies, events, followUps, meetingNotes, cardImports] =
    await Promise.all([
      supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(TABLE_LIMIT),
      supabase
        .from('companies')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(TABLE_LIMIT),
      supabase
        .from('events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(TABLE_LIMIT),
      supabase
        .from('follow_ups')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(TABLE_LIMIT),
      supabase
        .from('meeting_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(TABLE_LIMIT),
      supabase
        .from('card_imports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(TABLE_LIMIT),
    ]);

  const failed = [
    contacts.error,
    companies.error,
    events.error,
    followUps.error,
    meetingNotes.error,
    cardImports.error,
  ].find(Boolean);
  if (failed) {
    return errorJson(requestId, 'backup_failed', 'Chưa xuất được dữ liệu.', 500);
  }

  return NextResponse.json({
    exported_at: new Date().toISOString(),
    contacts: contacts.data ?? [],
    companies: companies.data ?? [],
    events: events.data ?? [],
    follow_ups: followUps.data ?? [],
    meeting_notes: meetingNotes.data ?? [],
    card_imports: cardImports.data ?? [],
    request_id: requestId,
  });
}
