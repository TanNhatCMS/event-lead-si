import { createClient } from "@supabase/supabase-js";

/**
 * Client đặc quyền Supabase (service-role). CHỈ dùng trong route handler /
 * server component / server action phía server. Tuyệt đối không import vào
 * client component, không log key, không trả key về client.
 */
export function createSupabaseAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("Supabase admin client chỉ được dùng phía server.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

/** Map user_id -> email bằng service-role (auth.users không đọc được qua RLS). */
export async function getUserEmailsByIds(
  admin: SupabaseAdminClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  const uniqueIds = [...new Set(userIds)];
  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (!error && data?.user?.email) {
          emails.set(id, data.user.email);
        }
      } catch {
        // Bỏ qua: thành viên vẫn hiển thị, chỉ thiếu email.
      }
    }),
  );
  return emails;
}

/** Tìm user theo email trong auth.users (phục vụ lời mời thành viên). */
export async function findUserByEmail(admin: SupabaseAdminClient, email: string) {
  const normalized = email.trim().toLowerCase();
  const perPage = 1000;
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized);
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}
