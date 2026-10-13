# Mô hình dữ liệu: RAG chatbot

Ngày: 2026-10-13. Schema single-user: mọi bảng có `user_id uuid not null references auth.users(id) on delete cascade` và RLS `auth.uid() = user_id`. Migration mới đặt tại `apps/web/supabase/migrations/<timestamp>_rag_chatbot.sql` (sau `20261014020000_phase3_sourcing.sql`).

## Thực thể mới

### documents — tài liệu người dùng upload

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid | not null, FK auth.users, on delete cascade |
| storage_path | text | not null — path trong bucket `documents` (`<user_id>/<doc_id>/<file_name>`) |
| file_name | text | not null — tên gốc hiển thị |
| mime_type | text | not null, check in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain') |
| document_type | text | **not null** (QĐ2), check in ('price_list','catalogue','contract_template','capability_profile','other') — loại tài liệu, chọn khi upload |
| effective_date | date | **not null** (QĐ2) — ngày hiệu lực của tài liệu; dùng để ưu tiên bản mới nhất và nêu trong citation |
| file_size_bytes | bigint | not null, check > 0 and <= 25*1024*1024 |
| page_count | integer | null — số trang (PDF) |
| status | text | not null default 'uploaded', check in ('uploaded','processing','ready','failed','needs_ocr') |
| error_message | text | null — lý do failed/needs_ocr |
| chunk_count | integer | not null default 0 |
| created_at / updated_at | timestamptz | not null default now() |

Xóa document → xóa chunks (FK cascade) + xóa file trong Storage (application-level).

Index: btree `(user_id, document_type, effective_date desc)` (hỗ trợ quy tắc ưu tiên QĐ1/QĐ2); btree `(user_id, created_at desc)` cho danh sách tài liệu mới nhất trước.

### document_chunks — chunk vector của tài liệu

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| document_id | uuid | not null, FK documents(id) on delete cascade |
| user_id | uuid | not null, FK auth.users, on delete cascade (dư thừa có chủ ý để RLS + RPC filter nhanh) |
| chunk_index | integer | not null, check >= 0 |
| page_number | integer | null — trang nguồn (PDF); null cho DOCX/TXT |
| section_title | text | null — tiêu đề mục/heading gần nhất chứa chunk (DOCX/TXT, QĐ3); null cho PDF hoặc khi không tách được heading |
| content | text | not null, check length(content) > 0 |
| embedding | vector(1536) | null cho phép trong lúc ingest (insert content trước, update embedding sau) — hoặc not null nếu ingest nguyên tử; chọn **nullable** để ingest từng bước chịu lỗi |
| embedding_model | text | not null default 'openai/text-embedding-3-small' |
| embedding_version | integer | not null default 1 |
| created_at | timestamptz | not null default now() |

Index: `using hnsw (embedding vector_cosine_ops)` (where embedding is not null); btree `(document_id, chunk_index)`; unique `(document_id, chunk_index)`.

### business_chunks — chunk vector của danh bạ

Một chunk = một entity (không cắt nhỏ), render từ template chuẩn hóa.

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid | not null, FK auth.users, on delete cascade |
| entity_type | text | not null, check in ('contact','company','meeting_note') |
| entity_id | uuid | not null |
| source_label | text | not null — nhãn hiển thị cho citation, vd `Hồ sơ liên hệ: Nguyễn Văn A`, `Công ty: ABC` |
| content | text | not null — văn bản chuẩn hóa của entity |
| embedding | vector(1536) | null được (như trên) |
| embedding_model | text | not null default 'openai/text-embedding-3-small' |
| embedding_version | integer | not null default 1 |
| updated_at | timestamptz | not null default now() |

Index: HNSW như trên; unique `(user_id, entity_type, entity_id)` để upsert. Không FK cứng sang contacts/companies/meeting_notes (tránh ràng buộc chéo khi entity bị xóa mềm/archived) — worker tự dọn chunk khi entity không còn tồn tại.

**Template content** (ví dụ):
- contact: `Liên hệ: {full_name} — {job_title} @ {company display_name}. Email: {email}. ĐT: {phone}. Địa chỉ: {address}. Giai đoạn: {relationship_stage}. Nhãn: {labels}.`
- company: `Công ty: {display_name} ({legal_name}). Website: {website}. Lĩnh vực: {industry}. Quy mô: {employee_size_range}. Sản phẩm: {products_summary}. Tóm tắt thị trường: {market_summary}.`
- meeting_note: `Ghi chú ({note_type}) về {contact full_name}, ngày {created_at}: {body}`

### rag_index_queue — hàng đợi re-index danh bạ

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid | not null, FK auth.users, on delete cascade |
| entity_type | text | not null, check in ('contact','company','meeting_note') |
| entity_id | uuid | not null |
| operation | text | not null, check in ('upsert','delete') |
| status | text | not null default 'pending', check in ('pending','processing','done','failed') |
| attempts | integer | not null default 0 |
| error_message | text | null |
| created_at / updated_at | timestamptz | not null default now() |

