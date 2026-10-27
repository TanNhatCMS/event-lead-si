import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import { isAdminSession } from '~/lib/server/require-user-in-server-component';

/**
 * API quản lý người dùng cho khu vực /admin — CHỈ role admin (app_metadata
 * trong GoTrue, chỉ service-role sửa được). Đi qua GoTrue admin API bằng
 * service-role key:
 * - GET    : danh sách user + role + trạng thái + số liên hệ của từng người.
 * - PATCH  : chặn / bỏ chặn (GoTrue ban_duration), gán role admin/member.
 * - DELETE : xóa user vĩnh viễn (cùng dữ liệu liên quan do FK cascade).
 *
 * Không cho phép tự chặn/tự xóa/tự đổi role chính mình.
 */

const patchSchema = z
  .object({
    userId: z.string().uuid('userId không hợp lệ.'),
    action: z.enum(['ban', 'unban', 'set_role']),
    role: z.enum(['admin', 'member']).optional(),
  })
  .refine((v) => v.action !== 'set_role' || v.role !== undefined, {
    message: 'action set_role cần role (admin | member).',
    path: ['role'],
  });

/** Thời hạn ban "vĩnh viễn" theo GoTrue: 100 năm tính bằng giờ. */
const PERMANENT_BAN = '876000h';

function errorJson(
  requestId: string,
  code: string,
  message: string,
  status: number,
) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

async function requireUser(requestId: string) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401),
    };
  }
  return { supabase, user };
}

/**
 * Guard admin cho các handler — session cũ (JWT chưa refresh sau khi được
 * gán role) vẫn được chấp nhận nhờ isAdminSession hỏi lại GoTrue.
 */
async function requireAdmin(requestId: string) {
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth;
  if (!(await isAdminSession(auth.supabase, auth.user))) {
    return {
      error: errorJson(
        requestId,
        'forbidden',
        'Chỉ admin mới được quản lý người dùng.',
        403,
      ),
    };
  }
  return auth;
}

interface AdminUserRow {
  id: string;
  email: string | null;
  fullName: string | null;
  role: 'admin' | 'member';
  emailConfirmed: boolean;
  banned: boolean;
  lastSignInAt: string | null;
  createdAt: string | null;
  contactCount: number;
}

async function listUsers(): Promise<AdminUserRow[]> {
  const admin = getSupabaseServerAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    throw new Error(`Không đọc được danh sách người dùng: ${error.message}`);
  }

  // Số liên hệ của từng user: 1 truy vấn user_id rồi đếm ở server (app
  // single-user, dữ liệu nhỏ). Service-role client → bỏ qua RLS.
  const contactCounts = new Map<string, number>();
  const { data: contactRows, error: contactError } = await admin
    .from('contacts')
    .select('user_id');
  if (!contactError && contactRows) {
    for (const row of contactRows as Array<{ user_id: string | null }>) {
      if (row.user_id) {
        contactCounts.set(row.user_id, (contactCounts.get(row.user_id) ?? 0) + 1);
      }
    }
  }

  return (data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? null,
    fullName:
      typeof u.user_metadata?.full_name === 'string'
        ? (u.user_metadata.full_name as string)
        : null,
    role: u.app_metadata?.role === 'admin' ? 'admin' : 'member',
    emailConfirmed: Boolean(u.email_confirmed_at),
    banned: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
    lastSignInAt: u.last_sign_in_at ?? null,
    createdAt: u.created_at ?? null,
    contactCount: contactCounts.get(u.id) ?? 0,
  }));
}

/**
 * GET /api/admin/users — danh sách người dùng hệ thống.
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireAdmin(requestId);
  if ('error' in auth) return auth.error;

  try {
    const users = await listUsers();
    return NextResponse.json({ users, currentUserId: auth.user.id });
  } catch (err) {
    return errorJson(
      requestId,
      'database_error',
      err instanceof Error ? err.message : 'Lỗi không xác định.',
      500,
    );
  }
}

/**
 * PATCH /api/admin/users — chặn / bỏ chặn một người dùng.
 * Body: { userId, action: 'ban' | 'unban' }
 */
export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireAdmin(requestId);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  if (parsed.data.userId === user.id) {
    return errorJson(
      requestId,
      'self_action',
      'Không thể tự thay đổi trạng thái/role của tài khoản đang đăng nhập.',
      400,
    );
  }

  const admin = getSupabaseServerAdminClient();

  if (parsed.data.action === 'set_role') {
    const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
      app_metadata: { role: parsed.data.role },
    });
    if (error) {
      return errorJson(
        requestId,
        'database_error',
        `Không gán được role: ${error.message}`,
        500,
      );
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    ban_duration: parsed.data.action === 'ban' ? PERMANENT_BAN : 'none',
  });
  if (error) {
    return errorJson(
      requestId,
      'database_error',
      `Không ${parsed.data.action === 'ban' ? 'chặn' : 'bỏ chặn'} được người dùng: ${error.message}`,
      500,
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/users — xóa vĩnh viễn một người dùng.
 * Body: { userId }
 */
export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireAdmin(requestId);
  if ('error' in auth) return auth.error;
  const { user } = auth;

  const body: unknown = await request.json().catch(() => null);
  const userId =
    typeof body === 'object' && body !== null && 'userId' in body
      ? String((body as { userId: unknown }).userId ?? '')
      : '';

  if (!z.string().uuid().safeParse(userId).success) {
    return errorJson(requestId, 'invalid_input', 'userId không hợp lệ.', 400);
  }

  if (userId === user.id) {
    return errorJson(
      requestId,
      'self_action',
      'Không thể xóa chính tài khoản đang đăng nhập.',
      400,
    );
  }

  const admin = getSupabaseServerAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return errorJson(
      requestId,
      'database_error',
      `Không xóa được người dùng: ${error.message}`,
      500,
    );
  }

  return NextResponse.json({ ok: true });
}
