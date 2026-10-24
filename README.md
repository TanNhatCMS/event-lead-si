# EventLead SI

Web app quản lý lead / khách hàng cho công ty tổ chức sự kiện — chạy **single-user**
(một tài khoản dùng toàn bộ, không có mô hình organizations/teams).

Xây trên nền MakerKit Next.js SaaS Starter Kit (lite), đã được port sang single-user
và phát triển thêm các tính năng nghiệp vụ.

## Tính năng chính

- **Quét danh thiếp bằng AI** (`/home/quet-danh-thiep`): chụp/chọn ảnh → crop → nhận
  dạng bằng model vision qua AI Gateway (confidence → uncertain/missing) → người dùng
  xem lại từng trường và bấm xác nhận mới lưu. AI chỉ gợi ý, con người quyết định.
- **Danh bạ liên hệ** (`/home/danh-ba`): tìm kiếm, lọc, lưu trữ, phát hiện trùng lặp,
  xuất CSV/Excel/vCard.
- **Công ty** (`/home/cong-ty`): hồ sơ công ty + tạo link chia sẻ công khai
  (`/chia-se/[token]`).
- **Ghi chú cuộc gặp**: ghi chú theo liên hệ, nhắc follow-up.
- **Sourcing nhà cung cấp** (`/home/sourcing`): yêu cầu sourcing, ứng viên, AI gợi ý,
  soạn RFQ và dàn ý đàm phán.
- **Trí tuệ quan hệ** (`/home/quan-he`): đồ thị kết nối liên hệ — công ty, tìm cầu nối
  giới thiệu (chỉ gợi ý, không tự gửi).
- **Trợ lý RAG** (`/home/tro-ly`): chatbot tra cứu tài liệu đã tải lên + danh bạ —
  upload PDF/DOCX/TXT (bắt buộc chọn loại tài liệu + ngày hiệu lực), ingest nền,
  chat streaming kèm trích dẫn nguồn (tên file + số trang/tiêu đề mục). Báo giá chỉ
  trích nguyên văn số liệu, chatbot không tự tính toán.
- **Mô hình AI** (`/home/cai-dat/ai-models`): cấu hình AI Gateway theo user
  (card recognition, lead enrichment, sourcing assist, rag_chat, rag_embeddings).
- **Nhật ký** (`/home/nhat-ky`): audit log các hành động + tab Trace xem chi tiết
  từng bước AI qua OpenTelemetry (span lưu vào Supabase).

## Stack

- Next.js 16.3 + React 19 + TypeScript (App Router)
- Tailwind CSS 4 + shadcn/ui
- Supabase: Postgres + pgvector + Auth (RLS theo `user_id`)
- Vercel AI SDK v7 (embeddings, chat streaming, tool calling)
- OpenTelemetry: span các bước AI lưu vào bảng `otel_spans` trên Supabase
- Turborepo monorepo: `apps/web`, `packages/*`

## Cấu trúc repo

```
apps/web/                  # App Next.js chính
  app/                     # Routes (App Router)
  lib/ai/                  # AI Gateway, vision OCR, enrichment agent, tools
  lib/ai/rag/              # RAG: extract/chunking/embeddings/ingest/retrieval
  lib/otel/                # OpenTelemetry: exporter -> Supabase
  lib/audit/               # Helper ghi audit log
  features/                # Client components theo tính năng
  supabase/migrations/     # Migrations (single-user, RLS owner-only)
  e2e/                     # E2E tests (Playwright)
  instrumentation.ts       # Đăng ký OTel SDK
packages/                  # Shared packages (supabase client, ui, ...)
specs/                     # Spec các tính năng (Spec Kit)
docs/                      # Tài liệu bổ sung
.env.example               # Mẫu biến môi trường
```

## Chạy dev

Yêu cầu: Node >= 22.13, pnpm 11.

```bash
pnpm install
cp .env.example .env.local   # điền Supabase URL/keys, AI_GATEWAY_API_KEY
pnpm dev
```

Database: apply các migration trong `apps/web/supabase/migrations/` lên Supabase
(SQL Editor), theo thứ tự thời gian:

1. `20261013235900_eventlead_single_user.sql` — schema single-user
   (lưu ý: nếu DB còn bảng cũ, xem hướng dẫn an toàn trong issue #35)
2. `20261014010000_followup_reminders.sql`
3. `20261014020000_phase3_sourcing.sql`
4. `20261014030000_audit_logs.sql`
5. `20261014040000_otel_spans.sql`
6. `20261014050000_rag_chatbot.sql` — schema RAG (documents, chunks, queue, chat)
7. `20261014060000_ai_prompts.sql` — bảng prompt AI tùy chỉnh theo user

Sau khi apply: regenerate Supabase types (`packages/supabase/src/database.types.ts`).

## Chạy thử local bằng Docker

Build image production (Next.js standalone) và chạy thử mà không cần Node trên máy —
chỉ cần Docker Desktop.

```bash
# 1. Bật Supabase local (chính nó cũng chạy bằng Docker trên máy host)
pnpm supabase:web:start

# 2. Build + chạy app trong container
docker compose up --build web

# 3. Mở http://localhost:3000
```

Cách hoạt động:

- Image build ở `apps/web/Dockerfile` (multi-stage): cài workspace bằng pnpm →
  `next build` với `output: standalone` → runner chỉ chứa server đã trace tối thiểu.
- Container gọi Supabase local qua `host.docker.internal:54321`; browser trên máy
  host dùng được cùng URL đó (Docker Desktop tự resolve).
- Các biến `NEXT_PUBLIC_*` được **inline lúc build** — muốn trỏ Supabase khác thì
  override khi build:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  docker compose up --build web
  ```
- Biến server-only (`SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, model...)
  đọc lúc runtime từ `apps/web/.env.docker` — copy từ `.env.docker.example`.
  Với Supabase local, service-role key mặc định của compose đã khớp với CLI.
- Xoá sạch: `docker compose down --rmi local` (image) — Supabase local vẫn dừng
  bằng `pnpm supabase:web:stop`.

Lưu ý: image này để smoke-test bản production build chạy thật; unit/E2E tests vẫn
chạy bằng pnpm trên máy host (mục "Kiểm tra" bên dưới).

## Kiểm tra

```bash
cd apps/web
./node_modules/.bin/tsc --noEmit   # typecheck
pnpm test                            # unit tests (Vitest)
pnpm test:e2e                         # E2E (Playwright, cần E2E_AUTH_EMAIL/PASSWORD)
NEXT_PUBLIC_SITE_URL=https://example.com \
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy ./node_modules/.bin/next build
```

## Lưu ý

- **Single-user**: mọi bảng nghiệp vụ gắn `user_id`, RLS `auth.uid() = user_id`.
  Không còn organizations/memberships như bản MakerKit gốc.
- **Nguyên tắc AI**: AI/OCR/enrichment/RAG chỉ gợi ý — mọi thao tác quan trọng
  (lưu liên hệ, gửi follow-up, RFQ, báo giá) đều cần con người xác nhận.
  Không tự động gửi bất cứ thứ gì ra ngoài.
- **Secrets**: service-role key và API keys chỉ dùng phía server, không bao giờ
  đưa ra client hay commit vào repo.

## Tài liệu

- [Mô tả dự án](docs/mo-ta-du-an.md) — tổng quan, tính năng, kiến trúc
- [Hướng dẫn deploy Vercel](docs/huong-dan-deploy.md) — từng bước đưa lên production
- [Sổ tay RAG](docs/rag-handbook-viet-tay.md) — tham khảo kiến thức RAG/LLM

## Giấy phép

MIT — xem [LICENSE](LICENSE).
