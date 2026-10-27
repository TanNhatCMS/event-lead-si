import 'server-only';

import { createGateway, type EmbeddingModel, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { createFireworks } from '@ai-sdk/fireworks';
import { createCohere } from '@ai-sdk/cohere';
import { createCerebras } from '@ai-sdk/cerebras';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';

import { isCardRecognitionEnabled } from '~/lib/ai/card-recognition';

/**
 * Nguồn cấu hình AI đang có hiệu lực cho một capability.
 * - "database": lấy từ bảng `ai_model_configs` của người dùng (ưu tiên).
 * - "env": fallback sang biến môi trường server khi chưa có dòng cấu hình.
 */
export type AiModelConfigSource = 'database' | 'env';

export interface AiModelConfigRow {
  id: string;
  user_id: string;
  capability: string;
  provider: string;
  model: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ResolvedCardRecognitionConfig {
  provider: string;
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
  /** Base URL tuỳ chọn cho provider trực tiếp (config.base_url trong DB). */
  baseUrl: string | null;
}

/**
 * Các provider trực tiếp mà AI SDK hỗ trợ và app gọi thẳng bằng package
 * `@ai-sdk/<provider>` (mỗi provider dùng API key env riêng).
 */
export type DirectProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'groq'
  | 'mistral'
  | 'deepseek'
  | 'perplexity'
  | 'togetherai'
  | 'fireworks'
  | 'cohere'
  | 'cerebras';

/**
 * Provider gọi model cho các capability dạng chat/vision:
 * - một `DirectProviderId`: gọi thẳng nhà cung cấp bằng `@ai-sdk/<provider>`.
 * - "openai-compatible": endpoint tương thích OpenAI tự trỏ (proxy/self-host),
 *   bắt buộc có base_url.
 * - "gateway": Vercel AI Gateway — một key (AI_GATEWAY_API_KEY) cho mọi nhà
 *   cung cấp, model dạng "provider/model".
 */
export type EnrichmentProvider = DirectProviderId | 'openai-compatible' | 'gateway';

export interface DirectProviderMeta {
  id: DirectProviderId;
  label: string;
  /** Biến môi trường chứa API key của provider (server only). */
  apiKeyEnv: string;
  /** Provider có chấp nhận base URL tuỳ chỉnh (proxy/self-host) không. */
  supportsBaseUrl: boolean;
}

interface DirectProviderDefinition extends DirectProviderMeta {
  create(input: {
    apiKey: string;
    baseUrl: string | null;
  }): (modelId: string) => LanguageModel;
}

/**
 * Registry provider trực tiếp — nguồn đơn nhất cho: kiểm tra credential,
 * tạo model, và danh sách lựa chọn ở trang Cài đặt → Mô hình AI.
 */
const DIRECT_PROVIDER_REGISTRY: Record<
  DirectProviderId,
  DirectProviderDefinition
> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createOpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createAnthropic({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    apiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createGoogleGenerativeAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  xai: {
    id: 'xai',
    label: 'xAI (Grok)',
    apiKeyEnv: 'XAI_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createXai({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    apiKeyEnv: 'GROQ_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createGroq({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    apiKeyEnv: 'MISTRAL_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createMistral({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createDeepSeek({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createPerplexity({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  togetherai: {
    id: 'togetherai',
    label: 'Together AI',
    apiKeyEnv: 'TOGETHER_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createTogetherAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks AI',
    apiKeyEnv: 'FIREWORKS_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createFireworks({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  cohere: {
    id: 'cohere',
    label: 'Cohere',
    apiKeyEnv: 'COHERE_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createCohere({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    supportsBaseUrl: true,
    create: ({ apiKey, baseUrl }) => {
      const provider = createCerebras({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return (modelId) => provider(modelId);
    },
  },
};

/** Danh sách provider trực tiếp cho UI/API (không kèm hàm tạo model). */
export function listDirectProviders(): DirectProviderMeta[] {
  return Object.values(DIRECT_PROVIDER_REGISTRY).map(
    ({ create: _create, ...meta }) => meta,
  );
}

/** Kiểm tra một chuỗi có phải id provider trực tiếp được hỗ trợ không. */
export function isDirectProviderId(
  value: string,
): value is DirectProviderId {
  return value in DIRECT_PROVIDER_REGISTRY;
}

const GATEWAY_PROVIDER_VALUES = new Set([
  'gateway',
  'vercel-gateway',
  'ai-gateway',
]);

/**
 * Chuẩn hoá giá trị provider từ DB/env. Giá trị nhận biết được được giữ
 * nguyên; mọi giá trị lạ/rỗng (vd "custom", "openai-compatible" viết sai)
 * về "openai" — mặc định theo quyết định người dùng 2026-10-24.
 */
export function normalizeEnrichmentProvider(
  raw: string | null | undefined,
): EnrichmentProvider {
  const value = (raw ?? '').trim().toLowerCase();
  if (GATEWAY_PROVIDER_VALUES.has(value)) {
    return 'gateway';
  }
  if (value === 'openai-compatible' || value === 'openai_compatible') {
    return 'openai-compatible';
  }
  if (value in DIRECT_PROVIDER_REGISTRY) {
    return value as DirectProviderId;
  }
  return 'openai';
}

export interface ResolvedEnrichmentConfig {
  /** Provider sẽ gọi model. */
  provider: EnrichmentProvider;
  /**
   * Model id theo provider: qua OpenAI là tên model của OpenAI,
   * ví dụ "gpt-5-mini"; qua Gateway ví dụ "anthropic/claude-sonnet-4-5".
   */
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
  /**
   * Địa chỉ gốc tuỳ chọn cho OpenAI (chỉ dùng khi provider = "openai"):
   * ưu tiên `config.base_url` trong DB, fallback env `OPENAI_BASE_URL`;
   * `null` = endpoint mặc định của OpenAI do SDK tự dùng.
   */
  baseUrl: string | null;
}

/**
 * Đọc cấu hình AI của người dùng từ bảng `ai_model_configs`.
 * Trả về `null` khi người dùng chưa cấu hình capability này (kể cả khi DB lỗi
 * hoặc bảng chưa tồn tại), để caller có thể fallback sang env.
 */
export async function getAiModelConfig(
  capability: string,
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<AiModelConfigRow | null> {
  try {
    const { data, error } = await supabase
      .from('ai_model_configs')
      .select(
        'id, user_id, capability, provider, model, enabled, config, created_at, updated_at',
      )
      .eq('user_id', userId)
      .eq('capability', capability)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Omit<AiModelConfigRow, 'config'> & { config: unknown };
    return {
      ...row,
      config: (row.config ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/**
 * Phân giải cấu hình nhận dạng danh thiếp đang có hiệu lực.
 * - Ưu tiên dòng DB (`capability = 'card_recognition'` của người dùng). Kể cả khi
 *   dòng đó có `enabled = false` thì vẫn là "database" — người dùng đã quyết định tắt.
 * - Fallback sang env (`CARD_RECOGNITION_PROVIDER`, `CARD_RECOGNITION_ENABLED`).
 */
export async function resolveCardRecognitionConfig(
  userId: string | null | undefined,
  supabase?: SupabaseClient<Database>,
): Promise<ResolvedCardRecognitionConfig> {
  if (userId && supabase) {
    const row = await getAiModelConfig('card_recognition', userId, supabase);
    if (row) {
      return {
        provider: row.provider,
        model: row.model,
        enabled: row.enabled,
        source: 'database',
        baseUrl:
          typeof row.config.base_url === 'string' && row.config.base_url.trim()
            ? row.config.base_url.trim()
            : null,
      };
    }
  }
  return {
    provider:
      (process.env.CARD_RECOGNITION_PROVIDER ?? '').trim().toLowerCase() || 'mock',
    model: (process.env.CARD_RECOGNITION_MODEL ?? '').trim() || null,
    enabled: isCardRecognitionEnabled(),
    source: 'env',
    baseUrl: null,
  };
}

/**
 * Phân giải cấu hình lead enrichment đang có hiệu lực.
 * - Ưu tiên dòng DB (`capability = 'lead_enrichment'` của người dùng), kể cả khi
 *   `enabled = false` — người dùng đã quyết định tắt thì tôn trọng.
 * - Fallback sang env (`ENRICHMENT_PROVIDER`, `ENRICHMENT_MODEL`,
 *   `OPENAI_BASE_URL`) khi chưa có dòng cấu hình.
 */
export async function resolveEnrichmentConfig(
  userId: string | null | undefined,
  supabase?: SupabaseClient<Database>,
): Promise<ResolvedEnrichmentConfig> {
  if (userId && supabase) {
    const row = await getAiModelConfig('lead_enrichment', userId, supabase);
    if (row) {
      const configBaseUrl =
        typeof row.config.base_url === 'string'
          ? row.config.base_url.trim() || null
          : null;
      return {
        provider: normalizeEnrichmentProvider(row.provider),
        model: row.model,
        enabled: row.enabled,
        source: 'database',
        baseUrl: configBaseUrl ?? getOpenAiBaseUrl(),
      };
    }
  }
  const envModel = (process.env.ENRICHMENT_MODEL ?? '').trim() || null;
  return {
    provider: normalizeEnrichmentProvider(process.env.ENRICHMENT_PROVIDER),
    model: envModel,
    enabled: Boolean(envModel),
    source: 'env',
    baseUrl: getOpenAiBaseUrl(),
  };
}

/** API key của AI Gateway (server only). */
export function getGatewayApiKey(): string | null {
  return (process.env.AI_GATEWAY_API_KEY ?? '').trim() || null;
}

/** API key của OpenAI (server only, chỉ từ env). */
export function getOpenAiApiKey(): string | null {
  return (process.env.OPENAI_API_KEY ?? '').trim() || null;
}

/** Địa chỉ gốc tuỳ chọn cho OpenAI từ env (server only). */
export function getOpenAiBaseUrl(): string | null {
  return (process.env.OPENAI_BASE_URL ?? '').trim() || null;
}

/** Đọc một biến môi trường API key (server only). */
function getEnvApiKey(envName: string): string | null {
  return (process.env[envName] ?? '').trim() || null;
}

/**
 * Kiểm tra phần credential/endpoint theo provider đã phân giải.
 * Giả định caller đã kiểm tra `enabled` + `model`. Trả về thông điệp lỗi
 * thân thiện khi thiếu cấu hình, `null` khi đã đủ.
 */
export function getEnrichmentConfigIssue(
  config: ResolvedEnrichmentConfig,
): string | null {
  if (config.provider === 'gateway') {
    if (!getGatewayApiKey()) {
      return 'Chưa cấu hình AI Gateway (thiếu AI_GATEWAY_API_KEY).';
    }
    return null;
  }
  if (config.provider === 'openai-compatible') {
    if (!config.baseUrl) {
      return 'Provider openai-compatible cần Base URL (config.base_url hoặc OPENAI_BASE_URL).';
    }
    return null;
  }
  const definition = DIRECT_PROVIDER_REGISTRY[config.provider];
  if (definition && !getEnvApiKey(definition.apiKeyEnv)) {
    return `Chưa cấu hình ${definition.label} (thiếu ${definition.apiKeyEnv}).`;
  }
  return null;
}

/**
 * Tạo LanguageModel cho một provider TRỰC TIẾP (không qua gateway) bằng
 * `@ai-sdk/<provider>` với API key env riêng. Dùng chung cho enrichment và
 * nhận dạng danh thiếp. Ném `Error` thân thiện khi thiếu key/base URL.
 */
export function createDirectModel(
  provider: DirectProviderId,
  opts: { model: string; baseUrl?: string | null },
): LanguageModel {
  const definition = DIRECT_PROVIDER_REGISTRY[provider];
  if (!definition) {
    throw new Error(`Provider không được hỗ trợ: ${provider}`);
  }
  const apiKey = getEnvApiKey(definition.apiKeyEnv);
  if (!apiKey) {
    throw new Error(
      `Chưa cấu hình ${definition.label} (thiếu ${definition.apiKeyEnv}).`,
    );
  }
  const created = definition.create({
    apiKey,
    baseUrl: definition.supportsBaseUrl ? (opts.baseUrl ?? null) : null,
  });
  return created(opts.model);
}

/**
 * Provider trực tiếp có SDK hỗ trợ embedding (`textEmbeddingModel`).
 * Nguồn đơn nhất cho UI (lọc lựa chọn) và factory bên dưới.
 */
export const EMBEDDING_DIRECT_PROVIDERS: readonly DirectProviderId[] = [
  'openai',
  'google',
  'mistral',
  'cohere',
];

/**
 * Tạo embedding model cho RAG: qua AI Gateway (một key, model dạng
 * "provider/model") hoặc gọi thẳng provider hỗ trợ embedding
 * (openai, google, mistral, cohere) bằng API key env riêng.
 */
export function createEmbeddingModel(
  provider: string,
  opts: { model: string; baseUrl?: string | null },
): EmbeddingModel {
  const providerId = (provider ?? 'gateway').trim().toLowerCase();
  const model = opts.model.trim();
  if (!model) {
    throw new Error('Thiếu model embedding trong cấu hình.');
  }

  if (providerId === 'gateway' || providerId === 'vision') {
    const apiKey = getGatewayApiKey();
    if (!apiKey) {
      throw new Error(
        'Chưa cấu hình AI Gateway (thiếu AI_GATEWAY_API_KEY) — không thể tạo embedding.',
      );
    }
    return createGateway({ apiKey }).textEmbeddingModel(model);
  }

  if (providerId === 'openai-compatible') {
    if (!opts.baseUrl) {
      throw new Error(
        'Provider openai-compatible cần Base URL (config.base_url hoặc OPENAI_BASE_URL).',
      );
    }
    const provider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: opts.baseUrl,
      ...(getOpenAiApiKey() ? { apiKey: getOpenAiApiKey() as string } : {}),
    });
    return provider.textEmbeddingModel(model);
  }

  if (!EMBEDDING_DIRECT_PROVIDERS.includes(providerId as DirectProviderId)) {
    throw new Error(
      `Provider "${providerId}" không hỗ trợ embedding trực tiếp. Hỗ trợ: gateway, openai, google, mistral, cohere.`,
    );
  }

  const definition = DIRECT_PROVIDER_REGISTRY[providerId as DirectProviderId];
  const apiKey = getEnvApiKey(definition.apiKeyEnv);
  if (!apiKey) {
    throw new Error(
      `Chưa cấu hình ${definition.label} (thiếu ${definition.apiKeyEnv}) — không thể tạo embedding.`,
    );
  }
  const baseUrl = definition.supportsBaseUrl ? (opts.baseUrl ?? null) : null;

  switch (providerId as DirectProviderId) {
    case 'openai': {
      const p = createOpenAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return p.textEmbeddingModel(model);
    }
    case 'google': {
      const p = createGoogleGenerativeAI({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return p.textEmbeddingModel(model);
    }
    case 'mistral': {
      const p = createMistral({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return p.textEmbeddingModel(model);
    }
    case 'cohere': {
      const p = createCohere({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
      });
      return p.textEmbeddingModel(model);
    }
  }

  throw new Error(`Provider embedding không được hỗ trợ: ${providerId}`);
}

/**
 * Tạo LanguageModel theo provider đã phân giải — provider trực tiếp dùng
 * `@ai-sdk/<provider>` với API key env riêng, gateway dùng một key chung.
 * Ném `Error` kèm thông điệp của `getEnrichmentConfigIssue` khi thiếu
 * credential/endpoint — caller nên kiểm tra trước bằng chính hàm đó để trả
 * lỗi thân thiện.
 */
export function createEnrichmentModel(
  config: ResolvedEnrichmentConfig & { model: string },
): LanguageModel {
  const issue = getEnrichmentConfigIssue(config);
  if (issue) throw new Error(issue);

  if (config.provider === 'gateway') {
    return createGateway({ apiKey: getGatewayApiKey() as string })(
      config.model,
    );
  }

  if (config.provider === 'openai-compatible') {
    const provider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: config.baseUrl as string,
      ...(getOpenAiApiKey() ? { apiKey: getOpenAiApiKey() as string } : {}),
    });
    return provider(config.model);
  }

  return createDirectModel(config.provider, {
    model: config.model,
    baseUrl: config.baseUrl,
  });
}
