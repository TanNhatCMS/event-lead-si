import { tool } from "ai";
import { z } from "zod";

import { toolRegistry } from "../tools";
import { assertEgressAllowed } from "../tools/egress-guard";
import { webFetchTool } from "../tools/webfetch";
import { getTinyFishApiKey, tinyFishSearch } from "../tinyfish";
import { loadEnrichmentMarkdown } from "./load-markdown";

/**
 * Các tool/skill mà agent loop dùng để thu thập thông tin.
 * Hai tool đầu là hàm thuần (pure), luôn khả dụng. `web_search` dùng backend
 * cấu hình qua `SEARCH_PROVIDER` (tool | api | fetch | none) — khi chưa cấu
 * hình thì trả `{ available: false }` để agent tự bỏ qua và không "bịa"
 * kết quả tìm kiếm.
 *
 * Mô tả chi tiết của từng skill được viết ra file markdown trong `skills/`
 * và load vào lúc chạy — sửa file .md là đổi được hành vi agent mà không
 * cần đụng code.
 */

// ---------------------------------------------------------------------------
// Hàm thuần: chuẩn hoá số điện thoại Việt Nam
// ---------------------------------------------------------------------------

/** Map đầu số → nhà mạng (di động phổ biến + đầu số cố định). */
const VN_CARRIERS: Array<{ prefixes: string[]; name: string }> = [
  { prefixes: ["086", "096", "097", "098", "032", "033", "034", "035", "036", "037", "038", "039"], name: "Viettel" },
  { prefixes: ["088", "091", "094", "083", "084", "085", "081", "082"], name: "Vinaphone" },
  { prefixes: ["090", "093", "070", "079", "077", "076", "078"], name: "MobiFone" },
  { prefixes: ["092", "056", "058"], name: "Vietnamobile" },
  { prefixes: ["099", "059"], name: "GMobile" },
  { prefixes: ["087"], name: "iTel" },
];

export interface NormalizedVnPhone {
  input: string;
  digits: string;
  /** Dạng quốc tế E.164 rút gọn, ví dụ "+84912345678". */
  e164: string | null;
  /** Dạng hiển thị quen thuộc, ví dụ "+84 912 345 678". */
  display: string | null;
  carrier: string | null;
  valid: boolean;
}

export function normalizeVnPhone(input: string): NormalizedVnPhone {
  const result: NormalizedVnPhone = {
    input,
    digits: "",
    e164: null,
    display: null,
    carrier: null,
    valid: false,
  };

  const digits = input.replace(/[^\d]/g, "");
  result.digits = digits;
  if (!digits) return result;

  // Chuẩn hoá về đầu 0 quốc gia: +84 9xx → 09xx, 84 9xx → 09xx, giữ nguyên 09xx.
  let national = digits;
  if (/^84(9|8|7|5|3)\d{7,8}$/.test(digits)) national = "0" + digits.slice(2);
  else if (/^840\d+$/.test(digits)) national = digits.slice(2);
  else if (!/^0\d+$/.test(digits)) return result;

  const isMobile = /^0(3|5|7|8|9)\d{8}$/.test(national);
  const isLandline = /^02\d{8,9}$/.test(national);
  if (!isMobile && !isLandline) return result;

  result.valid = true;
  result.e164 = "+84" + national.slice(1);
  // Định dạng hiển thị: +84 912 345 678 (di động) hoặc +84 24 3826 9999 (cố định).
  const local = national.slice(1);
  result.display =
    isMobile && local.length === 9
      ? `+84 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
      : `+84 ${local}`;
  const prefix = national.slice(0, 3);
  const carrier = VN_CARRIERS.find((c) => c.prefixes.includes(prefix));
  result.carrier = carrier ? carrier.name : isLandline ? "Cố định" : "Không xác định";

  return result;
}

// ---------------------------------------------------------------------------
// Hàm thuần: suy ra domain/website công ty từ email
// ---------------------------------------------------------------------------

export interface CompanyDomainGuess {
  email: string;
  domain: string | null;
  /** Website dự kiến. */
  website: string | null;
  /** true khi domain là nhà cung cấp email công cộng (không phải domain công ty). */
  isPublicProvider: boolean;
}

/** Các nhà cung cấp email công cộng — không suy ra được domain công ty. */
const PUBLIC_EMAIL_PROVIDERS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.com.vn",
  "hotmail.com",
  "outlook.com",
  "outlook.com.vn",
  "live.com",
  "icloud.com",
  "msn.com",
  "aol.com",
  "zoho.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
]);

export function extractCompanyDomain(email: string): CompanyDomainGuess {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  const domain = at > 0 ? trimmed.slice(at + 1) : null;
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return { email, domain: null, website: null, isPublicProvider: false };
  }
  const isPublicProvider = PUBLIC_EMAIL_PROVIDERS.has(domain);
  return {
    email,
    domain,
    website: isPublicProvider ? null : `https://${domain}`,
    isPublicProvider,
  };
}

