# Contract API: RAG chatbot

Base paths: `/api/knowledge` (tài liệu) và `/api/chat` (chat). Mọi route yêu cầu đăng nhập (Supabase SSR session); dữ liệu giới hạn theo `user_id` của session. Lỗi chuẩn: `{ "code": "<mã>", "message": "<tiếng Việt>", "request_id": "<id>" }` (theo quy ước `contracts/mvp-api.md` của spec 001).

Mã lỗi chung: `unauthenticated` (401), `forbidden` (403), `not_found` (404), `validation_error` (400), `payload_too_large` (413), `unsupported_media_type` (415), `ai_not_configured` (503 — thiếu AI Gateway key), `internal` (500).

## POST /api/knowledge/documents — Upload tài liệu

- Content-Type: `multipart/form-data`, field `file` + 2 field bắt buộc (QĐ2):
  - `document_type`: `price_list | catalogue | contract_template | capability_profile | other`
  - `effective_date`: `YYYY-MM-DD` — ngày hiệu lực của tài liệu.
- Giới hạn: PDF, DOCX, TXT (spec đã chốt); ≤ 25MB/file; tối đa 100 tài liệu/user.
- Luồng: lưu Storage `documents/<user_id>/<doc_id>/<file_name>` → insert `documents(status='uploaded')` → khởi chạy ingest nền (trích xuất → chunk → embed → `status='ready'`). Response trả ngay, không chờ ingest.
- Response `201`: `{ "id", "file_name", "mime_type", "document_type", "effective_date", "file_size_bytes", "status": "uploaded" }`
- Lỗi: `415` sai định dạng, `413` quá dung lượng, `quota_exceeded` (403) khi đã đủ 100 tài liệu, `400` khi thiếu `document_type`/`effective_date` hoặc sai định dạng ngày.

## GET /api/knowledge/documents — Danh sách tài liệu

- Query: `?status=ready|processing|failed&limit=50&offset=0`
- Response `200`: `{ "items": [{ "id","file_name","mime_type","document_type","effective_date","file_size_bytes","page_count","status","error_message","chunk_count","created_at" }], "total": n }`
- Dùng để poll trạng thái ingest và quản trị nguồn trong UI chat.

## DELETE /api/knowledge/documents/:id — Xóa tài liệu

- Xóa row `documents` (cascade chunks) + file trong Storage.
- Response `200`: `{ "deleted": true }`. `404` nếu không thuộc user.

## POST /api/knowledge/reindex — Re-index danh bạ

- Request JSON: `{ "entity_type"?: "contact"|"company"|"meeting_note", "entity_id"?: "uuid" }` — vắng cả hai = backfill toàn bộ danh bạ của user.
- Enqueue vào `rag_index_queue`, response `202`: `{ "queued": n }`.
- Dùng cho backfill lần đầu và xử lý thủ công khi worker trục trặc; re-index thường ngày do các API contacts/companies/notes tự enqueue.

## POST /api/chat — Chat streaming

- Request JSON:
  ```json
  {
    "conversation_id": "uuid | null (null = tạo mới)",
    "messages": [{ "role": "user", "content": "..." }],
    "top_k": 8
  }
  ```
- Luồng server: embed câu hỏi (model `rag_embeddings`) → RPC `match_rag_chunks` (filter user) → build prompt với context + system prompt (citation guard + pricing guard) → `streamText` (model `rag_chat`) → stream `UIMessage` về client; `onFinish` lưu user/assistant message + citations vào DB.
- Response: `text/event-stream` (UI message stream của AI SDK v7).
- Sau stream, client gọi `GET /api/chat/conversations/:id/messages?after=<msg_id>` hoặc nhận citations qua data part — chốt ở phase implement (khuyến nghị: data part `data-citations` cuối stream).
- Lỗi: `503 ai_not_configured`; `400` khi messages rỗng.

### Định dạng citations (bắt buộc trong mọi câu trả lời có dùng nguồn)

Assistant message dùng marker `[1]`, `[2]`, …; mảng citations lưu trong `chat_messages.citations`:
```json
[
  { "index": 1, "source_type": "document", "source_id": "<doc_id>",
    "label": "BaoGia_2026.pdf", "page_number": 3,
    "effective_date": "2026-01-01",
    "snippet": "…đoạn trích nguyên văn liên quan…" },
  { "index": 2, "source_type": "document", "source_id": "<doc_id>",
    "label": "HuongDanSuDung.docx", "section_title": "3. Cài đặt",
    "effective_date": "2025-06-15",
    "snippet": "…" },
  { "index": 3, "source_type": "company", "source_id": "<company_id>",
    "label": "Công ty ABC", "snippet": "…" }
]
```
`source_type ∈ {document, contact, company, meeting_note}`. Với PDF: `label` + `page_number`; với DOCX/TXT (QĐ3): `label` + `section_title` (hoặc `section_title: null` → UI ghi "đoạn văn bản gần nhất"); `effective_date` luôn kèm theo citation tài liệu (QĐ2). UI render panel "Nguồn tham khảo" liệt kê label (+ trang/mục nếu có, + ngày hiệu lực).

