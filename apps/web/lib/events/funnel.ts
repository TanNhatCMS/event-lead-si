/**
 * Phần tính toán thuần cho thống kê sự kiện (GET /api/events/[id]/stats) —
 * không đụng DB/mạng nên test được riêng bằng unit test.
 *
 * `contacts.relationship_stage` là text tự do trong DB (không có check
 * constraint, mặc định 'new'). Giá trị ứng dụng đang dùng:
 *   'new' | 'contacted' | 'meeting' | 'negotiating' | 'customer' | 'lost'
 * (xem STAGE_IDS trong app/api/dashboard/stats/route.ts). Stage lạ ngoài
 * danh sách vẫn được tính vào `contacted` vì khác 'new' — nghĩa là user đã
 * có tương tác nào đó.
 */

/** Stage tính vào bậc "gặp/negotiate" của phễu. */
export const FUNNEL_MEETING_STAGES = ['meeting', 'negotiating'] as const;

/** Stage tính vào bậc "chốt deal" của phễu. */
export const FUNNEL_DEAL_STAGES = ['customer'] as const;

export interface EventFunnel {
  /** Tổng contact gắn sự kiện (mọi stage, kể cả 'new'). */
  total: number;
  /** Đã bước ra khỏi 'new' (user đã tương tác). */
  contacted: number;
  /** Stage thuộc FUNNEL_MEETING_STAGES. */
  meeting: number;
  /** Stage thuộc FUNNEL_DEAL_STAGES. */
  deal: number;
}

/** Nhóm danh sách stage thô của contact thành phễu 4 bậc. */
export function groupFunnelStages(stages: string[]): EventFunnel {
  const total = stages.length;
  let contacted = 0;
  let meeting = 0;
  let deal = 0;
  for (const raw of stages) {
    const stage = (raw ?? '').trim().toLowerCase();
    if (!stage || stage === 'new') continue;
    contacted += 1;
    if ((FUNNEL_MEETING_STAGES as readonly string[]).includes(stage)) {
      meeting += 1;
    }
    if ((FUNNEL_DEAL_STAGES as readonly string[]).includes(stage)) {
      deal += 1;
    }
  }
  return { total, contacted, meeting, deal };
}

/** Số ngày gia hạn cửa sổ ước lượng chi phí sau khi sự kiện kết thúc. */
export const COST_WINDOW_TAIL_DAYS = 7;

export interface CostWindow {
  /** ISO string — đầu cửa sổ (= starts_at của sự kiện). */
  start: string;
  /** ISO string — cuối cửa sổ (= COALESCE(ends_at, starts_at) + 7 ngày). */
  end: string;
}

/**
 * Cửa sổ ước lượng chi phí AI của một sự kiện: [starts_at,
 * COALESCE(ends_at, starts_at) + COST_WINDOW_TAIL_DAYS ngày].
 * Trả null khi sự kiện không có starts_at (không đủ dữ liệu để ước lượng —
 * route trả costUsd/leadsPerCost = null).
 */
export function costWindowForEvent(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): CostWindow | null {
  if (!startsAt) return null;
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) return null;
  let endMs = startMs;
  if (endsAt) {
    const parsedEnd = Date.parse(endsAt);
    if (Number.isFinite(parsedEnd)) {
      endMs = parsedEnd;
    }
  }
  endMs += COST_WINDOW_TAIL_DAYS * 24 * 60 * 60 * 1000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}

/**
 * Hiệu suất chi phí: số lead thu được trên mỗi USD chi phí AI (làm tròn 4
 * số lẻ). cost <= 0 hoặc không có lead → null (không có ý nghĩa chia).
 */
export function leadsPerCost(leads: number, costUsd: number | null): number | null {
  if (costUsd === null || !Number.isFinite(costUsd) || costUsd <= 0 || leads <= 0) {
    return null;
  }
  return Math.round((leads / costUsd) * 10000) / 10000;
}
