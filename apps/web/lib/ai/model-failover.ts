import 'server-only';

import {
  createGateway,
  type EmbeddingModel,
  type LanguageModel,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';

import {
  createDirectModel,
  createEmbeddingModel,
  getProviderEnvKey,
  normalizeEnrichmentProvider,
  type AiModelConfigSource,
  type EnrichmentProvider,
  type ModelFallbackSpec,
} from './model-config';

/**
 * Backend failover engine cho các lượt gọi AI — đa API key + chuỗi model dự phòng.
 *
 * - Mỗi provider CÓ THỂ có nhiều API key trong DB:
 *   `agent_config.credentials["<provider>_api_keys"]` = JSON array chuỗi
 *   (key[0] = key active). Back-compat: đọc thêm `<provider>_api_key`
 *   (key đơn legacy) và key env của provider (luôn xếp CUỐI như fallback cuối).
 * - Một capability CÓ THỂ khai báo chuỗi model dự phòng trong
 *   `ai_model_configs.config.fallbacks` = array `{ provider, model, baseUrl? }`
 *   (jsonb — không cần migration).
 * - Thứ tự thử khi gọi: từng key của link hiện tại (mỗi lần tạo model mới với
 *   key đó) → link kế tiếp trong chuỗi. Lỗi KHÔNG retryable (400/422 — input
 *   sai, egress bị chặn) thì dừng ngay, không failover.
 */

/** Một mắt xích trong chuỗi failover: 1 model với danh sách key dự phòng. */
export interface ModelChainLink {
  provider: string;
  model: string;
  baseUrl?: string | null;
  keys: string[];
  source: AiModelConfigSource;
}

/** Một lượt thử thất bại — chi tiết phục vụ debug/report. */
export interface ModelAttemptRecord {
  provider: string;
  model: string;
  /** Chỉ số key đã thử trong link (0 = key active). */
  keyIndex: number;
  /** Thông điệp lỗi gốc của lượt thử này. */
  reason: string;
}

/**
 * Ném ra khi HẾT chuỗi model/key mà vẫn thất bại. Message là chuỗi TĨNH;
 * chi tiết từng lượt thử nằm ở field `attempts` (caller tự ghép log/report).
 */
export class ModelFailoverError extends Error {
  readonly attempts: ModelAttemptRecord[];

  constructor(attempts: ModelAttemptRecord[]) {
    super('Mọi model/key đều thất bại.');
    this.name = 'ModelFailoverError';
    this.attempts = attempts;
  }
}

/* ------------------------------------------------------------------ */
/* Đọc danh sách key của một provider                                   */
/* ------------------------------------------------------------------ */

async function readAgentCredentials(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Record<string, unknown>> {
  try {
    const { data } = await supabase
      .from('agent_config')
      .select('credentials')
      .eq('user_id', userId)
      .maybeSingle();
    return (data?.credentials as Record<string, unknown> | null) ?? {};
  } catch {
    return {};
  }
}

/** Bóc mảng key từ jsonb: nhận array trực tiếp hoặc chuỗi JSON array. */
function extractKeyList(raw: unknown): string[] {
  let items: unknown[] | null = null;
  if (Array.isArray(raw)) {
    items = raw;
  } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = parsed;
      }
    } catch {
      items = null;
    }
  }
  const keys: string[] = [];
  if (!items) {
    return keys;
  }
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      keys.push(item.trim());
    }
  }
  return keys;
}

function dedupeKeys(keys: string[]): string[] {
  return Array.from(new Set(keys));
}

/**
 * Danh sách API key của một provider theo thứ tự ưu tiên:
 * 1. DB array `credentials["<provider>_api_keys"]` (key[0] = active).
 * 2. DB key đơn legacy `credentials["<provider>_api_key"]`.
 * 3. Key env của provider (LUÔN CUỐI — fallback cuối).
 * Đã dedupe giữ thứ tự. Không có key nào → mảng rỗng.
 */
