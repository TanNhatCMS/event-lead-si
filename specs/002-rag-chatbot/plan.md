# Kế hoạch triển khai: RAG chatbot cho EventLead SI

**Nhánh**: `002-rag-chatbot` | **Ngày**: 2026-10-13 | **Đặc tả**: [spec.md](./spec.md)

**Đầu vào**: Đặc tả tính năng tại `specs/002-rag-chatbot/spec.md` — chatbot RAG: trả lời dựa trên (1) tài liệu upload (PDF/DOCX/TXT) và (2) dữ liệu danh bạ (contacts, companies, meeting notes); mọi câu trả lời kèm trích dẫn nguồn; báo giá chỉ dùng số liệu trích nguyên văn, chatbot KHÔNG tự tính toán (không nhân số lượng, không thành tiền/tổng cộng) — phép tính do người dùng thực hiện và kiểm tra; "AI gợi ý, người quyết định"; UI tiếng Việt, trang chat mới. Spec đã chốt 3 quyết định QĐ1–QĐ3 ngày 2026-10-13 — xem "Quyết định đã chốt từ spec (QĐ1–QĐ3)" bên dưới.

## Tóm tắt

Xây dựng RAG chatbot single-user trên stack hiện có: tài liệu upload vào Supabase Storage → server trích xuất text → chunk → embedding qua Vercel AI SDK (AI Gateway, model `openai/text-embedding-3-small`, 1536 chiều) → lưu pgvector trên Supabase. Dữ liệu danh bạ (contacts, companies, meeting notes) được biểu diễn thành chunk văn bản chuẩn hóa và index cùng pipeline, re-index khi dữ liệu thay đổi. Luồng chat: query → embed → truy xuất top-k chunk qua RPC `match_rag_chunks` (lọc theo `user_id`) → `streamText` với system prompt bắt buộc trích dẫn nguồn → UI tiếng Việt tại `/home/tro-ly`. Lịch sử hội thoại được lưu để xem lại.

## Bối cảnh kỹ thuật

**Ngôn ngữ/phiên bản**: TypeScript; Node.js 22+; React 19; Next.js 16 App Router (giữ nguyên stack repo).

**Thư viện chính**: `ai` 7.0.138 (đã có — export `createGateway`, đúng pattern `apps/web/lib/ai/vision-provider.ts`; không cần thêm `@ai-sdk/gateway`), Supabase JS + `@supabase/ssr`, shadcn/ui + Tailwind CSS 4. Thêm mới: `pdfjs-dist` (trích xuất text PDF phía server), `mammoth` (trích xuất DOCX). Không dùng LangChain (yêu cầu đã chốt); chunking tự viết (~200 dòng, recursive splitter). AI SDK Elements chưa có trong node_modules — UI chat tự dựng bằng shadcn/ui theo pattern `useChat` + `DefaultChatTransport` của AI SDK v7; xem xét bổ sung `@ai-sdk/elements` ở phase sau nếu cần.

**Lưu trữ**: Supabase PostgreSQL + extension `vector` (pgvector, bật qua migration); Supabase Storage bucket private mới `documents` cho file upload. Mọi bảng mới: RLS theo `user_id` (`auth.uid() = user_id`).

**Kiểm thử**: Vitest cho chunking, citation guard, RPC match (dữ liệu tổng hợp); kiểm thử RLS bằng 2 user khác nhau; kiểm thử luồng chat đầu-cuối bằng Playwright với mock embedding khi cần. Kế hoạch này chỉ xác định cách kiểm chứng.

**Nền tảng mục tiêu**: Ứng dụng web hiện có; xử lý ingest chạy trên server Node (route handler / worker), không phụ thuộc hosting riêng.

**Mục tiêu hiệu năng**: Truy xuất top-k < 2s với quy mô hàng nghìn chunk (HNSW index); ingest tài liệu 50 trang hoàn tất trong nền, UI poll trạng thái; chat stream token đầu tiên < 5s sau khi truy xuất xong.

