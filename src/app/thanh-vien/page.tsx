import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { getOrganizationContext, hasOrganizationRole } from "@/lib/auth/organization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MemberManager, type MemberRow } from "./member-manager";

export const instant = false;

export default async function MembersPage() {
  const { supabase, user, membership } = await getOrganizationContext();
  if (!user) redirect("/login?next=/thanh-vien");
  if (!supabase || !membership) redirect("/thiet-lap");

  if (!hasOrganizationRole(membership.role, ["owner", "admin"])) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <ShieldAlert size={24} />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">403 — Không có quyền truy cập</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Chỉ chủ sở hữu và quản trị viên của tổ chức mới được quản lý thành viên.
          </p>
        </div>
      </AppShell>
    );
  }

  const orgId = membership.organization_id as string;
  const actorRole = membership.role as string;

  const { data: members } = await supabase
    .from("memberships")
    .select("id, user_id, role, status, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  // Tra cứu email qua service-role (chỉ phía server, không ra client).
  const emailByUserId = new Map<string, string>();
  const admin = createSupabaseAdminClient();
  if (admin) {
    const userIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);
    // listUsers không lọc theo id; duyệt tối đa 1000 user rồi đối chiếu.
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (userIds.includes(u.id) && u.email) emailByUserId.set(u.id, u.email);
    }
  }

  const rows: MemberRow[] = (members ?? []).map((m) => {
    const row = m as { id: string; user_id: string; role: string; status: string; created_at: string };
    return {
      id: row.id,
      email: emailByUserId.get(row.user_id) ?? "—",
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      isSelf: row.user_id === user.id,
    };
  });

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-indigo-600">Tổ chức</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Quản lý thành viên</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Mời thành viên mới bằng email, phân vai trò và quản lý trạng thái. Mọi thay đổi được ghi nhận theo tổ chức.
        </p>
      </div>
      <MemberManager members={rows} actorRole={actorRole} />
    </AppShell>
  );
}
