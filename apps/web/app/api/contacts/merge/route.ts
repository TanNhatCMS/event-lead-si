import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  computeMergePlan,
  MERGE_REASON_LABELS,
  type MergeContactCore,
} from '~/lib/contacts/merge';

const bodySchema = z.object({
  source_id: z.string().uuid('Liên hệ nguồn không hợp lệ.'),
  target_id: z.string().uuid('Liên hệ đích không hợp lệ.'),
});

const CONTACT_SELECT =
  'id, full_name, job_title, email, phone, address, labels, company_id, archived_at';

type ContactRow = MergeContactCore;

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * POST /api/contacts/merge  body: { source_id, target_id }
 *
 * Gộp liên hệ `source` vào `target` (cùng user, khác nhau, đều đang hoạt động).
 * supabase-js KHÔNG có transaction — các bước chạy TUẦN TỰ, best-effort kèm
 * audit từng phần:
 *   a. chuyển meeting_notes, follow_ups (contact_id source → target);
 *   b. chuyển card_imports.confirmed_contact_id source → target;
 *   c. điền trường TRỐNG của target từ source (email/phone/address/job_title);
 *   d. hợp nhãn (union);
 *   e. audit 'contact.merged' (metadata: source_id, fields_taken);
 *   f. xóa contact source bằng SOFT delete (archived_at = now) — an toàn hơn
 *      hard delete vì vẫn khôi phục được; hard delete là giai đoạn sau.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_body', 'Dữ liệu không hợp lệ.', 400);
  }
  const { source_id: sourceId, target_id: targetId } = parsed.data;
  if (sourceId === targetId) {
    return errorJson(
      requestId,
      'same_contact',
      'Không thể gộp một liên hệ với chính nó.',
      400,
    );
  }

  // Guard: cả hai đều thuộc user, đang hoạt động (chưa lưu trữ).
  const { data: rows, error: loadError } = await supabase
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('user_id', user.id)
    .is('archived_at', null)
    .in('id', [sourceId, targetId]);
  if (loadError) {
    return errorJson(requestId, 'merge_failed', 'Gộp liên hệ thất bại.', 500);
  }
  const contacts = (rows ?? []) as unknown as ContactRow[];
  const source = contacts.find((c) => c.id === sourceId) ?? null;
  const target = contacts.find((c) => c.id === targetId) ?? null;
  if (!source || !target) {
    return errorJson(
      requestId,
      'not_found',
      'Không tìm thấy cả hai liên hệ (hoặc một bên đã lưu trữ).',
      404,
    );
  }

  // a. Chuyển ghi chú gặp mặt và follow-up sang target. Đơn giản: update hết
  //    (không khử trùng lặp (body, created_at) — trùng sẽ được user dọn sau).
  const movedNotes = await supabase
    .from('meeting_notes')
    .update({ contact_id: targetId, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('contact_id', sourceId)
    .select('id');
  if (movedNotes.error) {
    return errorJson(requestId, 'merge_failed', 'Gộp ghi chú gặp mặt thất bại.', 500);
  }

  const movedFollowUps = await supabase
    .from('follow_ups')
    .update({ contact_id: targetId, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('contact_id', sourceId)
    .select('id');
  if (movedFollowUps.error) {
    return errorJson(requestId, 'merge_failed', 'Gộp follow-up thất bại.', 500);
  }

  // b. Danh thiếp đã xác nhận trỏ về source → target.
  const movedImports = await supabase
    .from('card_imports')
    .update({ confirmed_contact_id: targetId })
    .eq('user_id', user.id)
    .eq('confirmed_contact_id', sourceId)
    .select('id');
  if (movedImports.error) {
    return errorJson(requestId, 'merge_failed', 'Gộp danh thiếp thất bại.', 500);
  }

  // c + d. Điền trường trống của target từ source, hợp nhãn.
  const plan = computeMergePlan(target, source);
  let fieldsTaken = plan.fieldsTaken as string[];
  if (Object.keys(plan.patch).length > 0) {
    const patched = await supabase
      .from('contacts')
      .update({
        ...plan.patch,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('user_id', user.id)
      .eq('id', targetId)
      .select('id');
    if (patched.error) {
      return errorJson(requestId, 'merge_failed', 'Gộp thông tin liên hệ thất bại.', 500);
    }
  } else {
    fieldsTaken = [];
  }

  // e. Audit 'contact.merged' — action là text tự do trong DB nên insert thẳng
  //    (logAudit đang chặt kiểu AuditAction, không đụng file chung).
  try {
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'contact.merged',
      entity_type: 'contact',
      entity_id: targetId,
      summary:
        'Đã gộp liên hệ "' +
        source.full_name +
        '" vào "' +
        target.full_name +
        '".',
      metadata: {
        source_id: sourceId,
        target_id: targetId,
        fields_taken: fieldsTaken,
        moved_notes: movedNotes.data?.length ?? 0,
        moved_follow_ups: movedFollowUps.data?.length ?? 0,
        moved_card_imports: movedImports.data?.length ?? 0,
      },
    } as never);
  } catch {
    // Audit best-effort — không làm hỏng merge.
  }

  // f. SOFT delete contact source (archived_at = now) — an toàn, khôi phục được.
  //    Hard delete là giai đoạn sau.
  const archived = await supabase
    .from('contacts')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('id', sourceId)
    .select('id');
  if (archived.error) {
    return errorJson(
      requestId,
      'archive_failed',
      'Đã gộp dữ liệu nhưng không lưu trữ được liên hệ nguồn.',
      500,
    );
  }

  return NextResponse.json({
    merged: true,
    target_id: targetId,
    source_id: sourceId,
    fields_taken: fieldsTaken,
    reasons: MERGE_REASON_LABELS,
    request_id: requestId,
  });
}