export async function resolveProviderKeys(
  providerId: string,
  userId?: string | null,
  supabase?: SupabaseClient<Database>,
): Promise<string[]> {
  const provider = (providerId ?? '').trim().toLowerCase();
  const keys: string[] = [];
  if (provider && userId && supabase) {
    const credentials = await readAgentCredentials(supabase, userId);
    keys.push(...extractKeyList(credentials[provider + '_api_keys']));
    const legacy = credentials[provider + '_api_key'];
    if (typeof legacy === 'string' && legacy.trim()) {
      keys.push(legacy.trim());
    }
  }
  const envKey = getProviderEnvKey(provider);
  if (envKey) {
    keys.push(envKey);
  }
  return dedupeKeys(keys);
}

/* ------------------------------------------------------------------ */
/* Dựng chuỗi model (primary + fallbacks)                               */
/* ------------------------------------------------------------------ */

/** Shape tối thiểu của config đầu vào — nhận cả ResolvedEnrichmentConfig. */
export interface BuildModelChainConfig {
  provider: string;
  model: string | null;
  baseUrl?: string | null;
  source?: AiModelConfigSource;
  fallbacks?: ModelFallbackSpec[];
}

export interface BuildModelChainInput {
  userId?: string | null;
  supabase?: SupabaseClient<Database>;
  config: BuildModelChainConfig;
}

/**
 * Dựng chuỗi failover: mắt xích đầu từ config chính của capability, sau đó
 * từng fallback trong `config.fallbacks`. Mỗi link mang danh sách key của
 * provider tương ứng. Link thiếu model/provider bị loại.
 */
export async function buildModelChain(
  input: BuildModelChainInput,
): Promise<ModelChainLink[]> {
  const chain: ModelChainLink[] = [];
  const model = (input.config.model ?? '').trim();
  const provider = (input.config.provider ?? '').trim().toLowerCase();
  if (model && provider) {
    chain.push({
      provider,
      model,
      baseUrl: input.config.baseUrl ?? null,
      keys: await resolveProviderKeys(provider, input.userId, input.supabase),
      source: input.config.source ?? 'env',
    });
  }
  chain.push(
    ...(await buildFallbackLinks(
      input.config.fallbacks ?? [],
      input.userId,
      input.supabase,
    )),
  );
  return chain;
}

/**
 * Chuyển các fallback spec thành link hoàn chỉnh (kèm keys từng provider).
 * Link thiếu model/provider bị loại. Dùng riêng cho vision provider (chain do
 * caller tự ghép) và bên trong `buildModelChain`.
 */
export async function buildFallbackLinks(
  fallbacks: readonly ModelFallbackSpec[],
  userId?: string | null,
  supabase?: SupabaseClient<Database>,
): Promise<ModelChainLink[]> {
  const links: ModelChainLink[] = [];
  for (const fallback of fallbacks) {
    const model = (fallback.model ?? '').trim();
    const provider = (fallback.provider ?? '').trim().toLowerCase();
    if (!model || !provider) {
      continue;
    }
    links.push({
      provider,
      model,
      baseUrl: fallback.baseUrl ?? null,
      keys: await resolveProviderKeys(provider, userId, supabase),
      source: 'database',
    });
  }
  return links;
}

/* ------------------------------------------------------------------ */
/* Phân loại lỗi                                                        */
/* ------------------------------------------------------------------ */

const RETRYABLE_HTTP_STATUS = new Set([401, 402, 429, 500, 502, 503, 504]);

const NETWORK_ERROR_PATTERN =
  /(fetch failed|fetchfailed|timeout|timed out|econnreset|econnrefused|enotfound|eai_again|etimedout|econnaborted|epipe|und_err_connect|und_err_headers_timeout|und_err_body_timeout|socket hang up)/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Đọc HTTP status từ err.statusCode / err.status / err.data.statusCode… */
