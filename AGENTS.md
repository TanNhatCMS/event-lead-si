# AGENTS.md — event-lead-si

## Kiến trúc (replatform ngày 2026-10-13)

Repo đã chuyển sang **MakerKit Next.js SaaS Starter Kit (lite)** — monorepo Turborepo:

- `apps/web/` — ứng dụng Next.js 16.3 (App Router, next-intl với prefix locale, Supabase Auth).
- `packages/` — các package dùng chung (`features/*`, `ui`, `supabase`, `next`, `shared`, `i18n`).
- `apps/web/supabase/` — migrations của kit.

Quyết định sản phẩm 2026-10-13: **single-user** — bỏ mô hình organizations/memberships.
Schema EventLead cũ (bảng companies, contacts, card_imports, ai_model_configs…) nằm ở
`supabase/` (gốc repo) sẽ được adapt sang single-user (user_id thay organization_id)
trong các task port tính năng.

## Lưu ý khi làm việc

- Code cũ (`src/`, `middleware.ts`, `next.config.ts` ở gốc…) còn tồn tại nhưng
  **không còn được dùng** — build/chạy theo monorepo mới. Chưa xóa được qua công cụ
  hiện tại; sẽ dọn sau bằng git local.
- Backup toàn bộ codebase cũ: tag `pre-makerkit` trên GitHub.
- Tài liệu planning cũ: `specs/`, `.specify/` (hiến chương cần cập nhật cho single-user).
- Node >= 22.13, pnpm 11 (`packageManager` trong package.json).
- Không sửa `.github/workflows/` qua MCP tools (gateway chặn).

## Docker local test (thêm 2026-10-24)

- `apps/web/Dockerfile` (multi-stage → Next standalone) + `docker-compose.yml` (gốc repo)
  + `.dockerignore` + `apps/web/.env.docker.example` (biến server-only lúc runtime).
- Image dùng **node:24** (khớp `.nvmrc` `lts/*`): `proxy.ts` dùng global `URLPattern`
  chỉ có từ Node 23.8+ — Node 22 làm standalone server crash.
- Build stage set `NEXT_PUBLIC_CI=true` để schema `app.config.ts` chấp nhận
  `NEXT_PUBLIC_SITE_URL=http://localhost:3000` (chuỗi escape hatch của kit).
- `next.config.mjs`: `output: 'standalone'` + `images.unoptimized` chỉ bật khi
  `NEXT_OUTPUT=standalone` (đặt trong Dockerfile) — deploy Vercel không đổi.
- Container trỏ Supabase local qua `host.docker.internal:54321`; cần chạy
  `pnpm supabase:web:start` trước khi `docker compose up --build web`.
