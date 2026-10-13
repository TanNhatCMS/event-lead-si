import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTE_TYPES = ['meeting_note', 'need', 'opportunity', 'next_step'] as const;

const createSchema = z.object({
  body: z.string().trim().min(1, 'Nội dung ghi chú không được để trống.').max(20000),
  note_type: z.enum(NOTE_TYPES).optional().default('meeting_note'),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/contacts/[id]/notes
 *
 * Thêm ghi chú cho liên hệ. Ghi chú loại `next_step` có thể kèm hạn
 * (`due_at`) để dùng làm nhắc việc.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'invalid_id', 'Mã liên hệ không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!contact) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_body',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  const { data: note, error } = await supabase
    .from('meeting_notes')
    .insert({
      user_id: user.id,
      contact_id: id,
      author_user_id: user.id,
      body: parsed.data.body,
      note_type: parsed.data.note_type,
      due_at: parsed.data.due_at ?? null,
    })
    .select('id, body, note_type, due_at, done_at, created_at')
    .single();

  if (error || !note) {
    return errorJson(requestId, 'create_failed', 'Chưa thêm được ghi chú.', 500);
  }

  return NextResponse.json({ note, request_id: requestId }, { status: 201 });
}
