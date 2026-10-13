/**
 * Tool `web_fetch` — bóc tách từ ZCode
 * (`apps/zcode-cli/packages/core/src/tool/handlers/webfetch*.ts`).
 *
 * ZCode WebFetch: fetch URL công khai → trích nội dung đọc được → giới hạn
 * output (MAX_WEBFETCH_MODEL_BYTES), timeout riêng, cache, egress guard,
 * và metadata riskLevel=medium / needsApproval.
 *
 * Bản port cho enrichment agent: sau khi `web_search` trả về URL (hoặc
 * `extract_company_domain` suy ra website), agent dùng `web_fetch` để đọc
 * nội dung thật của trang thay vì chỉ đọc snippet — giúp phát hiện lĩnh vực,
 * quy mô, sản phẩm/dịch vụ của công ty chính xác hơn.
 *
 * An toàn: mọi URL đi qua `assertEgressAllowed` (chặn IP nội bộ, cloud
 * metadata, allowlist/blocklist qua env). Tool chỉ đọc (readOnly), không
 * gửi form hay gọi API ghi.
 */

import { tool } from "ai";
import { z } from "zod";

import { loadEnrichmentMarkdown } from "../enrichment/load-markdown";
import { assertEgressAllowed, EgressBlockedError } from "./egress-guard";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_CHARS_DEFAULT = 8000;
const MAX_CHARS_LIMIT = 20000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 50;

export interface WebFetchResult {
  available: boolean;
  url?: string;
  /** Tiêu đề trang (thẻ <title>), nếu trích được. */
  title?: string;
  /** Nội dung text đã làm sạch, có thể bị cắt ngắn. */
  text?: string;
  /** true khi nội dung bị cắt ở MAX_CHARS. */
  truncated?: boolean;
  /** Lý do khi available=false. */
  message?: string;
}

interface CacheEntry {
  result: WebFetchResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(url: string): WebFetchResult | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(url);
    return null;
  }
  return entry.result;
}

function setCached(url: string, result: WebFetchResult): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(url, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Trích text đọc được từ HTML: bỏ script/style, thẻ, khoảng trắng thừa. */
function extractReadableText(html: string): { title?: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() || undefined;

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");

  // Giải mã một số HTML entity phổ biến.
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  return { title, text };
}

export async function runWebFetch(
  urlInput: string,
  maxChars = MAX_CHARS_DEFAULT
): Promise<WebFetchResult> {
  const max = Math.min(Math.max(1000, maxChars), MAX_CHARS_LIMIT);

  const cached = getCached(urlInput);
  if (cached) return cached;

  let url: URL;
  try {
    url = await assertEgressAllowed(urlInput);
  } catch (err) {
    const message =
      err instanceof EgressBlockedError
        ? `URL bị chặn bởi egress guard: ${err.message}`
        : "URL không hợp lệ.";
    return { available: false, message };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "EventLead-SI/1.0 (+enrichment-agent; fetch nội dung công khai)",
        accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
      },
    });

    if (!res.ok) {
      return {
        available: false,
        url: url.toString(),
        message: `Fetch thất bại: HTTP ${res.status}.`,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("text/")) {
      return {
        available: false,
        url: url.toString(),
        message: `Bỏ qua content-type không phải text: ${contentType || "không rõ"}.`,
      };
    }

    const html = await res.text();
    const { title, text } = extractReadableText(html);
    if (!text) {
      return {
        available: false,
        url: url.toString(),
        message: "Trang không có nội dung text đọc được.",
      };
    }

    const truncated = text.length > max;
    const result: WebFetchResult = {
      available: true,
      url: url.toString(),
      title,
      text: truncated ? text.slice(0, max) : text,
      truncated,
    };
    setCached(urlInput, result);
    return result;
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Fetch quá ${FETCH_TIMEOUT_MS / 1000}s — bỏ qua.`
        : `Fetch thất bại: ${err instanceof Error ? err.message : "lỗi không xác định"}`;
    return { available: false, url: url.toString(), message };
  } finally {
    clearTimeout(timeout);
  }
}

export const webFetchTool = tool({
  description: loadEnrichmentMarkdown("skills/web-fetch.md"),
  inputSchema: z.object({
    url: z.string().describe("URL công khai cần đọc nội dung"),
    maxChars: z
      .number()
      .int()
      .min(1000)
      .max(MAX_CHARS_LIMIT)
      .optional()
      .describe(`Số ký tự tối đa muốn lấy (mặc định ${MAX_CHARS_DEFAULT})`),
  }),
  execute: async ({
    url,
    maxChars,
  }: {
    url: string;
    maxChars?: number;
  }): Promise<WebFetchResult> => {
    return runWebFetch(url, maxChars ?? MAX_CHARS_DEFAULT);
  },
});
