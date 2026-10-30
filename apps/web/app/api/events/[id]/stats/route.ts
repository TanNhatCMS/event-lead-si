import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/events/[id]/stats
 *
 * Thống kê một sự kiện:
 * - contacts: số contact gắn vào sự kiện.
 * - cardImports: số danh thiếp đã xác nhận (card_imports.confirmed_contact_id)
 *   trỏ về contact thuộc sự kiện.
 * - followUpsSent: số follow-up trạng thái 'sent' của contact thuộc sự kiện.
 */
export async function GET(_request: Request, context: RouteContext) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }
  const { id: eventId } = await context.params;
  if (!eventId?.trim()) {
    return errorJson(requestId, 'invalid_id', 'Thiếu mã sự kiện.', 400);
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (eventError) {
    return errorJson(requestId, 'stats_failed', 'Chưa tải được thống kê sự kiện.', 500);
  }
  if (!event) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy sự kiện.', 404);
  }

  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('event_id', eventId)
    .limit(10000);
  if (contactsError) {
    return errorJson(requestId, 'stats_failed', 'Chưa tải được thống kê sự kiện.', 500);
  }

  const contactIds = (contacts ?? []).map((row) => row.id);

  let cardImports = 0;
  let followUpsSent = 0;

  if (contactIds.length > 0) {
    const { count: importCount, error: importError } = await supabase
      .from('card_imports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('confirmed_contact_id', contactIds);
    if (!importError) {
      cardImports = importCount ?? 0;
    }

    const { count: sentCount, error: sentError } = await supabase
      .from('follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'sent')
      .in('contact_id', contactIds);
    if (!sentError) {
      followUpsSent = sentCount ?? 0;
    }
  }

  return NextResponse.json({
    stats: {
      contacts: contactIds.length,
      cardImports,
      followUpsSent,
    },
    request_id: requestId,
  });
}
