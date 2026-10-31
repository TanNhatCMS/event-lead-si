import { describe, expect, it } from 'vitest';

import {
  AGING_DAYS,
  BRIDGE_MAX_PAIRS,
  computeAgingInsights,
  computeBridgePairs,
  computeInsights,
  computeUnlinkedInsights,
  daysSince,
  type InsightContact,
} from '../relationships/insights';

/**
 * Test gợi ý tất định từ đồ thị quan hệ — phần thuần: aging, unlinked,
 * bridge. Không gọi DB, không gọi LLM; mốc thời gian truyền cố định.
 */

// Mốc cố định: 2026-10-31T00:00:00Z.
const NOW = Date.parse('2026-10-31T00:00:00Z');

function contact(overrides: Partial<InsightContact>): InsightContact {
  return {
    id: 'c1',
    full_name: 'Nguyen Van A',
    relationship_stage: 'new',
    updated_at: '2026-10-30T00:00:00Z',
    company_id: null,
    ...overrides,
  };
}

const COMPANIES = [
  { id: 'co-x', display_name: 'Công ty X' },
  { id: 'co-y', display_name: 'Anpha Y' },
];

describe('daysSince', () => {
  it('tính số ngày trôi qua, làm tròn xuống', () => {
    expect(daysSince('2026-10-30T00:00:00Z', NOW)).toBe(1);
    expect(daysSince('2026-10-30T12:00:00Z', NOW)).toBe(0);
    expect(daysSince('2026-07-01T00:00:00Z', NOW)).toBe(122);
  });

  it('chuỗi ngày lỗi → -1 (bỏ qua khi xét aging)', () => {
    expect(daysSince('khong-phai-ngay', NOW)).toBe(-1);
  });
});

describe('computeAgingInsights', () => {
  it('đúng ngưỡng 90 ngày: 90 ngày → không gợi ý, 91 ngày → có', () => {
    const at90 = contact({ id: 'a', updated_at: new Date(NOW - AGING_DAYS * 86_400_000).toISOString() });
    const at91 = contact({ id: 'b', updated_at: new Date(NOW - (AGING_DAYS + 1) * 86_400_000).toISOString() });
    expect(computeAgingInsights([at90], COMPANIES, NOW)).toEqual([]);
    const aging = computeAgingInsights([at90, at91], COMPANIES, NOW);
    expect(aging).toHaveLength(1);
    expect(aging[0]).toMatchObject({ type: 'aging', title: 'Chưa liên lạc 91 ngày' });
  });

  it('stage "customer" bị bỏ qua dù lâu không chạm', () => {
    const customer = contact({
      relationship_stage: 'customer',
      updated_at: '2025-01-01T00:00:00Z',
    });
    expect(computeAgingInsights([customer], COMPANIES, NOW)).toEqual([]);
  });

  it('cũ nhất trước; title "Chưa liên lạc X ngày", kèm tên + công ty, link hồ sơ', () => {
    const old1 = contact({
      id: 'id-1',
      full_name: 'Tran B',
      updated_at: '2026-05-01T00:00:00Z',
      company_id: 'co-x',
    });
    const old2 = contact({
      id: 'id-2',
      full_name: 'Le C',
      updated_at: '2026-01-01T00:00:00Z',
      company_id: null,
    });
    const insights = computeAgingInsights([old1, old2], COMPANIES, NOW);
    expect(insights).toHaveLength(2);
    expect(insights[0]).toEqual({
      type: 'aging',
      title: 'Chưa liên lạc 303 ngày',
      detail: 'Le C',
      link: '/dashboard/danh-ba/id-2',
    });
    expect(insights[1]).toEqual({
      type: 'aging',
      title: 'Chưa liên lạc 183 ngày',
      detail: 'Tran B · Công ty X',
      link: '/dashboard/danh-ba/id-1',
    });
  });
});

describe('computeUnlinkedInsights', () => {
  it('công ty không có liên hệ nào → gợi ý kèm link trang công ty', () => {
    const linked = contact({ company_id: 'co-x' });
    const insights = computeUnlinkedInsights([linked], COMPANIES);
    expect(insights).toEqual([
      {
        type: 'unlinked',
        title: 'Công ty chưa có liên hệ',
        detail: 'Anpha Y',
        link: '/dashboard/cong-ty/co-y',
      },
    ]);
  });

  it('mọi công ty đều có liên hệ → rỗng; công ty không liên kết sắp theo tên', () => {
    const linked = [
      contact({ id: 'a', company_id: 'co-x' }),
      contact({ id: 'b', company_id: 'co-y' }),
    ];
    expect(computeUnlinkedInsights(linked, COMPANIES)).toEqual([]);
    const both = [
      { id: 'co-x', display_name: 'Zeta' },
      { id: 'co-y', display_name: 'Alpha' },
    ];
    const insights = computeUnlinkedInsights([], both);
    expect(insights.map((i) => i.detail)).toEqual(['Alpha', 'Zeta']);
  });
});

