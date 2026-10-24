import 'server-only';

import { createGateway, embedMany } from 'ai';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getAiModelConfig, getGatewayApiKey } from '../model-config';

/**
 * Embedding cho RAG chatbot (T002).
 *
 * - Model đọc từ `ai_model_configs` capability `rag_embeddings` của user,
 *   fallback env `RAG_EMBEDDING_MODEL`, mặc định `openai/text-embedding-3-small`
 *   (1536 chiều — khớp cột `vector(1536)` của migration RAG).
 * - Lỗi embed được ném ra để caller (ingest/retrieval) xử lý
 *   (ví dụ ingest set state `failed`, retrieval báo lỗi thân thiện).
 */
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

export async function resolveEmbeddingModel(userId: string): Promise<string> {
  try {
    const supabase = getSupabaseServerClient();
    const row = await getAiModelConfig('rag_embeddings', userId, supabase);
    const model = (row?.model ?? '').trim();
    if (model) return model;
  } catch {
    // Bỏ qua lỗi đọc config — dùng fallback env/mặc định.
  }
  return (process.env.RAG_EMBEDDING_MODEL ?? '').trim() || DEFAULT_EMBEDDING_MODEL;
}

function resolveGateway() {
  const apiKey = getGatewayApiKey();
  if (!apiKey) {
    throw new Error(
      'Thiếu AI_GATEWAY_API_KEY — chưa thể tạo embedding. Hãy cấu hình AI Gateway trước.',
    );
  }
  return createGateway({ apiKey });
}

/**
 * Tạo embedding cho một loạt text bằng cùng một model.
 * Trả về mảng embedding theo đúng thứ tự input.
 */
export async function embedTexts(
  userId: string,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const gateway = resolveGateway();
  const modelId = await resolveEmbeddingModel(userId);
  try {
    const { embeddings } = await embedMany({
      model: gateway.textEmbeddingModel(modelId),
      values: texts,
    });
    return embeddings;
  } catch (error) {
    throw new Error(
      `Không tạo được embedding (${modelId}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** Tạo embedding cho câu truy vấn của người dùng. */
export async function embedQuery(
  userId: string,
  query: string,
): Promise<number[]> {
  const [embedding] = await embedTexts(userId, [query]);
  if (!embedding) {
    throw new Error('Không tạo được embedding cho truy vấn.');
  }
  return embedding;
}
