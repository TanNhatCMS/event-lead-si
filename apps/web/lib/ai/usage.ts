import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

/**
 * Ghi nhận và định giá token của các lượt gọi AI (single-user).
 *
 * - `recordUsage` ghi một dòng vào `ai_usage` (migration
 *   20261027000000_usage_pricing.sql) — BEST-EFFORT: mọi lỗi bị nuốt
 *   (console.warn) và không bao giờ làm fail luồng AI chính.
 * - `computeCostUsd` đọc bảng giá `model_prices` (service-role) theo
 *   (provider, model) — thứ tự thử:
 *     1. (provider, model nguyên văn)
 *     2. (provider, model sau khi bỏ prefix "xxx/")
 *     3. ('litellm', model nguyên văn)   — dòng sync từ LiteLLM (model = key nguyên văn)
 *     4. ('litellm', model bỏ prefix)
 *   Gateway sync lưu provider='gateway' + model id nguyên văn
 *   ("openai/gpt-4o") nên traffic qua gateway khớp ở bước 1.
 * - Công thức cost (USD): input_không_cache/1M*giá_input +
 *   cached/1M*giá_cached (không có giá cached → tính như input thường) +
 *   output/1M*giá_output; làm tròn 6 số lẻ. Không có giá → cost_usd NULL.
 *
 * Bảng chưa có trong `database.types.ts` (chỉ có sau `pnpm supabase:typegen`)
 * nên client được nới về `SupabaseClient` không generic + `as never` khi
 * insert — cùng pattern với `lib/ai/enrichment/run-ownership.ts` và
 * `lib/otel/supabase-exporter.ts`.
 */

/** Nguồn ghi usage — khớp check constraint không có; chỉ là nhãn thống kê. */
export const AI_USAGE_SOURCES = [
  'enrichment',
  'card_recognition',
  'rag_chat',
  'embeddings',
] as const;

export type AiUsageSource = (typeof AI_USAGE_SOURCES)[number];

/** Shape usage của AI SDK (gen 7) — các số có thể undefined. */
export interface AiUsageTokens {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  cachedInputTokens?: number | null;
}

/** Một dòng giá — đồng bộ từ nguồn ngoài hoặc admin nhập tay. */
export interface ModelPriceRow {
  provider: string;
  model: string;
  inputPerMillion: number;
  cachedInputPerMillion: number | null;
  outputPerMillion: number;
  source: 'manual' | 'api' | 'scrape';
}

/** Client dùng để ghi — user client (RLS) hoặc service-role. */
export type UsageClient = SupabaseClient;

/* ------------------------------------------------------------------ */
/* Hằng số nguồn giá công khai                                          */
/* ------------------------------------------------------------------ */

/** Danh mục model + pricing của Vercel AI Gateway (không cần API key). */
export const GATEWAY_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';

/** Bảng giá LiteLLM (USD per token) trên GitHub raw. */
export const LITELLM_PRICES_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

/** Nhãn provider cho các dòng giá sync từ LiteLLM (model = key nguyên văn). */
export const LITELLM_PRICE_PROVIDER = 'litellm';

/** Nhãn provider cho các dòng giá sync từ AI Gateway. */
export const GATEWAY_PRICE_PROVIDER = 'gateway';

const PER_MILLION = 1_000_000;

/* ------------------------------------------------------------------ */
/* Tiện ích số                                                         */
/* ------------------------------------------------------------------ */

/** Ép giá trị string/number về số hữu hạn >= 0, sai trả null. */
function toNonNegativeNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return num;
}

/** Làm tròn 6 số lẻ (độ chính xác của cột numeric(14,6)). */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Làm tròn 4 số lẻ (định dạng hiển thị cost trong API thống kê). */
export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Ép token về số nguyên >= 0 (usage từ SDK có thể undefined/null). */
function toTokenCount(value: unknown): number {
  const num = toNonNegativeNumber(value);
  return num === null ? 0 : Math.round(num);
}

/** Model không prefix: "openai/gpt-4o" -> "gpt-4o"; không có "/" -> nguyên bản. */
export function bareModelName(model: string): string {
  const slashIndex = model.indexOf('/');
  return slashIndex >= 0 ? model.slice(slashIndex + 1) : model;
}

/* ------------------------------------------------------------------ */
/* Parse giá từ nguồn ngoài (thuần, không gọi mạng — dễ test)           */
/* ------------------------------------------------------------------ */

