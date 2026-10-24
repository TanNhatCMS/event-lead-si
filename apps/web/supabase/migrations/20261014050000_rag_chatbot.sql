-- Migration: RAG chatbot schema (T001 — spec 002-rag-chatbot)
--
-- 6 bảng: documents, document_chunks, business_chunks, rag_index_queue,
-- chat_conversations, chat_messages. RLS owner-only (auth.uid() = user_id)
-- cho cả 6 bảng (FR-014). Index HNSW cho 2 bảng chunk. RPC match_rag_chunks
-- (security definer, kiểm tra auth.uid() = p_user_id đầu hàm). Bucket
-- documents private 25MB (PDF/DOCX/TXT) + storage policies theo
-- (storage.foldername(name))[1]::uuid = auth.uid().
--
-- Áp dụng thủ công trên Supabase (issue #35), KHÔNG apply tự động.

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Bảng documents: metadata tài liệu upload (QĐ2: document_type + effective_date bắt buộc)
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  )),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  page_count integer,
  document_type text not null check (document_type in (
    'price_list', 'catalogue', 'contract_template', 'capability_profile', 'other'
  )),
  effective_date date not null,
  status text not null default 'uploaded' check (status in (
    'uploaded', 'processing', 'ready', 'failed', 'needs_ocr'
  )),
  error_message text,
  chunk_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_id_created_idx on public.documents (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Bảng document_chunks: chunk vector của tài liệu
-- ---------------------------------------------------------------------------
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null,
  page_number integer,
  section_title text,
  content text not null,
  embedding vector(1536),
  embedding_model text,
  embedding_version integer,
  unique (document_id, chunk_index)
);
create index document_chunks_document_idx on public.document_chunks (document_id);
create index document_chunks_embedding_hnsw on public.document_chunks
  using hnsw (embedding vector_cosine_ops) where (embedding is not null);

-- ---------------------------------------------------------------------------
-- Bảng business_chunks: chunk vector của danh bạ (contact/company/meeting_note)
-- ---------------------------------------------------------------------------
create table public.business_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact', 'company', 'meeting_note')),
  entity_id uuid not null,
  content text not null,
  embedding vector(1536),
  embedding_model text,
  embedding_version integer,
  updated_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);
create index business_chunks_embedding_hnsw on public.business_chunks
  using hnsw (embedding vector_cosine_ops) where (embedding is not null);

-- ---------------------------------------------------------------------------
-- Bảng rag_index_queue: hàng đợi index danh bạ (worker xử lý theo lịch)
-- ---------------------------------------------------------------------------
create table public.rag_index_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact', 'company', 'meeting_note')),
  entity_id uuid not null,
  operation text not null check (operation in ('upsert', 'delete')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rag_index_queue_pending_idx on public.rag_index_queue (status, created_at)
  where (status = 'pending');

-- ---------------------------------------------------------------------------
-- Bảng chat_conversations / chat_messages: lịch sử chat RAG
-- ---------------------------------------------------------------------------
create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_conversations_user_id_updated_idx
  on public.chat_conversations (user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS owner-only cho cả 6 bảng (FR-014)
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.business_chunks enable row level security;
alter table public.rag_index_queue enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

create policy documents_owner_access on public.documents for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy document_chunks_owner_access on public.document_chunks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy business_chunks_owner_access on public.business_chunks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy rag_index_queue_owner_access on public.rag_index_queue for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy chat_conversations_owner_access on public.chat_conversations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy chat_messages_owner_access on public.chat_messages for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- RPC match_rag_chunks: truy xuất vector hợp nhất tài liệu + danh bạ (FR-014)
-- security definer nhưng KIỂM TRA auth.uid() = p_user_id ngay đầu hàm.
-- ---------------------------------------------------------------------------
create or replace function public.match_rag_chunks(
  query_embedding vector(1536),
  p_user_id uuid,
  p_sources text[] default array['document', 'contact', 'company', 'meeting_note'],
  match_count integer default 8,
  match_threshold double precision default 0.35
)
returns table (
  chunk_id uuid,
  source_type text,
  source_id uuid,
  label text,
  document_type text,
  effective_date date,
  section_title text,
  page_number integer,
  content text,
  similarity double precision
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- FR-014: chặn ngay nếu caller không phải chủ dữ liệu.
  if (select auth.uid()) is distinct from p_user_id then
    raise exception 'not authorized';
  end if;

  return query
  (
    select
      dc.id as chunk_id,
      'document'::text as source_type,
      d.id as source_id,
      d.file_name as label,
      d.document_type as document_type,
      d.effective_date as effective_date,
      dc.section_title as section_title,
      dc.page_number as page_number,
      dc.content as content,
      (1 - (dc.embedding <=> query_embedding))::double precision as similarity
    from public.document_chunks dc
    join public.documents d on d.id = dc.document_id
    where dc.user_id = p_user_id
      and dc.embedding is not null
      and d.status = 'ready'
      and 'document' = any (p_sources)
      and (1 - (dc.embedding <=> query_embedding)) >= match_threshold
  )
  union all
  (
    select
      bc.id as chunk_id,
      bc.entity_type as source_type,
      bc.entity_id as source_id,
      -- Dòng đầu của content template là nhãn nguồn
      -- ("Hồ sơ liên hệ: <tên>" | "Công ty: <tên>" | "Ghi chú ...").
      split_part(bc.content, chr(10), 1) as label,
      null::text as document_type,
      null::date as effective_date,
      null::text as section_title,
      null::integer as page_number,
      bc.content as content,
      (1 - (bc.embedding <=> query_embedding))::double precision as similarity
    from public.business_chunks bc
    where bc.user_id = p_user_id
      and bc.embedding is not null
      -- entity_type chỉ là contact/company/meeting_note nên `= any (p_sources)`
      -- đã đủ (không bao giờ trùng 'document').
      and bc.entity_type = any (p_sources)
      and (1 - (bc.embedding <=> query_embedding)) >= match_threshold
  )
  order by similarity desc
  limit greatest(match_count, 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Bucket documents: file tài liệu upload. Quy ước storage path:
-- {user_id}/{doc_id}/{file_name} nên foldername(name)[1] là uuid của chủ sở hữu.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy documents_select on storage.objects for select to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1]::uuid = (select auth.uid()));
create policy documents_insert on storage.objects for insert to authenticated
with check (bucket_id = 'documents' and (storage.foldername(name))[1]::uuid = (select auth.uid()));
create policy documents_update on storage.objects for update to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1]::uuid = (select auth.uid()))
with check (bucket_id = 'documents' and (storage.foldername(name))[1]::uuid = (select auth.uid()));
create policy documents_delete on storage.objects for delete to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1]::uuid = (select auth.uid()));
