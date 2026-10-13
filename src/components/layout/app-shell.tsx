import Link from "next/link";
import { ContactRound, FileUp, UsersRound } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { OrgSwitcher } from "@/components/auth/org-switcher";
import { getOrgOptions, hasOrganizationRole } from "@/lib/auth/organization";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { user, options, activeOrgId } = await getOrgOptions();
  const activeRole = options.find((option) => option.organization_id === activeOrgId)?.role;
  const canManageMembers = hasOrganizationRole(activeRole, ["owner", "admin"]);

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-indigo-600 text-white">
              <ContactRound size={18} />
            </div>
            <div className="hidden text-[15px] font-semibold tracking-tight sm:block">
              EventLead <span className="text-indigo-600">SI</span>
            </div>
          </Link>
          {user && options.length > 0 && (
            <div className="ml-1 hidden sm:block">
              <OrgSwitcher options={options} activeId={activeOrgId} />
            </div>
          )}
          <nav className="ml-auto flex items-center gap-1 text-sm">
            {user && (
              <Link
                href="/card-imports/new"
                className="hidden items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:inline-flex"
              >
                <FileUp size={16} /> Nhập danh thiếp
              </Link>
            )}
            {canManageMembers && (
              <Link
                href="/thanh-vien"
                className="hidden items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:inline-flex"
              >
                <UsersRound size={16} /> Thành viên
              </Link>
            )}
            {user ? (
              <>
                <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
                <span className="hidden max-w-40 truncate text-xs text-slate-500 lg:block" title={user.email ?? undefined}>
                  {user.email}
                </span>
                <LogoutButton />
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-9 items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Đăng nhập
              </Link>
            )}
          </nav>
        </div>
        {user && options.length > 1 && (
          <div className="border-t border-slate-100 px-4 py-2 sm:hidden">
            <OrgSwitcher options={options} activeId={activeOrgId} />
          </div>
        )}
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">{children}</div>
    </div>
  );
}