/**
 * Parse response `GET /v1/models` của AI Gateway thành các dòng giá.
 *
 * Shape pricing đã kiểm chứng (curl 2026-10-29): mỗi model có
 * `pricing: { input: "0.0000025", output: "0.00001", input_cache_read?:
 * "0.00000125", ... }` — CHUỖI, đơn vị USD PER TOKEN (gpt-4o input
 * 0.0000025/token = 2.5 USD/1M). Nhân 1_000_000 về per-million.
 * Bỏ qua model thiếu input hoặc output hợp lệ (embeddings chỉ có input,
 * model image/video không có pricing token).
 */
export function parseGatewayModelPrices(payload: unknown): ModelPriceRow[] {
  const rows: ModelPriceRow[] = [];
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !Array.isArray((payload as { data?: unknown }).data)
  ) {
    return rows;
  }
  for (const entry of (payload as { data: unknown[] }).data) {
    if (typeof entry !== 'object' || entry === null) continue;
    const id = (entry as { id?: unknown }).id;
    const pricing = (entry as { pricing?: unknown }).pricing;
    if (typeof id !== 'string' || !id.trim()) continue;
    if (typeof pricing !== 'object' || pricing === null) continue;
    const p = pricing as Record<string, unknown>;
    const input = toNonNegativeNumber(p.input);
    const output = toNonNegativeNumber(p.output);
    if (input === null || output === null) continue;
    const cached = toNonNegativeNumber(p.input_cache_read);
    rows.push({
      provider: GATEWAY_PRICE_PROVIDER,
      model: id.trim(),
      inputPerMillion: round6(input * PER_MILLION),
      cachedInputPerMillion: cached === null ? null : round6(cached * PER_MILLION),
      outputPerMillion: round6(output * PER_MILLION),
      source: 'api',
    });
  }
  return rows;
}

/**
 * Parse JSON bảng giá LiteLLM (object keyed theo model id) thành các dòng giá.
 *
 * Shape đã kiểm chứng: mỗi entry `{ input_cost_per_token: 0.0000025,
 * output_cost_per_token: 0.00001, cache_read_input_token_cost?: 0.00000125,
 * mode?: "chat" | ... }` — SỐ, đơn vị USD PER TOKEN. Theo yêu cầu: KHÔNG lọc
 * theo `mode` — lấy mọi entry có CẢ input + output cost (số, kể cả 0 của
 * embedding). Key `sample_spec` là metadata mẫu của LiteLLM → bỏ.
 * Provider lưu 'litellm', model = key nguyên văn (bare lẫn "gemini/…").
 */
export function parseLiteLlmModelPrices(payload: unknown): ModelPriceRow[] {
  const rows: ModelPriceRow[] = [];
  if (typeof payload !== 'object' || payload === null) {
    return rows;
  }
  for (const [key, entry] of Object.entries(
    payload as Record<string, unknown>,
  )) {
    if (key === 'sample_spec') continue;
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const input = toNonNegativeNumber(e.input_cost_per_token);
    const output = toNonNegativeNumber(e.output_cost_per_token);
    if (input === null || output === null) continue;
    const cached = toNonNegativeNumber(e.cache_read_input_token_cost);
    rows.push({
      provider: LITELLM_PRICE_PROVIDER,
      model: key,
      inputPerMillion: round6(input * PER_MILLION),
      cachedInputPerMillion: cached === null ? null : round6(cached * PER_MILLION),
      outputPerMillion: round6(output * PER_MILLION),
      source: 'scrape',
    });
  }
  return rows;
}

/** Kết quả fetch một nguồn giá: dòng import được + tổng entry nguồn đưa ra. */
export interface SyncFetchResult {
  rows: ModelPriceRow[];
  /** Tổng entry nguồn (cả entry bị bỏ qua) — để route tính `skipped`. */
  totalEntries: number;
}

/** Đếm tổng entry của payload gateway (số phần tử mảng data). */
function countGatewayEntries(payload: unknown): number {
  if (typeof payload === 'object' && payload !== null) {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data.length;
    }
  }
  return 0;
}