// ---------------------------------------------------------------------------
// web_search: backend cấu hình qua env SEARCH_PROVIDER
// ---------------------------------------------------------------------------
//
// Quyết định của người dùng ngày 2026-10-13: web search thật phải cấu hình
// được, chọn 1 trong 3 backend:
//
// - "tool": POST JSON { query, maxResults } tới SEARCH_TOOL_URL (tool tìm kiếm
//   tự dựng — VD: n8n webhook, Cloudflare Worker, scraper riêng).
//   Kỳ vọng trả về { results: [{ title, url, snippet }] }.
//   SEARCH_TOOL_KEY (tùy chọn): gửi kèm header Authorization: Bearer.
// - "api": search API có sẵn (Tavily / Serper / Brave...). Cấu hình
//   SEARCH_API_URL + SEARCH_API_KEY (+ SEARCH_API_KEY_HEADER, mặc định
//   "X-API-KEY"). Request POST { query, max_results }; parse nhiều shape
//   phổ biến về dạng chuẩn { title, url, snippet }.
// - "fetch": không cần key — fetch trực tiếp DuckDuckGo HTML và parse kết quả
//   (best-effort, có thể bị giới hạn tần suất).
// - "none" (mặc định): không tìm kiếm, tool trả { available: false }.

export type SearchProvider = "tool" | "api" | "fetch" | "tinyfish" | "none";

export function getSearchProvider(): SearchProvider {
  const raw = (process.env.SEARCH_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "tool" || raw === "api" || raw === "fetch" || raw === "tinyfish") {
    return raw;
  }
  return "none";
}

export function isWebSearchAvailable(): boolean {
  const provider = getSearchProvider();
  if (provider === "tool") return Boolean((process.env.SEARCH_TOOL_URL ?? "").trim());
  if (provider === "api") {
    return Boolean(
      (process.env.SEARCH_API_URL ?? "").trim() &&
        (process.env.SEARCH_API_KEY ?? "").trim(),
    );
  }
  if (provider === "fetch") return true;
  if (provider === "tinyfish") return Boolean(getTinyFishApiKey());
  return false;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResult {
  available: boolean;
  message: string;
  provider?: SearchProvider;
  results?: WebSearchResultItem[];
}

function normalizeItem(raw: unknown): WebSearchResultItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // Hỗ trợ nhiều shape: {title,url,snippet} | {title,link,snippet} |
  // {title,url,content} | {title,link,description}
  const title = [r.title, r.name].find((v) => typeof v === "string") as string | undefined;
  const url = [r.url, r.link].find((v) => typeof v === "string") as string | undefined;
  const snippet = [r.snippet, r.content, r.description, r.text].find(
    (v) => typeof v === "string",
  ) as string | undefined;
  if (!title || !url) return null;
  return { title, url, snippet: snippet ?? "" };
}

