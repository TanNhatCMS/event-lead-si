import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * GET /api/contacts/[id]/timeline
 *
 * Timeline hồ sơ liên hệ: gộp mọi dấu vết từ 4 nguồn thành một dòng thời
 * gian (mới nhất trước):
 * - card_imports (confirmed_contact_id) — lượt quét danh thiếp
 * - meeting_notes (contact_id, chưa xóa mềm) — ghi chú cuộc gặp/nhu cầu/…
 * - follow_ups (contact_id) — nháp/đã duyệt/đã gửi
 * - audit_logs (entity_type='contact', entity_id=contact) — hành động khác
 *   (trừ contact.created — đã có entry quét thẻ tương đương).
 */

const entrySchema = z.object({
  kind: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  at: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

type TimelineEntry = z.infer<typeof entrySchema>;

const NOTE_TYPE_LABELS: Record<string, string> = {
  meeting_note: 'Ghi chú cuộc gặp',
  need: 'Nhu cầu',
  opportunity: 'Cơ hội',
  next_step: 'Bước tiếp theo',
};

const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  approved: 'Đã duyệt',
  sent: 'Đã gửi',
  dismissed: 'Đã bỏ qua',
};

function truncate(text: string, max = 300): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { code: 'unauthorized', message: 'Vui lòng đăng nhập.', request_id: requestId },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json(
      { code: 'invalid_input', message: 'id không hợp lệ.', request_id: requestId },
      { status: 400 },
    );
  }

  // Contact phải thuộc user — đồng thời lấy tên để UI hiển thị.
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, full_name')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json(
      { code: 'not_found', message: 'Không tìm thấy liên hệ.', request_id: requestId },
      { status: 404 },
    );
  }

  const [importsRes, notesRes, followUpsRes, auditsRes] = await Promise.all([
    supabase
      .from('card_imports')
      .select('id, state, recognition_provider, recognition_model, created_at')
      .eq('confirmed_contact_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('meeting_notes')
      .select('id, note_type, body, due_at, created_at')
      .eq('contact_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('follow_ups')
      .select('id, status, subject, body, sent_at, created_at')
      .eq('contact_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('audit_logs')
      .select('action, summary, created_at')
      .eq('entity_type', 'contact')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const timeline: TimelineEntry[] = [];

  for (const imp of importsRes.data ?? []) {
    const provider = imp.recognition_provider ?? 'mock';
    timeline.push({
      kind: 'card_scan',
      title: 'Quét danh thiếp (' + provider + ')',
      detail: 'Trạng thái: ' + imp.state,
      at: imp.created_at,
    });
  }

  for (const note of notesRes.data ?? []) {
    timeline.push({
      kind: 'note_' + note.note_type,
      title: NOTE_TYPE_LABELS[note.note_type] ?? 'Ghi chú',
      detail: truncate(note.body ?? ''),
      at: note.created_at,
      meta: note.due_at ? { due_at: note.due_at } : undefined,
    });
  }

  for (const fu of followUpsRes.data ?? []) {
    const statusLabel = FOLLOW_UP_STATUS_LABELS[fu.status] ?? fu.status;
    timeline.push({
      kind: 'follow_up',
      title: 'Follow-up — ' + statusLabel,
      detail: truncate([fu.subject, fu.body].filter(Boolean).join('\n')),
      at: fu.created_at,
    });
    // Lần gửi thực tế có thể khác thời điểm tạo — tách thành entry riêng.
    if (fu.sent_at) {
      timeline.push({
        kind: 'follow_up_sent',
        title: 'Follow-up đã gửi',
        detail: fu.subject ?? null,
        at: fu.sent_at,
      });
    }
  }

  for (const audit of auditsRes.data ?? []) {
    // contact.created trùng với entry quét thẻ — bỏ để không lặp.
    if (audit.action === 'contact.created') continue;
    timeline.push({
      kind: 'audit',
      title: audit.summary || audit.action,
      detail: audit.action,
      at: audit.created_at,
    });
  }

  timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

  return NextResponse.json({
    contact: { id: contact.id, full_name: contact.full_name },
    timeline: timeline.map((entry) => entrySchema.parse(entry)),
  });
}
