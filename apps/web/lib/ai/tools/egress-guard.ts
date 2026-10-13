/**
 * Egress guard cho các tool ra mạng ngoài — bóc tách từ ZCode
 * (`apps/zcode-cli/packages/core/src/tool/handlers/webfetch-egress-guard.ts`
 * + `webfetch-preapproved.ts`).
 *
 * ZCode chặn WebFetch truy cập hostname/IP nội bộ (private, loopback,
 * link-local — bao gồm endpoint metadata của cloud như 169.254.169.254)
 * và có khái niệm "pre-approved" cho các host tin cậy.
 *
 * Bản port:
 * - Chặn: localhost, dải IP private/loopback/link-local (sau khi resolve DNS),
 *   hostname nội bộ (*.local, *.internal, ...), scheme khác http/https.
 * - `WEBFETCH_ALLOWLIST` (phân cách bằng dấu phẩy): khi đặt, chỉ các domain
 *   này (và subdomain của chúng) được fetch — tương đương pre-approved của ZCode.
 * - `WEBFETCH_BLOCKLIST`: domain không bao giờ được fetch.
 */

import { lookup } from "node:dns/promises";

export class EgressBlockedError extends Error {
  readonly code = "EgressBlocked";
  constructor(message: string) {
    super(message);
    this.name = "EgressBlockedError";
  }
}

const INTERNAL_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".invalid",
  ".test",
];

function parseEnvList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatches(host: string, pattern: string): boolean {
  return host === pattern || host.endsWith("." + pattern);
}

/** true khi chuỗi là IPv4 thuộc dải cấm (private/loopback/link-local/...). */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  return (
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 loopback
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local (cloud metadata!)
    a === 0 // 0.0.0.0/8
  );
}

/** true khi chuỗi là IPv6 thuộc dải cấm. */
function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" || // loopback
    lower === "::" || // unspecified
    lower.startsWith("fc") || // fc00::/7 unique local
    lower.startsWith("fd") || // (dạng viết gọn của fc00::/7)
    lower.startsWith("fe80") // fe80::/10 link-local
  );
}

/**
 * Kiểm tra một URL có được phép fetch không. Ném `EgressBlockedError`
 * khi bị chặn. Trả về đối tượng URL đã parse khi hợp lệ.
 */
export async function assertEgressAllowed(urlInput: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlInput);
  } catch {
    throw new EgressBlockedError(`URL không hợp lệ: ${urlInput}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EgressBlockedError(
      `Chỉ cho phép fetch http/https, nhận được: ${url.protocol}`
    );
  }

  const host = url.hostname.toLowerCase();
  if (!host) {
    throw new EgressBlockedError("URL thiếu hostname.");
  }

  // 1. Chặn hostname nội bộ dạng tên.
  if (
    host === "localhost" ||
    INTERNAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    throw new EgressBlockedError(
      `WebFetch không được truy cập host nội bộ: ${host}`
    );
  }

  // 2. Chặn IP viết trực tiếp trong URL.
  if (isBlockedIpv4(host) || isBlockedIpv6(host.replace(/^\[|\]$/g, ""))) {
    throw new EgressBlockedError(
      `WebFetch không được truy cập địa chỉ IP nội bộ: ${host}`
    );
  }

  // 3. Resolve DNS rồi chặn IP nội bộ phía sau (chống DNS rebinding).
  let resolved: string[];
  try {
    resolved = await lookup(host, { all: true }).then((records) =>
      records.map((r) => r.address)
    );
  } catch {
    throw new EgressBlockedError(`Không resolve được hostname: ${host}`);
  }
  for (const ip of resolved) {
    if (isBlockedIpv4(ip) || isBlockedIpv6(ip)) {
      throw new EgressBlockedError(
        `WebFetch không được truy cập host nội bộ (resolve ra ${ip}): ${host}`
      );
    }
  }

  // 4. Blocklist luôn thắng.
  const blocklist = parseEnvList(process.env.WEBFETCH_BLOCKLIST);
  if (blocklist.some((pattern) => hostMatches(host, pattern))) {
    throw new EgressBlockedError(`Host nằm trong WEBFETCH_BLOCKLIST: ${host}`);
  }

  // 5. Allowlist (pre-approved): khi đặt, chỉ các domain này được fetch.
  const allowlist = parseEnvList(process.env.WEBFETCH_ALLOWLIST);
  if (
    allowlist.length > 0 &&
    !allowlist.some((pattern) => hostMatches(host, pattern))
  ) {
    throw new EgressBlockedError(
      `Host không nằm trong WEBFETCH_ALLOWLIST: ${host}`
    );
  }

  return url;
}
