import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getOrganizationContext } from "@/lib/auth/organization";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AcceptInviteCard } from "./accept-invite-card";
import { OnboardingOptions } from "./onboarding-options";

export const instant = false;

type InviteRow = {
  id: string;
  organization_id: string;
  organizations: { id: string; name: string } | { id: string; name: string }[] | null;
};

export default async function SetupPage() {
  const { user, membership } = await getOrganizationContext();
  if (!user) redirect("/login?next=/thiet-lap");
  if (membership) redirect("/");

  // Lời mời đang chờ: đọc bằng service-role phía server vì RLS chỉ cho
  // phép user đọc membership 'active'.
  let invites: { id: string; orgName: string }[] = [];
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data } = await admin
      .from("memberships")
      .select("id, organization_id, organizations ( id, name )")
      .eq("user_id", user.id)
      .eq("status", "invited")
      .order("created_at", { ascending: true });
    invites = ((data ?? []) as InviteRow[]).map((row) => {
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
      return { id: row.id, orgName: org?.name ?? "Tổ chức" };
    });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-indigo-600">Bắt đầu sử dụng</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Thiết lập tổ chức</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Tài khoản của bạn chưa thuộc tổ chức nào. Chọn một trong các cách sau để tiếp tục.
        </p>

        {invites.length > 0 && (
          <div className="mt-6 space-y-4">
            {invites.map((invite) => (
              <AcceptInviteCard key={invite.id} membershipId={invite.id} orgName={invite.orgName} />
            ))}
          </div>
        )}

        <div className="mt-6">
          <OnboardingOptions userEmail={user.email ?? ""} />
        </div>
      </div>
    </AppShell>
  );
}
