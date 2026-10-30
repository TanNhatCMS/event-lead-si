import { describe, expect, it } from 'vitest';

import { assertEgressAllowed, EgressBlockedError } from '../ai/tools/egress-guard';
import { postToWebhook } from '../webhooks/dispatch';

/**
 * Test SSRF guard THẬT của đường gửi webhook: URL do user cung cấp phải đi qua
 * `assertEgressAllowed` trước khi POST — localhost/IP nội bộ bị chặn TRƯỚC KHI
 * có bất kỳ request nào (chặn literal IP không cần resolve DNS).
 */

describe('webhook SSRF guard (egress thật)', () => {
  it('assertEgressAllowed chặn localhost và IP private/link-local', async () => {
    await expect(assertEgressAllowed('http://localhost/hook')).rejects.toBeInstanceOf(
      EgressBlockedError,
    );
    await expect(
      assertEgressAllowed('https://127.0.0.1/hook'),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(
      assertEgressAllowed('https://10.0.0.5/hook'),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(
      assertEgressAllowed('https://169.254.169.254/latest/meta-data'),
    ).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(
      assertEgressAllowed('https://192.168.1.10/hook'),
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('postToWebhook không gửi được tới host nội bộ (ném EgressBlockedError)', async () => {
    await expect(
      postToWebhook('https://127.0.0.1/hook', 'secret', '{}', 'contact.created'),
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it('chỉ cho phép http/https', async () => {
    await expect(
      assertEgressAllowed('ftp://example.com/file'),
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });
});
