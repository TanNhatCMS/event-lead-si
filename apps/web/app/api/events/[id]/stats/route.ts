import 'server-only';

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { round4 } from '~/lib/ai/usage';
import {
  costWindowForEvent,
  groupFunnelStages,
  leadsPerCost,
} from '~/lib/events/funnel';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Ghi chú tĩnh kèm số liệu ROI — chi phí AI là ƯỚC LƯỢNG vì bảng ai_usage
 * không có event_id/contact_id nên không gắn trực tiếp cost vào sự kiện.
 */
const COST_ESTIMATE_NOTE =
  'Chi phí AI là ước lượng: tổng cost_usd của người dùng trong khoảng từ thời điểm bắt đầu sự kiện ' +
  'đến 7 ngày sau khi kết thúc (hoặc 7 ngày sau thời điểm bắt đầu nếu chưa có ngày kết thúc); ' +
  'có thể bao gồm cả chi phí AI ngoài sự kiện này và bỏ sót chi phí phát sinh muộn hơn.';

/**
 * GET /api/events/[id]/stats
 *
 * Thống kê một sự kiện:
 * - contacts: số contact gắn vào sự kiện.
 * - cardImports: số danh thiếp đã xác nhận (card_imports.confirmed_contact_id)
 *   trỏ về contact thuộc sự kiện.
 * - followUpsSent: số follow-up trạng thái 'sent' của contact thuộc sự kiện.
 * - funnel: đếm contact theo relationship_stage nhóm thành 4 bậc
 *   (total / contacted / meeting / deal — xem lib/events/funnel.ts).
 * - costUsd + leadsPerCost: ROI ƯỚC LƯỢNG — SUM ai_usage.cost_usd của user
 *   trong cửa sổ [starts_at, COALESCE(ends_at, starts_at)+7 ngày] (bảng
 *   ai_usage không có event_id nên không gắn trực tiếp được; null khi sự
 *   kiện chưa có starts_at). Ghi chú ở stats.costNote.
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
    .select('id, starts_at, ends_at')
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
    .select('id, relationship_stage')
    .eq('user_id', user.id)
    .eq('event_id', eventId)
    .limit(10000);
  if (contactsError) {
    return errorJson(requestId, 'stats_failed', 'Chưa tải được thống kê sự kiện.', 500);
  }

  const contactRows = (contacts ?? []) as Array<{
    id: string;
    relationship_stage: string | null;
  }>;
  const contactIds = contactRows.map((row) => row.id);
  const funnel = groupFunnelStages(
    contactRows.map((row) => row.relationship_stage ?? 'new'),
  );

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

  // ROI ước lượng: SUM cost_usd trong cửa sổ thời gian của sự kiện. Bảng
  // ai_usage chưa có trong database.types.ts (chỉ có sau supabase:typegen)
  // nên client được nới về SupabaseClient không generic — cùng pattern với
  // lib/ai/usage.ts. Lỗi đọc usage không làm fail stats (costUsd = null).
  let costUsd: number | null = null;
  let leadsPerCostValue: number | null = null;
  const window = costWindowForEvent(event.starts_at, event.ends_at);
  if (window) {
    try {
      const usageClient = supabase as unknown as SupabaseClient;
      const { data: usageRows, error: usageError } = await usageClient
        .from('ai_usage')
        .select('cost_usd')
        .eq('user_id', user.id)
        .gte('created_at', window.start)
        .lte('created_at', window.end)
        .limit(10_000);
      if (!usageError) {
        let sum = 0;
        for (const row of (usageRows ?? []) as Array<{ cost_usd: number | null }>) {
          if (typeof row?.cost_usd === 'number' && Number.isFinite(row.cost_usd)) {
            sum += row.cost_usd;
          }
        }
        costUsd = round4(sum);
        leadsPerCostValue = leadsPerCost(contactRows.length, costUsd);
      }
    } catch (err) {
      console.warn(
        '[events/stats] đọc chi phí AI thất bại (bỏ qua): ' +
          (err instanceof Error ? err.message : 'lỗi không xác định'),
      );
    }
  }

  return NextResponse.json({
    stats: {
      contacts: contactIds.length,
      cardImports,
      followUpsSent,
      funnel,
      costUsd,
      leadsPerCost: leadsPerCostValue,
      costNote: COST_ESTIMATE_NOTE,
    },
    request_id: requestId,
  });
}
