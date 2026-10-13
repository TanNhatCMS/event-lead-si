import { expect, request, test } from '@playwright/test';

/**
 * E2E API: chat RAG streaming (T007).
 *
 * - Chưa đăng nhập → 401.
 * - Body sai → 400.
 * - Thiếu AI Gateway / chưa cấu hình model → 503 với mã lỗi rõ ràng
 *   (ai_not_configured), KHÔNG crash.
 * - Khi có AI_GATEWAY_API_KEY: stream trả về text + data part `data-citations`.
 */

const EMAIL = process.env.E2E_AUTH_EMAIL ?? '';
const PASSWORD = process.env.E2E_AUTH_PASSWORD ?? '';
const HAS_AUTH = Boolean(EMAIL && PASSWORD);
const HAS_AI = Boolean(process.env.AI_GATEWAY_API_KEY);

async function authedContext() {
  const ctx = await request.newContext();
  const res = await ctx.post('/auth/sign-in', {
    form: { email: EMAIL, password: PASSWORD },
  });
  return { ctx, ok: res.ok() };
}

test.describe('API /api/chat', () => {
  test('chưa đăng nhập → 401', async ({ request }) => {
    const res = await request.post('/api/chat', {
      data: { messages: [{ role: 'user', content: 'xin chào' }] },
    });
    expect(res.status()).toBe(401);
  });

  test('body sai → 400', async () => {
    test.skip(!HAS_AUTH, 'cần E2E_AUTH_EMAIL/PASSWORD');
    const { ctx, ok } = await authedContext();
    test.skip(!ok, 'đăng nhập thất bại');
    const res = await ctx.post('/api/chat', { data: { messages: [] } });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test('thiếu cấu hình AI → 503 ai_not_configured (không crash)', async () => {
    test.skip(!HAS_AUTH, 'cần E2E_AUTH_EMAIL/PASSWORD');
    test.skip(HAS_AI, 'chỉ chạy khi thiếu AI_GATEWAY_API_KEY');
    const { ctx, ok } = await authedContext();
    test.skip(!ok, 'đăng nhập thất bại');
    const res = await ctx.post('/api/chat', {
      data: { messages: [{ role: 'user', content: 'Bảng giá mới nhất?' }] },
    });
    // Có thể 503 (chưa cấu hình) — quan trọng là JSON lỗi chuẩn, không 500 crash.
    expect([503]).toContain(res.status());
    const body = await res.json();
    expect(body.code).toBe('ai_not_configured');
    expect(body.request_id).toBeTruthy();
    await ctx.dispose();
  });

  test('có AI key: stream trả text + citations', async () => {
    test.skip(!HAS_AUTH, 'cần E2E_AUTH_EMAIL/PASSWORD');
    test.skip(!HAS_AI, 'cần AI_GATEWAY_API_KEY');
    const { ctx, ok } = await authedContext();
    test.skip(!ok, 'đăng nhập thất bại');
    const res = await ctx.post('/api/chat', {
      data: { messages: [{ role: 'user', content: 'Tóm tắt tài liệu của tôi.' }] },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const text = await res.text();
    // UIMessage stream chứa data part citations ở cuối.
    expect(text).toContain('data-citations');
    await ctx.dispose();
  });
});
