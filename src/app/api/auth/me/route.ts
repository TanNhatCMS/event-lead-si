import { NextResponse } from "next/server";

import { getOrganizationContext } from "@/lib/auth/organization";

/** Thông tin phiên đăng nhập cho client sau khi đăng nhập/đăng ký. */
export async function GET() {
  const { user, membership } = await getOrganizationContext();
  if (!user) {
    return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  }
  return NextResponse.json({
    email: user.email,
    has_membership: !!membership,
  });
}
