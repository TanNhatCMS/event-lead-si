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