function getErrorStatus(err: unknown): number | null {
  const direct = asRecord(err);
  if (!direct) {
    return null;
  }
  for (const candidate of [direct.statusCode, direct.status]) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  const data = asRecord(direct.data);
  if (data) {
    for (const candidate of [data.statusCode, data.status]) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/** Gom mã lỗi + name + message thành một chuỗi lowercase để nhận diện. */
function getErrorCodeText(err: unknown): string {
  const parts: string[] = [];
  const direct = asRecord(err);
  if (direct) {
    if (typeof direct.code === 'string') {
      parts.push(direct.code);
    }
    if (typeof direct.name === 'string') {
      parts.push(direct.name);
    }
    const data = asRecord(direct.data);
    if (data && typeof data.code === 'string') {
      parts.push(data.code);
    }
  }
  if (err instanceof Error) {
    parts.push(err.message);
  } else if (typeof err === 'string') {
    parts.push(err);
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Lỗi model CÓ THỬ lại (key khác/model khác) hay không?
 * - Retryable: HTTP 401/402/429/500/502/503/504, lỗi mạng/fetch failed/timeout,
 *   `model_not_found` (404 kèm mã), `quota_exceeded`.
 * - KHÔNG retryable: 400/422 (input sai), EgressBlocked (chặn egress của app).
 */
export function isRetryableModelError(err: unknown): boolean {
  const codeText = getErrorCodeText(err);
  if (codeText.includes('egressblocked')) {
    return false;
  }
  if (codeText.includes('quota_exceeded') || codeText.includes('quota exceeded')) {
    return true;
  }
  if (codeText.includes('model_not_found') || codeText.includes('model not found')) {
    return true;
  }
  const status = getErrorStatus(err);
  if (status !== null) {
    return RETRYABLE_HTTP_STATUS.has(status);
  }
  return NETWORK_ERROR_PATTERN.test(codeText);
}

/* ------------------------------------------------------------------ */
/* Tạo model cho một link                                               */
/* ------------------------------------------------------------------ */

/**
 * Tạo LanguageModel (chat) cho một link với key TƯỜNG MINH (link.keys[0]):
 * - gateway/vision: `createGateway({ apiKey })(model)`.
 * - openai-compatible: `createOpenAICompatible({ baseURL, apiKey? })(model)`.
 * - provider trực tiếp: `createDirectModel` với key tường minh (registry
 *   `DIRECT_PROVIDER_REGISTRY` trong model-config — không rơi env khi đã có key).
 * Ném Error với message tĩnh khi thiếu credential/base URL — caller ghi nhận
 * vào danh sách attempts.
 */
export function createChatModelForLink(link: ModelChainLink): LanguageModel {
  const model = (link.model ?? '').trim();
  if (!model) {
    throw new Error('Thiếu model trong mắt xích chuỗi failover.');
  }
  const rawProvider = (link.provider ?? '').trim().toLowerCase();
  // "vision" là bí danh gateway của capability card_recognition.
  const providerId: EnrichmentProvider =
    rawProvider === 'vision'
      ? 'gateway'
      : normalizeEnrichmentProvider(rawProvider);
  const apiKey = link.keys[0]?.trim() || null;

  if (providerId === 'gateway') {
    if (!apiKey) {
      throw new Error('Chưa cấu hình AI Gateway (thiếu AI_GATEWAY_API_KEY).');
    }
    return createGateway({ apiKey })(model);
  }

  if (providerId === 'openai-compatible') {
    if (!link.baseUrl) {
      throw new Error(
        'Provider openai-compatible cần Base URL (config.base_url hoặc OPENAI_BASE_URL).',
      );
    }
    const provider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: link.baseUrl,
      ...(apiKey ? { apiKey } : {}),
    });
    return provider(model);
  }

  return createDirectModel(providerId, {
    model,
    baseUrl: link.baseUrl ?? null,
    apiKey,
  });
}

/* ------------------------------------------------------------------ */
/* Chạy với failover                                                    */
/* ------------------------------------------------------------------ */

function describeError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  if (typeof err === 'string' && err.trim()) {
    return err;
  }
  const name = asRecord(err)?.name;
  if (typeof name === 'string' && name.trim()) {
    return name;
  }
  return 'lỗi không xác định';
}

interface ChainRunInput<TModel, T> {
  chain: ModelChainLink[];
  createModel: (link: ModelChainLink, apiKey: string | null) => TModel;
  execute: (model: TModel) => Promise<T>;
}

/**
 * Lõi failover (generic trên kiểu model — chat hoặc embedding): mỗi link thử
 * TỪNG key (mỗi lần tạo model mới với key đó); lỗi retryable → key kế → hết
 * key → link kế; hết chain → `ModelFailoverError` (message tĩnh, chi tiết ở
 * field `attempts`). Lỗi KHÔNG retryable (400/422…) → ném lại nguyên bản ngay.
 */
async function runWithChain<TModel, T>(
  input: ChainRunInput<TModel, T>,
): Promise<{ result: T; used: ModelChainLink; attempts: number }> {
  const records: ModelAttemptRecord[] = [];
  for (const link of input.chain) {
    // Link không có key nào: vẫn thử 1 lần không key (provider có thể không
    // cần key — ví dụ openai-compatible self-host) để lấy lỗi cấu hình rõ.
    const keysToTry: ReadonlyArray<string | null> =
      link.keys.length > 0 ? link.keys : [null];
    for (let keyIndex = 0; keyIndex < keysToTry.length; keyIndex += 1) {
      const apiKey = keysToTry[keyIndex] ?? null;
      const attemptLink: ModelChainLink = {
        ...link,
        keys: apiKey ? [apiKey] : [],
      };
      let model: TModel;
      try {
        model = input.createModel(attemptLink, apiKey);
      } catch (err) {
        records.push({
          provider: link.provider,
          model: link.model,
          keyIndex,
          reason: describeError(err),
        });
        continue;
      }
      try {
        const result = await input.execute(model);
        return { result, used: link, attempts: records.length + 1 };
      } catch (err) {
        records.push({
          provider: link.provider,
          model: link.model,
          keyIndex,
          reason: describeError(err),
        });
        if (!isRetryableModelError(err)) {
          throw err;
        }
      }
    }
  }
  throw new ModelFailoverError(records);
}

export interface RunWithModelFailoverInput<T> {
  chain: ModelChainLink[];
  /** Dành cho trace/tương thích hợp đồng — chain đã mang keys sẵn. */
  userId?: string | null;
  supabase?: SupabaseClient<Database>;
  execute: (model: LanguageModel) => Promise<T>;
}

/**
 * Chạy `execute` trên chuỗi model CHAT với failover key/model: tạo model bằng
 * `createChatModelForLink` cho từng (link, key), lỗi retryable thì chuyển
 * sang key/link kế tiếp.
 */
export async function runWithModelFailover<T>(
  input: RunWithModelFailoverInput<T>,
): Promise<{ result: T; used: ModelChainLink; attempts: number }> {
  return runWithChain({
    chain: input.chain,
    createModel: (link) => createChatModelForLink(link),
    execute: input.execute,
  });
}

export interface RunWithEmbeddingFailoverInput<T> {
  chain: ModelChainLink[];
  execute: (model: EmbeddingModel) => Promise<T>;
}

/**
 * Như `runWithModelFailover` nhưng tạo EMBEDDING model qua
 * `createEmbeddingModel` (gateway cần `.textEmbeddingModel`, không phải chat
 * model) — dùng cho RAG embeddings.
 */
export async function runWithEmbeddingFailover<T>(
  input: RunWithEmbeddingFailoverInput<T>,
): Promise<{ result: T; used: ModelChainLink; attempts: number }> {
  return runWithChain({
    chain: input.chain,
    createModel: (link, apiKey) =>
      createEmbeddingModel(link.provider, {
        model: link.model,
        baseUrl: link.baseUrl ?? null,
        apiKey,
      }),
    execute: input.execute,
  });
}
