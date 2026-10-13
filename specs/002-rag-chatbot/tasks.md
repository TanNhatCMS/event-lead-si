# Danh sách công việc: Chatbot RAG tra cứu tri thức EventLead SI

**Tài liệu đầu vào**: `specs/002-rag-chatbot/spec.md` (FR-001..FR-014, SC-001..SC-011), `plan.md`, `data-model.md`, `research.md`, `contracts/rag-api.md`.

**Quyết định đã chốt áp dụng** (QĐ1–QĐ3, user chốt 2026-10-13):
- **QĐ1** (tài liệu vs danh bạ mâu thuẫn): ưu tiên tài liệu có ngày hiệu lực/tải lên mới nhất; chatbot chỉ nêu nguồn đó, không trình bày dữ liệu danh bạ mâu thuẫn.
- **QĐ2** (nhiều phiên bản tài liệu): khi upload người dùng bắt buộc chọn `document_type` (bảng giá, catalogue, hợp đồng mẫu, hồ sơ năng lực, khác) + `effective_date` (ngày hiệu lực); chatbot ưu tiên bản đang hiệu lực (cùng loại, `effective_date` mới nhất) và nêu rõ đang dùng bản nào (tên file + ngày hiệu lực).
- **QĐ3** (đơn vị trích dẫn): PDF = tên file + số trang; DOCX/TXT = tên file + tiêu đề mục/đoạn gần nhất (`section_title`).

**Quyết định kỹ thuật đã chốt** (từ plan): pgvector trên Supabase sẵn có (single-user, không thêm vector DB ngoài); embeddings qua Vercel AI SDK (`ai`, `embedMany`/`streamText` qua AI Gateway, không dùng LangChain); chunk + index tài liệu upload qua Supabase Storage bucket `documents`; re-index danh bạ qua `rag_index_queue` (worker chu kỳ ≤ 5 phút); mọi câu trả lời kèm trích dẫn nguồn; báo giá: số liệu trích nguyên văn, chatbot KHÔNG tự tính toán — mọi phép tính do người dùng thực hiện và kiểm tra; hiến chương "AI gợi ý, người quyết định"; UI tiếng Việt, trang `/home/tro-ly`; API theo `contracts/rag-api.md`.

**Cách tổ chức**: Task gom theo 6 phase triển khai. `[P]` = làm song song được với task khác cùng giai đoạn (không phụ thuộc nhau, chỉ cần các phase trước xong).

