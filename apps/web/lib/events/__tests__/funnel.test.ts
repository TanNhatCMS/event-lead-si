import { describe, expect, it } from 'vitest';

import {
  COST_WINDOW_TAIL_DAYS,
  costWindowForEvent,
  groupFunnelStages,
  leadsPerCost,
} from '../funnel';

/**
 * Test thuần cho phễu sự kiện + cửa sổ ước lượng chi phí (GET
 * /api/events/[id]/stats). Stage là text tự do trong DB — nhóm theo giá trị
 * ứng dụng đang dùng: 'new' | 'contacted' | 'meeting' | 'negotiating' |
 * 'customer' | 'lost'.
 */

describe('groupFunnelStages', () => {
  it('đếm đúng 4 bậc phễu', () => {
    const funnel = groupFunnelStages([
      'new',
      'new',
      'contacted',
      'meeting',
      'negotiating',
      'customer',
      'lost',
    ]);
    expect(funnel).toEqual({ total: 7, contacted: 5, meeting: 2, deal: 1 });
  });

  it('stage lạ (không phải new) vẫn tính vào contacted', () => {
    const funnel = groupFunnelStages(['new', 'deal_memo', '']);
    expect(funnel).toEqual({ total: 3, contacted: 1, meeting: 0, deal: 0 });
  });

  it('danh sách rỗng → phễu 0', () => {
    expect(groupFunnelStages([])).toEqual({
      total: 0,
      contacted: 0,
      meeting: 0,
      deal: 0,
    });
  });

  it('mọi contact đều customer', () => {
    const funnel = groupFunnelStages(['customer', 'customer']);
    expect(funnel).toEqual({ total: 2, contacted: 2, meeting: 0, deal: 2 });
  });
});

describe('costWindowForEvent', () => {
  it('cửa sổ [starts_at, ends_at + 7 ngày] khi có đủ', () => {
    const window = costWindowForEvent(
      '2026-10-01T09:00:00Z',
      '2026-10-02T17:00:00Z',
    );
    expect(window).not.toBeNull();
    expect(window?.start).toBe('2026-10-01T09:00:00.000Z');
    const expectedEnd = Date.parse('2026-10-02T17:00:00Z') + COST_WINDOW_TAIL_DAYS * 86400000;
    expect(window?.end).toBe(new Date(expectedEnd).toISOString());
  });

  it('thiếu ends_at → cộng 7 ngày vào starts_at', () => {
    const window = costWindowForEvent('2026-10-01T09:00:00Z', null);
    const expectedEnd = Date.parse('2026-10-01T09:00:00Z') + COST_WINDOW_TAIL_DAYS * 86400000;
    expect(window?.start).toBe('2026-10-01T09:00:00.000Z');
    expect(window?.end).toBe(new Date(expectedEnd).toISOString());
  });

  it('thiếu starts_at → null (không đủ dữ liệu ước lượng)', () => {
    expect(costWindowForEvent(null, '2026-10-02T00:00:00Z')).toBeNull();
    expect(costWindowForEvent(undefined, null)).toBeNull();
    expect(costWindowForEvent('', null)).toBeNull();
  });

  it('starts_at sai định dạng → null', () => {
    expect(costWindowForEvent('khong-phai-ngay', null)).toBeNull();
  });
});

describe('leadsPerCost', () => {
  it('leads / cost làm tròn 4 số lẻ', () => {
    expect(leadsPerCost(50, 2)).toBe(25);
    expect(leadsPerCost(7, 3)).toBe(2.3333);
  });

  it('null khi cost <= 0, null hoặc không có lead', () => {
    expect(leadsPerCost(10, null)).toBeNull();
    expect(leadsPerCost(10, 0)).toBeNull();
    expect(leadsPerCost(10, -1)).toBeNull();
    expect(leadsPerCost(0, 5)).toBeNull();
  });
});