/** Fetch + parse giá AI Gateway. Ném Error khi mạng/HTTP lỗi. */
export async function fetchGatewayModelPrices(): Promise<SyncFetchResult> {
  const response = await fetch(GATEWAY_MODELS_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(
      'AI Gateway trả HTTP ' + String(response.status) + ' khi lấy danh sách model.',
    );
  }
  const payload: unknown = await response.json();
  return {
    rows: parseGatewayModelPrices(payload),
    totalEntries: countGatewayEntries(payload),
  };
}

/** Fetch + parse giá LiteLLM. Ném Error khi mạng/HTTP lỗi. */
export async function fetchLiteLlmModelPrices(): Promise<SyncFetchResult> {
  const response = await fetch(LITELLM_PRICES_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(
      'LiteLLM trả HTTP ' + String(response.status) + ' khi lấy bảng giá.',
    );
  }
  const payload: unknown = await response.json();
  const totalEntries =
    typeof payload === 'object' && payload !== null
      ? Object.keys(payload as Record<string, unknown>).length
      : 0;
  return {
    rows: parseLiteLlmModelPrices(payload),
    totalEntries,
  };
}

/* ------------------------------------------------------------------ */
/* Tính cost                                                            */
/* ------------------------------------------------------------------ */

function getAdminClient(): UsageClient {
  return getSupabaseServerAdminClient() as unknown as UsageClient;
}

/**
 * Đọc giá của (provider, model) — 4 lần thử theo thứ tự ưu tiên (xem docs
 * đầu file). Trả dòng đầu tiên tìm thấy hoặc null.
 */
