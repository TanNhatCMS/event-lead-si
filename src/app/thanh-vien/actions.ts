"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationContext, hasOrganizationRole } from "@/lib/auth/organization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type MemberActionState = { error?: string; success?: string } | null;

type GuardResult =
  | { ok: true; supabase: NonNullable<Awaited<ReturnType<typeof getOrganizationContext>>["supabase"]>; orgId: string; role: string }
  | { ok: false; state: MemberActionState };

async function requireAdmin(): Promise<GuardResult> {
  const { supabase, user, membership } = await getOrganizationContext();
  if (!supabase || !user) redirect("/login?next=/thanh-vien");
  if (!membership) redirect("/thiet-lap");
  if (!hasOrganizationRole(membership.role, ["owner", "admin"])) {
    return { ok: false, state: { error: "Bạn không có quyền quản lý thành viên." } };
  }
  return { ok: true, supabase, orgId: membership.organization_id as string, role: membership.role as string };
}

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
};

async function getMembership(supabase: NonNullable<Awaited<ReturnType<typeof getOrganizationContext>>["supabase"]>, orgId: string, membershipId: string) {
  const { data } = await supabase
    .from("memberships")
    .select("id, organization_id, user_id, role, status")
    .eq("id", membershipId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data ?? null) as MembershipRow | null;
}

async function countOtherActiveOwners(
  supabase: NonNullable<Awaited<ReturnType<typeof getOrganizationContext>>["supabase"]>,
  orgId: string,
  excludeId: string,
) {
  const { count } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("role", "owner")
    .eq("status", "active")
    .neq("id", excludeId);
  return count ?? 0;
}

/**
 * Kiểm tra actor có được phép tác động lên target không.
 * - Chỉ owner mới được gán/gỡ vai trò owner.
 * - Admin không được sửa owner (vai trò, trạng thái, xóa).
 * - Không được hạ cấp/tạm ngưng/xóa owner active duy nhất.
 */
function checkTargetPermission(
  actorRole: string,
  target: MembershipRow,
  change: { toRole?: string; toStatus?: string; remove?: boolean },
): string | null {
  const targetIsOwner = target.role === "owner";
  const becomesNonOwner = change.toRole !== undefined && change.toRole !== "owner";
  const becomesNonActive = change.toStatus !== undefined && change.toStatus !== "active";

  if (actorRole !== "owner") {
    if (targetIsOwner) return "Quản trị viên không được thay đổi chủ sở hữu.";
    if (change.toRole === "owner") return "Chỉ chủ sở hữu mới được gán vai trò chủ sở hữu.";
    return null;
  }
  if (targetIsOwner && (becomesNonOwner || becomesNonActive || change.remove)) {
    return "LAST_OWNER";
  }
  return null;
}

async function resolveLastOwner(
  supabase: NonNullable<Awaited<ReturnType<typeof getOrganizationContext>>["supabase"]>,
  orgId: string,
  target: MembershipRow,
  denied: string | null,
): Promise<string | null> {
  if (denied !== "LAST_OWNER") return denied;
  const others = await countOtherActiveOwners(supabase, orgId, target.id);
  if (others === 0) {
    return "Không thể thực hiện: đây là chủ sở hữu đang hoạt động duy nhất của tổ chức.";
  }
  return null;
}

const emailSchema = z.string().trim().toLowerCase().email("Địa chỉ email không hợp lệ.").max(255);

