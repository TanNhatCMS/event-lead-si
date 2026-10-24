# Hướng dẫn deploy EventLead SI lên Vercel

## 1. Chuẩn bị

### 1.1. Supabase

1. Tạo project Supabase (region Singapore — gần VN nhất).
2. Apply 7 migrations theo thứ tự trong `apps/web/supabase/migrations/` qua SQL Editor:
   1. `20261013235900_eventlead_single_user.sql` — schema single-user
      (nếu DB còn bảng cũ, xem file an toàn trong issue #35)
   2. `20261014010000_followup_reminders.sql`
   3. `20261014020000_phase3_sourcing.sql`
   4. `20261014030000_audit_logs.sql`
   5. `20261014040000_otel_spans.sql`
   6. `20261014050000_rag_chatbot.sql`
   7. `20261014060000_ai_prompts.sql`
3. Lấy **Project URL**, **anon key**, **service-role key** từ Dashboard.

> **Lưu ý**: migrations tự tạo bucket Storage `documents` (private, 25MB) và
> `business-cards` (private, 10MB), và bật extension `vector` cho pgvector —
> không cần làm thủ công các bước này.

### 1.2. AI Gateway

Lấy API key từ AI Gateway provider. Key này dùng cho: OCR danh thiếp,
enrichment, sourcing, chat RAG, embeddings.

## 2. Deploy lên Vercel

### 2.1. Import project

1. Vào [vercel.com](https://vercel.com) → Add New → Project → import repo
   `TanNhatCMS/event-lead-si`.
2. **Root Directory**: để trống (repo root) — file `vercel.json` đã cấu hình
   build cho monorepo Turborepo.
3. **Framework Preset**: Next.js (tự nhận).
4. **Region**: `sin1` (Singapore) đã set trong `vercel.json`.

### 2.2. Biến môi trường (Environment Variables)

Thêm trong Vercel Dashboard → Settings → Environment Variables.
Đánh dấu **Production** (và Preview nếu muốn test).

#### Bắt buộc

| Biến | Mô tả |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL production, VD `https://eventlead.tannhatcms.io.vn` (phải HTTPS) |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL từ Supabase Dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key từ Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — CHỈ server dùng, không expose ra client |
| `AI_GATEWAY_API_KEY` | Key AI Gateway cho mọi tính năng AI |

#### Tùy chọn — model AI (có thể cấu hình sau qua UI `/home/cai-dat/ai-models`)

| Biến | Mặc định | Mô tả |
|---|---|---|
| `RAG_CHAT_MODEL` | theo `lib/ai/rag/config.ts` | Model chat cho trợ lý RAG |
| `RAG_EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Model embedding RAG |
| `ENRICHMENT_MODEL` | — | Model agent làm giàu dữ liệu |
| `SOURCING_MODEL` | — | Model sourcing/RFQ |
| `FOLLOWUP_MODEL` | — | Model soạn follow-up |
| `CARD_RECOGNITION_PROVIDER` | `mock` | `mock` hoặc `gateway` (vision thật) |
| `CARD_RECOGNITION_MODEL` | — | Model vision khi PROVIDER=gateway |
| `CARD_RECOGNITION_ENABLED` | `false` | Bật/tắt quét danh thiếp |

#### Tùy chọn — web search cho enrichment agent

| Biến | Mô tả |
|---|---|
| `SEARCH_PROVIDER` | `tool` / `api` / `fetch` / `none` (mặc định `none` = tắt) |
| `SEARCH_TOOL_URL`, `SEARCH_TOOL_KEY` | Khi PROVIDER=`tool` |
| `SEARCH_API_URL`, `SEARCH_API_KEY_HEADER` | Khi PROVIDER=`api` (Tavily/Serper/Brave) |
| `WEBFETCH_ALLOWLIST`, `WEBFETCH_BLOCKLIST` | Domain cho phép/chặn của tool web_fetch |

> **Lưu ý**: cấu hình model trong DB (trang **Mô hình AI**) được ưu tiên hơn
> biến môi trường. Prompts hệ thống tùy chỉnh ở trang **Prompts AI**.

### 2.3. Deploy

Bấm **Deploy**. Vercel tự build (`pnpm --filter web build`) và cấp URL.

## 3. Sau khi deploy

1. Mở URL production, đăng ký tài khoản đầu tiên (single-user).
2. Vào **Cài đặt → Mô hình AI**: cấu hình model cho từng capability
   (`card_recognition`, `lead_enrichment`, `sourcing_assist`, `rag_chat`,
   `rag_embeddings`).
3. (Tùy chọn) Vào **Cài đặt → Prompts AI**: tùy chỉnh system prompt.
4. Upload tài liệu test ở **Trợ lý → Tài liệu**, kiểm tra chat RAG.
5. Kiểm tra tab **Trace AI** ở **Nhật ký** để xem span OTel.

## 4. Lưu ý vận hành

- **Timeout**: API routes AI set `maxDuration: 60` giây trong `vercel.json`
  (streaming chat, ingest tài liệu). Đây là mức tối đa của gói Vercel Hobby
  (miễn phí) — mặc định Vercel chỉ cho 10s, set `maxDuration` lên 60s là chạy
  được. Chỉ khi cần timeout lâu hơn 60s (tối đa 300s) mới cân nhắc gói Pro.
- **Ingest tài liệu**: chạy nền bằng `after()` của Next.js — trên Vercel
  hoạt động trong giới hạn function timeout.
- **Secrets**: không bao giờ commit `.env.local`, không log API keys.
- **Database types**: sau khi apply migration mới, regenerate
  `packages/supabase/src/database.types.ts` bằng Supabase CLI.