**Lưu ý repo**: monorepo MakerKit tại `apps/web/` (Next.js 16.3 App Router). Sổ tay tham khảo RAG: `docs/rag-handbook-viet-tay.md` (ánh xạ khái niệm → task). Pattern API route: `import 'server-only'`, validate zod, `getSupabaseServerClient` từ `@kit/supabase/server-client`, thông báo lỗi tiếng Việt, chuẩn lỗi `{code, message, request_id}` (xem `apps/web/app/api/enrichment/run/route.ts`). Cấu hình model theo user: bảng `ai_model_configs` + hàm `getAiModelConfig(capability, userId, supabase)` trong `apps/web/lib/ai/enrichment/model-config.ts` (fallback env khi chưa có dòng cấu hình). Pattern gọi AI Gateway: `import { createGateway, ... } from "ai"` (xem `apps/web/lib/ai/vision-provider.ts`). Migration mới đặt tại `apps/web/supabase/migrations/`, áp dụng thủ công qua Supabase SQL Editor (theo issue #35), regenerate `apps/web/lib/database.types.ts` sau khi apply. Pattern bucket Storage: `insert into storage.buckets` + policy dùng `(storage.foldername(name))[1]::uuid = auth.uid()` theo path `{user_id}/...` (xem bucket `business-cards` trong `apps/web/supabase/migrations/20261013235900_eventlead_single_user.sql`). Không sửa `.github/workflows/` qua MCP tools. Không dùng service-role key ở trình duyệt.

**Sơ đồ phụ thuộc**:

```text
T001 ─┬─▶ T002 ─┬─▶ T003 ────────────┐
      ├─▶ T004 [P]                    │
      ├─▶ T005 [P] (sau T002)        ├─▶ T009 ─▶ T010 ─▶ T011
      ├─▶ T006 (sau T002) ─▶ T007 ───┘
      └─▶ T008 [P] ──────────────────▶ T009 (dùng config, không bắt buộc)
```

- T001: nền duy nhất, phải xong trước.
- T002: xong → T003, T005, T006 làm được.
- T004, T008: chỉ cần T001 → làm song song với T002/T003 bất kỳ lúc nào.
- T006: chỉ cần T001+T002 → song song được với T003/T004/T005.
- T007: cần T006. T009: cần T007 (API chat) + T003/T004 (API tài liệu). T010: cần T009. T011: cuối cùng.

---

## Phase 1 — Schema cơ sở dữ liệu

- [ ] T001 Migration schema RAG: tạo file `apps/web/supabase/migrations/<timestamp>_rag_chatbot.sql` (timestamp phải lớn hơn migration mới nhất hiện có, ví dụ sau `20261014020000_phase3_sourcing.sql`) gồm:
  - `create extension if not exists vector;`
  - Bảng `documents`: id uuid pk, user_id uuid not null, storage_path text (`{user_id}/{doc_id}/{file_name}`), file_name text, mime_type text check in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'), file_size_bytes bigint check > 0 and <= 26214400 (25MB), page_count int nullable, document_type text not null check in ('price_list','catalogue','contract_template','capability_profile','other') (QĐ2), effective_date date not null (QĐ2), status text check in ('uploaded','processing','ready','failed','needs_ocr'), error_message text nullable, chunk_count int default 0, created_at/updated_at timestamptz.
  - Bảng `document_chunks`: id, document_id fk cascade, user_id, chunk_index int, page_number int nullable (PDF), section_title text nullable (QĐ3: tiêu đề mục/đoạn gần nhất cho DOCX/TXT), content text not null, embedding vector(1536) nullable, embedding_model text, embedding_version integer, unique(document_id, chunk_index).
  - Bảng `business_chunks`: id, user_id, entity_type check in ('contact','company','meeting_note'), entity_id uuid, content text not null, embedding vector(1536) nullable, embedding_model text, embedding_version integer, updated_at, unique(user_id, entity_type, entity_id).
  - Bảng `rag_index_queue`: id, user_id, entity_type check in ('contact','company','meeting_note'), entity_id uuid, operation check in ('upsert','delete'), status check in ('pending','processing','done','failed'), attempts int default 0, error_message nullable, created_at/updated_at.
  - Bảng `chat_conversations`: id, user_id, title text, created_at/updated_at.
  - Bảng `chat_messages`: id, conversation_id fk cascade, user_id, role check in ('user','assistant'), content text, citations jsonb default '[]', created_at.
  - RLS `for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)` cho cả 6 bảng (FR-014).
  - Index HNSW `using hnsw (embedding vector_cosine_ops)` cho 2 bảng chunk (kèm `where embedding is not null`).
  - RPC `match_rag_chunks(query_embedding vector(1536), p_user_id uuid, p_sources text[] default array['document','contact','company','meeting_note'], match_count int default 8, match_threshold float default 0.35)`: plpgsql `security definer`, kiểm tra `auth.uid() = p_user_id` ngay đầu hàm (FR-014), union `document_chunks` (join documents để loại status != 'ready') + `business_chunks`, lọc `user_id = p_user_id` và `embedding is not null`, `order by embedding <=> query_embedding limit match_count`, trả (chunk_id uuid, source_type text, source_id uuid, label text, document_type text, effective_date date, section_title text, page_number int, content text, similarity float).
  - Bucket `documents` (private, file_size_limit 25MB, allowed_mime_types PDF/DOCX/TXT) + policy select/insert/update/delete trên `storage.objects` theo `(storage.foldername(name))[1]::uuid = auth.uid()`.
  Bao phủ FR-001..FR-004 (meta tài liệu), FR-013 (hội thoại), FR-014 (RLS).
  **Xong khi**: SQL review kỹ (hoặc apply thử trên project staging), `pnpm --filter web typecheck` pass, tên bảng/cột khớp đúng như các task sau dùng.

---

## Phase 2 — Ingestion tài liệu (tải lên → trích xuất → index)

- [ ] T002 Pipeline ingest tài liệu (lib): tạo trong `apps/web/lib/ai/rag/`:
  - `extract.ts`: trích text PDF bằng `pdfjs-dist` (legacy build chạy Node, giữ page_number từng đoạn text), DOCX bằng `mammoth`, TXT đọc trực tiếp. Trả `{pages: [{page_number, sections: [{section_title, text}]}]}` — `section_title` = heading gần nhất tách được (QĐ3). Thêm 2 package `pdfjs-dist`, `mammoth` vào `apps/web/package.json`.
  - `chunking.ts`: recursive splitter ~1000 ký tự/chunk, overlap ~200, ngắt ưu tiên đoạn văn → câu → từ, giữ `page_number` và `section_title` từng chunk; kèm unit test Vitest tách câu tiếng Việt đúng dấu `.`, `!`, `?` và không cắt mất `section_title`.
  - `embeddings.ts`: dùng `embedMany` từ package `ai` qua `createGateway` (theo `apps/web/lib/ai/vision-provider.ts`); model đọc từ `ai_model_configs` capability `rag_embeddings` bằng `getAiModelConfig`, fallback env `RAG_EMBEDDING_MODEL`, mặc định `openai/text-embedding-3-small` (1536 chiều khớp `vector(1536)` của T001).
  - `ingest.ts`: `indexDocumentChunks(userId, documentId, pages)` — chunk → `embedMany` theo lô → insert `document_chunks` với `embedding_model`/`embedding_version`; idempotent (xóa chunks cũ của document trước khi index lại); lỗi embed → ném lỗi để caller set state `failed`.
  Bao phủ FR-002. **Xong khi**: với 1 PDF 5 trang seed, `indexDocumentChunks` tạo N dòng `document_chunks`, `embedding` không null, `section_title` có giá trị cho chunk từ DOCX mẫu; Vitest chunker pass; `pnpm --filter web typecheck` pass; chạy thử `embedMany` qua gateway để xác nhận provider hỗ trợ `textEmbeddingModel` (ghi rõ kết quả; nếu không hỗ trợ thì báo cáo rõ, không tự đổi thiết kế). (Chưa có AI_GATEWAY_API_KEY thật thì lỗi chỉ phát sinh lúc runtime — ghi rõ trong báo cáo.)

- [ ] T003 [P] API upload tài liệu + ingest nền: tạo `apps/web/app/api/knowledge/documents/route.ts` — `POST` nhận multipart `file` (+ form fields bắt buộc `document_type`, `effective_date` theo QĐ2):
  - Validate: định dạng PDF/DOCX/TXT (415 `unsupported_media_type`), ≤ 25MB (413 `payload_too_large`), tối đa 100 tài liệu/user (403 `quota_exceeded`), thiếu/sai `document_type` hoặc `effective_date` (400 `validation_error`), thông báo tiếng Việt (FR-001, FR-002).
  - Upload lên bucket `documents` tại path `{user_id}/{doc_id}/{file_name}`; insert `documents(status='uploaded')` kèm `document_type` + `effective_date`; response `201` ngay `{id, file_name, mime_type, document_type, effective_date, file_size_bytes, status: 'uploaded'}` (không chờ ingest).
  - Ingest nền: gọi `extract.ts` của T002 → `status='processing'`; text rỗng (PDF scan) → `needs_ocr` + `error_message` tiếng Việt ("File không có nội dung chữ — cần OCR ở phase sau"), không index chunk rỗng; trích xuất xong → `indexDocumentChunks` → `ready` + `page_count` + `chunk_count`; lỗi bất kỳ → `failed` + `error_message`. Ingest chạy sau response (không block): dùng `after()` của Next hoặc route worker nội bộ — chọn cách đơn giản nhất chạy được trên hosting hiện tại, ghi rõ trong báo cáo.
  Bao phủ FR-001, FR-002. **Xong khi**: upload PDF 5 trang → 201 ngay, sau ingest xong state `ready` + page_count=5; upload file .png → 415 kèm thông báo chỉ nhận PDF/DOCX/TXT; upload PDF scan rỗng text → `needs_ocr`; typecheck pass.

- [ ] T004 [P] API quản lý tài liệu (list/delete): trong `apps/web/app/api/knowledge/documents/`:
  - `GET /api/knowledge/documents`: danh sách của user (id, file_name, mime_type, file_size_bytes, page_count, document_type, effective_date, status, error_message, chunk_count, created_at), mới nhất trước, filter `?status=` (FR-003).
  - `DELETE /api/knowledge/documents/[id]/route.ts`: xóa row `documents` → cascade chunks → xóa object trong bucket `documents`; 404 nếu không thuộc user; sau xóa chatbot không còn trích dẫn tài liệu đó (FR-004, SC-005).
  Bao phủ FR-003, FR-004. **Xong khi**: GET trả đúng danh sách kèm `document_type`/`effective_date`; DELETE xong thì `document_chunks` không còn dòng của document đó và object trong bucket bị xóa; typecheck pass.

---

## Phase 3 — Index dữ liệu danh bạ

- [ ] T005 [P] Index danh bạ + worker re-index: tạo `apps/web/lib/ai/rag/contact-index.ts`:
  - `buildContactText` (tên, chức danh, công ty, email, phone, địa chỉ, giai đoạn, nhãn), `buildCompanyText` (tên hiển thị, website, lĩnh vực, quy mô, products_summary, market_summary), `buildMeetingNoteText` (loại ghi chú, ngày, tên liên hệ, body) — chunk danh bạ là template văn bản chuẩn hóa theo entity, không cắt bừa.
  - `source_label` cho trích dẫn: `Hồ sơ liên hệ: <tên>`, `Công ty: <tên>`, `Ghi chú <loại> (<ngày>) — <tên liên hệ>`.
  - `enqueueBusinessIndex(userId, entityType, entityId, operation)` insert vào `rag_index_queue`.
  - `processIndexQueue(batchSize=50)`: gộp theo (user_id, entity_type, entity_id), bản ghi mới nhất thắng, `delete` thắng `upsert`; upsert → build text + embed bằng `embeddings.ts` của T002 (theo lô) + upsert `business_chunks`; hồ sơ xóa mềm (verify đúng tên cột trong `database.types.ts`: dự kiến `contacts.archived_at` / `meeting_notes.deleted_at` not null) → coi như `delete`, không index.
  - Móc `enqueueBusinessIndex` vào route API hiện có `apps/web/app/api/contacts`, `apps/web/app/api/companies`, `apps/web/app/api/notes` (POST/PATCH/DELETE) sau khi ghi DB thành công — fire-and-forget có try/catch, không làm hỏng API chính nếu enqueue lỗi.
  - `POST /api/knowledge/reindex`: backfill toàn bộ dữ liệu cũ một lần (enqueue hết contacts/companies/meeting_notes của user) — theo `contracts/rag-api.md`.
  - Worker chạy chu kỳ ≤ 5 phút (FR-010): route handler nội bộ `GET /api/knowledge/worker` gọi `processIndexQueue`, được gọi theo lịch (xem pattern cron/scheduler hiện có trong repo; nếu chưa có thì ghi rõ trong báo cáo cách kích hoạt).
  Bao phủ FR-006, FR-010. **Xong khi**: tạo 1 contact mới → `business_chunks` có dòng `entity_type='contact'` tương ứng trong vòng 5 phút; sửa contact → chunk cập nhật; xóa contact → chunk biến mất; hồ sơ xóa mềm không vào index; typecheck pass.

---

## Phase 4 — Retrieval và Chat API

- [ ] T006 Retrieval có trích dẫn (theo QĐ1–QĐ3): tạo `apps/web/lib/ai/rag/retrieval.ts` — `retrieveContext(userId, query, topK=8)`:
  - Embed query bằng cùng model `embeddings.ts`; gọi RPC `match_rag_chunks` (lọc `user_id` — FR-014); bỏ chunk similarity dưới ngưỡng (mặc định 0.35, cấu hình được qua `ai_model_configs` capability `rag_chat`).
  - Trả `{ chunks, citations }`: citation cho document = `{source_type:'document', label: file_name, page_number?, section_title?, effective_date}` (QĐ3: PDF có page_number; DOCX/TXT có section_title); cho danh bạ = `{source_type:'contact'|'company'|'meeting_note', label: source_label}`.
  - QĐ2: khi nhiều document cùng `document_type`, sắp xếp ưu tiên `effective_date` DESC rồi `created_at` DESC (theo data-model); citation ghi rõ phiên bản (`label` kèm `document_type` + `effective_date`).
  - QĐ1: khi tài liệu và danh bạ mâu thuẫn, chỉ đưa vào context bản tài liệu có ngày hiệu lực/tải lên mới nhất; không trộn dữ liệu danh bạ mâu thuẫn vào cùng câu trả lời.
  Bao phủ FR-006, FR-007, FR-014. **Xong khi**: với dữ liệu seed (1 PDF bảng giá + 1 contact), query "giá máy X" trả chunk đúng kèm citation có tên file + số trang; query của user A không bao giờ trả chunk của user B (kiểm tra bằng 2 user_id); typecheck pass.

- [ ] T007 Chat API RAG: tạo `POST /api/chat` trong `apps/web/app/api/chat/route.ts` — zod `{conversation_id?: uuid, messages: [{role:'user', content: 1..4000 ký tự}], top_k?: int}`; lấy user từ session (401 nếu chưa đăng nhập); tạo conversation mới (title = 60 ký tự đầu của message) nếu `conversation_id` null; lưu message user vào `chat_messages`; gọi `retrieveContext` (T006) rồi `streamText` qua AI Gateway (capability `rag_chat` từ `ai_model_configs`, fallback env `RAG_CHAT_MODEL`) với system prompt tiếng Việt đặt tại `apps/web/lib/ai/rag/prompts/system.md` (theo quy ước load-markdown của enrichment agent) gồm:
  1. Chỉ trả lời dựa trên CONTEXT được cấp; ghi trích dẫn `[1]`, `[2]`... sau mỗi ý; cuối câu trả lời liệt kê "Nguồn: [1] <tên file, trang N | tên file, mục X> / <tên hồ sơ>".
  2. Không tìm thấy → "Tôi không tìm thấy thông tin này trong tài liệu và danh bạ của bạn." và gợi ý nguồn gần nhất nếu có — TUYỆT ĐỐI không bịa (FR-009, FR-011).
  3. QUOTE-MODE (FR-008, spec story 3): dự thảo báo giá CHỈ liệt kê hạng mục + đơn giá trích NGUYÊN VĂN từ context, mỗi dòng kèm nguồn; CẤM chatbot tự tính toán (không nhân số lượng, không tính thành tiền/tổng cộng/chiết khấu/thuế) — cột tính toán để trống cho người dùng tự tính và kiểm tra; khi người dùng yêu cầu tính hộ → từ chối lịch sự và nêu rõ cần người dùng thực hiện; thiếu giá → ghi "chưa có giá trong tài liệu — cần người bổ sung", không tự điền số; kết thúc bằng dòng "⚠️ Báo giá tạm tính — cần người kiểm tra trước khi gửi."
  4. Xử lý mâu thuẫn (QĐ1): khi tài liệu và danh bạ mâu thuẫn, dùng tài liệu có ngày hiệu lực/tải lên mới nhất, chỉ nêu nguồn đó, không trình bày dữ liệu danh bạ mâu thuẫn.
  5. Ưu tiên phiên bản tài liệu (QĐ2): khi có nhiều bản cùng loại, dùng bản đang hiệu lực và nêu rõ "đang dùng bảng giá hiệu lực từ <ngày>".
  6. Từ chối mọi yêu cầu gửi hộ/gọi hộ/sửa hộ dữ liệu: "Tôi chỉ tư vấn và dựng dự thảo, bạn tự kiểm tra và gửi nhé." (FR-012). Câu hỏi ngoài phạm vi hai kho tri thức → từ chối lịch sự, nêu rõ phạm vi.
  7. Trùng tên nhiều hồ sơ → liệt kê ứng viên kèm thông tin phân biệt để người dùng chọn, không tự đoán.
  Stream về client bằng `toUIMessageStreamResponse()` (AI SDK v7), citations trả kèm data part `data-citations` cuối stream; `onFinish` lưu message assistant + citations jsonb.
  Bao phủ FR-005, FR-007, FR-008, FR-009, FR-011, FR-012, FR-014. **Xong khi**: typecheck pass; kiểm thử thủ công với câu hỏi có/không có trong context cho đúng hành vi (cần AI_GATEWAY_API_KEY — nếu chưa có thì ghi rõ chưa kiểm thử runtime được).

- [ ] T008 [P] Cấu hình model RAG trong trang AI Models: mở rộng trang `apps/web/app/home/cai-dat/ai-models/page.tsx` và API `apps/web/app/api/ai-models/route.ts` để hỗ trợ thêm 2 capability `rag_chat` và `rag_embeddings` (dropdown chọn provider/model, bật/tắt, lưu vào `ai_model_configs` — tái dùng pattern hiện có của capability `lead_enrichment`). Không FR trực tiếp, phục vụ T002/T007 đọc config theo user. **Xong khi**: lưu được config 2 capability mới, GET trả về đúng; typecheck pass.

---

## Phase 5 — Giao diện người dùng

- [ ] T009 Trang chat + lịch sử hội thoại: tạo `apps/web/app/home/tro-ly/page.tsx` (route mới `/home/tro-ly`, theo pattern các route `/home/*` hiện có) — giao diện tiếng Việt:
  - Khung chat streaming gọi `POST /api/chat` (dùng `useChat` + `DefaultChatTransport` của AI SDK v7 theo research.md), render markdown cơ bản, hiển thị trích dẫn dưới mỗi câu trả lời (chip "📄 <tên file> — trang N" cho PDF / "📄 <tên file> — <tiêu đề mục>" cho DOCX/TXT theo QĐ3, "👤 <tên hồ sơ>" cho danh bạ).
  - Sidebar: nút "Đoạn chat mới", danh sách `chat_conversations` (title + ngày), mở lại đoạn cũ, xóa đoạn có xác nhận; empty state hướng dẫn "Tải tài liệu lên rồi hỏi tôi nhé".
  - API phụ trong `apps/web/app/api/chat/conversations/`: `GET /api/chat/conversations` (danh sách của user), `POST /api/chat/conversations` (tạo mới — theo contract), `GET /api/chat/conversations/[id]/messages`, `DELETE /api/chat/conversations/[id]` (cascade xóa messages) — theo `contracts/rag-api.md`.
  Bao phủ FR-005, FR-007, FR-013. **Xong khi**: mở trang thấy tiếng Việt toàn bộ; gửi câu hỏi → câu trả lời stream về kèm chip trích dẫn; tạo/mở/xóa đoạn chat hoạt động; `pnpm --filter web typecheck` và `next build` pass.

- [ ] T010 UI quản lý tài liệu: trong trang `/home/tro-ly` (T009) thêm tab/panel "Tài liệu":
  - Upload drag-drop chỉ nhận PDF/DOCX/TXT (file khác báo lỗi ngay ở client + server đã chặn ở T003); form chọn `document_type` (bảng giá/catalogue/hợp đồng mẫu/hồ sơ năng lực/khác, bắt buộc) + `effective_date` (bắt buộc, QĐ2).
  - Danh sách tài liệu (tên, loại tài liệu, ngày hiệu lực, ngày tải, trạng thái với màu sắc: đang xử lý/đã sẵn sàng/lỗi/cần OCR), nút xóa có hộp xác nhận; tự refresh trạng thái sau upload (polling nhẹ mỗi 3s khi còn `processing`); trạng thái `needs_ocr` hiển thị rõ "File không có nội dung chữ — cần OCR (phase sau)".
  Gọi API của T003/T004. Bao phủ FR-001, FR-003, FR-004. **Xong khi**: upload PDF → thấy trạng thái chuyển `processing` → `ready`; xóa → biến mất khỏi danh sách; build pass.

---

## Phase 6 — Nghiệm thu

- [ ] T011 Kiểm thử chấp nhận: chuẩn bị dữ liệu seed (1 PDF bảng giá 20 trang có 10 sản phẩm, 1 PDF bảng giá bản cũ `effective_date` 2025, 1 PDF catalogue, 1 file DOCX có tiêu đề mục, 3 công ty + 5 liên hệ + 2 ghi chú cuộc gặp), chạy bộ kiểm thử 30 câu hỏi (20 từ tài liệu, 10 từ danh bạ) theo SC-001..SC-011:
  - Trích dẫn đúng file+trang (PDF) / file+mục (DOCX/TXT); số liệu khớp nguyên văn; câu hỏi ngoài tài liệu → "không tìm thấy" không kèm số; báo giá 3 dòng hàng 100% số trích nguyên văn có nguồn + KHÔNG có con số nào do chatbot tự tính + cảnh báo tạm tính; liên hệ mới hỏi được trong 5 phút; xóa tài liệu → không còn trích dẫn; giao diện tiếng Việt; yêu cầu "gửi báo giá hộ" → bị từ chối.
  - SC-009 (QĐ2): 2 bảng giá cùng loại hiển thị đúng loại + ngày hiệu lực; hỏi giá có trong cả 2 bản → dùng bản 2026 và nêu rõ tên file + ngày hiệu lực. SC-010 (QĐ1): tình huống tài liệu–danh bạ mâu thuẫn → chỉ trích dẫn tài liệu mới nhất. SC-011 (QĐ3): hỏi nội dung trong mục của file DOCX → trích dẫn ghi đúng tên file + tiêu đề mục.
  - Ghi kết quả pass/fail từng SC vào `specs/002-rag-chatbot/checklists/acceptance.md`.
  Bao phủ toàn bộ FR-001..FR-014. **Xong khi**: file acceptance.md hoàn thành, tối thiểu SC-001..SC-005 và SC-007..SC-011 pass, SC-006 đạt ≥27/30; các SC fail ghi rõ nguyên nhân và task cần sửa.