**Ràng buộc**:
- Không dùng service-role key ở trình duyệt; key AI Gateway chỉ phía server.
- Định dạng tài liệu: PDF, DOCX, TXT (đã chốt theo spec); mỗi file ≤ 25MB, tối đa 100 tài liệu/user (kiểm tra ở application-level khi upload).
- Mọi câu trả lời PHẢI kèm trích dẫn nguồn: PDF → tên file + số trang; DOCX/TXT → tên file + tiêu đề mục/đoạn văn bản gần nhất (QĐ3); danh bạ → tên hồ sơ; khi có nhiều bản tài liệu cùng loại, nêu rõ tên file + ngày hiệu lực đang dùng (QĐ2). Mâu thuẫn tài liệu vs danh bạ → chỉ trích dẫn tài liệu có ngày hiệu lực/tải lên mới nhất, không trình bày dữ liệu danh bạ mâu thuẫn (QĐ1). Không có nguồn → nói rõ không tìm thấy, không bịa.
- Riêng báo giá: đơn giá PHẢI trích nguyên văn từ tài liệu kèm nguồn từng dòng; chatbot KHÔNG ĐƯỢC tự thực hiện bất kỳ phép tính nào (không nhân số lượng, không tính thành tiền/tổng cộng/chiết khấu/thuế) — mọi phép tính do người dùng thực hiện và kiểm tra; dự thảo kèm cảnh báo "tạm tính — cần người kiểm tra trước khi gửi". TUYỆT ĐỐI không bịa số, không ước lượng giá thiếu, không suy ra giá từ sản phẩm khác, không tự suy diễn chiết khấu/điều kiện không có trong nguồn.
- Dữ liệu danh bạ mới/sửa PHẢI có mặt trong chỉ mục trong vòng 5 phút (FR-010) → worker re-index chạy chu kỳ ≤ 5 phút; hồ sơ xóa mềm (archived_at/deleted_at) không được index.
- PDF scan (ảnh, không có text layer) không trích xuất được ở phase này → status `needs_ocr`, báo rõ trong UI, không im lặng bỏ qua (mở rộng OCR ở phase sau).
- Câu hỏi ngoài phạm vi hai kho tri thức → từ chối lịch sự, nêu rõ phạm vi (xử lý ở system prompt). Trùng tên nhiều hồ sơ → liệt kê ứng viên để người dùng chọn, không tự đoán.
- AI chỉ gợi ý (tra cứu, dự thảo báo giá, gợi ý bước tiếp theo); mọi hành động có hệ quả (gửi báo giá, cập nhật CRM) nằm ngoài phạm vi chatbot — người dùng quyết định.

## Kiểm tra hiến chương

| Nguyên tắc | Cách đáp ứng trong thiết kế | Kết quả |
|---|---|---|
| I. Bằng chứng, nguồn gốc, độ không chắc chắn | Chunk nào cũng lưu nguồn (document_id + page_number/section_title + document_type/effective_date, hoặc entity_type + entity_id); câu trả lời bắt buộc citations theo đúng QĐ1–QĐ3; báo giá chỉ trích nguyên văn số liệu kèm nguồn; khi thiếu bằng chứng thì nói rõ. | Đạt |
| II. Con người kiểm soát hành động hệ trọng | Chatbot chỉ đọc (read-only RAG); không có tool ghi dữ liệu, không tự gửi; dự thảo báo giá là văn bản để người dùng duyệt, không phải cam kết thương mại. | Đạt |
| III. Quyền riêng tư | RLS `user_id` trên mọi bảng; bucket `documents` private; match RPC lọc theo `auth.uid()`; embedding gửi sang AI Gateway là nội dung tài liệu của chính user (ghi rõ trong UI/cài đặt). | Đạt |
| IV. Hồ sơ đáng tin cậy | Chunk giữ `chunk_index`, `page_number`, `section_title`, `embedding_model`/`embedding_version`; re-index có queue + trạng thái; xóa document/entity thì xóa chunk tương ứng, không để vector mồ côi. | Đạt |
| V. Giải thích được, cấu hình được | Citations truy được về chunk gốc; ngưỡng similarity, top-k, model chat/embedding cấu hình qua `ai_model_configs` (capability `rag_chat`, `rag_embeddings`) + env fallback, theo đúng cơ chế hiện có. | Đạt |

Không có ngoại lệ cần ghi vào Complexity Tracking.

## Quyết định đã chốt từ spec (QĐ1–QĐ3) và thiết kế tương ứng

Ngày 2026-10-13 spec đã chốt 3 quyết định (xem "Quyết định đã chốt" trong spec.md); plan áp dụng như sau:

