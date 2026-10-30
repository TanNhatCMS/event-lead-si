import 'server-only';

import { embedMany } from 'ai';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  getAiModelConfig,
  getProviderCredential,
  parseModelFallbacks,
  type AiModelConfigSource,
  type ModelFallbackSpec,
} from '../model-config';
import {
  buildModelChain,
  ModelFailoverError,
  runWithEmbeddingFailover,
} from '../model-failover';
import { recordUsage } from '../usage';

/**
 * Embedding cho RAG chatbot (T002).
 *
 * - Provider + model đọc từ `ai_model_configs` capability `rag_embeddings`
 *   của user (provider: "gateway" mặc định, hoặc "openai", "google",
 *   "mistral", "cohere" gọi trực tiếp), fallback env `RAG_EMBEDDING_PROVIDER`
 *   + `RAG_EMBEDDING_MODEL`, mặc định gateway +
 *   `openai/text-embedding-3-small` (1536 chiều — khớp cột `vector(1536)`
 *   của migration RAG; đổi model khác kích thước là phải index lại).
 * - FAILOVER: chạy qua chuỗi model dự phòng (`config.fallbacks` của
 *   capability) và xoay TỪNG API key của provider (DB đa key + legacy + env)
 *   bằng `runWithEmbeddingFailover` — lỗi retryable (429/5xx/mạng/quota) thì
 *   thử key kế rồi model kế.
 * - Lỗi embed được ném ra để caller (ingest/retrieval) xử lý
 *   (ví dụ ingest set state `failed`, retrieval báo lỗi thân thiện).
 */
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

interface ResolvedEmbedding {
  provider: string;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
  source: AiModelConfigSource;
  fallbacks: ModelFallbackSpec[];
}

export async function resolveEmbeddingModel(userId: string): Promise<string> {
  return (await resolveEmbeddingConfig(userId)).model;
}

async function resolveEmbeddingConfig(userId: string): Promise<ResolvedEmbedding> {
  try {
    const supabase = getSupabaseServerClient();
    const row = await getAiModelConfig('rag_embeddings', userId, supabase);
    if (row) {
      const provider = (row.provider ?? 'gateway').trim().toLowerCase() || 'gateway';
      return {
        provider,
        model: (row.model ?? '').trim(),
        baseUrl:
          typeof row.config.base_url === 'string' && row.config.base_url.trim()
            ? row.config.base_url.trim()
            : null,
        apiKey: await getProviderCredential(provider, userId, supabase),
        source: 'database',
        fallbacks: parseModelFallbacks(row.config.fallbacks),
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
    apiKey: null,
    source: 'env',
    fallbacks: [],
  };
}

/**
 * Tạo embedding cho một loạt text bằng cùng một model.
 * Trả về mảng embedding theo đúng thứ tự input.
 *
 * Chạy qua chuỗi failover (model dự phòng + xoay API key): mỗi attempt tạo
 * embedding model mới với key tường minh rồi gọi `embedMany` một lần.
 */
export async function embedTexts(
  userId: string,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const config = await resolveEmbeddingConfig(userId);
  const supabase = getSupabaseServerClient();
  const chain = await buildModelChain({
    userId,
    supabase,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      source: config.source,
      fallbacks: config.fallbacks,
    },
  });
  try {
    // Đo latency và bắt token usage của embedMany (chỉ có input tokens).
    const startedAt = Date.now();
    let usageTokens = 0;
    const { result, used } = await runWithEmbeddingFailover({
      chain,
      execute: async (embeddingModel) => {
        const { embeddings, usage } = await embedMany({
          model: embeddingModel,
          values: texts,
        });
        usageTokens = usage?.tokens ?? 0;
        return embeddings;
      },
    });
    // Thống kê token/chi phí — best-effort (recordUsage tự nuốt lỗi).
    await recordUsage({
      userId,
      source: 'embeddings',
      provider: used.provider,
      model: used.model,
      usage: { inputTokens: usageTokens, outputTokens: 0, totalTokens: usageTokens },
      latencyMs: Date.now() - startedAt,
      supabase,
    });
    return result;
  } catch (error) {
    if (error instanceof ModelFailoverError) {
      // Message tĩnh + chi tiết từng lần thử ở field `attempts`.
      throw error;
    }
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
