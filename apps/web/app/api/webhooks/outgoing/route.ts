import 'server-only';

import { randomBytes } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { Database } from '@kit/supabase/database';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { WEBHOOK_EVENT_NAMES } from '~/lib/webhooks/dispatch';
import { logLifecycleAudit } from '~/lib/lifecycle/audit';

type WebhookUpdate = Database['public']['Tables']['outgoing_webhooks']['Update'];

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

const eventNamesSchema = z
  .array(z.enum(WEBHOOK_EVENT_NAMES))
  .min(1, 'Chọn ít nhất một loại sự kiện.');

const createSchema = z.object({
  /** Bắt buộc HTTPS — DB cũng có check `url like 'https://%'. */
  url: z
    .string()
    .trim()
    .max(1000)
    .url('URL webhook không hợp lệ.')
    .refine((value) => value.startsWith('https://'), 'Webhook phải dùng HTTPS.'),
  events: eventNamesSchema.optional(),
});

const patchSchema = z.object({
  id: z.string().uuid('Mã webhook không hợp lệ.'),
  url: z
    .string()
    .trim()
    .max(1000)
    .url('URL webhook không hợp lệ.')
    .refine((value) => value.startsWith('https://'), 'Webhook phải dùng HTTPS.')
    .optional(),
  events: eventNamesSchema.optional(),
  enabled: z.boolean().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid('Mã webhook không hợp lệ.'),
});

const DEFAULT_EVENTS = [...WEBHOOK_EVENT_NAMES];

/** Che secret cho UI: giữ 4 ký tự đầu, phần còn lại thay bằng dấu chấm. */
function maskSecret(secret: string): string {
  if (secret.length <= 4) return '••••';
  return secret.slice(0, 4) + '••••••••';
}

/**
 * GET /api/webhooks/outgoing
 *
 * Danh sách outgoing webhook của user. SECRET KHÔNG BAO GIỜ trả về UI sau khi
 * tạo (write-only) — chỉ có `secret_masked` để nhận diện.
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const { data, error } = await supabase
    .from('outgoing_webhooks')
    .select('id, url, events, enabled, created_at, updated_at, secret')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return errorJson(requestId, 'list_failed', 'Chưa tải được danh sách webhook.', 500);
  }

  return NextResponse.json({
    webhooks: (data ?? []).map((row) => ({
      id: row.id,
      url: row.url,
      events: row.events,
      enabled: row.enabled,
      created_at: row.created_at,
      updated_at: row.updated_at,
      secret_masked: maskSecret(row.secret),
    })),
    available_events: DEFAULT_EVENTS,
    request_id: requestId,
  });
}

/**
 * POST /api/webhooks/outgoing — đăng ký webhook: { url (https), events? }.
 * Secret tự sinh (32 bytes hex) và KHÔNG thể đọc lại qua API — trả về ĐÚNG MỘT
 * lần trong response của chính request tạo để user lưu an toàn.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'validation_error', 'Dữ liệu webhook không hợp lệ.', 400);
  }

  const secret = randomBytes(32).toString('hex');
  const { data: webhook, error } = await supabase
    .from('outgoing_webhooks')
    .insert({
      user_id: user.id,
      url: parsed.data.url,
      events: parsed.data.events ?? DEFAULT_EVENTS,
      secret,
    })
    .select('id, url, events, enabled, created_at, updated_at')
    .single();

  if (error || !webhook) {
    return errorJson(requestId, 'create_failed', 'Chưa tạo được webhook.', 500);
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'webhook.create',
    entityType: 'outgoing_webhook',
    entityId: webhook.id,
    summary: 'Đăng ký outgoing webhook.',
    metadata: { url: webhook.url, events: webhook.events },
  });

  return NextResponse.json(
    { webhook, secret, request_id: requestId },
    { status: 201 },
  );
}

/** PATCH /api/webhooks/outgoing — sửa URL/events/bật-tắt: { id, url?, events?, enabled? }. */
export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'validation_error', 'Dữ liệu không hợp lệ.', 400);
  }
  const input = parsed.data;
  if (input.url === undefined && input.events === undefined && input.enabled === undefined) {
    return errorJson(requestId, 'validation_error', 'Không có trường nào cần cập nhật.', 400);
  }

  const update: WebhookUpdate = { updated_at: new Date().toISOString() };
  if (input.url !== undefined) update.url = input.url;
  if (input.events !== undefined) update.events = input.events;
  if (input.enabled !== undefined) update.enabled = input.enabled;

  const { data: webhook, error } = await supabase
    .from('outgoing_webhooks')
    .update(update)
    .eq('id', input.id)
    .eq('user_id', user.id)
    .select('id, url, events, enabled, created_at, updated_at')
    .maybeSingle();

  if (error) {
    return errorJson(requestId, 'update_failed', 'Chưa cập nhật được webhook.', 500);
  }
  if (!webhook) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy webhook.', 404);
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'webhook.update',
    entityType: 'outgoing_webhook',
    entityId: webhook.id,
    summary: 'Cập nhật outgoing webhook.',
    metadata: { fields: Object.keys(update) },
  });

  return NextResponse.json({ webhook, request_id: requestId });
}

/** DELETE /api/webhooks/outgoing — gỡ webhook: { id }. */
export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'validation_error', 'Dữ liệu không hợp lệ.', 400);
  }

  const { data: deleted, error } = await supabase
    .from('outgoing_webhooks')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return errorJson(requestId, 'delete_failed', 'Chưa xoá được webhook.', 500);
  }
  if (!deleted) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy webhook.', 404);
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'webhook.delete',
    entityType: 'outgoing_webhook',
    entityId: deleted.id,
    summary: 'Gỡ outgoing webhook.',
    metadata: {},
  });

  return NextResponse.json({ deleted_id: deleted.id, request_id: requestId });
}
