import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import type { Database, Json } from '@kit/supabase/database';
import type { SupabaseClient } from '@supabase/supabase-js';

import { listDirectProviders } from '~/lib/ai/model-config';

/**
 * Quản lý ĐA API key theo provider cho /admin/settings — KHÔNG dùng env để lưu:
 * - GET   : danh sách key hiện có của từng provider (masked, không bao giờ trả
 *           key gốc) + key env (nếu có) hiển thị như fallback cuối.
 * - PUT   : THAY THẾ danh sách key vào agent_config.credentials
 *           (`<provider>_api_keys` = JSON array; key[0] = key active) và xóa
 *           field key đơn legacy `<provider>_api_key` nếu còn.
 * - DELETE: gỡ toàn bộ key của một provider (cả danh sách lẫn legacy).
 *
 * Nguồn key mà backend failover dùng theo thứ tự: DB array → DB legacy (sau
 * khi PUT sẽ không còn) → env `${apiKeyEnv}` (fallback cuối, không sửa được
 * từ đây). UI chỉ nhận bản masked (4 ký tự cuối).
 */

const DIRECT_PROVIDER_IDS: string[] = listDirectProviders().map((p) => p.id);
const DIRECT_PROVIDER_LABELS = new Map<string, string>(
  listDirectProviders().map((p) => [p.id, p.label]),
);
const DIRECT_PROVIDER_ENVS = new Map<string, string>(
  listDirectProviders().map((p) => [p.id, p.apiKeyEnv]),
);
// openai-compatible không thuộc registry direct (không có factory riêng) nhưng
// vẫn cho phép quản lý key — failover tạo model qua createOpenAICompatible.
const SUPPORTED_PROVIDER_IDS: string[] = [...DIRECT_PROVIDER_IDS, 'openai-compatible'];
const PROVIDER_LABELS = new Map<string, string>([
  ...DIRECT_PROVIDER_LABELS,
  ['openai-compatible', 'OpenAI-compatible (tuỳ chỉnh)'],
]);
const PROVIDER_ENVS = new Map<string, string>([
  ...DIRECT_PROVIDER_ENVS,
  ['openai-compatible', 'OPENAI_API_KEY'],
]);

const MAX_KEYS_PER_PROVIDER = 20;

const providerSchema = z.string().refine((v) => SUPPORTED_PROVIDER_IDS.includes(v), {
  message: 'Provider không được hỗ trợ.',
});

const putSchema = z.object({
  provider: providerSchema,
  keys: z
    .array(
      z
        .string()
        .trim()
        .min(8, 'API key quá ngắn (tối thiểu 8 ký tự).')
        .max(300, 'API key quá dài.'),
    )
    .max(MAX_KEYS_PER_PROVIDER, 'Tối đa 20 API key cho mỗi provider.'),
});

const deleteSchema = z.object({ provider: providerSchema });

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

function maskKey(key: string): string {
  return '***' + key.slice(-4);
}

async function requireUser(requestId: string) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401) };
  }
  return { supabase, user };
}

async function readCredentials(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('agent_config')
    .select('credentials')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.credentials as Record<string, unknown>) ?? {};
}

/** Đọc danh sách key (đã trim) từ credentials cho một provider. */
function readProviderKeys(
  credentials: Record<string, unknown>,
  providerId: string,
): string[] {
  const rawList = credentials[`${providerId}_api_keys`];
  const fromList = Array.isArray(rawList)
    ? rawList.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
  const rawLegacy = credentials[`${providerId}_api_key`];
  const legacy =
    typeof rawLegacy === 'string' && rawLegacy.trim() ? [rawLegacy.trim()] : [];
  return Array.from(new Set([...fromList, ...legacy]));
}

/** GET /api/ai-keys — trạng thái đa key của từng provider (đều masked). */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const credentials = await readCredentials(auth.supabase, auth.user.id);

  const providers = SUPPORTED_PROVIDER_IDS.map((id) => {
    const envName = PROVIDER_ENVS.get(id) ?? '';
    const envKey = (process.env[envName] ?? '').trim();
    const keys = readProviderKeys(credentials, id).map(maskKey);

    return {
      id,
      label: PROVIDER_LABELS.get(id) ?? id,
      envName,
      // Key DB (đã gồm key đơn legacy nếu còn) — masked, giữ thứ tự ưu tiên.
      keys,
      // Key env hiện tại của server (fallback cuối) — masked hoặc null.
      envFallback: envKey ? maskKey(envKey) : null,
      count: keys.length,
    };
  });

  return NextResponse.json({ providers });
}

/**
 * PUT /api/ai-keys — thay thế danh sách key của một provider.
 * Body: { provider, keys: string[] } (mỗi key trim, tối thiểu 8 ký tự, tối đa 20).
 * Ghi `<provider>_api_keys` (key[0] = active) và xóa legacy `<provider>_api_key`.
 */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  // Dedupe giữ thứ tự — key đầu tiên là key active.
  const uniqueKeys = Array.from(new Set(parsed.data.keys));

  const admin = getSupabaseServerAdminClient();
  const { data: rows } = await admin
    .from('agent_config')
    .select('credentials')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const credentials = {
    ...((rows?.credentials as Record<string, unknown>) ?? {}),
    [`${parsed.data.provider}_api_keys`]: uniqueKeys,
  };
  delete credentials[`${parsed.data.provider}_api_key`];

  const { error } = await admin
    .from('agent_config')
    .upsert(
      {
        user_id: auth.user.id,
        credentials: credentials as NonNullable<Json>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/ai-keys — gỡ toàn bộ key của một provider. Body: { provider } */
export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const body: unknown = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  const admin = getSupabaseServerAdminClient();
  const { data: rows } = await admin
    .from('agent_config')
    .select('credentials')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const credentials = {
    ...((rows?.credentials as Record<string, unknown>) ?? {}),
  };
  delete credentials[`${parsed.data.provider}_api_keys`];
  delete credentials[`${parsed.data.provider}_api_key`];

  const { error } = await admin
    .from('agent_config')
    .upsert(
      {
        user_id: auth.user.id,
        credentials: credentials as NonNullable<Json>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    return errorJson(requestId, 'database_error', error.message, 500);
  }
  return NextResponse.json({ ok: true });
}