- **QĐ1 — mâu thuẫn tài liệu vs danh bạ**: khi mâu thuẫn, ưu tiên **tài liệu có ngày hiệu lực (hoặc ngày tải lên) mới nhất** và **chỉ trích dẫn nguồn đó** — không trình bày dữ liệu danh bạ mâu thuẫn. Thiết kế: truy xuất tài liệu ưu tiên sắp xếp theo `effective_date DESC, created_at DESC` trong cùng `document_type`; system prompt ghi rõ quy tắc ưu tiên và cấm trộn hai nguồn mâu thuẫn vào cùng câu trả lời.
- **QĐ2 — nhiều phiên bản tài liệu cùng loại**: khi tải lên, người dùng **bắt buộc chọn loại tài liệu** (`document_type`: `price_list | catalogue | contract_template | capability_profile | other`) và **ngày hiệu lực** (`effective_date`). Chatbot ưu tiên bản đang hiệu lực (mới nhất theo `effective_date`) trong cùng `document_type`, và **luôn nêu rõ đang dùng bản nào** (tên file + ngày hiệu lực) trong câu trả lời lẫn citation. Hai cột này là NOT NULL trên bảng `documents`.
- **QĐ3 — đơn vị trích dẫn cho DOCX/TXT**: citation dùng **tên file + tiêu đề mục hoặc đoạn văn gần nhất** (không dùng số chunk). Bảng `document_chunks` thêm cột `section_title` (nullable); khi ingest DOCX/TXT, trích xuất giữ lại heading gần nhất của mỗi chunk (fallback: không có heading thì để null, UI ghi "đoạn văn bản gần nhất").

## Nghiên cứu và quyết định thiết kế

Chi tiết tại [research.md](./research.md). Các quyết định trọng yếu:

1. **pgvector trên Supabase**: bật extension `vector` bằng migration; hai bảng chunk (`document_chunks`, `business_chunks`) dùng cột `embedding vector(1536)` **nullable** trong lúc ingest (insert content trước, update embedding sau — chịu lỗi, retry được); index HNSW `vector_cosine_ops` chỉ trên row có embedding; truy xuất qua RPC `match_rag_chunks` — chữ ký và SQL chuẩn tại [data-model.md](./data-model.md) (`security definer` + kiểm tra `auth.uid() = p_user_id` ngay đầu hàm, chỉ lấy chunk của document `status='ready'`, `embedding is not null`).
2. **Embeddings qua Vercel AI SDK + AI Gateway**: `createGateway({ apiKey }).textEmbeddingModel('openai/text-embedding-3-small')` (`createGateway` từ package `ai` 7.0.138, đúng pattern `vision-provider.ts`); dùng `embed`/`embedMany`. Chưa verify runtime (node_modules chưa install) — T002 chạy thử `embedMany` và ghi rõ kết quả trong báo cáo. Thêm capability `rag_embeddings` vào `ai_model_configs` (fallback env `RAG_EMBEDDING_MODEL`), cột lưu `embedding_model` + `embedding_version` để đổi model sau này.
3. **Trích xuất text**: PDF → `pdfjs-dist` (legacy build, chạy Node, đọc text layer theo trang); DOCX → `mammoth` (text thô); TXT → đọc trực tiếp. Không OCR ảnh ở phase này.
4. **Chunking**: recursive splitter tự viết, ~1000 ký tự/chunk, overlap 200, ưu tiên ngắt ở ranh giới đoạn/câu, giữ `page_number` cho PDF và `section_title` (tiêu đề mục/heading gần nhất) cho DOCX/TXT (QĐ3); chunk danh bạ = template văn bản chuẩn hóa theo entity (không cắt bừa giữa chừng).
5. **Chat**: `streamText` + `DefaultChatTransport`/`useChat` (AI SDK v7); system prompt phiên bản hóa trong `lib/ai/rag/prompts/` (theo quy ước `load-markdown` của enrichment agent); citations dạng `[1]`, `[2]` map sang danh sách nguồn trả kèm trong `onFinish`/data part; UI render panel "Nguồn tham khảo".
6. **Re-index danh bạ**: bảng `rag_index_queue` (entity_type, entity_id, operation, status) — trigger ứng dụng (application-level, trong API contacts/companies/notes) enqueue + worker xử lý debounce theo lô; không dùng pg_net/trigger DB gọi HTTP.

## Giai đoạn 0 — Chuẩn bị

1. Bật extension `vector` trên Supabase (migration).
2. Tạo bucket Storage private `documents` + policy RLS theo `user_id` (đường dẫn `user_id/...`).
3. Thêm 2 package: `pdfjs-dist`, `mammoth`; chốt phiên bản trong lockfile.
4. Thêm capability `rag_chat`, `rag_embeddings` vào cơ chế `ai_model_configs` (UI cài đặt có thể ở phase sau; trước mắt dùng env fallback).

## Giai đoạn 1 — Dữ liệu và hợp đồng

