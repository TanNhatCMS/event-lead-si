import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { isAdminSession } from '~/lib/server/require-user-in-server-component';
import {
  fetchGatewayModelPrices,
  fetchLiteLlmModelPrices,
  type ModelPriceRow,
} from '~/lib/ai/usage';

/**
 * POST /api/admin/prices/sync — đồng bộ bảng giá `model_prices` từ nguồn
 * công khai. Chỉ role admin (app_metadata.role).
 *
 * Body: { source: 'gateway' | 'litellm' }
 * - 'gateway': Vercel AI Gateway `GET /v1/models` — pricing là CHUỖI USD per
 *   token, trường `input` / `output` / `input_cache_read` → nhân 1M về
 *   per-million. Lưu provider='gateway', model = id nguyên văn
 *   ("openai/gpt-4o"), source='api'.
 * - 'litellm': JSON bảng giá LiteLLM trên GitHub raw — SỐ USD per token
 *   (`input_cost_per_token` / `output_cost_per_token` /
 *   `cache_read_input_token_cost`). KHÔNG lọc theo `mode` — lấy mọi entry có
 *   cả input + output cost. Lưu provider='litellm', model = key nguyên văn,
 *   source='scrape' (thuật toán tính cost có fallback đọc nhãn 'litellm').
 *
 * Trả { upserted, skipped }: upserted = số dòng giá đã upsert; skipped = số
 * entry nguồn bị bỏ qua (thiếu giá hợp lệ…).
 */

const bodySchema = z.object({
  source: z.enum(['gateway', 'litellm']),
});

/** Kích thước lô upsert (LiteLLM có ~3.6k entry hợp lệ). */
const UPSERT_CHUNK_SIZE = 500;

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

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
      error: errorJson(requestId, 'forbidden', 'Chỉ admin mới được đồng bộ giá model.', 403),
    };
  }
  return { supabase, user };
}

interface SyncRow {
  provider: string;
  model: string;
  input_per_million: number;
  cached_input_per_million: number | null;
  output_per_million: number;
  source: 'api' | 'scrape';
  updated_at: string;
}

function toSyncRow(price: ModelPriceRow, updatedAt: string): SyncRow {
  return {
    provider: price.provider,
    model: price.model,
    input_per_million: price.inputPerMillion,
    cached_input_per_million: price.cachedInputPerMillion,
    output_per_million: price.outputPerMillion,
    source: price.source === 'manual' ? 'api' : price.source,
    updated_at: updatedAt,
  };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireAdmin(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Body phải chứa source: gateway | litellm.',
      400,
    );
  }

  try {
    const fetched =
      parsed.data.source === 'gateway'
        ? await fetchGatewayModelPrices()
        : await fetchLiteLlmModelPrices();

    const updatedAt = new Date().toISOString();
    const rows = fetched.rows.map((price) => toSyncRow(price, updatedAt));
    const db = getSupabaseServerAdminClient() as unknown as SupabaseClient;

    let upserted = 0;
    for (let start = 0; start < rows.length; start += UPSERT_CHUNK_SIZE) {
      const chunk = rows.slice(start, start + UPSERT_CHUNK_SIZE);
      const { error } = await db
        .from('model_prices')
        .upsert(chunk as never, { onConflict: 'provider,model' });
      if (error) {
        return errorJson(requestId, 'database_error', error.message, 500);
      }
      upserted += chunk.length;
    }

    return NextResponse.json({
      upserted,
      skipped: Math.max(0, fetched.totalEntries - fetched.rows.length),
    });
  } catch (err) {
    return errorJson(
      requestId,
      'sync_failed',
      err instanceof Error ? err.message : 'Không đồng bộ được giá model.',
      502,
    );
  }
}
