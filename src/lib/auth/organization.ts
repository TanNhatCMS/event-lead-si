import { cookies } from "next/headers";

import { ACTIVE_ORG_COOKIE } from "@/lib/auth/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getOrganizationContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null, membership: null };

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { supabase, user: null, membership: null };

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("organization_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error || !memberships?.length) {
    return { supabase, user, membership: null };
  }

  const cookieStore = await cookies();
  const selectedId = cookieStore.get("eventlead-active-org")?.value;
  const membership = memberships.find((item) => item.organization_id === selectedId) ?? memberships[0];

  return { supabase, user, membership };
}

export function hasOrganizationRole(
  role: string | undefined,
  allowed: readonly ("owner" | "admin" | "member")[],
) {
  return role !== undefined && allowed.includes(role as (typeof allowed)[number]);
}

export type OrgOption = {
  organization_id: string;
  role: string;
  name: string;
};

/**
 * Lấy user hiện tại + danh sách tổ chức (membership active) + id tổ chức
 * đang hoạt động (theo cookie, fallback tổ chức đầu tiên).
 */
export async function getOrgOptions(): Promise<{
  user: { email?: string | null } | null;
  options: OrgOption[];
  activeOrgId: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { user: null, options: [], activeOrgId: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, options: [], activeOrgId: null };

  const { data } = await supabase
    .from("memberships")
    .select("organization_id, role, organizations ( id, name )")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const options: OrgOption[] = ((data ?? []) as Array<{
    organization_id: string;
    role: string;
    organizations: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  }>).map((row) => ({
    organization_id: row.organization_id,
    role: row.role,
    name: Array.isArray(row.organizations)
      ? (row.organizations[0]?.name ?? "Tổ chức")
      : (row.organizations?.name ?? "Tổ chức"),
  }));

  const cookieStore = await cookies();
  const selectedId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const activeOrgId = options.some((option) => option.organization_id === selectedId)
    ? selectedId
    : (options[0]?.organization_id ?? null);

  return { user, options, activeOrgId };
}

/**
 * Chỉ cho phép redirect nội bộ (path bắt đầu bằng "/" nhưng không phải "//").
 */
export function sanitizeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}
