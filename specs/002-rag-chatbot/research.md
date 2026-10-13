# Nghiên cứu kỹ thuật: RAG chatbot

Ngày: 2026-10-13. Các điểm chưa rõ lúc lập kế hoạch và kết luận sau khi tìm hiểu.

## 1. pgvector trên Supabase — có sẵn không, dùng thế nào?

**Câu hỏi**: Supabase Postgres sẵn có có hỗ trợ pgvector không? Pattern truy xuất chuẩn là gì?

**Kết luận**: Có. `pgvector` là extension được Supabase hỗ trợ chính thức; bật bằng `create extension if not exists vector;` trong migration. Pattern chuẩn:
- Cột `embedding vector(1536)` (dims khớp model).
- Index HNSW: `create index ... using hnsw (embedding vector_cosine_ops)` (lựa chọn mặc định, tốt cho dataset vừa/nhỏ, truy vấn cosine).
- RPC `match_documents(query_embedding vector(1536), match_threshold float, match_count int)` bằng plpgsql, tính `similarity = 1 - (embedding <=> query_embedding)`, `order by embedding <=> query_embedding limit match_count`.

**Áp dụng**: Dùng đúng pattern này cho RPC `match_rag_chunks`, thêm tham số `p_user_id uuid` và điều kiện `user_id = p_user_id` để RLS single-user; RPC `security definer` nhưng kiểm tra `auth.uid() = p_user_id` ngay đầu hàm để không bypass phân quyền.

## 2. Embeddings qua Vercel AI SDK + AI Gateway — API nào?

**Câu hỏi**: App đang dùng `createGateway` từ `ai@7.0.138` cho chat model. Có API embedding tương đương không, model id nào hợp lệ?

**Kết luận**: Có. `createGateway` được export từ chính package `ai` (v7) — đúng pattern repo đang dùng trong `apps/web/lib/ai/vision-provider.ts` (`import { createGateway } from "ai"`); repo hiện không có dependency `@ai-sdk/gateway` riêng nên không cần thêm package mới. Provider gateway hỗ trợ `textEmbeddingModel(modelId)` theo tài liệu AI Gateway; model id dạng `'openai/text-embedding-3-small'` (1536 chiều), `'openai/text-embedding-3-large'`, v.v. Dùng cùng `embed` / `embedMany` từ gói `ai` như API chuẩn.

**Lưu ý kiểm chứng**: repo chưa `pnpm install` (node_modules chưa có trên máy này) nên chưa verify runtime được — T002 phải chạy thử `embedMany` với model `openai/text-embedding-3-small` và ghi rõ kết quả trong báo cáo; nếu gateway provider không hỗ trợ embedding, báo rõ và đề xuất phương án thay thế, không tự đổi thiết kế.

**Áp dụng**: `embeddings.ts` dùng `createGateway({ apiKey }).textEmbeddingModel(modelId)` + `embedMany({ values, maxParallelCalls })`; model mặc định `openai/text-embedding-3-small`; cho phép user đổi qua capability `rag_embeddings` trong `ai_model_configs` (fallback env `RAG_EMBEDDING_MODEL`). Mỗi chunk lưu `embedding_model` + `embedding_version` để phát hiện lệch dims khi đổi model.

**Không chọn**: Gọi trực tiếp OpenAI API (trái yêu cầu "embeddings qua Vercel AI SDK", mất đi lớp trừu tượng provider của hiến chương); self-host embedding model (thêm hạ tầng, trái "không thêm vector DB/service ngoài" theo tinh thần single-user gọn nhẹ).

## 3. Trích xuất text từ PDF/DOCX phía server Next.js

**Câu hỏi**: Không dùng LangChain thì trích xuất text PDF/DOCX/TXT bằng gì trong route handler Node?

**Kết luận**:
- **PDF**: `pdfjs-dist` (legacy build cho Node) đọc được text layer theo từng trang → giữ được `page_number` cho citation. PDF scan (chỉ có ảnh, không text layer) trả về text rỗng → detect và đánh dấu `needs_ocr`, không index chunk rỗng.
- **DOCX**: `mammoth` trích text thô (bỏ format) — đủ cho RAG, nhẹ, không cần LibreOffice.
- **TXT**: đọc trực tiếp. (Spec chốt 3 định dạng PDF/DOCX/TXT; không nhận MD.)
- Cả hai đều chạy tốt trong Node runtime của route handler (không dùng Edge runtime).
- Đơn vị trích dẫn khi không có số trang (DOCX/TXT): **tên file + tiêu đề mục hoặc đoạn văn bản gần nhất** (QĐ3 đã chốt — không dùng số mục chunk); pipeline ingest ghi `section_title` cho mỗi chunk.

