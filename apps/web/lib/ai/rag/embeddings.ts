import 'server-only';

import { embedMany } from 'ai';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  createEmbeddingModel,
  getAiModelConfig,
} from '../model-config';

/**
 * Embedding cho RAG chatbot (T002).
 *
 * - Provider + model đọc từ `ai_model_configs` capability `rag_embeddings`
 *   của user (provider: "gateway" mặc định, hoặc "openai", "google",
 *   "mistral", "cohere" gọi trực tiếp), fallback env `RAG_EMBEDDING_PROVIDER`
 *   + `RAG_EMBEDDING_MODEL`, mặc định gateway +
 *   `openai/text-embedding-3-small` (1536 chiều — khớp cột `vector(1536)`
 *   của migration RAG; đổi model khác kích thước là phải index lại).
 * - Lỗi embed được ném ra để caller (ingest/retrieval) xử lý
 *   (ví dụ ingest set state `failed`, retrieval báo lỗi thân thiện).
 */
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

interface ResolvedEmbedding {
  provider: string;
  model: string;
  baseUrl: string | null;
}

export async function resolveEmbeddingModel(userId: string): Promise<string> {
  return (await resolveEmbeddingConfig(userId)).model;
}

async function resolveEmbeddingConfig(userId: string): Promise<ResolvedEmbedding> {
  try {
    const supabase = getSupabaseServerClient();
    const row = await getAiModelConfig('rag_embeddings', userId, supabase);
    if (row) {
      return {
        provider: (row.provider ?? 'gateway').trim().toLowerCase() || 'gateway',
        model: (row.model ?? '').trim(),
        baseUrl:
          typeof row.config.base_url === 'string' && row.config.base_url.trim()
            ? row.config.base_url.trim()
            : null,
      };
    }
  } catch {
    // Bỏ qua lỗi đọc config — dùng fallback env/mặc định.
  }
  return {
    provider:
      (process.env.RAG_EMBEDDING_PROVIDER ?? '').trim().toLowerCase() || 'gateway',
    model:
      (process.env.RAG_EMBEDDING_MODEL ?? '').trim() || DEFAULT_EMBEDDING_MODEL,
    baseUrl: null,
  };
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
  const config = await resolveEmbeddingConfig(userId);
  const embeddingModel = createEmbeddingModel(config.provider, {
    model: config.model,
    baseUrl: config.baseUrl,
  });
  try {
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: texts,
    });
    return embeddings;
  } catch (error) {
    throw new Error(
      `Không tạo được embedding (${config.provider}/${config.model}): ${
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