function extractResults(data: unknown): WebSearchResultItem[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  // Tavily: { results: [...] } | Serper: { organic: [...] } |
  // Brave: { web: { results: [...] } } | generic: { items: [...] }
  const candidates: unknown[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) candidates.push(...v);
  };
  push(d.results);
  push(d.organic);
  push(d.items);
  const web = d.web as Record<string, unknown> | undefined;
  if (web && typeof web === "object") push(web.results);
  return candidates
    .map(normalizeItem)
    .filter((x): x is WebSearchResultItem => x !== null);
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Backend "tool": POST tới tool tìm kiếm tự cấu hình. */
async function searchViaTool(
  query: string,
  maxResults: number,
): Promise<WebSearchResultItem[]> {
  const toolUrl = (process.env.SEARCH_TOOL_URL ?? "").trim();
  const toolKey = (process.env.SEARCH_TOOL_KEY ?? "").trim();
  const res = await fetchWithTimeout((await assertEgressAllowed(toolUrl)).href, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(toolKey ? { Authorization: `Bearer ${toolKey}` } : {}),
    },
    body: JSON.stringify({ query, maxResults }),
  });
  if (!res.ok) {
    throw new Error(`Tool tìm kiếm trả mã ${res.status}.`);
  }
  return extractResults(await res.json()).slice(0, maxResults);
}

/** Backend "api": search API có sẵn (Tavily/Serper/Brave...). */
async function searchViaApi(
  query: string,
  maxResults: number,
): Promise<WebSearchResultItem[]> {
  const apiUrl = (process.env.SEARCH_API_URL ?? "").trim();
  const apiKey = (process.env.SEARCH_API_KEY ?? "").trim();
  const keyHeader = (process.env.SEARCH_API_KEY_HEADER ?? "").trim() || "X-API-KEY";
  const res = await fetchWithTimeout((await assertEgressAllowed(apiUrl)).href, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [keyHeader]: apiKey,
    },
    body: JSON.stringify({ query, max_results: maxResults, q: query }),
  });
  if (!res.ok) {
    throw new Error(`Search API trả mã ${res.status}.`);
  }
  return extractResults(await res.json()).slice(0, maxResults);
}

/** Backend "fetch": parse DuckDuckGo HTML, không cần key (best-effort). */
async function searchViaFetch(
  query: string,
  maxResults: number,
): Promise<WebSearchResultItem[]> {
  const ddgUrl = await assertEgressAllowed("https://html.duckduckgo.com/html/");
  ddgUrl.searchParams.set("q", query);
  const res = await fetchWithTimeout(ddgUrl.href, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`DuckDuckGo trả mã ${res.status}.`);
  }
  const html = await res.text();
  const items: WebSearchResultItem[] = [];
  // Mỗi kết quả: <a class="result__a" href="...">tiêu đề</a> ... <a class="result__snippet">...</a>
  const re =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const stripTags = (s: string) =>
    s
      .replace(/[<>]/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .trim();
  const decodeDdg = (href: string) => {
    try {
      if (href.includes("duckduckgo.com/l/")) {
        const u = new URL(href.startsWith("//") ? `https:${href}` : href);
        const uddg = u.searchParams.get("uddg");
        if (uddg) return decodeURIComponent(uddg);
      }
    } catch {
      // bỏ qua, dùng href gốc
    }
    return href.startsWith("//") ? `https:${href}` : href;
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && items.length < maxResults) {
    const url = decodeDdg(m[1] ?? "");
    const title = stripTags(m[2] ?? "");
    const snippet = stripTags(m[3] ?? "");
    if (url && title && url.startsWith("http")) {
      items.push({ title, url, snippet });
    }
  }
  return items;
}

/** Backend "tinyfish": Search API của TinyFish (1 key cho search + fetch). */
async function searchViaTinyFish(
  query: string,
  maxResults: number,
): Promise<WebSearchResultItem[]> {
  const items = await tinyFishSearch(query, { maxResults });
  return items
    .filter((item) => item.url.startsWith("http") && item.title)
    .slice(0, maxResults)
    .map((item) => ({ title: item.title, url: item.url, snippet: item.snippet }));
}

