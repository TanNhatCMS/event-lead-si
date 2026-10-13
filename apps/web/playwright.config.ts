import { defineConfig, devices } from '@playwright/test';

/**
 * E2E cho RAG chatbot (spec 002-rag-chatbot).
 *
 * Yêu cầu môi trường:
 * - App chạy ở E2E_BASE_URL (mặc định http://localhost:3000), hoặc để
 *   Playwright tự start qua webServer bên dưới.
 * - Supabase + biến môi trường đã cấu hình trong .env.test (xem package.json
 *   script `with-env:test`).
 * - E2E_AUTH_EMAIL / E2E_AUTH_PASSWORD: tài khoản test đã đăng ký.
 * - AI_GATEWAY_API_KEY: chỉ cần cho test chat streaming thật; khi thiếu,
 *   các test chat sẽ assert 503 + thông báo cấu hình thay vì crash.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm with-env:test next dev --port 3000',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
