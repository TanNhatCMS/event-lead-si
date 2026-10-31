import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  BUDGET_WINDOW_DAYS,
  FOLLOWUP_DRAFT_STALE_DAYS,
  computeNotifications,
  type BudgetAuditRow,
  type DraftFollowUpRow,
  type DueNoteRow,
} from '~/lib/notifications/compute';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysAheadIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * GET /api/notifications
 *
 * Notification center TÍNH TOÁN từ dữ liệu có sẵn (không bảng mới):
 * - follow_ups status 'draft' cũ hơn FOLLOWUP_DRAFT_STALE_DAYS ngày.
 * - meeting_notes due_at trong 3 ngày tới hoặc quá hạn, chưa xong/chưa xóa.
 * - audit_logs 'budget.exceeded' trong BUDGET_WINDOW_DAYS ngày qua.
 * Mỗi item { kind, title, detail, link, at }, sort mới nhất trước, max 20.
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

  const [draftsRes, notesRes, budgetRes] = await Promise.all([
    supabase
      .from('follow_ups')
      .select('id, contact_id, subject, created_at')
      .eq('user_id', user.id)
      .eq('status', 'draft')
      .lt('created_at', daysAgoIso(FOLLOWUP_DRAFT_STALE_DAYS))
      .order('created_at', { ascending: true })
      .limit(50),
    supabase
      .from('meeting_notes')
      .select('id, contact_id, body, due_at')
      .eq('user_id', user.id)
      .eq('note_type', 'next_step')
      .is('deleted_at', null)
      .is('done_at', null)
      .not('due_at', 'is', null)
      .gte('due_at', daysAgoIso(90))
      .lte('due_at', daysAheadIso(3))
      .order('due_at', { ascending: true })
      .limit(50),
    supabase
      .from('audit_logs')
      .select('id, summary, created_at')
      .eq('user_id', user.id)
      .eq('action', 'budget.exceeded')
      .gte('created_at', daysAgoIso(BUDGET_WINDOW_DAYS))
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // Một nguồn lỗi không chặn các nguồn còn lại (best-effort, giống stats ROI).
  if (draftsRes.error || notesRes.error || budgetRes.error) {
    if (draftsRes.error) {
      console.error('[notifications] follow_ups failed:', draftsRes.error.message);
    }
    if (notesRes.error) {
      console.error('[notifications] meeting_notes failed:', notesRes.error.message);
    }
    if (budgetRes.error) {
      console.error('[notifications] audit_logs failed:', budgetRes.error.message);
    }
  }

  const items = computeNotifications(
    {
      draftFollowUps: (draftsRes.data ?? []) as unknown as DraftFollowUpRow[],
      dueNotes: (notesRes.data ?? []) as unknown as DueNoteRow[],
      budgetLogs: (budgetRes.data ?? []) as unknown as BudgetAuditRow[],
    },
    new Date(),
  );

  return NextResponse.json({
    notifications: items,
    count: items.length,
    request_id: requestId,
  });
}
