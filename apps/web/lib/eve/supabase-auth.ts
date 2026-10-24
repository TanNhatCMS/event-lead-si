import type { AuthFn } from "eve/channels/auth";

/**
 * AuthFn cho kênh eve: xác thực người dùng EventLead bằng chính phiên
 * Supabase Auth của ứng dụng (không tạo cơ chế đăng nhập riêng cho agent).
 *
 * Token được lấy theo thứ tự:
 * 1. Header `Authorization: Bearer <access_token>` (client tự gắn — ví dụ
 *    `useEveAgent` với `headers` callback đọc session Supabase phía client).
 * 2. Cookie phiên Supabase SSR (`sb-<ref>-auth-token`, kể cả bản chunked
 *    `.0`/`.1` và bản bọc `base64-`) — trình duyệt tự gửi kèm vì route
 *    `/eve/v1/*` cùng origin với ứng dụng.
 *
 * Token được verify thật bằng cách gọi `GET /auth/v1/user` của Supabase
 * (không tự giải JWT ở đây) — token hết hạn/không hợp lệ → trả `null` để
 * auth walk chuyển sang entry tiếp theo, cuối cùng là 401 (fail-closed).
 */
export function supabaseSession(): AuthFn<Request> {
  return async (request) => {
    const supabaseUrl = (
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
    ).trim();
    const anonKey = (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    ).trim();
    if (!supabaseUrl || !anonKey) return null;

    const token = extractAccessToken(request);
    if (!token) return null;

    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
        // Không để một Supabase chậm treo cả auth walk của kênh.
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const user = (await res.json()) as {
        id?: string;
        email?: string;
      };
      if (!user.id) return null;
      const attributes: Record<string, string> = {};
      if (user.email) attributes.email = user.email;
      return {
        attributes,
        authenticator: "supabase",
        principalId: user.id,
        principalType: "user",
      };
    } catch {
      return null;
    }
  };
}

function extractAccessToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim();
    if (token) return token;
  }
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  return readSupabaseCookieToken(cookieHeader);
}

/**
 * Đọc access_token từ cookie phiên của @supabase/ssr. Cookie có thể bị
 * chunk thành `<name>.0`, `<name>.1`… và giá trị có thể là JSON thuần
 * hoặc tiền tố `base64-` + base64url(JSON) — cả hai đều chứa trường
 * `access_token`.
 */
function readSupabaseCookieToken(cookieHeader: string): string | null {
  const chunks = new Map<string, Map<number, string>>();
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    const match = /^sb-.+-auth-token(?:\.(\d+))?$/.exec(name);
    if (!match) continue;
    const base = name.replace(/\.\d+$/, "");
    const index = match[1] ? Number(match[1]) : 0;
    if (!chunks.has(base)) chunks.set(base, new Map());
    chunks.get(base)?.set(index, value);
  }
  for (const parts of chunks.values()) {
    const joined = [...parts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
      .join("");
    const token = decodeSessionValue(joined);
    if (token) return token;
  }
  return null;
}

function decodeSessionValue(raw: string): string | null {
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // giữ nguyên giá trị thô nếu không decode được
  }
  try {
    const parsed = JSON.parse(text) as { access_token?: string };
    return parsed.access_token ?? null;
  } catch {
    // thử dạng base64-
  }
  if (text.startsWith("base64-")) {
    try {
      const json = Buffer.from(
        text.slice("base64-".length),
        "base64url",
      ).toString("utf8");
      const parsed = JSON.parse(json) as { access_token?: string };
      return parsed.access_token ?? null;
    } catch {
      return null;
    }
  }
  return null;
}
