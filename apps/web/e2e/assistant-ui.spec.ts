import { expect, test } from '@playwright/test';

/**
 * E2E UI: trang Trợ lý /dashboard/tro-ly (T009/T010).
 *
 * - Chưa đăng nhập → chuyển về trang đăng nhập.
 * - (Có auth) trang render 2 tab: Đoạn chat + Tài liệu.
 */

const EMAIL = process.env.E2E_AUTH_EMAIL ?? '';
const PASSWORD = process.env.E2E_AUTH_PASSWORD ?? '';
const HAS_AUTH = Boolean(EMAIL && PASSWORD);

test.describe('Trang /dashboard/tro-ly', () => {
  test('chưa đăng nhập → về trang sign-in', async ({ page }) => {
    await page.goto('/dashboard/tro-ly');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('đã đăng nhập: thấy 2 tab Chat và Tài liệu', async ({ page }) => {
    test.skip(!HAS_AUTH, 'cần E2E_AUTH_EMAIL/PASSWORD');
    await page.goto('/auth/sign-in');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 15_000 });

    await page.goto('/dashboard/tro-ly');
    await expect(page.getByText('Trợ lý', { exact: false }).first()).toBeVisible();
    // Tab chat có ô nhập liệu.
    await expect(
      page.getByPlaceholder(/Hỏi về tài liệu/i),
    ).toBeVisible();
  });
});