1. Migration: `documents`, `document_chunks`, `business_chunks`, `rag_index_queue`, `chat_conversations`, `chat_messages`; RPC `match_rag_chunks`; HNSW indexes; RLS policies. Chi tiết tại [data-model.md](./data-model.md).
2. Định nghĩa contract API tại [contracts/rag-api.md](./contracts/rag-api.md): upload/list/delete documents, chat streaming, conversations/messages, citations format.
3. Viết module `lib/ai/rag/`: `chunking.ts`, `extract.ts` (pdf/docx/txt), `embeddings.ts` (gateway + fallback config), `retrieval.ts` (gọi RPC), `contact-index.ts` (enqueue + worker re-index), `prompts/system.md` (citation guard + pricing guard).

## Giai đoạn 2 — Các lát cắt

1. **Upload & ingest tài liệu**: UI upload tại trang chat (kéo-thả PDF/DOCX/TXT ≤ 25MB) → Storage → job ingest bất đồng bộ (route handler chạy nền hoặc cron worker) → trạng thái `processing/ready/failed` hiển thị trong UI; file lỗi trích xuất được báo rõ lý do.
2. **Index danh bạ**: worker đọc `rag_index_queue`, build chunk văn bản từ contact/company/meeting_note, `embedMany` theo lô, upsert `business_chunks`; enqueue tự động khi API contacts/companies/notes tạo/sửa/xóa.
3. **Chat RAG**: trang `/home/tro-ly` (tiếng Việt): khung chat streaming, panel nguồn tham khảo cho mỗi câu trả lời, lịch sử hội thoại (tạo/xem/xóa), gợi ý câu hỏi mẫu. System prompt ép citations; pricing guard chặn số liệu không có nguồn.
4. **Quản trị nguồn**: danh sách tài liệu đã index trong trang chat (xem trạng thái, xóa → xóa chunk), hiển thị model đang dùng.

## Giai đoạn 3 — Mở rộng (ngoài phạm vi hiện tại)

- OCR cho PDF scan (dùng vision model qua AI Gateway).
- Hybrid search (full-text + vector) và rerank.
- Export hội thoại/báo giá nháp ra file; chia sẻ hội thoại.
- `@ai-sdk/elements` nếu cần component chat chuẩn.

## Cấu trúc dự án

### Tài liệu tính năng

```text
specs/002-rag-chatbot/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── tasks.md
└── contracts/
    └── rag-api.md
```

### Mã nguồn dự kiến

```text
apps/web/
├── app/
│   ├── home/tro-ly/             # Trang chat (page.tsx, _components/)
│   └── api/
│       ├── knowledge/           # documents: POST upload, GET list, DELETE [id]; POST reindex
│       └── chat/                # POST streaming; conversations CRUD + messages
├── lib/ai/rag/
│   ├── chunking.ts              # Recursive splitter
│   ├── extract.ts               # pdfjs-dist / mammoth / txt
│   ├── embeddings.ts            # Gateway textEmbeddingModel + config
│   ├── retrieval.ts             # Gọi RPC match_rag_chunks
│   ├── contact-index.ts         # Enqueue + worker re-index danh bạ
│   └── prompts/
│       └── system.md            # System prompt (citation + pricing guard)
apps/web/supabase/migrations/
└── <timestamp>_rag_chatbot.sql  # vector ext, bảng, RPC, RLS, bucket
```

## Rủi ro và giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Chi phí embedding/chat qua AI Gateway tăng theo dung lượng | Trung bình | Chunk overlap vừa phải; batch `embedMany`; re-index chỉ entity đổi; hiển thị model đang dùng; giới hạn file 25MB |
| PDF scan không có text → ingest "trống" | Trung bình | Detect text rỗng → status `needs_ocr`, báo rõ trong UI, không index chunk rỗng |
| Ảo giác số liệu báo giá | Cao | Pricing guard 2 lớp: system prompt + kiểm tra sau sinh (post-check regex số tiền không có citation → thay bằng cảnh báo); test chuyên biệt |
| Đổi embedding model làm sai dims | Thấp | Lưu `embedding_model`/`embedding_version` mỗi chunk; RPC ép đúng dims; migration chuyển đổi khi cần |
| Re-index trễ sau khi sửa danh bạ | Thấp | Queue + worker theo lịch/cron ngắn; UI hiển thị "đang cập nhật chỉ mục" khi queue còn việc |
| Dữ liệu nhạy cảm gửi sang provider embedding | Trung bình | Ghi rõ trong UI/cài đặt rằng nội dung được gửi qua AI Gateway; RLS đảm bảo chỉ dữ liệu của chính user |