### Quy tắc mâu thuẫn và ưu tiên phiên bản (hợp đồng hành vi, theo QĐ1–QĐ2)

1. Khi câu hỏi chạm số liệu có trong nhiều tài liệu cùng loại: chatbot dùng và **chỉ nêu** bản có `effective_date` mới nhất, kèm câu nêu rõ bản đang dùng, vd "Theo bảng giá BaoGia_2026.pdf (hiệu lực từ 2026-01-01)…". Không trình bày số liệu từ danh bạ hoặc bản cũ khi chúng mâu thuẫn với bản mới nhất.
2. Với thông tin hồ sơ không mâu thuẫn (chức danh, công ty, ghi chú), danh bạ và tài liệu được dùng chung, mỗi ý trích đúng nguồn của nó.
3. Không tự suy diễn "bản mới nhất đúng" cho câu hỏi về lịch sử/quá khứ: khi người dùng hỏi về thời điểm cũ, chatbot nêu rõ bản tài liệu tương ứng thời điểm đó nếu có.

### Pricing guard (hợp đồng hành vi, kiểm thử bắt buộc — theo spec story 3)

1. Mọi **đơn giá** trong dự thảo PHẢI trích nguyên văn từ tài liệu, kèm marker citation trỏ tới chunk chứa đúng con số đó, từng dòng hàng.
2. CẤM mọi phép tính do chatbot tự thực hiện: không nhân số lượng, không tính thành tiền/tổng cộng, không suy ra chiết khấu/thuế. Dự thảo chỉ liệt kê hạng mục + đơn giá trích nguyên văn kèm nguồn; cột thành tiền/tổng cộng để trống cho người dùng tự tính và kiểm tra; dự thảo kèm dòng cảnh báo "tạm tính — cần người kiểm tra trước khi gửi".
3. CẤM: bịa/ước lượng giá khi tài liệu không có (dòng hàng đó ghi "chưa có giá trong tài liệu — cần người bổ sung"); suy ra giá từ sản phẩm khác; tự suy diễn chiết khấu, thuế, điều kiện không có trong nguồn; dùng kiến thức nền về giá thị trường.
4. Không tìm thấy số liệu trong context → trả lời "không tìm thấy", đề nghị user bổ sung — KHÔNG đưa con số nào.

## GET /api/chat/conversations — Lịch sử hội thoại

- Response `200`: `{ "items": [{ "id","title","created_at","updated_at" }] }` (mới nhất trước).

## POST /api/chat/conversations — Tạo hội thoại

- Request: `{ "title"?: "…" }` → `201`: `{ "id","title","created_at" }`.
- Thực tế client ít gọi trực tiếp (POST /api/chat với `conversation_id=null` tự tạo).

## GET /api/chat/conversations/:id/messages — Tin nhắn

- Response `200`: `{ "items": [{ "id","role","content","citations","created_at" }] }`.

## DELETE /api/chat/conversations/:id — Xóa hội thoại

- Cascade xóa messages. Response `200`: `{ "deleted": true }`.

## Hợp đồng nội bộ: ingest pipeline (không phơi ra client)

`lib/ai/rag/extract.ts` + `ingestDocument(documentId, userId)` (đặt trong route handler hoặc `lib/ai/rag/ingest.ts`) — các bước và chuyển trạng thái:
`uploaded → processing → ready | failed | needs_ocr`. Idempotent: chạy lại trên document `failed` thì xóa chunks cũ trước khi index lại. Chunk rỗng sau trích xuất → `needs_ocr` (PDF scan) kèm `error_message` tiếng Việt. Khi trích xuất DOCX/TXT, giữ tiêu đề mục (heading) gần nhất của mỗi chunk vào `section_title` (QĐ3); PDF giữ `page_number`.

`lib/ai/rag/contact-index.ts`: `enqueueBusinessIndex(userId, entityType, entityId, operation)` được gọi từ các API contacts/companies/notes sau write thành công; `processIndexQueue(batchSize=50)` cho worker.
