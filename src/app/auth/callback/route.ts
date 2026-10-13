import { NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/auth/organization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Callback cho Supabase Auth: đổi code (PKCE / liên kết xác nhận email)
 * thành phiên đăng nhập rồi chuyển hướng.
 *
 * Nếu user có lời mời đang chờ (membership status='invited'), tự động
 * kích hoạt để họ vào thẳng tổ chức mà không cần bấm "chấp nhận".
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"), "/thiet-lap");

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        const admin = createSupabaseAdminClient();
        if (admin) {
          await admin
            .from("memberships")
            .update({ status: "active" })
            .eq("user_id", data.user.id)
            .eq("status", "invited");
        }
        return NextResponse.redirect(new URL(next, request.url));
      }
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "callback");
  return NextResponse.redirect(loginUrl);
}
