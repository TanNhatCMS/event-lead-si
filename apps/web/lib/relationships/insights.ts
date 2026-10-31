/**
 * Gợi ý (insight) tất định từ dữ liệu đồ thị quan hệ — KHÔNG gọi LLM.
 *
 * Ba loại gợi ý, ưu tiên theo thứ tự:
 * - aging:   liên hệ chưa được cập nhật/tương tác quá 90 ngày (trừ stage
 *   "customer") — "Chưa liên lạc X ngày".
 * - unlinked: công ty chưa có liên hệ nào gắn vào.
 * - bridge:  đường giới thiệu 2 bước — A (cùng công ty X với liên hệ B)
 *   có thể làm cầu nối giới thiệu tới C thuộc công ty khác Y (tái dùng
 *   logic "cùng công ty" của GET /api/relationships/intros).
 *
 * Phần thuần tách ra đây để unit test không cần DB; route
 * `GET /api/relationships/insights` chỉ nạp dữ liệu rồi gọi `computeInsights`.
 */

export type InsightType = 'aging' | 'unlinked' | 'bridge';

export type Insight = {
  type: InsightType;
  title: string;
  detail: string;
  link?: string;
};

/** Dòng contacts rút gọn mà route nạp từ DB. */
export type InsightContact = {
  id: string;
  full_name: string;
  relationship_stage: string | null;
  updated_at: string;
  company_id: string | null;
};

/** Dòng companies rút gọn mà route nạp từ DB. */
export type InsightCompany = {
  id: string;
  display_name: string;
};

export type InsightsInput = {
  contacts: InsightContact[];
  companies: InsightCompany[];
};

export type InsightsOptions = {
  /** Mốc "bây giờ" (ms) — truyền cố định trong test để kết quả tất định. */
  now?: number;
};

/** Ngưỡng coi một liên hệ là "lãng quên". */
export const AGING_DAYS = 90;

/** Tối đa 5 cặp cầu nối (người giới thiệu + người được giới thiệu). */
export const BRIDGE_MAX_PAIRS = 5;

/** Tối đa 10 gợi ý trả về, ưu tiên aging trước. */
export const INSIGHTS_MAX = 10;

const MS_PER_DAY = 86_400_000;

/**
 * Số ngày trôi qua kể từ `iso` so với `nowMs`. Trả về -1 nếu chuỗi ngày
 * không hợp lệ (bỏ qua khi xét aging).
 */
export function daysSince(iso: string, nowMs: number): number {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return -1;
  return Math.floor((nowMs - then) / MS_PER_DAY);
}

/** Liên hệ "customer" không cần nhắc chăm sóc — đã là khách hàng. */
export function isAgingCandidate(contact: InsightContact): boolean {
  return contact.relationship_stage !== 'customer';
}

/** aging — liên hệ chưa chạm tới quá 90 ngày, cũ nhất trước. */
export function computeAgingInsights(
  contacts: InsightContact[],
  companies: InsightCompany[],
  nowMs: number,
): Insight[] {
  const companyName = new Map(companies.map((c) => [c.id, c.display_name]));
  const aging: Array<Insight & { days: number }> = [];

  for (const contact of contacts) {
    if (!isAgingCandidate(contact)) continue;
    const days = daysSince(contact.updated_at, nowMs);
    if (days <= AGING_DAYS) continue;
    const company = contact.company_id ? companyName.get(contact.company_id) : undefined;
    aging.push({
      type: 'aging',
      title: 'Chưa liên lạc ' + days + ' ngày',
      detail: company
        ? contact.full_name + ' · ' + company
        : contact.full_name,
      link: '/dashboard/danh-ba/' + contact.id,
      days,
    });
  }

  aging.sort((a, b) => {
    if (b.days !== a.days) return b.days - a.days;
    return a.detail.localeCompare(b.detail, 'vi');
  });

  return aging.map(({ days: _days, ...insight }) => insight);
}

/** unlinked — công ty chưa có liên hệ nào, theo thứ tự tên. */
export function computeUnlinkedInsights(
  contacts: InsightContact[],
  companies: InsightCompany[],
): Insight[] {
  const linked = new Set<string>();
  for (const contact of contacts) {
    if (contact.company_id) linked.add(contact.company_id);
  }

  return companies
    .filter((company) => !linked.has(company.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'vi'))
    .map((company) => ({
      type: 'unlinked' as const,
      title: 'Công ty chưa có liên hệ',
      detail: company.display_name,
      link: '/dashboard/cong-ty/' + company.id,
    }));
}

