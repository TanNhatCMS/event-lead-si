import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { isAdminSession } from '~/lib/server/require-user-in-server-component';
import { round4 } from '~/lib/ai/usage';

/**
 * GET /api/admin/usage?days=30 — thống kê token/chi phí AI cho trang
 * Thống kê (/admin/thong-ke). Chỉ role admin (app_metadata.role).
 *
 * - `days`: 7 | 30 | 90 | all (mặc định 30) — khoảng created_at.
 * - Đọc TOÀN BỘ user (service-role bỏ qua RLS) rồi aggregate theo
 *   (provider, model) trong JS — app single-user, khối lượng nhỏ.
 * - `costUsd` = tổng các dòng CÓ giá (SUM cost_usd); bằng null khi không có
 *   dòng nào có giá. `pricedCalls` = số dòng có giá. Cost làm tròn 4 số lẻ.
 */

const querySchema = z.object({
  days: z.enum(['7', '30', '90', 'all']).optional().default('30'),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/** Guard admin dùng chung cho API /api/admin/* (pattern admin/users). */
async function requireAdmin(requestId: string) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401),
    };
  }
  if (!(await isAdminSession(supabase, user))) {
    return {
      error: errorJson(requestId, 'forbidden', 'Chỉ admin mới được xem thống kê.', 403),
    };
  }
  return { supabase, user };
}

interface UsageRow {
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  total_tokens: number | null;
  cost_usd: string | number | null;
}

interface ModelStat {
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number | null;
  pricedCalls: number;
}

interface Totals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
  pricedCalls: number;
}

function emptyTotals(): Totals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    pricedCalls: 0,
  };
}

/** numeric của Postgres về sang JS là string — ép number an toàn. */
function toCostNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function finalizeTotals(totals: Totals) {
  return {
    calls: totals.calls,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    cachedTokens: totals.cachedTokens,
    totalTokens: totals.totalTokens,
    costUsd: totals.pricedCalls > 0 ? round4(totals.costUsd) : null,
  };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireAdmin(requestId);
  if ('error' in auth) return auth.error;

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_query', 'Tham số days không hợp lệ.', 400);
  }
  const daysValue = parsed.data.days;

  try {
    // Bảng chưa có trong database.types.ts → client nới không generic (pattern
    // run-ownership.ts) và hàng đọc về cast thủ công.
    const client = auth.supabase as unknown as import('@supabase/supabase-js').SupabaseClient;
    let query = client
      .from('ai_usage')
      .select(
        'provider, model, input_tokens, output_tokens, cached_tokens, total_tokens, cost_usd',
      );
    if (daysValue !== 'all') {
      const cutoff = new Date(Date.now() - Number(daysValue) * 86400000);
      query = query.gte('created_at', cutoff.toISOString());
    }
    const { data, error } = await query;
    if (error) {
      return errorJson(requestId, 'database_error', error.message, 500);
    }

    const rows = (data ?? []) as unknown as UsageRow[];
    const summary = emptyTotals();
    const byModelKey = new Map<string, Totals & { provider: string; model: string }>();

    for (const row of rows) {
      const input = row.input_tokens ?? 0;
      const output = row.output_tokens ?? 0;
      const cached = row.cached_tokens ?? 0;
      const total = row.total_tokens ?? 0;
      const cost = toCostNumber(row.cost_usd);

      summary.calls += 1;
      summary.inputTokens += input;
      summary.outputTokens += output;
      summary.cachedTokens += cached;
      summary.totalTokens += total;
      if (cost !== null) {
        summary.costUsd += cost;
        summary.pricedCalls += 1;
      }

      const key = row.provider + '|' + row.model;
      let stat = byModelKey.get(key);
      if (!stat) {
        stat = {
          provider: row.provider,
          model: row.model,
          ...emptyTotals(),
        };
        byModelKey.set(key, stat);
      }
      stat.calls += 1;
      stat.inputTokens += input;
      stat.outputTokens += output;
      stat.cachedTokens += cached;
      stat.totalTokens += total;
      if (cost !== null) {
        stat.costUsd += cost;
        stat.pricedCalls += 1;
      }
    }

    const byModel: ModelStat[] = [...byModelKey.values()]
      .map((stat) => ({
        provider: stat.provider,
        model: stat.model,
        calls: stat.calls,
        inputTokens: stat.inputTokens,
        outputTokens: stat.outputTokens,
        cachedTokens: stat.cachedTokens,
        totalTokens: stat.totalTokens,
        costUsd: stat.pricedCalls > 0 ? round4(stat.costUsd) : null,
        pricedCalls: stat.pricedCalls,
      }))
      // Model tốn token nhất đứng trước để bảng thống kê đọc theo độ ưu tiên.
      .sort((a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls);

    return NextResponse.json({
      summary: finalizeTotals(summary),
      byModel,
    });
  } catch (err) {
    return errorJson(
      requestId,
      'database_error',
      err instanceof Error ? err.message : 'Lỗi không xác định.',
      500,
    );
  }
}
