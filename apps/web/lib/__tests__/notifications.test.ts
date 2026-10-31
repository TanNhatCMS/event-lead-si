import { describe, expect, it } from 'vitest';

import {
  computeNotifications,
  FOLLOWUP_DRAFT_STALE_DAYS,
  MAX_NOTIFICATIONS,
  type BudgetAuditRow,
  type DraftFollowUpRow,
  type DueNoteRow,
} from '../notifications/compute';

/**
 * Test notification center — phần thuần (lib/notifications/compute.ts):
 * gộp 3 nguồn (nháp follow-up cũ, việc đến hạn, budget vượt), sort mới nhất
 * trước, cắt tối đa MAX_NOTIFICATIONS. Route chỉ việc đọc DB nên không cần
 * mock Supabase ở đây.
 */

const NOW = new Date('2026-10-31T12:00:00.000Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function daysAhead(n: number): string {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}

describe('computeNotifications — followup_draft', () => {
  const drafts: DraftFollowUpRow[] = [
    { id: 'd1', contact_id: 'c1', subject: 'Thu ngon ban hang', created_at: daysAgo(5) },
    { id: 'd2', contact_id: 'c2', subject: null, created_at: daysAgo(2) }, // còn mới
  ];

  it('nháp cũ hơn 3 ngày → thông báo; nháp mới → bỏ qua', () => {
    const items = computeNotifications(
      { draftFollowUps: drafts, dueNotes: [], budgetLogs: [] },
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('followup_draft');
    expect(items[0]?.title).toBe('Nháp follow-up chờ duyệt');
    expect(items[0]?.detail).toBe('Thu ngon ban hang');
    expect(items[0]?.link).toBe('/dashboard');
  });

  it('nháp đúng ranh giới (chính xác 3 ngày) → tính là cũ', () => {
    const items = computeNotifications(
      {
        draftFollowUps: [
          { id: 'd9', contact_id: null, subject: null, created_at: daysAgo(FOLLOWUP_DRAFT_STALE_DAYS) },
        ],
        dueNotes: [],
        budgetLogs: [],
      },
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.detail).toBe('Bản nháp chưa được duyệt');
  });

  it('subject rỗng → detail mặc định', () => {
    const items = computeNotifications(
      {
        draftFollowUps: [
          { id: 'd3', contact_id: 'c3', subject: '   ', created_at: daysAgo(10) },
        ],
        dueNotes: [],
        budgetLogs: [],
      },
      NOW,
    );
    expect(items[0]?.detail).toBe('Bản nháp chưa được duyệt');
  });
});

describe('computeNotifications — note_due', () => {
  const notes: DueNoteRow[] = [
    { id: 'n1', contact_id: 'c1', body: 'Goi lai khach hang', due_at: daysAgo(1) }, // quá hạn
    { id: 'n2', contact_id: 'c2', body: 'Gui email chao', due_at: daysAhead(2) }, // trong 3 ngày
    { id: 'n3', contact_id: 'c3', body: 'Qua xa', due_at: daysAhead(5) }, // ngoài cửa sổ
    { id: 'n4', contact_id: 'c4', body: null, due_at: null }, // không có hạn
  ];

  it('quá hạn hoặc trong 3 ngày tới → thông báo; ngoài cửa sổ → bỏ qua', () => {
    const items = computeNotifications(
      { draftFollowUps: [], dueNotes: notes, budgetLogs: [] },
      NOW,
    );
    // Sort theo at giảm dần: due_at +2 ngày (n2) trước due_at -1 ngày (n1).
    expect(items.map((i) => i.detail)).toEqual(['Gui email chao', 'Goi lai khach hang']);
    expect(items.map((i) => i.title)).toEqual(['Việc đến hạn', 'Việc đến hạn']);
    expect(items[1]?.link).toBe('/dashboard/danh-ba/c1');
  });

  it('không có contact_id → link về /dashboard', () => {
    const items = computeNotifications(
      {
        draftFollowUps: [],
        dueNotes: [{ id: 'n9', contact_id: null, body: 'X', due_at: daysAgo(2) }],
        budgetLogs: [],
      },
      NOW,
    );
    expect(items[0]?.link).toBe('/dashboard');
  });
});

describe('computeNotifications — budget_exceeded', () => {
  const logs: BudgetAuditRow[] = [
    {
      id: 'b1',
      summary: 'Vượt ngưỡng chi phí tháng của capability sourcing.',
      created_at: daysAgo(10),
    },
    {
      id: 'b2',
      summary: 'Vượt ngưỡng (quá cũ).',
      created_at: daysAgo(45), // ngoài cửa sổ 30 ngày
    },
  ];

  it('chỉ lấy log trong 30 ngày qua', () => {
    const items = computeNotifications(
      { draftFollowUps: [], dueNotes: [], budgetLogs: logs },
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('budget_exceeded');
    expect(items[0]?.title).toBe('Budget vượt');
    expect(items[0]?.link).toBe('/dashboard/nhat-ky');
  });
});

describe('computeNotifications — gộp nguồn', () => {
  it('sort at giảm dần (mới nhất trước)', () => {
    const items = computeNotifications(
      {
        draftFollowUps: [
          { id: 'd1', contact_id: 'c1', subject: 'A', created_at: daysAgo(9) },
        ],
        dueNotes: [{ id: 'n1', contact_id: 'c2', body: 'B', due_at: daysAgo(1) }],
        budgetLogs: [
          { id: 'b1', summary: 'C', created_at: daysAgo(4) },
        ],
      },
      NOW,
    );
    // due_at 1 ngày trước < budget 4 ngày < draft 9 ngày (mới → cũ).
    expect(items.map((i) => i.kind)).toEqual(['note_due', 'budget_exceeded', 'followup_draft']);
  });

  it('tối đa MAX_NOTIFICATIONS item', () => {
    const many: DraftFollowUpRow[] = Array.from({ length: 30 }, (_, i) => ({
      id: 'd' + i,
      contact_id: 'c' + i,
      subject: 'S' + i,
      created_at: daysAgo(10 + i),
    }));
    const items = computeNotifications(
      { draftFollowUps: many, dueNotes: [], budgetLogs: [] },
      NOW,
    );
    expect(items).toHaveLength(MAX_NOTIFICATIONS);
  });

  it('mọi nguồn rỗng → rỗng; mốc thời gian sai → bỏ qua', () => {
    expect(
      computeNotifications(
        {
          draftFollowUps: [
            { id: 'x', contact_id: null, subject: null, created_at: 'khong-phai-ngay' },
          ],
          dueNotes: [],
          budgetLogs: [],
        },
        NOW,
      ),
    ).toEqual([]);
  });
});