export async function inviteMemberAction(_state: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.state;
  const { supabase, orgId } = guard;

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Email không hợp lệ." };
  const email = parsed.data;

  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Chưa cấu hình khóa service-role trên máy chủ. Không thể tra cứu tài khoản." };

  // Tra cứu user theo email để lấy user_id (service-role chỉ dùng phía server).
  const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) return { error: "Không tra cứu được tài khoản. Vui lòng thử lại." };
  let invitedUserId = usersPage.users.find((u) => u.email?.toLowerCase() === email)?.id;

  // Email chưa có tài khoản: gửi thư mời Supabase (tạo user + email xác nhận).
  // redirectTo phải nằm trong danh sách Redirect URLs của project.
  if (!invitedUserId) {
    const headerStore = await headers();
    const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
    const proto = headerStore.get("x-forwarded-proto") ?? "https";
    const redirectTo = host ? `${proto}://${host}/auth/callback?next=/thiet-lap` : undefined;
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (inviteError || !invited.user) {
      return {
        error: `Không gửi được thư mời tới ${email}. Người này có thể đăng ký trước tại trang /dang-ky, sau đó bạn mời lại.`,
      };
    }
    invitedUserId = invited.user.id;
  }

  const { data: existing } = await supabase
    .from("memberships")
    .select("id, status")
    .eq("organization_id", orgId)
    .eq("user_id", invitedUserId)
    .maybeSingle();

  if (existing) {
    const status = (existing as { status: string }).status;
    if (status === "active") return { error: "Người này đã là thành viên của tổ chức." };
    if (status === "invited") return { error: "Đã gửi lời mời cho email này trước đó." };
    return { error: "Email này đã từng thuộc tổ chức (đang tạm ngưng). Hãy kích hoạt lại thay vì mời mới." };
  }

  // Insert qua client của người đăng nhập để RLS (memberships_manage_admin) kiểm soát.
  const { error: insertError } = await supabase.from("memberships").insert({
    organization_id: orgId,
    user_id: invitedUserId,
    role: "member",
    status: "invited",
  });
  if (insertError) return { error: "Không gửi được lời mời. Vui lòng thử lại." };

  revalidatePath("/thanh-vien");
  return { success: `Đã mời ${email}. Họ bấm liên kết trong email để tham gia tổ chức.` };
}

const targetSchema = z.object({ membership_id: z.string().uuid() });

export async function changeRoleAction(_state: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.state;
  const { supabase, orgId, role: actorRole } = guard;

  const parsedId = targetSchema.safeParse({ membership_id: formData.get("membership_id") });
  const newRole = z.enum(["owner", "admin", "member"]).safeParse(formData.get("role"));
  if (!parsedId.success || !newRole.success) return { error: "Dữ liệu không hợp lệ." };

  const target = await getMembership(supabase, orgId, parsedId.data.membership_id);
  if (!target) return { error: "Không tìm thấy thành viên." };
  if (target.role === newRole.data) return { success: "Vai trò không thay đổi." };

  const denied = await resolveLastOwner(supabase, orgId, target, checkTargetPermission(actorRole, target, { toRole: newRole.data }));
  if (denied) return { error: denied };

  const { error } = await supabase.from("memberships").update({ role: newRole.data }).eq("id", target.id);
  if (error) return { error: "Không đổi được vai trò. Vui lòng thử lại." };

  revalidatePath("/thanh-vien");
  return { success: "Đã cập nhật vai trò." };
}

export async function setStatusAction(_state: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.state;
  const { supabase, orgId, role: actorRole } = guard;

  const parsedId = targetSchema.safeParse({ membership_id: formData.get("membership_id") });
  const newStatus = z.enum(["active", "suspended"]).safeParse(formData.get("status"));
  if (!parsedId.success || !newStatus.success) return { error: "Dữ liệu không hợp lệ." };

  const target = await getMembership(supabase, orgId, parsedId.data.membership_id);
  if (!target) return { error: "Không tìm thấy thành viên." };
  if (target.status === "invited" && newStatus.data === "active") {
    return { error: "Lời mời phải do chính người được mời chấp nhận khi đăng nhập." };
  }
  if (target.status === newStatus.data) return { success: "Trạng thái không thay đổi." };

  const denied = await resolveLastOwner(supabase, orgId, target, checkTargetPermission(actorRole, target, { toStatus: newStatus.data }));
  if (denied) return { error: denied };

  const { error } = await supabase.from("memberships").update({ status: newStatus.data }).eq("id", target.id);
  if (error) return { error: "Không cập nhật được trạng thái. Vui lòng thử lại." };

  revalidatePath("/thanh-vien");
  return { success: newStatus.data === "suspended" ? "Đã tạm ngưng thành viên." : "Đã kích hoạt lại thành viên." };
}

export async function removeMemberAction(_state: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.state;
  const { supabase, orgId, role: actorRole } = guard;

  const parsedId = targetSchema.safeParse({ membership_id: formData.get("membership_id") });
  if (!parsedId.success) return { error: "Dữ liệu không hợp lệ." };

  const target = await getMembership(supabase, orgId, parsedId.data.membership_id);
  if (!target) return { error: "Không tìm thấy thành viên." };

  const denied = await resolveLastOwner(supabase, orgId, target, checkTargetPermission(actorRole, target, { remove: true }));
  if (denied) return { error: denied };

  const { error } = await supabase.from("memberships").delete().eq("id", target.id);
  if (error) return { error: "Không xóa được thành viên. Vui lòng thử lại." };

  revalidatePath("/thanh-vien");
  return { success: "Đã xóa thành viên khỏi tổ chức." };
}