export async function runWebSearch(
  query: string,
  maxResults = 3,
): Promise<WebSearchResult> {
  const provider = getSearchProvider();
  if (!isWebSearchAvailable()) {
    return {
      available: false,
      provider,
      message:
        "Chưa cấu hình web search (SEARCH_PROVIDER=tool|api|fetch|tinyfish). Agent bỏ qua tìm kiếm web.",
    };
  }
  try {
    const results =
      provider === "tool"
        ? await searchViaTool(query, maxResults)
        : provider === "api"
          ? await searchViaApi(query, maxResults)
          : provider === "tinyfish"
            ? await searchViaTinyFish(query, maxResults)
            : await searchViaFetch(query, maxResults);
    return {
      available: true,
      provider,
      results,
      message:
        results.length > 0
          ? `Tìm thấy ${results.length} kết quả cho "${query}".`
          : `Không tìm thấy kết quả cho "${query}".`,
    };
  } catch (err) {
    return {
      available: false,
      provider,
      message:
        "Tìm kiếm web thất bại: " +
        (err instanceof Error ? err.message : "lỗi không xác định"),
    };
  }
}

// ---------------------------------------------------------------------------
// Tool definitions cho Vercel AI SDK
// ---------------------------------------------------------------------------

const normalizeVnPhoneTool = tool({
  description: loadEnrichmentMarkdown("skills/normalize-vn-phone.md"),
  inputSchema: z.object({
    phone: z.string().describe("Số điện thoại thô cần chuẩn hoá"),
  }),
  execute: async ({ phone }: { phone: string }) => normalizeVnPhone(phone),
});

const extractCompanyDomainTool = tool({
  description: loadEnrichmentMarkdown("skills/extract-company-domain.md"),
  inputSchema: z.object({
    email: z.string().describe("Địa chỉ email cần phân tích"),
  }),
  execute: async ({ email }: { email: string }) => extractCompanyDomain(email),
});

const webSearchTool = tool({
  description: loadEnrichmentMarkdown("skills/web-search.md"),
  inputSchema: z.object({
    query: z.string().describe("Từ khoá tìm kiếm"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Số kết quả tối đa (mặc định 3)"),
  }),
  execute: async ({
    query,
    maxResults,
  }: {
    query: string;
    maxResults?: number;
  }): Promise<WebSearchResult> => {
    return runWebSearch(query, maxResults ?? 3);
  },
});

let registrySeeded = false;

/** Bộ tool đầy đủ cho agent loop. */
export function buildEnrichmentTools() {
  const tools = {
    normalize_vn_phone: normalizeVnPhoneTool,
    extract_company_domain: extractCompanyDomainTool,
    web_search: webSearchTool,
    web_fetch: webFetchTool,
  };

  if (registrySeeded) return tools;
  registrySeeded = true;
  // Đăng ký vào registry dùng chung (pattern bóc từ ZCode) — chỉ một lần.
  toolRegistry.register({
    metadata: {
      name: "normalize_vn_phone",
      description: "Chuẩn hoá SĐT Việt Nam về +84 kèm nhà mạng.",
      category: "internal",
      readOnly: true,
      riskLevel: "low",
      needsApproval: false,
      origin: "eventlead",
    },
    tool: normalizeVnPhoneTool,
  });
  toolRegistry.register({
    metadata: {
      name: "extract_company_domain",
      description: "Suy domain/website công ty từ email.",
      category: "internal",
      readOnly: true,
      riskLevel: "low",
      needsApproval: false,
      origin: "eventlead",
    },
    tool: extractCompanyDomainTool,
  });
  toolRegistry.register({
    metadata: {
      name: "web_search",
      description: "Tìm kiếm thông tin công khai trên web theo từ khoá.",
      category: "web",
      readOnly: true,
      riskLevel: "medium",
      needsApproval: true,
      origin: "eventlead",
    },
    tool: webSearchTool,
  });
  toolRegistry.register({
    metadata: {
      name: "web_fetch",
      description:
        "Đọc nội dung text của một URL công khai (sau web_search hoặc từ website suy ra).",
      category: "web",
      readOnly: true,
      riskLevel: "medium",
      needsApproval: true,
      origin: "zcode-port",
    },
    tool: webFetchTool,
  });

  return tools;
}

export type EnrichmentToolSet = ReturnType<typeof buildEnrichmentTools>;