**Không chọn**: Dịch vụ OCR ngoài ở phase này (thêm phụ thuộc + chi phí); `pdf-parse` (ít được bảo trì hơn pdfjs-dist ở thời điểm này).

## 4. Chunking không dùng LangChain

**Câu hỏi**: Tự viết splitter có đủ tốt không?

**Kết luận**: Đủ. Recursive character splitter (~200 dòng): ngắt theo thứ tự ưu tiên đoạn văn → câu → từ, `chunk_size ≈ 1000` ký tự, `overlap = 200`. Với tài liệu tiếng Việt cần tách câu đúng dấu `.`, `!`, `?` (không tách sau số thập phân/viết tắt phổ biến) — viết unit test riêng. Chunk danh bạ không dùng splitter chung mà render từ template cố định theo entity (contact/company/meeting_note) để mỗi chunk là một đơn vị ngữ nghĩa trọn vẹn.

## 5. Chat streaming với AI SDK v7

**Câu hỏi**: API chat hiện hành của `ai@7.0.138` là gì?

**Kết luận**: Client dùng `useChat` + `DefaultChatTransport` từ `ai/react` (hoặc `ai`); server dùng `streamText(...).toUIMessageStream()` trả về `UIMessage` stream. Lịch sử hội thoại persist thủ công vào `chat_conversations`/`chat_messages` (không dùng state server của SDK). Citations: trả kèm trong `onFinish` dưới dạng data part hoặc mảng `sources` trong response JSON sau stream; UI map `[n]` sang panel nguồn.

**Ghi chú**: `@ai-sdk/elements` chưa có trong repo — phase này tự dựng UI chat bằng shadcn/ui (Message, PromptInput tự viết), tránh thêm dependency chưa cần thiết.

## 6. Re-index khi danh bạ thay đổi — trigger DB hay application-level?

**Câu hỏi**: Làm sao biết contact/company/note đổi để re-index?

**Kết luận**: Application-level queue (`rag_index_queue`): các API contacts/companies/notes hiện có enqueue `{entity_type, entity_id, operation}` sau mỗi write thành công; worker (route cron nội bộ hoặc background task) xử lý debounce theo lô (gộp nhiều operation cùng entity thành 1). Không dùng pg_net/Supabase trigger gọi HTTP (thêm extension, khó retry, khó quan sát).

## 7. Q3 đã chốt: citation theo tiêu đề mục/đoạn (DOCX/TXT)

**Câu hỏi**: Sau khi spec chốt QĐ3 (citation DOCX/TXT = tên file + tiêu đề mục hoặc đoạn văn gần nhất), có khả thi không?

**Kết luận**: Khả thi với chi phí hợp lý. Trong lúc ingest, bộ trích xuất ghi lại `section_title` cho mỗi chunk:
- DOCX: `mammoth` mặc định trả text thô mất heading — cần chuyển sang đọc paragraph styles (`mammoth` hỗ trợ `transformDocument`/`styleMap` để giữ `Heading1/2`); fallback: nhận diện dòng tiêu đề theo heuristic (dòng ngắn, đứng đầu mục, không kết thúc bằng dấu câu) và gán cho các chunk theo sau.
- TXT: không có cấu trúc — dùng heuristic tương tự, hoặc `section_title = null` (UI ghi "đoạn văn bản gần nhất" kèm 40 ký tự đầu của đoạn chứa thông tin).
- Cột `section_title` nullable trong `document_chunks`; mọi nơi khác đã tách page_number (PDF) và section_title (DOCX/TXT) rạch ròi. Nếu không tách được heading, plan vẫn chấp nhận được vì citation unit là "đoạn văn bản gần nhất" theo đúng QĐ3.

## Nguồn tham khảo

- Supabase pgvector pattern: tài liệu cộng đồng Supabase specialist (match_documents + HNSW, `vector_cosine_ops`) — khớp tài liệu chính thức Supabase AI & Vectors.
- AI Gateway embeddings: Vercel AI Gateway hỗ trợ embedding models qua AI SDK (`textEmbeddingModel`/`embedMany` theo tài liệu ai-sdk.dev); `createGateway` dùng từ package `ai` (v7) theo đúng pattern `apps/web/lib/ai/vision-provider.ts` — chưa verify runtime, T002 chạy thử và báo cáo.
- AI SDK `embed`/`embedMany`: tài liệu AI SDK (ai-sdk.dev/docs/ai-sdk-core/embeddings).