describe('computeBridgePairs', () => {
  const bridgeContacts = [
    contact({ id: 'a1', full_name: 'A Pham', company_id: 'co-x' }),
    contact({ id: 'b1', full_name: 'B Le', company_id: 'co-x' }),
    contact({ id: 'c1', full_name: 'C Vo', company_id: 'co-y' }),
  ];

  it('A và B cùng công ty X, C ở công ty khác Y → 1 cặp (A giới thiệu, C được giới thiệu)', () => {
    const pairs = computeBridgePairs(bridgeContacts, COMPANIES);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({
      introducer: { id: 'a1', full_name: 'A Pham' },
      anchor: { id: 'b1', full_name: 'B Le' },
      target: { id: 'c1', full_name: 'C Vo' },
      introducerCompany: 'Công ty X',
      targetCompany: 'Anpha Y',
    });
  });

  it('công ty chỉ có 1 liên hệ → không đủ cầu nối', () => {
    const single = [contact({ id: 'a1', company_id: 'co-x' }), contact({ id: 'c1', company_id: 'co-y' })];
    expect(computeBridgePairs(single, COMPANIES)).toEqual([]);
  });

  it('tối đa 5 cặp và kết quả tất định theo thứ tự tên', () => {
    const companies = [
      { id: 'co-1', display_name: 'A Co' },
      { id: 'co-2', display_name: 'B Co' },
      { id: 'co-3', display_name: 'C Co' },
      { id: 'co-4', display_name: 'D Co' },
    ];
    const many: InsightContact[] = [
      contact({ id: 'x1', company_id: 'co-1', full_name: 'X A' }),
      contact({ id: 'x2', company_id: 'co-1', full_name: 'X B' }),
      contact({ id: 'y1', company_id: 'co-2', full_name: 'Y A' }),
      contact({ id: 'y2', company_id: 'co-2', full_name: 'Y B' }),
      contact({ id: 'z1', company_id: 'co-3', full_name: 'Z A' }),
      contact({ id: 'z2', company_id: 'co-3', full_name: 'Z B' }),
      contact({ id: 'w1', company_id: 'co-4', full_name: 'W A' }),
      contact({ id: 'w2', company_id: 'co-4', full_name: 'W B' }),
    ];
    const pairs = computeBridgePairs(many, companies);
    expect(pairs.length).toBeLessThanOrEqual(BRIDGE_MAX_PAIRS);
    expect(pairs.map((p) => p.introducer.id + '->' + p.target.id)).toEqual([
      'x1->y1',
      'x1->z1',
      'x1->w1',
      'y1->x1',
      'y1->z1',
    ]);
  });

  it('liên hệ không gắn công ty hoặc công ty lạ bị bỏ qua', () => {
    const weird = [
      contact({ id: 'n1', company_id: null }),
      contact({ id: 'a1', company_id: 'co-ghost' }),
      contact({ id: 'a2', company_id: 'co-ghost' }),
    ];
    expect(computeBridgePairs(weird, COMPANIES)).toEqual([]);
  });
});

describe('computeInsights — shape tổng', () => {
  it('aging trước, sau đó unlinked, rồi bridge; dùng Date.now() khi không truyền now', () => {
    const aging = contact({
      id: 'old',
      updated_at: '2026-01-01T00:00:00Z',
      company_id: 'co-x',
    });
    const bridgeContacts = [
      contact({ id: 'a1', company_id: 'co-x', updated_at: '2026-10-30T00:00:00Z' }),
      contact({ id: 'b1', company_id: 'co-x', updated_at: '2026-10-30T00:00:00Z' }),
      contact({ id: 'c1', company_id: 'co-y', updated_at: '2026-10-30T00:00:00Z' }),
    ];
    const insights = computeInsights(
      {
        contacts: [...bridgeContacts, aging],
        companies: [...COMPANIES, { id: 'co-z', display_name: 'Omega Z' }],
      },
      { now: NOW },
    );
    expect(insights.map((i) => i.type)).toEqual(['aging', 'unlinked', 'bridge']);
    expect(insights[0]).toMatchObject({ title: 'Chưa liên lạc 303 ngày' });
    expect(insights[1]).toMatchObject({ title: 'Công ty chưa có liên hệ', detail: 'Omega Z' });
    expect(insights[2]).toMatchObject({
      title: 'Nguyen Van A có thể giới thiệu Nguyen Van A',
    });
  });

  it('tối đa 10 gợi ý', () => {
    const many: InsightContact[] = Array.from({ length: 15 }, (_, i) =>
      contact({ id: 'old-' + i, updated_at: '2025-01-01T00:00:00Z' }),
    );
    const insights = computeInsights({ contacts: many, companies: [] }, { now: NOW });
    expect(insights).toHaveLength(10);
    expect(insights.every((i) => i.type === 'aging')).toBe(true);
  });

  it('đồ thị trống → rỗng', () => {
    expect(computeInsights({ contacts: [], companies: [] }, { now: NOW })).toEqual([]);
  });
});
