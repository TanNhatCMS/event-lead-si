import 'server-only';

import { createGateway, embedMany } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';

import { getAiModelConfig, getGatewayApiKey } from '../enrichment/model-config';
import { extractDocument, type ExtractedPage } from './extract';

/**
 * Ingest nền cho tài liệu upload (T003) — chạy sau khi API đã trả 201.
 *
 * Luồng trạng thái: `uploaded → processing → ready | failed | needs_ocr`.
 * - Text rỗng (vd. PDF scan) → `needs_ocr` + error_message tiếng Việt.
 * - Lỗi bất kỳ → `failed` + error_message tiếng Việt.
 *
 * Idempotent: xóa chunks cũ của document trước khi index lại, nên chạy lại
 * trên document `failed` vẫn an toàn.
 *
 * Hàm KHÔNG BAO GIỜ ném lỗi ra ngoài — mọi thất bại được ghi vào
 * `documents.status`/`error_message` để UI polling hiển thị.
 */

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const EMBEDDING_VERSION = 1;
const EMBED_BATCH_SIZE = 64;
const INSERT_BATCH_SIZE = 100;

interface RagChunk {
  chunk_index: number;
  page_number: number | null;
  section_title: string | null;
  content: string;
}

type RagSupabaseClient = SupabaseClient<Database>;

function splitSentences(text: string): string[] {
  // Tách câu tiếng Việt, giữ dấu câu ở cuối câu.
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Recursive splitter ~1000 ký tự/chunk, overlap ~200: ngắt ưu tiên
 * đoạn văn → câu → từ; giữ `page_number` và `section_title` từng chunk.
 */
export function chunkPages(pages: ExtractedPage[]): RagChunk[] {
  const chunks: RagChunk[] = [];
  let chunkIndex = 0;

  const pushChunk = (
    page_number: number | null,
    section_title: string | null,
    content: string,
  ) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    chunks.push({ chunk_index: chunkIndex, page_number, section_title, content: trimmed });
    chunkIndex += 1;
  };

  for (const page of pages) {
    for (const section of page.sections) {
      const paragraphs = section.text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);

      let current = '';
      const flush = () => {
        if (current.trim()) {
          pushChunk(page.page_number, section.section_title, current);
          // Overlap: giữ đuôi chunk trước làm đầu chunk sau.
          const tail = current.slice(-CHUNK_OVERLAP);
          current = tail.length >= 50 ? tail : '';
        }
      };

      for (const paragraph of paragraphs) {
        if ((current + '\n\n' + paragraph).length <= CHUNK_SIZE) {
          current = current ? `${current}\n\n${paragraph}` : paragraph;
          continue;
        }
        // Đoạn văn quá dài → tách theo câu.
        for (const sentence of splitSentences(paragraph)) {
          if ((current + ' ' + sentence).length <= CHUNK_SIZE) {
            current = current ? `${current} ${sentence}` : sentence;
          } else {
            if (sentence.length > CHUNK_SIZE) {
              // Câu đơn quá dài → tách theo từ.
              flush();
              const words = sentence.split(/\s+/).filter(Boolean);
              let wordChunk = '';
              for (const word of words) {
                if ((wordChunk + ' ' + word).length <= CHUNK_SIZE) {
                  wordChunk = wordChunk ? `${wordChunk} ${word}` : word;
                } else {
                  pushChunk(page.page_number, section.section_title, wordChunk);
                  wordChunk = word;
                }
              }
              current = wordChunk;
            } else {
              flush();
              current = sentence;
            }
          }
        }
      }
      flush();
    }
  }
  return chunks;
}

