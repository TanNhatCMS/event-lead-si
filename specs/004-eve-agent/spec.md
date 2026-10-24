# Spec 004 — Agent hội thoại EventLead bằng vercel/eve

Trạng thái: đã triển khai bản đầu (nhánh `feat/eve-integration`, xếp chồng
trên `feat/workflow-sdk-integration` / PR #92). Chưa phải production-ready —
xem "Giới hạn & việc còn mở" ở cuối.

## Bối cảnh & quyết định gốc

- Người dùng yêu cầu ngày 2026-10-24: "tích hợp vercel/eve vào luôn", ngay
  sau báo cáo nghiên cứu eve (`~/workspace/vercel-eve-research/report.html`:
  eve 0.83.0, beta, filesystem-first, đứng trên AI SDK + Workflow SDK).
- Provider: người dùng chốt cùng ngày — model gọi THẲNG OpenAI, không qua
  Vercel AI Gateway (nhất quán với thay đổi provider của enrichment trong
  PR #92, commit `af0de36`).

## Phạm vi bản đầu

1. **Mount eve vào ứng dụng Next.js hiện có** bằng `withEve` từ `eve/next`
   trong `next.config.mjs` (chuỗi wrapper: `withEve(withWorkflow(withNextIntl))`).
   Agent sống ở `apps/web/agent/`, kênh HTTP mặc định của eve mount tại
   `/eve/v1/*`; `proxy.ts` loại `eve` khỏi matcher như đã làm với workflow.
2. **Model**: `defineAgent` dùng helper `openai()` của `eve/models/openai`
   (đọc `OPENAI_API_KEY`), model mặc định `gpt-5-mini`, đổi qua env
   `EVE_OPENAI_MODEL`.
3. **An toàn bề mặt**: `defaultTools: false` — tắt toàn bộ tool mặc định
   của eve (bash/read_file/write_file trong sandbox, web_search/web_fetch,
   subagent). Agent chỉ có đúng 2 tool nghiệp vụ dưới đây.
4. **Xác thực kênh**: AuthFn tự viết `supabaseSession`
   (`apps/web/lib/eve/supabase-auth.ts`) — verify phiên Supabase Auth của
   chính ứng dụng (Bearer token hoặc cookie SSR, verify qua
   `GET /auth/v1/user`, timeout 5s). Sau nó là `localDev()` (chỉ có tác
   dụng khi chạy dev). Production: fail-closed 401 như mặc định của eve.
5. **Tools**:
   - `lookup_contact`: tra cứu danh bạ chỉ đọc của chính người dùng
     (lọc `user_id` từ phiên đã xác thực — không tin tham số của model),
     tối đa 5 kết quả, bỏ archived.
   - `enrich_lead`: bọc nguyên `runEnrichmentLoop` (dùng chung logic với
     route `/api/enrichment/run` và workflow của spec 003). Chỉ trả
     findings — không ghi dữ liệu, đúng hiến chương "AI gợi ý, người
     quyết định".
6. **instructions.md**: tiếng Việt, nêu rõ nguyên tắc trên cho model.

## Thay đổi phụ trợ

- `lib/ai/enrichment/load-markdown.ts`: thêm fallback đường dẫn theo cwd
  khi thư mục theo `import.meta.url` không đọc được — eve biên dịch
  authored modules vào `node_modules/.cache/eve/authored-modules` nên
  đường dẫn tương đối theo module bị lệch. Đường chính không đổi.
- Deps: `eve` 0.83.0 qua pnpm catalog (pnpm tự thêm vào
  `minimumReleaseAgeExclude` khi cài). **eve yêu cầu Node >= 24** (repo
  đang khai >= 22.13 — môi trường chạy eve service phải là Node 24).
- `.gitignore`: bỏ qua `apps/web/.eve/` và `apps/web/.output/`.

## Kiểm chứng đã chạy (máy này, 2026-10-24)

- `eve build` pass; `eve info --json`: status `ready`, 0 errors/warnings,
  model `openai/gpt-5-mini`, tools = [`enrich_lead`, `lookup_contact`].
- `eve start` (bản build) + `POST /eve/v1/session` không auth → **401**
  đúng chuẩn fail-closed của eve.
- `pnpm typecheck` exit 0; bộ test unit của apps/web pass 48/48.
- `next build` với env dummy: **pass** (exit 0) — chuỗi wrapper
  `withEve(withWorkflow(withNextIntl))` không phá build chung.

## Giới hạn & việc còn mở

- **Chưa kiểm chứng end-to-end với tài khoản thật**: cần Supabase cloud +
  `OPENAI_API_KEY` thật để chạy một phiên chat hoàn chỉnh (điều kiện môi
  trường giống phần còn nợ của PR #92).
- **Chưa có UI chat**: bản này chỉ có API `/eve/v1/*`. Giao diện chat
  (dùng `useEveAgent` từ `eve/react` hoặc app Web Chat sinh bởi
  `eve add channel/web`) là bước tiếp theo, làm khi người dùng chốt vị
  trí hiển thị trong EventLead.
- **eve đang beta** (0.83.0): API/bản vá thay đổi nhanh (~2 bản/ngày ở
  thời điểm nghiên cứu); nâng cấp eve cần chạy lại `eve build` + kiểm
  chứng kênh auth.
- Production ngoài Vercel: `next start` tự chạy eve service từ `.output`
  (cổng loopback riêng) và proxy route — cần `eve build` trước
  `next build`. Trên Vercel: `withEve` tự sinh service + routes.
- Session của eve chạy trên Workflow world của eve (Local World khi tự
  host mặc định) — cùng lưu ý production như QĐ-MỞ-001 của spec 003.
