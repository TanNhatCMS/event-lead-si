import { tool } from "ai";
import { z } from "zod";

import { loadEnrichmentMarkdown } from "./load-markdown";

/**
 * Các tool/skill mà agent loop dùng để thu thập thông tin.
 * Hai tool đầu là hàm thuần (pure), luôn khả dụng. `web_search` bị giới hạn:
 * chỉ trả kết quả khi có SEARCH_API_KEY — ngược lại trả `{ available: false }`
 * để agent tự bỏ qua và không "bịa" kết quả tìm kiếm.
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
// web_search: bị giới hạn bởi SEARCH_API_KEY + provider chưa chốt
// ---------------------------------------------------------------------------

export function isWebSearchAvailable(): boolean {
  return Boolean((process.env.SEARCH_API_KEY ?? "").trim());
}

export interface WebSearchResult {
  available: boolean;
  message: string;
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
  execute: async (): Promise<WebSearchResult> => {
    if (!isWebSearchAvailable()) {
      return {
        available: false,
        message:
          "Chưa cấu hình SEARCH_API_KEY — agent bỏ qua tìm kiếm web. " +
          "Chỉ dùng hai tool chuẩn hoá nội bộ.",
      };
    }
    // TODO: provider tìm kiếm web chưa được chốt (xem plan.md Giai đoạn 2).
    // Khi đã chọn provider (VD: Exa, Tavily, Brave Search), implement gọi API
    // thật tại đây và trả về danh sách { title, url, snippet }.
    return {
      available: false,
      message:
        "TODO: provider tìm kiếm web chưa được chốt — chưa gọi API thật. " +
        "Agent bỏ qua tìm kiếm web ở phiên bản này.",
    };
  },
});

/** Bộ tool đầy đủ cho agent loop. */
export function buildEnrichmentTools() {
  return {
    normalize_vn_phone: normalizeVnPhoneTool,
    extract_company_domain: extractCompanyDomainTool,
    web_search: webSearchTool,
  };
}

export type EnrichmentToolSet = ReturnType<typeof buildEnrichmentTools>;
