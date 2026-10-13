import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAudit } from '~/lib/audit/log-audit';
import { enqueueBusinessIndexSafe } from '~/lib/ai/rag/contact-index';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTE_TYPES = ['meeting_note', 'need', 'opportunity', 'next_step'] as const;

const patchSchema = z.object({
  body: z.string().trim().min(1, 'Nội dung ghi chú không được để trống.').max(20000).optional(),
  note_type: z.enum(NOTE_TYPES).optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  /** true = đánh dấu đã xong, false = mở lại. */
  done: z.boolean().optional(),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedNote(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
) {
  const { data, error } = await supabase
    .from('meeting_notes')
    .select('id, body, note_type')
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * PATCH /api/notes/[id]
 *
 * Sửa nội dung/loại/hạn của ghi chú, hoặc đánh dấu đã xong (done).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'invalid_id', 'Mã ghi chú không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const owned = await getOwnedNote(supabase, user.id, id);
  if (!owned) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy ghi chú.', 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_body',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }
  const input = parsed.data;

  type NoteUpdate = Database['public']['Tables']['meeting_notes']['Update'];
  const updates: NoteUpdate = {};
  if (input.body !== undefined) updates.body = input.body;
  if (input.note_type !== undefined) updates.note_type = input.note_type;
  if (input.due_at !== undefined) updates.due_at = input.due_at;
  if (input.done !== undefined) {
    updates.done_at = input.done ? new Date().toISOString() : null;
  }
  if (Object.keys(updates).length === 0) {
    return errorJson(requestId, 'no_changes', 'Không có gì để cập nhật.', 400);
  }

  const { error } = await supabase
    .from('meeting_notes')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return errorJson(requestId, 'update_failed', 'Chưa cập nhật được ghi chú.', 500);
  }

  await logAudit(supabase, user.id, {
    action: 'note.update',
    entityType: 'meeting_note',
    entityId: id,
    summary: `Cập nhật ghi chú (${owned.note_type}): ${owned.body.slice(0, 60)}`,
  });

  // Enqueue index RAG (fire-and-forget).
  void enqueueBusinessIndexSafe(user.id, 'meeting_note', id, 'upsert', supabase);

  return NextResponse.json({ ok: true, request_id: requestId });
}

/**
 * DELETE /api/notes/[id]
 *
 * Xóa mềm ghi chú (đánh dấu deleted_at).
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'invalid_id', 'Mã ghi chú không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const owned = await getOwnedNote(supabase, user.id, id);
  if (!owned) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy ghi chú.', 404);
  }

  const { error } = await supabase
    .from('meeting_notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return errorJson(requestId, 'delete_failed', 'Chưa xóa được ghi chú.', 500);
  }

  await logAudit(supabase, user.id, {
    action: 'note.delete',
    entityType: 'meeting_note',
    entityId: id,
    summary: `Xóa ghi chú (${owned.note_type}): ${owned.body.slice(0, 60)}`,
  });

  // Ghi chú xóa mềm → xóa chunk khỏi index RAG.
  void enqueueBusinessIndexSafe(user.id, 'meeting_note', id, 'delete', supabase);

  return NextResponse.json({ ok: true, request_id: requestId });
}
