import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { embedQuery } from './embeddings';
import { getAiModelConfig } from '../model-config';

/**
 * Retrieval RAG có trích dẫn (T006, theo QĐ1–QĐ3).
 *
 * Luồng:
 * 1. Embed câu query bằng cùng model `embeddings.ts`.
 * 2. Gọi RPC `match_rag_chunks` (security definer, tự kiểm tra
 *    `auth.uid() = p_user_id` — FR-014), lọc similarity theo ngưỡng
 *    (mặc định 0.35, cấu hình được qua `ai_model_configs` capability
 *    `rag_chat`, key `similarity_threshold`).
 * 3. QĐ2: nhiều document cùng `document_type` → chỉ giữ bản mới nhất
 *    (`effective_date` DESC, rồi `created_at` DESC); citation ghi rõ phiên bản.
 * 4. QĐ1: tài liệu đứng trước danh bạ trong context — khi cần trả lời theo
 *    tài liệu thì chỉ trích dẫn tài liệu mới nhất, không trộn dữ liệu danh bạ
 *    mâu thuẫn (quy tắc trình bày cuối cùng do system prompt của T007).
 * 5. Trả `{ chunks, citations }` với citation theo QĐ3.
 */

export type RagSourceType = 'document' | 'contact' | 'company' | 'meeting_note';

export interface RagChunk {
  chunk_id: string;
  source_type: RagSourceType;
  /** Id tài liệu (documents.id) hoặc entity danh bạ. */
  source_id: string;
  /** Tên file tài liệu hoặc tên hồ sơ danh bạ. */
  label: string;
  document_type: string | null;
  effective_date: string | null;
  section_title: string | null;
  page_number: number | null;
  content: string;
  similarity: number;
}

export interface DocumentCitation {
  source_type: 'document';
  /**
   * Tên file + loại tài liệu + ngày hiệu lực (QĐ2 — nêu rõ phiên bản đang dùng),
   * ví dụ: "bang-gia-2026.pdf (price_list, hiệu lực 2026-01-01)".
   */
  label: string;
  /** PDF: số trang (QĐ3). */
  page_number?: number;
  /** DOCX/TXT: tiêu đề mục/đoạn gần nhất (QĐ3). */
  section_title?: string;
  effective_date?: string;
}

export interface BusinessCitation {
  source_type: 'contact' | 'company' | 'meeting_note';
  /** Tên hồ sơ liên hệ/công ty hoặc tiêu đề ghi chú cuộc gặp. */
  label: string;
}

export type RagCitation = DocumentCitation | BusinessCitation;

export interface RetrieveContextResult {
  chunks: RagChunk[];
  citations: RagCitation[];
}

/** Ngưỡng similarity mặc định khi chưa có cấu hình. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.35;

/** Dạng row trả về từ RPC `match_rag_chunks` (migration T001). */
export interface MatchRow {
  chunk_id: string;
  source_type: RagSourceType;
  source_id: string;
  label: string;
  document_type: string | null;
  effective_date: string | null;
  section_title: string | null;
  page_number: number | null;
  content: string;
  similarity: number;
}

/**
 * Đọc ngưỡng similarity từ `ai_model_configs` (capability `rag_chat`,
 * `config.retrieval.threshold` theo data-model, hoặc `config.similarity_threshold`
 * ở top-level); fallback 0.35 khi chưa có cấu hình hợp lệ.
 */
async function resolveSimilarityThreshold(
  userId: string,
  supabase: SupabaseClient,
): Promise<number> {
  try {
    const row = await getAiModelConfig('rag_chat', userId, supabase);
    const config = row?.config ?? {};
    const retrieval = (config as Record<string, unknown>)['retrieval'];
    const raw =
      (retrieval && typeof retrieval === 'object'
        ? (retrieval as Record<string, unknown>)['threshold']
        : undefined) ?? (config as Record<string, unknown>)['similarity_threshold'];
    const value = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1) {
      return value;
    }
  } catch {
    // Bỏ qua — dùng ngưỡng mặc định.
  }
  return DEFAULT_SIMILARITY_THRESHOLD;
}

/**
 * Lấy `created_at` của các tài liệu được match để sắp xếp theo
 * `effective_date` DESC rồi `created_at` DESC (QĐ2).
 */
async function fetchDocumentCreatedAt(
  supabase: SupabaseClient,
  documentIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (documentIds.length === 0) return map;
  try {
    const { data } = await supabase
      .from('documents')
      .select('id, created_at')
      .in('id', documentIds);
    for (const row of (data ?? []) as { id: string; created_at: string }[]) {
      map.set(row.id, row.created_at);
    }
  } catch {
    // Bỏ qua — sắp xếp chỉ theo effective_date.
  }
  return map;
}

