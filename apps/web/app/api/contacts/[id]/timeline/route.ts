import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { computeContactGaps, type ContactGapValues } from '~/lib/contacts/contact-gaps';

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
 *
 * FR-011/012 — trả thêm `gaps` (computed, KHÔNG phải entry timeline):
 * - missing_fields: các trường chính chưa có giá trị trên contact
 *   (website/company_name lấy từ company liên kết).
 * - unverified_fields: trường có evidence nhưng chưa xác thực
 *   (unreviewed/uncertain/inferred — theo evidence MỚI NHẤT mỗi trường).
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

  // Contact phải thuộc user — lấy tên + các trường chính để tính khoảng trống
  // (FR-011/012). website/display_name lấy từ company liên kết (nếu có).
  const { data: contact } = await supabase
    .from('contacts')
    .select(
      'id, full_name, email, phone, address, job_title, companies(website, display_name)',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json(
      { code: 'not_found', message: 'Không tìm thấy liên hệ.', request_id: requestId },
      { status: 404 },
    );
  }

  const [importsRes, notesRes, followUpsRes, auditsRes, evidenceRes] = await Promise.all([
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
      .select('action, summary, metadata, created_at')
      .eq('entity_type', 'contact')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    // Evidence mới nhất trước — computeContactGaps lấy state của dòng đầu
    // tiên theo từng field_name.
    supabase
      .from('contact_field_evidence')
      .select('field_name, verification_state')
      .eq('contact_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
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
    // lead.assessed (agent enrichment chấm độ nóng lead) — render riêng
    // kind 'lead_assessment' kèm metadata để UI vẽ badge độ nóng.
    if (audit.action === 'lead.assessed') {
      const meta = (audit.metadata ?? {}) as Record<string, unknown>;
      const heat = typeof meta.heat === 'string' ? meta.heat : '';
      timeline.push({
        kind: 'lead_assessment',
        title: heat
          ? 'AI đánh giá lead: ' + heat.toUpperCase()
          : 'AI đánh giá lead',
        detail:
          typeof meta.reason === 'string' && meta.reason
            ? meta.reason
            : (audit.summary || audit.action),
        at: audit.created_at,
        meta: {
          heat,
          heat_confidence: meta.heat_confidence ?? null,
          suggested_labels: meta.suggested_labels ?? [],
        },
      });
      continue;
    }
    timeline.push({
      kind: 'audit',
      title: audit.summary || audit.action,
      detail: audit.action,
      at: audit.created_at,
    });
  }

  timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

  // FR-011/012 — khoảng trống bằng chứng: computed từ contact row + evidence
  // (frontend tự render section riêng, không phải entry timeline).
  const company = contact.companies;
  const gapValues: ContactGapValues = {
    email: contact.email,
    phone: contact.phone,
    address: contact.address,
    job_title: contact.job_title,
    website: company?.website ?? null,
    company_name: company?.display_name ?? null,
  };
  const gaps = computeContactGaps(gapValues, evidenceRes.data ?? []);

  return NextResponse.json({
    contact: { id: contact.id, full_name: contact.full_name },
    timeline: timeline.map((entry) => entrySchema.parse(entry)),
    gaps,
  });
}
