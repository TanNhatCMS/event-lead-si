import 'server-only';

import { createHmac } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { assertEgressAllowed } from '~/lib/ai/tools/egress-guard';
import { logLifecycleAudit } from '~/lib/lifecycle/audit';

/**
 * Dispatch webhook outgoing (fire-and-forget, best-effort).
 *
 * - Đọc `outgoing_webhooks` của user qua SERVICE-ROLE: chỉ các dòng
 *   `enabled = true` và `events` (jsonb array) chứa tên sự kiện.
 * - Với mỗi webhook khớp: POST JSON tới URL với header
 *     `X-EventLead-Event: <event>`
 *     `X-EventLead-Signature: sha256=<hex(HMAC-SHA256(body, secret))>`
 *   Body là CHUỖI JSON được ký — receiver xác minh bằng chính chuỗi body nhận được.
 * - URL do user cung cấp luôn đi qua `assertEgressAllowed` (chặn localhost/
 *   private IP/link-local sau khi resolve DNS — chống SSRF) và bị bỏ qua khi
 *   vi phạm.
 * - Timeout 5s mỗi webhook; MỌI lỗi bị nuốt (console.warn) + ghi audit_logs
 *   best-effort — dispatch không bao giờ làm fail luồng chính.
 */

/** Các loại sự kiện mà hệ thống phát ra cho outgoing webhooks. */
export const WEBHOOK_EVENT_NAMES = [
  'contact.created',
  'followup.sent',
  'card.confirmed',
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENT_NAMES)[number];

/** Thời gian chờ tối đa một request webhook (ms). */
export const WEBHOOK_TIMEOUT_MS = 5000;

/** Client service-role — webhooks phải đọc được bất kể RLS của caller. */
type AdminClient = SupabaseClient<Database>;

export interface OutgoingWebhookRow {
  id: string;
  url: string;
  events: unknown;
  secret: string;
}

/**
 * Chọn các webhook (enabled) của user đang đăng ký đúng sự kiện.
 * `events` là jsonb array — kiểm tra chứa phần tử bằng JS sau khi đọc.
 */
export async function listWebhooksForEvent(
  userId: string,
  event: WebhookEventName,
  admin?: AdminClient,
): Promise<OutgoingWebhookRow[]> {
  const client = admin ?? getSupabaseServerAdminClient();
  const { data, error } = await client
    .from('outgoing_webhooks')
    .select('id, url, events, secret')
    .eq('user_id', userId)
    .eq('enabled', true);
  if (error || !data) {
    return [];
  }
  return (data as OutgoingWebhookRow[]).filter((row) => {
    if (!Array.isArray(row.events)) return false;
    return (row.events as unknown[]).includes(event);
  });
}

/** Chữ ký HMAC-SHA256 của body (kèm prefix thuật toán). */
export function signWebhookBody(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * POST body tới MỘT webhook. Ném Error khi bị egress guard chặn hoặc
 * HTTP lỗi — caller chịu trách nhiệm try/catch (dispatchWebhook đã bọc).
 */
export async function postToWebhook(
  url: string,
  secret: string,
  body: string,
  event: WebhookEventName,
): Promise<number> {
  // Chặn SSRF: localhost / private IP / link-local (kể cả sau resolve DNS).
  const allowedUrl = await assertEgressAllowed(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(allowedUrl.href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EventLead-Event': event,
        'X-EventLead-Signature': signWebhookBody(body, secret),
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error('Webhook receiver trả HTTP ' + String(response.status));
    }
    return response.status;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gửi sự kiện tới TẤT CẢ webhook enabled của user đang đăng ký sự kiện đó.
 * Fire-and-forget tuyệt đối: không ném, không trả giá trị có nghĩa — lỗi từng
 * webhook chỉ console.warn + audit best-effort.
 */
export async function dispatchWebhook(
  userId: string,
  event: WebhookEventName,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = getSupabaseServerAdminClient();
    const webhooks = await listWebhooksForEvent(userId, event, admin);
    if (webhooks.length === 0) {
      return;
    }
    const body = JSON.stringify({
      event,
      occurred_at: new Date().toISOString(),
      data: payload,
    });

    await Promise.allSettled(
      webhooks.map(async (webhook) => {
        try {
          await postToWebhook(webhook.url, webhook.secret, body, event);
          await logLifecycleAudit(admin, userId, {
            action: 'webhook.dispatch',
            entityType: 'outgoing_webhook',
            entityId: webhook.id,
            summary: 'Đã gửi sự kiện ' + event + ' ra webhook.',
            metadata: { event },
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'lỗi không xác định';
          console.warn(
            '[webhooks] dispatch thất bại (' + event + '): ' + message,
          );
          await logLifecycleAudit(admin, userId, {
            action: 'webhook.dispatch',
            entityType: 'outgoing_webhook',
            entityId: webhook.id,
            summary: 'Gửi sự kiện ' + event + ' ra webhook thất bại.',
            metadata: { event, error: message.slice(0, 200) },
          });
        }
      }),
    );
  } catch (err) {
    // Dispatch không bao giờ được làm fail luồng chính.
    console.warn(
      '[webhooks] dispatch lỗi: ' +
        (err instanceof Error ? err.message : 'lỗi không xác định'),
    );
  }
}

/** Kiểm tra `events` jsonb của một webhook có chứa sự kiện (dùng ở route CRUD). */
export function webhookEventsInclude(
  raw: unknown,
  event: WebhookEventName,
): boolean {
  return Array.isArray(raw) && (raw as unknown[]).includes(event);
}
