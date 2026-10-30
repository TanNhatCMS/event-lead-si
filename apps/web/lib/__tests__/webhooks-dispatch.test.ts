import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Test dispatchWebhook — KHÔNG gọi mạng: client service-role và egress guard
 * bị mock, fetch bị stub. Kiểm tra: lọc webhook theo sự kiện, header chữ ký
 * HMAC-SHA256 khớp body, fire-and-forget khi receiver lỗi, audit best-effort.
 */

interface AdminState {
  webhooks: Array<Record<string, unknown>>;
  auditRows: Array<Record<string, unknown>>;
}

const hoisted = vi.hoisted(() => {
  const state: AdminState = { webhooks: [], auditRows: [] };
  const adminClient = {
    from: (table: string) => {
      if (table === 'outgoing_webhooks') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ data: state.webhooks, error: null }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') {
        return {
          insert: (row: unknown) => {
            state.auditRows.push(row as Record<string, unknown>);
            return { error: null };
          },
        };
      }
      throw new Error('admin client không mong đợi bảng: ' + table);
    },
  };
  return { state, adminClient };
});

vi.mock('@kit/supabase/server-admin-client', () => ({
  getSupabaseServerAdminClient: () => hoisted.adminClient,
}));

// Egress guard passthrough (URL giữ nguyên) — test SSRF thật nằm ở file riêng.
vi.mock('../ai/tools/egress-guard', () => ({
  EgressBlockedError: class EgressBlockedError extends Error {},
  assertEgressAllowed: async (url: string) => new URL(url),
}));

import { dispatchWebhook, signWebhookBody } from '../webhooks/dispatch';

const SECRET = 'webhook-secret-123';

describe('signWebhookBody', () => {
  it('tạo chữ ký HMAC-SHA256 dạng sha256=<hex> khớp crypto thuần', () => {
    const body = JSON.stringify({ event: 'contact.created' });
    const expected =
      'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
    expect(signWebhookBody(body, SECRET)).toBe(expected);
  });
});

describe('dispatchWebhook', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    hoisted.state.webhooks = [];
    hoisted.state.auditRows = [];
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gửi đúng 1 request tới webhook enabled đăng ký sự kiện, đủ header chữ ký', async () => {
    hoisted.state.webhooks = [
      { id: 'w-1', url: 'https://example.com/hook', events: ['contact.created', 'card.confirmed'], secret: SECRET, enabled: true },
      // Không đăng ký sự kiện → bỏ qua.
      { id: 'w-2', url: 'https://example.com/other', events: ['followup.sent'], secret: SECRET, enabled: true },
    ];

    await dispatchWebhook('u-1', 'contact.created', { contact_id: 'c-1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://example.com/hook');
    expect(init.method).toBe('POST');
    expect(init.headers['X-EventLead-Event']).toBe('contact.created');
    expect(init.headers['X-EventLead-Signature']).toBe(
      'sha256=' + createHmac('sha256', SECRET).update(init.body).digest('hex'),
    );
    const payload = JSON.parse(init.body) as { event: string; data: Record<string, unknown> };
    expect(payload.event).toBe('contact.created');
    expect(payload.data).toEqual({ contact_id: 'c-1' });
    // Audit thành công.
    expect(
      hoisted.state.auditRows.some((row) => row.action === 'webhook.dispatch'),
    ).toBe(true);
  });

  it('receiver lỗi HTTP → không ném, vẫn chạy tiếp (fire-and-forget)', async () => {
    hoisted.state.webhooks = [
      { id: 'w-1', url: 'https://example.com/hook', events: ['followup.sent'], secret: SECRET, enabled: true },
    ];
    fetchMock.mockRejectedValue(new Error('connection refused'));

    await expect(
      dispatchWebhook('u-1', 'followup.sent', { follow_up_id: 'f-1' }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Audit lỗi vẫn được ghi.
    expect(hoisted.state.auditRows.length).toBe(1);
  });

  it('không có webhook nào khớp → không gọi fetch, không audit', async () => {
    hoisted.state.webhooks = [
      { id: 'w-1', url: 'https://example.com/hook', events: ['card.confirmed'], secret: SECRET, enabled: true },
    ];

    await dispatchWebhook('u-1', 'contact.created', {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(hoisted.state.auditRows).toHaveLength(0);
  });
});