Worker gộp theo `(user_id, entity_type, entity_id)`: chỉ xử lý bản ghi mới nhất, `delete` thắng `upsert`.

### chat_conversations — hội thoại

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid | not null, FK auth.users, on delete cascade |
| title | text | not null default 'Hội thoại mới' |
| created_at / updated_at | timestamptz | not null default now() |

### chat_messages — tin nhắn

| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| conversation_id | uuid | not null, FK chat_conversations(id) on delete cascade |
| user_id | uuid | not null, FK auth.users, on delete cascade |
| role | text | not null, check in ('user','assistant') |
| content | text | not null |
| citations | jsonb | not null default '[]' — mảng `{index, source_type: 'document'|'contact'|'company'|'meeting_note', source_id, label, page_number?, section_title?, effective_date?, snippet}` — `section_title` cho DOCX/TXT (QĐ3), `effective_date` (YYYY-MM-DD) cho document để nêu rõ bản đang dùng (QĐ2) |
| created_at | timestamptz | not null default now() |

Index btree `(conversation_id, created_at)`.

## RPC: match_rag_chunks

```sql
create or replace function public.match_rag_chunks(
  query_embedding vector(1536),
  p_user_id uuid,
  p_sources text[] default array['document','contact','company','meeting_note'],
  match_count int default 8,
  match_threshold float default 0.35
)
returns table (
  chunk_id uuid,
  source_type text,      -- 'document' | 'contact' | 'company' | 'meeting_note'
  source_id uuid,        -- document_id hoặc entity_id
  label text,            -- tên file (+ effective_date) hoặc tên entity (để hiển thị citation)
  page_number int,       -- PDF; null cho DOCX/TXT
  section_title text,    -- DOCX/TXT (QĐ3); null cho PDF
  effective_date date,   -- ngày hiệu lực tài liệu (QĐ2); null cho danh bạ
  content text,
  similarity float
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'forbidden';
  end if;
  -- union document_chunks + business_chunks, filter user_id + p_sources,
  -- order by embedding <=> query_embedding, limit match_count
end;
$$;
```

Ngưỡng `match_threshold` mặc định 0.35 (cosine similarity) — đủ rộng để recall, LLM tự loại nhiễu; cấu hình được qua `ai_model_configs` capability `rag_chat` (`config.retrieval`).

**Quy tắc ưu tiên phiên bản (QĐ1, QĐ2)**: khi cùng `document_type` có nhiều tài liệu, kết quả truy xuất sắp xếp ưu tiên `effective_date DESC, documents.created_at DESC` sau khi lọc similarity; application-layer nêu rõ bản đang dùng (tên file + ngày hiệu lực) trong context và citation (QĐ2). Khi số liệu các bản mâu thuẫn nhau, chỉ dùng và chỉ trích dẫn bản mới nhất — không trình bày nguồn mâu thuẫn (QĐ1, đúng spec FR-006).

## RLS (mọi bảng mới)

```sql
alter table public.<table> enable row level security;
create policy "<table>_owner_all" on public.<table>
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Storage bucket `documents` (private): policy insert/select/delete trên `storage.objects` với `bucket_id = 'documents'` và path bắt đầu bằng `auth.uid()::text || '/'`.

## Quan hệ (ER tóm tắt)

```text
auth.users 1──* documents 1──* document_chunks
auth.users 1──* business_chunks (entity_type/entity_id → contacts|companies|meeting_notes, liên kết logic)
auth.users 1──* rag_index_queue
auth.users 1──* chat_conversations 1──* chat_messages
```

## Ràng buộc toàn vẹn

- Xóa user → cascade xóa toàn bộ (FK on delete cascade).
- Xóa document → cascade chunks + application xóa file Storage.
- Xóa contact/company/note → application enqueue `rag_index_queue(operation='delete')` → worker xóa `business_chunks` tương ứng.
- Hồ sơ **xóa mềm** (`contacts.archived_at`, `meeting_notes.deleted_at` not null) → worker bỏ qua khi build chunk và xóa chunk đã index (coi như `delete`).
- Giới hạn 100 tài liệu/user: kiểm tra application-level khi upload (mã lỗi `quota_exceeded`, 403), không đặt check constraint DB để dễ điều chỉnh.
- `embedding` null = chunk chưa index xong → RPC bỏ qua (`where embedding is not null`); UI báo "đang xử lý" khi còn chunk null/queue pending (spec story 5).
- Worker re-index chu kỳ ≤ 5 phút để đáp ứng FR-010 (dữ liệu danh bạ mới có hiệu lực trong vòng 5 phút).