function documentVersionRank(
  row: MatchRow,
  createdAtByDoc: Map<string, string>,
): string {
  // Chuỗi so sánh: effective_date DESC rồi created_at DESC.
  return `${row.effective_date ?? ''}|${createdAtByDoc.get(row.source_id) ?? ''}`;
}

/**
 * QĐ2: mỗi document_type chỉ giữ các chunk của bản mới nhất
 * (effective_date DESC, rồi created_at DESC). Hàm pure để unit test.
 */
export function selectNewestDocumentRows(
  documentRows: MatchRow[],
  createdAtByDoc: Map<string, string>,
): MatchRow[] {
  const newestByType = new Map<string, MatchRow>();
  for (const row of documentRows) {
    const key = row.document_type ?? '__none__';
    const current = newestByType.get(key);
    if (
      !current ||
      documentVersionRank(row, createdAtByDoc) > documentVersionRank(current, createdAtByDoc)
    ) {
      newestByType.set(key, row);
    }
  }
  const newestDocIds = new Set(
    [...newestByType.values()].map((row) => row.source_id),
  );
  return documentRows
    .filter((row) => newestDocIds.has(row.source_id))
    .sort(
      (a, b) =>
        documentVersionRank(b, createdAtByDoc).localeCompare(
          documentVersionRank(a, createdAtByDoc),
        ) || b.similarity - a.similarity,
    );
}

/**
 * Truy xuất context cho câu hỏi chat.
 *
 * @param userId Id người dùng (FR-014: chỉ lấy dữ liệu của chính user).
 * @param query Câu hỏi của người dùng.
 * @param topK Số chunk tối đa đưa vào context (mặc định 8).
 */
export async function retrieveContext(
  userId: string,
  query: string,
  topK = 8,
): Promise<RetrieveContextResult> {
  const supabase = getSupabaseServerClient();

  const embedding = await embedQuery(userId, query);
  const threshold = await resolveSimilarityThreshold(userId, supabase);

  // RPC là security definer và tự kiểm tra auth.uid() = p_user_id (FR-014).
  const { data, error } = await (supabase as SupabaseClient).rpc(
    'match_rag_chunks',
    {
      query_embedding: embedding,
      p_user_id: userId,
      match_count: topK,
      match_threshold: threshold,
    },
  );
  if (error) {
    throw new Error(`Không truy xuất được ngữ cảnh RAG: ${error.message}`);
  }

  const rows = ((data ?? []) as MatchRow[]).filter(
    (row) => typeof row.similarity === 'number' && row.similarity >= threshold,
  );

  const documentRows = rows.filter((row) => row.source_type === 'document');
  const businessRows = rows.filter((row) => row.source_type !== 'document');

  // QĐ2: mỗi document_type chỉ giữ bản mới nhất
  // (effective_date DESC, rồi created_at DESC).
  const docIds = [...new Set(documentRows.map((row) => row.source_id))];
  const createdAtByDoc = await fetchDocumentCreatedAt(supabase, docIds);
  const keptDocumentRows = selectNewestDocumentRows(documentRows, createdAtByDoc);

  // QĐ1: tài liệu đứng trước danh bạ trong context (ưu tiên nguồn tài liệu).
  const ordered: MatchRow[] = [
    ...keptDocumentRows,
    ...businessRows.sort((a, b) => b.similarity - a.similarity),
  ].slice(0, Math.max(1, topK));

  const chunks: RagChunk[] = ordered.map((row) => ({
    chunk_id: row.chunk_id,
    source_type: row.source_type,
    source_id: row.source_id,
    label: row.label,
    document_type: row.document_type,
    effective_date: row.effective_date,
    section_title: row.section_title,
    page_number: row.page_number,
    content: row.content,
    similarity: row.similarity,
  }));

  // QĐ3: đơn vị trích dẫn theo loại file.
  const citations: RagCitation[] = ordered.map((row) => {
    if (row.source_type === 'document') {
      // QĐ2: label ghi rõ phiên bản đang dùng (tên file + loại + ngày hiệu lực).
      const version =
        [row.document_type, row.effective_date ? `hiệu lực ${row.effective_date}` : null]
          .filter(Boolean)
          .join(', ');
      const citation: DocumentCitation = {
        source_type: 'document',
        label: version ? `${row.label} (${version})` : row.label,
      };
      // QĐ3: PDF có page_number; DOCX/TXT có section_title.
      if (typeof row.page_number === 'number') citation.page_number = row.page_number;
      if (row.section_title) citation.section_title = row.section_title;
      if (row.effective_date) citation.effective_date = row.effective_date;
      return citation;
    }
    return {
      source_type: row.source_type,
      label: row.label,
    } satisfies BusinessCitation;
  });

  return { chunks, citations };
}
