import 'server-only';

import { TinyFish } from '@tiny-fish/sdk';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { assertEgressAllowed } from './tools/egress-guard';

/**
 * TinyFish Search + Fetch (miễn phí) — backend cho tool `web_search` /
 * `web_fetch` của agent, theo issue #88.
 *
 * - API key: lưu trong DB (`agent_config.credentials`, quản lý ở
 *   /admin/agent — write-only), fallback env `TINYFISH_API_KEY`. Header
 *   `X-API-Key` do SDK tự gắn.
 * - CHỈ dùng Search + Fetch. TinyFish Agent/Browser/Monitor/Research là tính
 *   năng tính phí, ngoài phạm vi — không expose.
 * - Egress: endpoint của SDK là hằng số (api.search/fetch.tinyfish.ai) — không
 *   có cấu hình nào đổi được nơi gọi; URL ĐÍCH cần fetch phải public, đi qua
 *   `assertEgressAllowed` (chặn localhost/private IP trước khi gửi đi).
 */

export function getTinyFishApiKeyFromEnv(): string | null {
  return (process.env.TINYFISH_API_KEY ?? '').trim() || null;
}

/**
 * Phân giải key: DB (`agent_config.credentials`, admin UI quản) ưu tiên,
 * fallback env `TINYFISH_API_KEY`. Đọc bằng service-role — webhook receiver
 * không có user context.
 */
export async function resolveTinyFishApiKey(): Promise<string | null> {
  try {
    const admin = getSupabaseServerAdminClient();
    const { data } = await admin
      .from('agent_config')
      .select('credentials')
      .not('credentials->>tinyfish_api_key', 'is', null)
      .limit(1);
    const key = (data?.[0]?.credentials as Record<string, unknown> | null)
      ?.tinyfish_api_key;
    if (typeof key === 'string' && key.trim()) return key.trim();
  } catch {
    // DB lỗi → fallback env
  }
  return getTinyFishApiKeyFromEnv();
}

/** Alias back-compat（đọc trực tiếp từ env）。 */
export const getTinyFishApiKey = getTinyFishApiKeyFromEnv;

export class TinyFishNotConfiguredError extends Error {
  constructor() {
    super(
      'Chưa cấu hình TinyFish (thiếu TINYFISH_API_KEY). Đặt key trong biến môi trường hoặc chọn backend search/fetch khác.',
    );
    this.name = 'TinyFishNotConfiguredError';
  }
}

// ---------------------------------------------------------------------------
// Wallet — GET agent.tinyfish.ai/v1/wallet (số dư/trạng thái thanh toán,
// phục vụ thẻ trạng thái trên trang quản trị)
// ---------------------------------------------------------------------------

export interface TinyFishWallet {
  availableBalance: string;
  currency: string;
  asOf: string | null;
  autoReload: string | null;
}

export interface TinyFishStatus {
  configured: boolean;
  /** key đã cấu hình nhưng gọi thất bại (401 key sai, 404 ví chưa mở…). */
  error: string | null;
  wallet: TinyFishWallet | null;
}

/**
 * Đọc ví và trạng thái thanh toán (dùng cho /admin/agent). Không cache —
 * trang quản trị mỗi lần mở đều đọc realtime. Timeout 8s; 401/403/404
 * chuyển thành thông báo thân thiện, không làm trang lỗi.
 */
export async function getTinyFishStatus(): Promise<TinyFishStatus> {
  const apiKey = await resolveTinyFishApiKey();
  if (!apiKey) {
    return { configured: false, error: null, wallet: null };
  }

  try {
    const client = new TinyFish({ apiKey, timeout: 8000 });
    const wallet = await client.wallet.get();
    const reload = wallet.auto_reload;
    const reloadState =
      reload && typeof reload === 'object' && 'state' in reload
        ? String(reload.state)
        : null;
    return {
      configured: true,
      error: null,
      wallet: {
        availableBalance: String(wallet.available_balance),
        currency: String(wallet.currency ?? 'USD'),
        asOf: typeof wallet.as_of === 'string' ? wallet.as_of : null,
        autoReload: reloadState,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Ví có thể chưa mở cho tổ chức (404 FEATURE_NOT_AVAILABLE) — Search
    // và Fetch vẫn dùng được, hiển thị là trạng thái hạ cấp.
    return { configured: true, error: message, wallet: null };
  }
}

/** Lỗi per-URL của Fetch API (timeout, bot_blocked…) — code nằm ở field. */
export class TinyFishFetchError extends Error {
  readonly url: string;
  readonly code: string;

  constructor(url: string, code: string) {
    super('TinyFish fetch thất bại.');
    this.name = 'TinyFishFetchError';
    this.url = url;
    this.code = code;
  }
}

function createClient(apiKey: string): TinyFish {
  return new TinyFish({ apiKey });
}

// ---------------------------------------------------------------------------
// Search — GET api.search.tinyfish.ai
// ---------------------------------------------------------------------------

export interface TinyFishSearchItem {
  position: number;
  title: string;
  url: string;
  snippet: string;
  site_name: string;
}

/**
 * Tìm kiếm web qua TinyFish. Kết quả map về shape `WebSearchResultItem`
 * mà tool `web_search` đang trả (position/title/url/snippet/site_name).
 */
export async function tinyFishSearch(
  query: string,
  opts?: { maxResults?: number; location?: string; language?: string },
): Promise<TinyFishSearchItem[]> {
  const apiKey = await resolveTinyFishApiKey();
  if (!apiKey) throw new TinyFishNotConfiguredError();

  const client = createClient(apiKey);
  const searchParams: { query: string; location?: string; language?: string } = {
    query,
  };
  if (opts?.location) searchParams.location = opts.location;
  if (opts?.language) searchParams.language = opts.language;

  const response = await client.search.query(searchParams);

  return (response.results ?? [])
    .slice(0, Math.max(1, opts?.maxResults ?? 5))
    .map((item) => ({
      position: item.position,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      site_name: item.site_name,
    }));
}

// ---------------------------------------------------------------------------
// Fetch — POST api.fetch.tinyfish.ai (markdown sạch)
// ---------------------------------------------------------------------------

export interface TinyFishFetchResult {
  title: string | null;
  text: string;
}

/**
 * Lấy nội dung markdown sạch của một URL qua TinyFish Fetch API. URL đích
 * phải public (assertEgressAllowed — TinyFish fetch từ bên ngoài nên cũng
 * không với được host nội bộ, nhưng kiểm tra trước để chặn sớm).
 */
export async function tinyFishFetch(url: string): Promise<TinyFishFetchResult> {
  await assertEgressAllowed(url); // chặn sớm localhost/private/reserved

  const apiKey = await resolveTinyFishApiKey();
  if (!apiKey) throw new TinyFishNotConfiguredError();

  const client = createClient(apiKey);
  const targets: string[] = [url];
  const response = await client.fetch.getContents({
    urls: targets,
    format: 'markdown',
  });

  const failed = response.errors?.[0];
  if (failed) {
    throw new TinyFishFetchError(failed.url ?? url, failed.error);
  }

  const page = response.results?.[0];
  if (!page) {
    throw new TinyFishFetchError(url, 'empty_result');
  }

  return {
    title: typeof page.title === 'string' ? page.title : null,
    text: typeof page.text === 'string' ? page.text : '',
  };
}
