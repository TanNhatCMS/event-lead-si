import { NextResponse } from "next/server";
import { z } from "zod";

import { ACTIVE_ORG_COOKIE } from "@/lib/auth/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  organization_id: z.string().uuid("Tổ chức không hợp lệ"),
});

/**
 * Đặt tổ chức đang hoạt động cho phiên hiện tại.
 * Ghi cookie httpOnly, path=/, sameSite=lax.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Chưa cấu hình Supabase." }, { status: 500 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }

  // Chỉ cho phép chọn tổ chức mà user đang là thành viên active.
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("id, organizations ( id, name )")
    .eq("user_id", user.id)
    .eq("organization_id", parsed.data.organization_id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !membership) {
    return NextResponse.json({ error: "Bạn không thuộc tổ chức này." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACTIVE_ORG_COOKIE, parsed.data.organization_id, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
