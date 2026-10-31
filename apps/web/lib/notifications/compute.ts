/**
 * Phần tính toán thuần cho notification center (GET /api/notifications) —
 * không đụng DB/mạng nên test được riêng bằng unit test.
 *
 * Thông báo được TÍNH TOÁN từ dữ liệu có sẵn (không bảng mới):
 * - follow_ups status 'draft' cũ hơn FOLLOWUP_DRAFT_STALE_DAYS ngày
 *   ("Nháp follow-up chờ duyệt").
 * - meeting_notes có due_at trong NOTE_DUE_WINDOW_DAYS ngày tới hoặc đã quá
 *   hạn, chưa xong, chưa xóa ("Việc đến hạn").
 * - audit_logs action 'budget.exceeded' trong BUDGET_WINDOW_DAYS ngày qua
 *   ("Budget vượt").
 */

export type NotificationKind = 'followup_draft' | 'note_due' | 'budget_exceeded';

export interface NotificationItem {
  kind: NotificationKind;
  title: string;
  detail: string;
  link: string;
  /** ISO timestamp — mốc sắp xếp (mới nhất trước). */
  at: string;
}

/** Dòng follow_ups (status draft) — đầu vào thô từ Supabase. */
export interface DraftFollowUpRow {
  id: string;
  contact_id: string | null;
  subject: string | null;
  created_at: string;
}

/** Dòng meeting_notes có due_at — đầu vào thô từ Supabase. */
export interface DueNoteRow {
  id: string;
  contact_id: string | null;
  body: string | null;
  due_at: string | null;
}

/** Dòng audit_logs action 'budget.exceeded' — đầu vào thô từ Supabase. */
export interface BudgetAuditRow {
  id: string;
  summary: string;
  created_at: string;
}

/** Nháp follow-up "cũ" tính từ bao nhiêu ngày. */
export const FOLLOWUP_DRAFT_STALE_DAYS = 3;

/** Cửa sổ "đến hạn" của ghi chú: trong 3 ngày tới hoặc đã quá hạn. */
export const NOTE_DUE_WINDOW_DAYS = 3;

/** Cửa sổ đọc audit 'budget.exceeded'. */
export const BUDGET_WINDOW_DAYS = 30;

/** Số thông báo tối đa trả về. */
export const MAX_NOTIFICATIONS = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function truncateDetail(text: string | null | undefined, max = 80): string {
  const value = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

/**
 * Gộp ba nguồn thành danh sách thông báo: sort `at` giảm dần, cắt tối đa
 * MAX_NOTIFICATIONS. Mọi mốc thời gian tính theo `now` (tiêm vào để test).
 */
export function computeNotifications(
  input: {
    draftFollowUps: DraftFollowUpRow[];
    dueNotes: DueNoteRow[];
    budgetLogs: BudgetAuditRow[];
  },
  now: Date,
): NotificationItem[] {
  const nowMs = now.getTime();
  const items: NotificationItem[] = [];

  // 1. Nháp follow-up chờ duyệt — tạo cách đây hơn FOLLOWUP_DRAFT_STALE_DAYS ngày.
  const draftCutoff = nowMs - FOLLOWUP_DRAFT_STALE_DAYS * DAY_MS;
  for (const row of input.draftFollowUps ?? []) {
    const at = parseTime(row.created_at);
    if (at === null || at > draftCutoff) continue;
    const detail = truncateDetail(row.subject) || 'Bản nháp chưa được duyệt';
    items.push({
      kind: 'followup_draft',
      title: 'Nháp follow-up chờ duyệt',
      detail,
      link: '/dashboard',
      at: row.created_at,
    });
  }

  // 2. Việc đến hạn — due_at trong NOTE_DUE_WINDOW_DAYS ngày tới hoặc quá hạn.
  const dueUpper = nowMs + NOTE_DUE_WINDOW_DAYS * DAY_MS;
  for (const row of input.dueNotes ?? []) {
    const dueMs = parseTime(row.due_at);
    if (dueMs === null || dueMs > dueUpper) continue;
    const detail = truncateDetail(row.body) || 'Việc cần làm';
    items.push({
      kind: 'note_due',
      title: 'Việc đến hạn',
      detail,
      link: row.contact_id
        ? '/dashboard/danh-ba/' + row.contact_id
        : '/dashboard',
      at: row.due_at as string,
    });
  }

  // 3. Budget vượt — audit 'budget.exceeded' trong BUDGET_WINDOW_DAYS ngày qua.
  const budgetCutoff = nowMs - BUDGET_WINDOW_DAYS * DAY_MS;
  for (const row of input.budgetLogs ?? []) {
    const at = parseTime(row.created_at);
    if (at === null || at < budgetCutoff) continue;
    items.push({
      kind: 'budget_exceeded',
      title: 'Budget vượt',
      detail: truncateDetail(row.summary) || 'Đã vượt ngưỡng chi phí tháng.',
      link: '/dashboard/nhat-ky',
      at: row.created_at,
    });
  }

  items.sort((a, b) => {
    const ta = parseTime(a.at) ?? 0;
    const tb = parseTime(b.at) ?? 0;
    return tb - ta;
  });
  return items.slice(0, MAX_NOTIFICATIONS);
}
