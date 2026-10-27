import 'server-only';

import { cache } from 'react';

import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import pathsConfig from '~/config/paths.config';

/**
 * @name requireUserInServerComponent
 * @description Require the user to be authenticated in a server component.
 * We reuse this function in multiple server components - it is cached so that the data is only fetched once per request.
 * Use this instead of `requireUser` in server components, so you don't need to hit the database multiple times in a single request.
 */
export const requireUserInServerComponent = cache(async () => {
  /**
   * Marks everything below as per-request. The Supabase server client seeds a
   * value with `Math.random()`, and an unstable value is not fixed by wrapping
   * the caller in `<Suspense>` the way uncached data is. The session is genuinely
   * per-request, so opting into request-time rendering is correct here rather
   * than trying to cache it.
   *
   * It must be awaited. `connection()` stalls a prerender by returning a promise
   * that never resolves, so `void connection()` does nothing at all.
   */
  await connection();

  const client = getSupabaseServerClient();
  const result = await requireUser(client);

  if (result.error) {
    redirect(result.redirectTo);
  }

  return result.data;
});

/**
 * Role của người dùng lưu trong GoTrue `app_metadata.role` — chỉ service-role
 * sửa được (không thể tự nâng quyền từ client). Người không có role hoặc
 * `role !== 'admin'` được coi là member.
 */
export function isAdminUser(user: {
  app_metadata?: Record<string, unknown> | null;
}): boolean {
  return user.app_metadata?.role === 'admin';
}

/**
 * Kiểm tra admin cho MỘT SESSION ĐANG CHẠY. JWT claims được bake lúc đăng
 * nhập — session tồn tại từ trước khi admin gán role sẽ mang `app_metadata`
 * cũ cho tới khi token refresh (mặc định 1h). Claims thiếu role thì hỏi lại
 * GoTrue (`getUser` đọc record mới nhất) để việc gán role có hiệu lực ngay
 * mà không bắt người dùng đăng nhập lại.
 */
export async function isAdminSession(
  client: SupabaseClient,
  user: { app_metadata?: Record<string, unknown> | null },
): Promise<boolean> {
  if (isAdminUser(user)) return true;

  const { data } = await client.auth.getUser();
  return Boolean(data?.user && isAdminUser(data.user));
}

/**
 * @name requireAdminInServerComponent
 * @description Như requireUserInServerComponent nhưng bắt buộc role admin
 * (app_metadata.role). Member truy cập khu vực /admin sẽ bị đưa về /dashboard.
 */
export const requireAdminInServerComponent = cache(async () => {
  const user = await requireUserInServerComponent();

  if (!(await isAdminSession(getSupabaseServerClient(), user))) {
    redirect(pathsConfig.app.home);
  }

  return user;
});
