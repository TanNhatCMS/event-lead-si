# AGENTS.md — event-lead-si

## Kiến trúc (replatform ngày 2026-10-13)

Repo đã chuyển sang **MakerKit Next.js SaaS Starter Kit (lite)** — monorepo Turborepo:

- `apps/web/` — ứng dụng Next.js 16.3 (App Router, Supabase Auth). i18n dùng
  next-intl nhưng **không có segment `[locale]`**: tiếng Việt là mặc định,
  chuyển sang tiếng Anh do phía client (không có prefix locale trong URL).
- `packages/` — các package dùng chung (`features/*`, `ui`, `supabase`, `next`, `shared`, `i18n`).
- `apps/web/supabase/` — migrations của kit.

### Routes chính (cập nhật 2026-10-29)

- Khu nghiệp vụ: `/dashboard/*` (đổi từ `/home`) — danh-ba, cong-ty, quan-he,
  quet-danh-thiep, sourcing, tro-ly, nhat-ky, cai-dat, settings.
- Khu quản trị: `/admin/*` — hub (trang chính), nguoi-dung, agent, settings,
  prompts, nhat-ky, thong-ke.
- Chia sẻ công khai: `/chia-se/[token]` — token từ cột `share_token` của bảng companies.

### Agent tooling & failover (cập nhật 2026-10-29)

- Agent tooling (MCP servers / Skills / Hooks / Plugins) và TinyFish được quản
  ở `/admin/agent`; TinyFish API key lưu DB bảng `agent_config` (write-only —
  GET không trả lại giá trị key).
- Failover AI: đa API key + model dự phòng, cấu hình trong `/admin/settings`.

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

## Docker dev có hot reload (thêm 2026-10-30)

- `docker compose -f docker-compose.dev.yml up --build web-dev` (hoặc
  `pnpm docker:web:dev`) — chạy `next dev` (Turbopack) trong container, mở
  http://localhost:3300. Sửa file trên host là trang tự cập nhật; stop bằng
  `pnpm docker:web:dev:down`.
- Stage `dev` trong `apps/web/Dockerfile` chỉ cài deps (KHÔNG build); source
  được bind mount toàn repo lúc runtime. `node_modules` (root, apps/web và 7
  package @kit/*) + `apps/web/.next` nằm trong named volumes khởi tạo từ image
  — **đổi deps (lockfile) là phải `up --build` lại**; thêm package mới vào
  workspace thì thêm volume tương ứng trong `docker-compose.dev.yml`.
- Hot reload qua bind mount từ Windows cần polling watcher: compose dev đặt
  `NEXT_DEV_POLLING=true` → `next.config.mjs` bật `watchOptions.pollIntervalMs`
  (fix Turbopack polling từ Next 16.4 — vercel/next.js#96440; inotify không
  truyền qua Docker Desktop bind mount). Tuning interval qua
  `NEXT_DEV_POLLING_INTERVAL_MS` (mặc định 1000).
- Dev container là project compose riêng (`event-lead-si-dev`, port 3300) —
  chạy song song với container demo (`docker-compose.yml`, port 3100) không xung đột.
