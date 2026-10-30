import 'server-only';

import {
  EMBEDDING_DIRECT_PROVIDERS,
  getGatewayApiKey,
  listDirectProviders,
} from './model-config';

/**
 * Danh mục model AI cho trang Cài đặt → Mô hình AI.
 *
 * - Nguồn live: AI Gateway công khai endpoint `GET /v1/models` (không cần
 *   key; truyền Bearer khi có AI_GATEWAY_API_KEY). Lấy 480+ model thật,
 *   phân nhóm theo provider, cache 10 phút trong bộ nhớ tiến trình — danh
 *   sách tự cập nhật theo thời gian mà không phải sửa code.
 * - Nguồn tĩnh: danh sách model thế hệ hiện tại đã biết, dùng khi fetch lỗi
 *   (offline). Người dùng vẫn có thể nhập model khác tay trong UI.
 */

export interface DirectProviderCatalogEntry {
  /** Id khớp `DirectProviderId` trong model-config. */
  id: string;
  label: string;
  /** Biến môi trường chứa API key cần thiết (hint cho UI). */
  apiKeyEnv: string;
  supportsBaseUrl: boolean;
  models: string[];
  /** Model có khả năng đọc ảnh (dùng cho nhận dạng danh thiếp). */
  visionModels: string[];
  /** Model embedding (dùng cho RAG) — rỗng với provider không hỗ trợ. */
  embeddingModels: string[];
}

export interface ModelCatalog {
  /** 'gateway' khi danh sách lấy live từ AI Gateway, 'static' khi fetch lỗi. */
  source: 'gateway' | 'static';
  directProviders: DirectProviderCatalogEntry[];
  /** Model plain của OpenAI (provider = "openai"), giữ để tương thích. */
  openaiModels: string[];
  /** Model qua AI Gateway cho chat/enrichment (format "provider/model"). */
  gatewayModels: string[];
  /** Model qua AI Gateway có khả năng đọc ảnh (nhận dạng danh thiếp). */
  visionModels: string[];
  /** Model embedding qua AI Gateway (RAG). */
  embeddingModels: string[];
}

/**
 * Danh sách tĩnh — thế hệ model hiện tại (10/2026), lấy từ catalog của AI
 * Gateway; chỉ dùng khi fetch live lỗi. Không liệt kê biến thể -batch.
 */
const STATIC_DIRECT_MODELS: Record<string, string[]> = {
  openai: [
    'gpt-6.1-sol',
    'gpt-6-sol',
    'gpt-6-luna',
    'gpt-6-astra',
    'gpt-5.4',
    'gpt-5.2',
    'gpt-5.2-pro',
    'gpt-5.1-thinking',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-4.1',
    'gpt-4o',
    'o4-mini',
  ],
  anthropic: [
    'claude-opus-5.5',
    'claude-opus-5',
    'claude-sonnet-5.5',
    'claude-haiku-5.5',
    'claude-opus-4.6',
    'claude-sonnet-4.6',
  ],
  google: [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-2.5-pro',
  ],
  xai: ['grok-4', 'grok-3', 'grok-3-mini'],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
  ],
  mistral: [
    'mistral-large-4',
    'mistral-large-3',
    'mistral-medium-3.5',
    'mistral-small',
  ],
  deepseek: [
    'deepseek-v4.1-flash',
    'deepseek-v4-pro',
    'deepseek-v3.2',
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  perplexity: ['sonar', 'sonar-pro', 'sonar-reasoning-pro'],
  togetherai: [
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'Qwen/Qwen2.5-72B-Instruct-Turbo',
    'deepseek-ai/DeepSeek-V3',
  ],
  fireworks: [
    'accounts/fireworks/models/llama-v3p3-70b-instruct',
    'accounts/fireworks/models/kimi-k2-instruct',
  ],
  cohere: ['command-a', 'command-r-plus-08-2024'],
  cerebras: ['llama3.3-70b', 'llama3.1-8b', 'gpt-oss-120b'],
};

/** Model embedding tĩnh cho các provider trực tiếp có SDK hỗ trợ. */
const STATIC_DIRECT_EMBEDDINGS: Record<string, string[]> = {
  openai: ['text-embedding-3-small', 'text-embedding-3-large'],
  google: ['gemini-embedding-001', 'gemini-embedding-2', 'text-embedding-005'],
  mistral: ['mistral-embed', 'codestral-embed'],
  cohere: ['embed-v4.0', 'embed-v5.0-fast'],
};