async function lookupPriceRow(
  provider: string,
  model: string,
  client?: UsageClient,
): Promise<Record<string, unknown> | null> {
  const bare = bareModelName(model);
  // (provider, model) các biến thể + fallback nguồn 'litellm'.
  const candidates = new Set<string>([model, bare]);
  const providerIds = new Set<string>([provider, LITELLM_PRICE_PROVIDER]);
  const rows = await (client ?? getAdminClient())
    .from('model_prices')
    .select('provider, model, input_per_million, cached_input_per_million, output_per_million')
    .in('model', [...candidates])
    .in('provider', [...providerIds]);
  if (rows.error || !rows.data || rows.data.length === 0) {
    return null;
  }
  const pairs: Array<[string, string]> = [];
  for (const p of providerIds) {
    for (const m of [model, bare]) {
      pairs.push([p, m]);
    }
  }
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows.data as Array<Record<string, unknown>>) {
    byKey.set(String(row.provider) + '|' + String(row.model), row);
  }
  for (const [p, m] of pairs) {
    const found = byKey.get(p + '|' + m);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Tính cost USD của một lượt gọi theo bảng giá `model_prices`.
 * Không tìm thấy giá → null. cachedInputTokens là MỘT PHẦN của inputTokens
 * (quy ước OpenAI/AI SDK) nên input tính giá thường = input - cached.
 */
export async function computeCostUsd(
  provider: string,
  model: string,
  tokens: AiUsageTokens,
): Promise<number | null> {
  try {
    const row = await lookupPriceRow(provider, model);
    if (!row) {
      return null;
    }
    const inputPrice = toNonNegativeNumber(row.input_per_million) ?? 0;
    const outputPrice = toNonNegativeNumber(row.output_per_million) ?? 0;
    const cachedPrice =
      row.cached_input_per_million === null || row.cached_input_per_million === undefined
        ? null
        : toNonNegativeNumber(row.cached_input_per_million);

    const inputTokens = toTokenCount(tokens.inputTokens);
    const cachedTokens = Math.min(toTokenCount(tokens.cachedInputTokens), inputTokens);
    const outputTokens = toTokenCount(tokens.outputTokens);
    const notCachedInput = inputTokens - cachedTokens;
    const effectiveCachedPrice = cachedPrice === null ? inputPrice : cachedPrice;

    const cost =
      (notCachedInput / PER_MILLION) * inputPrice +
      (cachedTokens / PER_MILLION) * effectiveCachedPrice +
      (outputTokens / PER_MILLION) * outputPrice;
    return round6(cost);
  } catch {
    // Lỗi đọc bảng giá không được làm fail luồng chính.
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Ghi usage                                                            */
/* ------------------------------------------------------------------ */

export interface RecordUsageInput {
  /** null = không biết chủ sở hữu → bỏ qua (user_id là NOT NULL). */
  userId: string | null;
  source: AiUsageSource;
  provider: string;
  model: string;
  usage: AiUsageTokens | null | undefined;
  latencyMs?: number | null;
  /** User client (RLS insert own) — không truyền thì dùng service-role. */
  supabase?: UsageClient | null;
}

/**
 * Ghi một dòng `ai_usage` — BEST-EFFORT: try/catch toàn bộ, lỗi chỉ
 * console.warn, không bao giờ ném ra ngoài luồng AI chính.
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const userId = (input.userId ?? '').trim();
    if (!userId || !input.provider.trim() || !input.model.trim()) {
      return;
    }
    const usage = input.usage ?? {};
    const inputTokens = toTokenCount(usage.inputTokens);
    const outputTokens = toTokenCount(usage.outputTokens);
    const cachedTokens = Math.min(toTokenCount(usage.cachedInputTokens), inputTokens);
    const totalTokens = toTokenCount(
      usage.totalTokens === null || usage.totalTokens === undefined
        ? inputTokens + outputTokens
        : usage.totalTokens,
    );
    const latencyMs =
      input.latencyMs === null || input.latencyMs === undefined
        ? null
        : Math.max(0, Math.round(input.latencyMs));
    const costUsd = await computeCostUsd(input.provider, input.model, {
      inputTokens,
      outputTokens,
      cachedInputTokens: cachedTokens,
    });

    const row = {
      user_id: userId,
      source: input.source,
      provider: input.provider.trim(),
      model: input.model.trim(),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_tokens: cachedTokens,
      total_tokens: totalTokens,
      cost_usd: costUsd,
      latency_ms: latencyMs,
    };
    const client = input.supabase ?? getAdminClient();
    const { error } = await client.from('ai_usage').insert(row as never);
    if (error) {
      console.warn('[ai_usage] ghi usage thất bại: ' + error.message);
      return;
    }
    // Ghi thành công → kiểm tra ngân sách chi phí tháng (best-effort, tự nuốt lỗi).
    await enforceBudgets(userId, capabilityForUsageSource(input.source));
  } catch (err) {
    console.warn(
      '[ai_usage] ghi usage thất bại: ' +
        (err instanceof Error ? err.message : 'lỗi không xác định'),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Ngân sách chi phí theo capability (budgets trong agent_config)      */
/* ------------------------------------------------------------------ */

/**
 * Ánh xạ capability (tên trong `ai_model_configs` / key của
 * `agent_config.budgets`) → các `source` ghi trong `ai_usage`. Ví dụ chi phí
 * của capability `lead_enrichment` nằm ở source `enrichment`.
 */
export const USAGE_SOURCES_BY_CAPABILITY: Record<string, string[]> = {
  lead_enrichment: ['enrichment'],
  card_recognition: ['card_recognition'],
  rag_chat: ['rag_chat'],
  rag_embeddings: ['embeddings'],
};

/** Nghịch đảo: source ghi usage → capability chịu trách nhiệm về ngân sách. */
const CAPABILITY_BY_USAGE_SOURCE: Record<string, string> = {
  enrichment: 'lead_enrichment',
  card_recognition: 'card_recognition',
  rag_chat: 'rag_chat',
  embeddings: 'rag_embeddings',
};

/**
 * Capability chịu trách nhiệm về ngân sách cho một source ghi usage.
 * Source không có trong bảng ánh xạ → dùng chính tên source làm capability.
 */
export function capabilityForUsageSource(source: string): string {
  return CAPABILITY_BY_USAGE_SOURCE[source] ?? source;
}

/** Kết quả kiểm tra một ngân sách (chỉ khiCapability có khai báo ngưỡng). */
export interface BudgetCheckResult {
  capability: string;
  /** Ngưỡng tháng (USD) khai báo trong agent_config.budgets. */
  monthlyUsd: number;
  /** Tổng cost_usd của tháng hiện tại theo các source của capability. */
  spentUsd: number;
  disabledConfigs: number;
}

/**
 * Đọc ngưỡng `monthly_usd` của một capability từ `agent_config.budgets`.
 * Shape hỗ trợ: budgets[capability] = { monthly_usd: number } hoặc
 * budgets[capability] = number. Không khai báo / sai shape → null.
 */
export function readBudgetMonthlyUsd(
  budgets: unknown,
  capability: string,
): number | null {
  if (typeof budgets !== 'object' || budgets === null) return null;
  const entry = (budgets as Record<string, unknown>)[capability];
  const raw =
    typeof entry === 'object' && entry !== null
      ? (entry as Record<string, unknown>).monthly_usd
      : entry;
  return toNonNegativeNumber(raw);
}

/** Đầu tháng hiện tại (UTC) — mốc tính tổng chi phí tháng. */
function startOfCurrentMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Kiểm tra NGÂN SÁCH chi phí tháng của một capability — BEST-EFFORT, không bao
 * giờ ném (lỗi chỉ console.warn, không ảnh hưởng luồng AI chính).
 *
 * Khi tổng `cost_usd` tháng hiện tại (theo các source của capability) VƯỢT
 * ngưỡng `monthly_usd` khai báo trong `agent_config.budgets`:
 * 1. UPDATE `ai_model_configs` SET enabled = false cho capability đó
 *    (service-role) — các luồng AI tôn trọng `enabled` nên tự dừng gọi model.
 * 2. Ghi `audit_logs` action 'budget.exceeded' kèm số đã chi/ngưỡng.
 *
 * Trả về kết quả kiểm tra khi capability có khai báo ngưỡng, ngược lại null.
 */
export async function enforceBudgets(
  userId: string,
  capability: string,
): Promise<BudgetCheckResult | null> {
  try {
    const capabilityKey = capability.trim();
    if (!userId.trim() || !capabilityKey) {
      return null;
    }
    const admin = getAdminClient();

    // 1. Đọc budgets của user (service-role — bảng agent_config chỉ 1 dòng/user).
    const { data: configRow, error: configError } = await admin
      .from('agent_config')
      .select('budgets')
      .eq('user_id', userId)
      .maybeSingle();
    if (configError || !configRow) {
      return null;
    }
    const monthlyUsd = readBudgetMonthlyUsd(
      (configRow as { budgets?: unknown }).budgets,
      capabilityKey,
    );
    if (monthlyUsd === null || monthlyUsd <= 0) {
      return null;
    }

    // 2. Tổng cost tháng hiện tại theo các source của capability.
    const sources = Array.from(
      new Set([capabilityKey, ...(USAGE_SOURCES_BY_CAPABILITY[capabilityKey] ?? [])]),
    );
    const { data: usageRows, error: usageError } = await admin
      .from('ai_usage')
      .select('cost_usd')
      .eq('user_id', userId)
      .in('source', sources)
      .gte('created_at', startOfCurrentMonthUtc())
      .limit(10_000);
    if (usageError) {
      return null;
    }
    let spentUsd = 0;
    for (const row of (usageRows ?? []) as Array<{ cost_usd: number | null }>) {
      if (typeof row?.cost_usd === 'number' && Number.isFinite(row.cost_usd)) {
        spentUsd += row.cost_usd;
      }
    }
    if (spentUsd <= monthlyUsd) {
      return null;
    }

    // 3. Vượt ngưỡng → tắt model config của capability + audit.
    const { data: disabledRows } = await admin
      .from('ai_model_configs')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('capability', capabilityKey)
      .select('id');
    const disabledConfigs = (disabledRows as Array<{ id: string }> | null)?.length ?? 0;

    console.warn(
      '[budget] capability ' +
        capabilityKey +
        ' vượt ngưỡng tháng: ' +
        round4(spentUsd) +
        ' USD > ' +
        round4(monthlyUsd) +
        ' USD — đã tắt ' +
        disabledConfigs +
        ' cấu hình model.',
    );

    try {
      await admin.from('audit_logs').insert({
        user_id: userId,
        action: 'budget.exceeded',
        entity_type: 'ai_capability',
        entity_id: capabilityKey,
        summary:
          'Vượt ngưỡng chi phí tháng của capability ' +
          capabilityKey +
          ' — đã tắt cấu hình model.',
        metadata: {
          capability: capabilityKey,
          monthly_usd: monthlyUsd,
          spent_usd: round4(spentUsd),
          disabled_configs: disabledConfigs,
        },
      } as never);
    } catch {
      // Audit best-effort.
    }

    return {
      capability: capabilityKey,
      monthlyUsd,
      spentUsd: round4(spentUsd),
      disabledConfigs,
    };
  } catch (err) {
    console.warn(
      '[budget] kiểm tra ngân sách thất bại: ' +
        (err instanceof Error ? err.message : 'lỗi không xác định'),
    );
    return null;
  }
}
