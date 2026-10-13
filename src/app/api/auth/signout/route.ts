import { NextResponse } from "next/server";

import { ACTIVE_ORG_COOKIE } from "@/lib/auth/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Đăng xuất: xóa phiên Supabase phía server + cookie tổ chức đang hoạt động. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ACTIVE_ORG_COOKIE);
  return response;
}