/** Một cặp cầu nối: A giới thiệu (qua bằng chứng cùng công ty với B) tới C. */
export type BridgePair = {
  introducer: { id: string; full_name: string };
  anchor: { id: string; full_name: string };
  target: { id: string; full_name: string };
  introducerCompany: string;
  targetCompany: string;
};

/**
 * bridge — đường 2 bước trên đồ thị contact→company: A và B cùng làm tại
 * công ty X (cùng công ty = bằng chứng như logic intros), C thuộc công ty
 * khác Y. Kết quả tất định: công ty và liên hệ sắp theo tên, tối đa
 * BRIDGE_MAX_PAIRS cặp, mỗi (A, C) chỉ xuất hiện một lần.
 */
export function computeBridgePairs(
  contacts: InsightContact[],
  companies: InsightCompany[],
): BridgePair[] {
  const sortedCompanies = [...companies].sort((a, b) =>
    a.display_name.localeCompare(b.display_name, 'vi'),
  );
  const companyName = new Map(sortedCompanies.map((c) => [c.id, c.display_name]));

  const byCompany = new Map<string, InsightContact[]>();
  for (const contact of contacts) {
    if (!contact.company_id || !companyName.has(contact.company_id)) continue;
    const arr = byCompany.get(contact.company_id) ?? [];
    arr.push(contact);
    byCompany.set(contact.company_id, arr);
  }
  for (const arr of byCompany.values()) {
    arr.sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'));
  }

  const seen = new Set<string>();
  const pairs: BridgePair[] = [];

  for (const companyX of sortedCompanies) {
    if (pairs.length >= BRIDGE_MAX_PAIRS) break;
    const colleagues = byCompany.get(companyX.id) ?? [];
    if (colleagues.length < 2) continue;

    const introducer = colleagues[0]!;
    const anchor = colleagues[1]!;

    for (const companyY of sortedCompanies) {
      if (pairs.length >= BRIDGE_MAX_PAIRS) break;
      if (companyY.id === companyX.id) continue;
      const targets = byCompany.get(companyY.id) ?? [];
      const target = targets[0];
      if (!target) continue;

      const key = introducer.id + '->' + target.id;
      if (seen.has(key)) continue;
      seen.add(key);

      pairs.push({
        introducer: { id: introducer.id, full_name: introducer.full_name },
        anchor: { id: anchor.id, full_name: anchor.full_name },
        target: { id: target.id, full_name: target.full_name },
        introducerCompany: companyX.display_name,
        targetCompany: companyY.display_name,
      });
    }
  }

  return pairs;
}

/** bridge — biến cặp cầu nối thành insight có link mở hồ sơ người giới thiệu. */
export function computeBridgeInsights(
  contacts: InsightContact[],
  companies: InsightCompany[],
): Insight[] {
  return computeBridgePairs(contacts, companies).map((pair) => ({
    type: 'bridge' as const,
    title: pair.introducer.full_name + ' có thể giới thiệu ' + pair.target.full_name,
    detail:
      pair.introducer.full_name +
      ' và ' +
      pair.anchor.full_name +
      ' cùng làm tại ' +
      pair.introducerCompany +
      ' — có thể nhờ tạo cầu nối tới ' +
      pair.target.full_name +
      ' (' +
      pair.targetCompany +
      ').',
    link: '/dashboard/danh-ba/' + pair.introducer.id,
  }));
}

/**
 * Gom 3 loại gợi ý: aging trước, sau đó unlinked, cuối cùng bridge;
 * cắt còn tối đa INSIGHTS_MAX mục.
 */
export function computeInsights(
  input: InsightsInput,
  options: InsightsOptions = {},
): Insight[] {
  const now = options.now ?? Date.now();
  const insights = [
    ...computeAgingInsights(input.contacts, input.companies, now),
    ...computeUnlinkedInsights(input.contacts, input.companies),
    ...computeBridgeInsights(input.contacts, input.companies),
  ];
  return insights.slice(0, INSIGHTS_MAX);
}
