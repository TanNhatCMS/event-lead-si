import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAudit } from '~/lib/audit/log-audit';

type ContactUpdate = Database['public']['Tables']['contacts']['Update'];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  full_name: z.string().trim().min(1, 'Họ và tên không được để trống.').max(240).optional(),
  job_title: z.string().trim().max(240).nullable().optional(),
  email: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  preferred_language: z.string().trim().max(10).nullable().optional(),
  relationship_stage: z.string().trim().max(40).nullable().optional(),
  company_id: z.string().uuid('Công ty không hợp lệ.').nullable().optional(),
  archived: z.boolean().optional(),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedContact(supabase: SupabaseClient<Database>, userId: string, id: string) {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, full_name')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * GET /api/contacts/[id]
 *
 * Chi tiết liên hệ: thông tin + công ty + bằng chứng từng trường
 * (contact_field_evidence) + ghi chú cuộc gặp (meeting_notes).
 */
export async function GET(_request: Request, { params }: RouteContext) {
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

  const { data: contact, error } = await supabase
    .from('contacts')
    .select(
      'id, full_name, job_title, email, phone, address, preferred_language, relationship_stage, labels, archived_at, created_at, updated_at, company_id, companies(id, display_name, website, industry, share_token)',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !contact) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);
  }

  const [{ data: evidence }, { data: notes }] = await Promise.all([
    supabase
      .from('contact_field_evidence')
      .select('id, field_name, raw_value, normalized_value, value_snapshot, source_type, verification_state, retrieved_at, created_at')
      .eq('contact_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('meeting_notes')
      .select('id, body, note_type, due_at, done_at, created_at')
      .eq('contact_id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    contact,
    evidence: evidence ?? [],
    notes: notes ?? [],
    request_id: requestId,
  });
}

/**
 * PATCH /api/contacts/[id]
 *
 * Cập nhật thông tin liên hệ. Mỗi trường do người dùng sửa được ghi thêm
 * một dòng evidence (source_type='user', verification_state='user_confirmed')
 * theo hiến chương "nguồn gốc từng trường".
 */
export async function PATCH(request: Request, { params }: RouteContext) {
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

  const owned = await getOwnedContact(supabase, user.id, id);
  if (!owned) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_body', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.', 400);
  }
  const input = parsed.data;

  // company_id phải thuộc về đúng user này.
  if (input.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', input.company_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!company) {
      return errorJson(requestId, 'invalid_company', 'Công ty không thuộc về bạn.', 400);
    }
  }

  const { archived, ...fields } = input;
  const updates: ContactUpdate = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      (updates as Record<string, unknown>)[key] = value;
    }
  }
  if (archived !== undefined) {
    updates.archived_at = archived ? new Date().toISOString() : null;
  }
  if (Object.keys(updates).length === 0) {
    return errorJson(requestId, 'no_changes', 'Không có gì để cập nhật.', 400);
  }

  const { error: updateError } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (updateError) {
    return errorJson(requestId, 'update_failed', 'Chưa cập nhật được liên hệ.', 500);
  }

  // Ghi evidence cho các trường người dùng sửa trực tiếp.
  const evidenceRows = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => ({
      user_id: user.id,
      contact_id: id,
      field_name: field,
      raw_value: null,
      normalized_value: value == null ? null : String(value),
      value_snapshot: value == null ? null : String(value),
      schema_version: 1,
      source_type: 'user',
      source_reference: null,
      retrieved_at: null,
      verification_state: 'user_confirmed',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }));
  if (evidenceRows.length > 0) {
    await supabase.from('contact_field_evidence').insert(evidenceRows);
  }

  await logAudit(supabase, user.id, {
    action: 'contact.update',
    entityType: 'contact',
    entityId: id,
    summary: `Cập nhật liên hệ${owned.full_name ? `: ${owned.full_name}` : ''}`,
    metadata: { fields: Object.keys(fields) },
  });

  return NextResponse.json({ ok: true, request_id: requestId });
}

/**
 * DELETE /api/contacts/[id]
 *
 * Xóa vĩnh viễn liên hệ (kèm evidence và ghi chú qua cascade).
 * Giao diện nên yêu cầu xác nhận rõ ràng trước khi gọi.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
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

  const owned = await getOwnedContact(supabase, user.id, id);
  if (!owned) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);
  }

  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return errorJson(requestId, 'delete_failed', 'Chưa xóa được liên hệ.', 500);
  }

  await logAudit(supabase, user.id, {
    action: 'contact.delete',
    entityType: 'contact',
    entityId: id,
    summary: `Xóa liên hệ${owned.full_name ? `: ${owned.full_name}` : ''}`,
  });

  return NextResponse.json({ ok: true, request_id: requestId });
}
