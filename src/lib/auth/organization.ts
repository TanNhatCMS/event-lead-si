import { cookies } from "next/headers";

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
