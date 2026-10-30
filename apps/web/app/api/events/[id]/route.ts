import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { Database } from '@kit/supabase/database';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logLifecycleAudit } from '~/lib/lifecycle/audit';

type EventUpdate = Database['public']['Tables']['events']['Update'];

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

function isParsableDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

const dateInput = z
  .string()
  .trim()
  .max(40)
  .refine(isParsableDate, 'Thời gian không hợp lệ.');

const patchEventSchema = z.object({
  name: z.string().trim().min(1, 'Tên sự kiện không được rỗng.').max(160).optional(),
  location: z.string().trim().max(240).nullable().optional(),
  starts_at: dateInput.nullable().optional(),
  ends_at: dateInput.nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Đọc id từ path và kiểm tra là UUID (Postgres sẽ tự từ chối nếu sai). */
async function readEventId(context: RouteContext): Promise<string | null> {
  const { id } = await context.params;
  return id?.trim() || null;
}

/**
 * PATCH /api/events/[id] — sửa sự kiện. Chỉ nhận các trường có mặt trong body.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }
  const eventId = await readEventId(context);
  if (!eventId) {
    return errorJson(requestId, 'invalid_id', 'Thiếu mã sự kiện.', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = patchEventSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'validation_error', 'Dữ liệu không hợp lệ.', 400);
  }

  const update: EventUpdate = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.location !== undefined) update.location = parsed.data.location || null;
  if (parsed.data.starts_at !== undefined) update.starts_at = parsed.data.starts_at || null;
  if (parsed.data.ends_at !== undefined) update.ends_at = parsed.data.ends_at || null;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes || null;

  const { data: event, error } = await supabase
    .from('events')
    .update(update)
    .eq('id', eventId)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) {
    return errorJson(requestId, 'update_failed', 'Chưa cập nhật được sự kiện.', 500);
  }
  if (!event) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy sự kiện.', 404);
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'event.update',
    entityType: 'event',
    entityId: eventId,
    summary: 'Cập nhật sự kiện: ' + event.name,
    metadata: { fields: Object.keys(update) },
  });

  return NextResponse.json({ event, request_id: requestId });
}

/**
 * DELETE /api/events/[id] — xoá sự kiện. Contacts gắn vào sự kiện được giữ lại
 * (FK `contacts.event_id` ON DELETE SET NULL).
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }
  const eventId = await readEventId(context);
  if (!eventId) {
    return errorJson(requestId, 'invalid_id', 'Thiếu mã sự kiện.', 400);
  }

  const { data: deleted, error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .eq('user_id', user.id)
    .select('id, name')
    .maybeSingle();

  if (error) {
    return errorJson(requestId, 'delete_failed', 'Chưa xoá được sự kiện.', 500);
  }
  if (!deleted) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy sự kiện.', 404);
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'event.delete',
    entityType: 'event',
    entityId: eventId,
    summary: 'Xoá sự kiện: ' + deleted.name,
    metadata: {},
  });

  return NextResponse.json({ deleted_id: deleted.id, request_id: requestId });
}