async function embedTexts(
  texts: string[],
  userId: string,
  supabase: RagSupabaseClient,
): Promise<{ embeddings: number[][]; model: string }> {
  const apiKey = getGatewayApiKey();
  if (!apiKey) {
    throw new Error(
      'Chưa cấu hình AI Gateway (thiếu AI_GATEWAY_API_KEY) nên không tạo được embedding.',
    );
  }
  const config = await getAiModelConfig('rag_embeddings', userId, supabase);
  const modelName =
    (config?.enabled && config.model) ||
    process.env.RAG_EMBEDDING_MODEL ||
    'openai/text-embedding-3-small';

  const gateway = createGateway({ apiKey });
  const model = gateway.textEmbeddingModel(modelName);

  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const { embeddings: batchEmbeddings } = await embedMany({
      model,
      values: batch,
      maxRetries: 2,
    });
    embeddings.push(...batchEmbeddings);
  }
  return { embeddings, model: modelName };
}

function toFriendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.startsWith('Chưa ') || raw.startsWith('Không ')
    ? raw
    : `Xử lý tài liệu thất bại: ${raw}`;
  return message.slice(0, 500);
}

export interface IngestDocumentInput {
  documentId: string;
  userId: string;
  /** Supabase client đã gắn access token của user (tạo ở request scope). */
  supabase: RagSupabaseClient;
}

export async function ingestDocument(input: IngestDocumentInput): Promise<void> {
  const { documentId, userId, supabase } = input;

  const setStatus = async (patch: {
    status: string;
    error_message?: string | null;
    page_count?: number | null;
    chunk_count?: number;
  }) => {
    const { error } = await supabase
      .from('documents')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .eq('user_id', userId);
    if (error) {
      console.error('[rag-ingest] cập nhật trạng thái thất bại:', error.message);
    }
  };

  try {
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('id, storage_path, mime_type, file_name')
      .eq('id', documentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError || !doc) {
      console.error('[rag-ingest] không tìm thấy tài liệu:', documentId);
      return;
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.storage_path);

    if (downloadError || !blob) {
      throw new Error(
        `Không tải được file từ kho lưu trữ: ${downloadError?.message ?? 'lỗi không xác định.'}`,
      );
    }

    await setStatus({ status: 'processing', error_message: null });

    const buffer = Buffer.from(await blob.arrayBuffer());
    const extracted = await extractDocument(buffer, doc.mime_type);

    if (extracted.total_chars === 0) {
      await setStatus({
        status: 'needs_ocr',
        error_message: 'File không có nội dung chữ — cần OCR ở phase sau.',
      });
      return;
    }

    const chunks = chunkPages(extracted.pages);
    if (chunks.length === 0) {
      await setStatus({
        status: 'needs_ocr',
        error_message: 'File không có nội dung chữ — cần OCR ở phase sau.',
      });
      return;
    }

    // Idempotent: xóa chunks cũ trước khi index lại.
    const { error: clearError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId);
    if (clearError) {
      throw new Error(`Không xóa được chunks cũ: ${clearError.message}`);
    }

    const { embeddings, model } = await embedTexts(
      chunks.map((c) => c.content),
      userId,
      supabase,
    );

    for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + INSERT_BATCH_SIZE).map((chunk, j) => ({
        document_id: documentId,
        user_id: userId,
        chunk_index: chunk.chunk_index,
        page_number: chunk.page_number,
        section_title: chunk.section_title,
        content: chunk.content,
        embedding: embeddings[i + j] as unknown as string,
        embedding_model: model,
        embedding_version: EMBEDDING_VERSION,
      }));
      const { error: insertError } = await supabase
        .from('document_chunks')
        .insert(batch);
      if (insertError) {
        throw new Error(`Không lưu được chunks: ${insertError.message}`);
      }
    }

    await setStatus({
      status: 'ready',
      page_count: extracted.pages.length,
      chunk_count: chunks.length,
      error_message: null,
    });
  } catch (err) {
    console.error('[rag-ingest] ingest thất bại:', err);
    try {
      await setStatus({ status: 'failed', error_message: toFriendlyError(err) });
    } catch {
      // Bỏ qua — đã log ở trên.
    }
  }
}