const GATEWAY_MODELS = [
  'openai/gpt-5.4',
  'openai/gpt-5.2',
  'openai/gpt-5.2-pro',
  'openai/gpt-5.1-thinking',
  'openai/gpt-5-mini',
  'openai/gpt-4o',
  'anthropic/claude-opus-5.5',
  'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-haiku-5.5',
  'google/gemini-3.8-flash',
  'google/gemini-3.5-flash',
  'google/gemini-2.5-pro',
  'xai/grok-4',
  'deepseek/deepseek-v4.1-flash',
  'deepseek/deepseek-v3.2',
  'zai/glm-5.3',
  'zai/glm-4.6',
  'mistral/mistral-large-4',
  'cohere/command-a',
];

const VISION_MODEL_PATTERN =
  /gpt-4o|gpt-4\.1|gpt-5|gpt-6|o3|o4-mini|claude|gemini|grok-4|glm-4\.6|glm-5|vision|-vl\b/i;

const EMBEDDING_MODEL_PATTERN = /embed/i;

const GATEWAY_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
const GATEWAY_CACHE_MS = 10 * 60 * 1000;

let gatewayCache: { at: number; models: string[] | null } | null = null;

/** Biến thể chỉ dùng cho batch pricing — không chọn được trong UI thường. */
function isBatchVariant(id: string): boolean {
  return id.endsWith('-batch');
}

/**
 * Gọi AI Gateway lấy danh sách model thật. Endpoint công khai — không cần
 * key; có AI_GATEWAY_API_KEY thì vẫn truyền Bearer. Trả null khi fetch lỗi.
 */
async function fetchGatewayModels(): Promise<string[] | null> {
  if (gatewayCache && Date.now() - gatewayCache.at < GATEWAY_CACHE_MS) {
    return gatewayCache.models;
  }

  try {
    const apiKey = getGatewayApiKey();
    const res = await fetch(GATEWAY_MODELS_URL, {
      ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
      signal: AbortSignal.timeout(8000),
    });
    const models: string[] | null = res.ok
      ? ((await res.json())?.data ?? [])
          .map((m: { id?: unknown }) => (typeof m?.id === 'string' ? m.id : ''))
          .filter((id: string) => id.includes('/') && !isBatchVariant(id))
      : null;
    gatewayCache = { at: Date.now(), models };
    return models;
  } catch {
    gatewayCache = { at: Date.now(), models: null };
    return null;
  }
}

function dedupeSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function buildDirectProviders(live: string[] | null): DirectProviderCatalogEntry[] {
  return listDirectProviders().map((meta) => {
    const staticModels = STATIC_DIRECT_MODELS[meta.id] ?? [];
    // Live: model của provider này theo prefix gateway, bỏ prefix để có id
    // plain (provider trực tiếp gọi không cần "openai/...").
    const liveModels = live
      ? live
          .filter((id) => id.startsWith(`${meta.id}/`))
          .map((id) => id.slice(meta.id.length + 1))
      : [];
    const models = dedupeSorted([...staticModels, ...liveModels]);
    return {
      id: meta.id,
      label: meta.label,
      apiKeyEnv: meta.apiKeyEnv,
      supportsBaseUrl: meta.supportsBaseUrl,
      models,
      visionModels: models.filter((id) => VISION_MODEL_PATTERN.test(id)),
      embeddingModels: EMBEDDING_DIRECT_PROVIDERS.includes(
        meta.id as (typeof EMBEDDING_DIRECT_PROVIDERS)[number],
      )
        ? dedupeSorted([
            ...(STATIC_DIRECT_EMBEDDINGS[meta.id] ?? []),
            ...liveModels.filter((id) => EMBEDDING_MODEL_PATTERN.test(id)),
          ])
        : [],
    };
  });
}

/**
 * Trả về danh mục model: live từ AI Gateway khi được (source = 'gateway'),
 * fallback danh sách tĩnh khi fetch lỗi.
 */
export async function getModelCatalog(): Promise<ModelCatalog> {
  const live = await fetchGatewayModels();
  const directProviders = buildDirectProviders(live);

  if (!live || live.length === 0) {
    return {
      source: 'static',
      directProviders,
      openaiModels: STATIC_DIRECT_MODELS['openai'] ?? [],
      gatewayModels: GATEWAY_MODELS,
      visionModels: GATEWAY_MODELS.filter((id) =>
        VISION_MODEL_PATTERN.test(id),
      ),
      embeddingModels: GATEWAY_MODELS.filter((id) =>
        EMBEDDING_MODEL_PATTERN.test(id),
      ),
    };
  }

  const gatewayModels = dedupeSorted([...GATEWAY_MODELS, ...live]);

  return {
    source: 'gateway',
    directProviders,
    openaiModels: STATIC_DIRECT_MODELS['openai'] ?? [],
    gatewayModels,
    visionModels: gatewayModels.filter((id) => VISION_MODEL_PATTERN.test(id)),
    embeddingModels: gatewayModels.filter((id) =>
      EMBEDDING_MODEL_PATTERN.test(id),
    ),
  };
}
