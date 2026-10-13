"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ACTIVE_ORG_COOKIE } from "@/lib/auth/constants";
import { getOrganizationContext } from "@/lib/auth/organization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const nameSchema = z.string().trim().min(1, "Vui lòng nhập tên tổ chức.").max(160, "Tên tổ chức tối đa 160 ký tự.");

export type CreateOrgState = { error?: string } | null;

export async function createOrganizationAction(_state: CreateOrgState, formData: FormData): Promise<CreateOrgState> {
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) {
    return { error: name.error.issues[0]?.message ?? "Tên tổ chức không hợp lệ." };
  }

  const { supabase, user, membership } = await getOrganizationContext();
  if (!supabase || !user) redirect("/login");
  if (membership) redirect("/");

  // RPC create_organization là security definer: tự tạo tổ chức + gán caller làm owner.
  const { data: orgId, error } = await supabase.rpc("create_organization", { org_name: name.data });
  if (error || !orgId) {
    return { error: "Không tạo được tổ chức. Vui lòng thử lại." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId as string, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/");
}

export type AcceptInviteState = { error?: string } | null;

/**
 * Người được mời (status='invited') chấp nhận lời mời khi đăng nhập.
 * Dùng service-role phía server vì RLS chỉ cho phép đọc membership 'active';
 * đã kiểm tra lời mời thuộc đúng user đang đăng nhập trước khi cập nhật.
 */
export async function acceptInviteAction(_state: AcceptInviteState, formData: FormData): Promise<AcceptInviteState> {
  const { user } = await getOrganizationContext();
  if (!user) redirect("/login?next=/thiet-lap");

  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Chưa cấu hình máy chủ. Vui lòng thử lại sau." };

  const membershipId = z.string().uuid().safeParse(formData.get("membership_id"));
  if (!membershipId.success) return { error: "Lời mời không hợp lệ." };

  const { data: invitation } = await admin
    .from("memberships")
    .select("id, organization_id, user_id, status")
    .eq("id", membershipId.data)
    .maybeSingle();

  const row = invitation as { id: string; organization_id: string; user_id: string; status: string } | null;
  if (!row || row.user_id !== user.id || row.status !== "invited") {
    return { error: "Không tìm thấy lời mời." };
  }

  const { error } = await admin
    .from("memberships")
    .update({ status: "active" })
    .eq("id", membershipId.data);
  if (error) return { error: "Không chấp nhận được lời mời. Vui lòng thử lại." };

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, row.organization_id, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/");
}
