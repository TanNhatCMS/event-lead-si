import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { isAdminSession } from '~/lib/server/require-user-in-server-component';

/**
 * CRUD bảng giá model (`model_prices` — GLOBAL, không user_id) cho trang
 * Thống kê (/admin/thong-ke). Chỉ role admin (app_metadata.role).
 *
 * - GET    : danh sách giá toàn bộ (đơn vị USD / 1 triệu token).
 * - PUT    : upsert giá nhập tay — source='manual' (ghi đè cả giá đã sync).
 * - DELETE : xóa một dòng giá.
 *
 * RLS của model_prices chỉ mở SELECT cho authenticated; mọi ghi đều qua
 * service-role client. Bảng chưa có trong database.types.ts → client nới
 * không generic (pattern run-ownership.ts).
 */

const priceFieldsSchema = {
  provider: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(300),
  inputPerMillion: z.number().min(0).max(1_000_000),
  cachedInputPerMillion: z.number().min(0).max(1_000_000).nullable().optional(),
  outputPerMillion: z.number().min(0).max(1_000_000),
};

const putSchema = z.object(priceFieldsSchema);
const deleteSchema = z.object({
  provider: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(300),
});

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
      error: errorJson(requestId, 'forbidden', 'Chỉ admin mới được quản lý giá model.', 403),
    };
  }
  return { supabase, user };
}

function adminDb(): SupabaseClient {
  return getSupabaseServerAdminClient() as unknown as SupabaseClient;
}

/** Làm tròn về 6 số lẻ — khớp độ chính xác cột numeric(14,6). */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

interface PriceRecord {
  provider: string;
  model: string;
  input_per_million: string | number;
  cached_input_per_million: string | number | null;
  output_per_million: string | number;
  source: 'manual' | 'api' | 'scrape';
  updated_at: string | null;
}

/**
 * GET /api/admin/prices — danh sách giá model (USD/1M token), sắp theo
 * provider rồi model.
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireAdmin(requestId);
  if ('error' in auth) return auth.error;

  try {
    const { data, error } = await adminDb()
      .from('model_prices')
      .select(
        'provider, model, input_per_million, cached_input_per_million, output_per_million, source, updated_at',
      )
      .order('provider')
      .order('model');
    if (error) {
      return errorJson(requestId, 'database_error', error.message, 500);
    }

    const prices = ((data ?? []) as unknown as PriceRecord[]).map((row) => ({
      provider: row.provider,
      model: row.model,
      inputPerMillion: round6(Number(row.input_per_million)),
      cachedInputPerMillion:
        row.cached_input_per_million === null || row.cached_input_per_million === undefined
          ? null
          : round6(Number(row.cached_input_per_million)),
      outputPerMillion: round6(Number(row.output_per_million)),
      source: row.source,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ prices });
  } catch (err) {
    return errorJson(
      requestId,
      'database_error',
      err instanceof Error ? err.message : 'Lỗi không xác định.',
      500,
    );
  }
}

/**
 * PUT /api/admin/prices — upsert một dòng giá nhập tay (source='manual').
 * Body: { provider, model, inputPerMillion, cachedInputPerMillion?, outputPerMillion }
 */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireAdmin(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu giá không hợp lệ.',
      400,
    );
  }

  try {
    const row = {
      provider: parsed.data.provider,
      model: parsed.data.model,
      input_per_million: round6(parsed.data.inputPerMillion),
      cached_input_per_million:
        parsed.data.cachedInputPerMillion === null ||
        parsed.data.cachedInputPerMillion === undefined
          ? null
          : round6(parsed.data.cachedInputPerMillion),
      output_per_million: round6(parsed.data.outputPerMillion),
      source: 'manual' as const,
      updated_at: new Date().toISOString(),
    };
    const { error } = await adminDb()
      .from('model_prices')
      .upsert(row as never, { onConflict: 'provider,model' });
    if (error) {
      return errorJson(requestId, 'database_error', error.message, 500);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(
      requestId,
      'database_error',
      err instanceof Error ? err.message : 'Lỗi không xác định.',
      500,
    );
  }
}

/**
 * DELETE /api/admin/prices — xóa một dòng giá.
 * Body: { provider, model }
 */
export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireAdmin(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'provider/model không hợp lệ.',
      400,
    );
  }

  try {
    const { error } = await adminDb()
      .from('model_prices')
      .delete()
      .eq('provider', parsed.data.provider)
      .eq('model', parsed.data.model);
    if (error) {
      return errorJson(requestId, 'database_error', error.message, 500);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(
      requestId,
      'database_error',
      err instanceof Error ? err.message : 'Lỗi không xác định.',
      500,
    );
  }
}
