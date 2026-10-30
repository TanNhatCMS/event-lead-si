import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { Database } from '@kit/supabase/database';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  FollowupDraftError,
  generateFollowupDraft,
} from '~/lib/ai/followup/draft';
import { dispatchWebhook } from '~/lib/webhooks/dispatch';
import { logLifecycleAudit } from '~/lib/lifecycle/audit';

type FollowUpUpdate = Database['public']['Tables']['follow_ups']['Update'];

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

const FOLLOW_UP_STATUSES = ['draft', 'approved', 'sent', 'dismissed'] as const;

const CHANNELS = ['email', 'zalo', 'sms', 'khac'] as const;

const listQuerySchema = z.object({
  status: z.enum(FOLLOW_UP_STATUSES).optional(),
  contact_id: z.string().uuid('Mã liên hệ không hợp lệ.').optional(),
  /** Lọc "contact cần follow-up lại": trả `aging_contacts` thay vì follow-ups. */
  aging_days: z.coerce.number().int().min(1).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const createSchema = z.object({
  contact_id: z.string().uuid('Mã liên hệ không hợp lệ.'),
  /** Có body → dùng nguyên văn (generated_by 'manual'). Thiếu → AI soạn nháp. */
  body: z.string().trim().min(1, 'Nội dung không được rỗng.').max(20000).optional(),
  subject: z.string().trim().max(300).optional(),
  /** Ngữ cảnh thêm cho AI khi tự soạn nháp. */
  context: z.string().trim().max(2000).optional().default(''),
  channel: z.enum(CHANNELS).optional().default('email'),
});

const patchSchema = z.object({
  id: z.string().uuid('Mã follow-up không hợp lệ.'),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().min(1, 'Nội dung không được rỗng.').max(20000).optional(),
  status: z.enum(FOLLOW_UP_STATUSES).optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid('Mã follow-up không hợp lệ.'),
});

/**
 * GET /api/followups
 *
 * - Không `aging_days`: danh sách follow-up (mới nhất trước) kèm tên liên hệ
 *   và công ty; lọc được theo `status`, `contact_id`.
 * - Có `aging_days=N`: trả `aging_contacts` — contact CHƯA có follow-up nào
 *   trạng thái 'sent' và được tạo trước thời điểm hiện tại - N ngày.
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_query', 'Tham số không hợp lệ.', 400);
  }
  const params = parsed.data;

  // ---- Chế độ aging: liệt kê contact chưa được follow-up (sent) trong N ngày.
  if (params.aging_days !== undefined) {
    const cutoff = new Date(
      Date.now() - params.aging_days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: sentRows, error: sentError } = await supabase
      .from('follow_ups')
      .select('contact_id')
      .eq('user_id', user.id)
      .eq('status', 'sent');
    if (sentError) {
      return errorJson(requestId, 'list_failed', 'Chưa tải được hàng chờ follow-up.', 500);
    }
    const sentContactIds = new Set((sentRows ?? []).map((row) => row.contact_id));

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, full_name, job_title, created_at, companies(display_name)')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .range(params.offset, params.offset + params.limit - 1);
    if (contactsError) {
      return errorJson(requestId, 'list_failed', 'Chưa tải được hàng chờ follow-up.', 500);
    }

    const agingContacts = (contacts ?? [])
      .filter((contact) => !sentContactIds.has(contact.id))
      .map((contact) => {
        const company = contact.companies as unknown as
          | { display_name: string }
          | null;
        return {
          id: contact.id,
          full_name: contact.full_name,
          job_title: contact.job_title,
          company_name: company?.display_name ?? null,
          created_at: contact.created_at,
          aging_days: params.aging_days,
        };
      });

    return NextResponse.json({ aging_contacts: agingContacts, request_id: requestId });
  }

  // ---- Chế độ thường: danh sách follow-ups.
  let query = supabase
    .from('follow_ups')
    .select(
      'id, contact_id, status, channel, subject, body, generated_by, sent_at, created_at, updated_at, contacts(full_name, companies(display_name))',
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);

  if (params.status) {
    query = query.eq('status', params.status);
  }
  if (params.contact_id) {
    query = query.eq('contact_id', params.contact_id);
  }

  const { data, error, count } = await query;
  if (error) {
    return errorJson(requestId, 'list_failed', 'Chưa tải được danh sách follow-up.', 500);
  }

  const followUps = (data ?? []).map((row) => {
    const contact = row.contacts as unknown as
      | { full_name: string; companies: { display_name: string } | null }
      | null;
    return {
      id: row.id,
      contact_id: row.contact_id,
      status: row.status,
      channel: row.channel,
      subject: row.subject,
      body: row.body,
      generated_by: row.generated_by,
      sent_at: row.sent_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      contact_name: contact?.full_name ?? null,
      company_name: contact?.companies?.display_name ?? null,
    };
  });

  return NextResponse.json({
    follow_ups: followUps,
    total: count ?? 0,
    request_id: requestId,
  });
}

/**
 * POST /api/followups — tạo follow-up cho một liên hệ.
 *
 * - Có `body`: lưu nguyên văn, `generated_by = 'manual'`, status 'draft'.
 * - Thiếu `body`: AI soạn nháp (capability `followup_draft`),
 *   `generated_by = 'ai'`, status 'draft'. Người dùng duyệt/gửi ở PATCH.
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'validation_error', 'Dữ liệu không hợp lệ.', 400);
  }
  const input = parsed.data;

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, full_name, job_title, companies(display_name)')
    .eq('id', input.contact_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (contactError) {
    return errorJson(requestId, 'lookup_failed', 'Chưa tra cứu được liên hệ.', 500);
  }
  if (!contact) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);
  }

  const subject: string | null = input.subject ?? null;
  let bodyText: string;
  let generatedBy: 'ai' | 'manual';

  if (input.body) {
    bodyText = input.body;
    generatedBy = 'manual';
  } else {
    const { data: notes } = await supabase
      .from('meeting_notes')
      .select('body')
      .eq('contact_id', input.contact_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    const company = contact.companies as unknown as { display_name: string } | null;
    try {
      const draft = await generateFollowupDraft({
        userId: user.id,
        supabase,
        context: {
          fullName: contact.full_name,
          jobTitle: contact.job_title,
          companyName: company?.display_name ?? null,
          notes: (notes ?? []).map((note) => note.body),
          context: input.context,
          channel: input.channel,
        },
      });
      bodyText = draft.draft;
      generatedBy = 'ai';
    } catch (err) {
      if (err instanceof FollowupDraftError) {
        return errorJson(requestId, err.code, err.detail, err.code === 'not_configured' ? 503 : 500);
      }
      return errorJson(requestId, 'draft_failed', 'Soạn tin nhắn thất bại.', 500);
    }
  }

  const { data: followUp, error: insertError } = await supabase
    .from('follow_ups')
    .insert({
      user_id: user.id,
      contact_id: input.contact_id,
      status: 'draft',
      channel: input.channel,
      subject,
      body: bodyText,
      generated_by: generatedBy,
    })
    .select('*')
    .single();

  if (insertError || !followUp) {
    return errorJson(requestId, 'create_failed', 'Chưa tạo được follow-up.', 500);
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'followup.create',
    entityType: 'follow_up',
    entityId: followUp.id,
    summary: 'Tạo follow-up (' + generatedBy + ') cho liên hệ: ' + contact.full_name,
    metadata: { contact_id: input.contact_id, generated_by: generatedBy },
  });

  return NextResponse.json(
    { follow_up: followUp, request_id: requestId },
    { status: 201 },
  );
}

/**
 * PATCH /api/followups — sửa nội dung/chuyển trạng thái: { id, subject?, body?, status? }.
 *
 * Khi status chuyển sang 'sent': set `sent_at = now()`, dispatch webhook
 * 'followup.sent' (fire-and-forget) + ghi audit. Hệ thống KHÔNG tự gửi email —
 * 'sent' chỉ là trạng thái người dùng tự xác nhận đã gửi ngoài app.
 */
export async function PATCH(request: Request) {
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'validation_error', 'Dữ liệu không hợp lệ.', 400);
  }
  const input = parsed.data;
  if (input.subject === undefined && input.body === undefined && input.status === undefined) {
    return errorJson(requestId, 'validation_error', 'Không có trường nào cần cập nhật.', 400);
  }

  const { data: existing } = await supabase
    .from('follow_ups')
    .select('id, status, contact_id')
    .eq('id', input.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!existing) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy follow-up.', 404);
  }

  const update: FollowUpUpdate = { updated_at: new Date().toISOString() };
  if (input.subject !== undefined) update.subject = input.subject || null;
  if (input.body !== undefined) update.body = input.body;
  if (input.status !== undefined) update.status = input.status;
  if (input.status === 'sent') {
    update.sent_at = new Date().toISOString();
  }

  const { data: followUp, error: updateError } = await supabase
    .from('follow_ups')
    .update(update)
    .eq('id', input.id)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (updateError || !followUp) {
    return errorJson(requestId, 'update_failed', 'Chưa cập nhật được follow-up.', 500);
  }

  if (input.status === 'sent' && existing.status !== 'sent') {
    void dispatchWebhook(user.id, 'followup.sent', {
      follow_up_id: followUp.id,
      contact_id: followUp.contact_id,
      channel: followUp.channel,
      subject: followUp.subject,
      sent_at: followUp.sent_at,
    });
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'followup.update',
    entityType: 'follow_up',
    entityId: followUp.id,
    summary: 'Cập nhật follow-up sang trạng thái ' + followUp.status,
    metadata: { fields: Object.keys(update), contact_id: followUp.contact_id },
  });

  return NextResponse.json({ follow_up: followUp, request_id: requestId });
}

/** DELETE /api/followups — xoá follow-up: { id }. */
export async function DELETE(request: Request) {
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
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'validation_error', 'Dữ liệu không hợp lệ.', 400);
  }

  const { data: deleted, error } = await supabase
    .from('follow_ups')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return errorJson(requestId, 'delete_failed', 'Chưa xoá được follow-up.', 500);
  }
  if (!deleted) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy follow-up.', 404);
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'followup.delete',
    entityType: 'follow_up',
    entityId: deleted.id,
    summary: 'Xoá follow-up.',
    metadata: {},
  });

  return NextResponse.json({ deleted_id: deleted.id, request_id: requestId });
}
