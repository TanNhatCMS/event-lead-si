import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { enqueueBusinessIndex } from '~/lib/ai/rag/contact-index';
import type { BusinessEntityType, QueueOperation } from '~/lib/ai/rag/types';

const ENTITY_TYPES = ['contact', 'company', 'meeting_note'] as const;

const bodySchema = z
  .object({
    entity_type: z
      .enum(ENTITY_TYPES, { message: 'Loại entity không hợp lệ.' })
      .optional(),
    entity_id: z
      .string()
      .uuid({ message: 'entity_id không phải UUID hợp lệ.' })
      .optional(),
  })
  .refine((v) => !(v.entity_id && !v.entity_type), {
    message: 'entity_id bắt buộc phải đi kèm entity_type.',
  });

function errorJson(
  requestId: string,
  code: string,
  message: string,
  status: number,
) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

function ragNotReady(message: string): boolean {
  return (
    message.includes('relation') ||
    message.includes('schema cache') ||
    message.includes('Could not find the table')
  );
}

/**
 * POST /api/knowledge/reindex
 *
 * Backfill index danh bạ (FR-010):
 * - `{ entity_type, entity_id }` → enqueue đúng 1 entity (404 nếu không thuộc user).
 * - Không truyền gì → enqueue toàn bộ contacts/companies/meeting_notes của user
 *   (hồ sơ xóa mềm được enqueue dạng `delete` để dọn chunk cũ).
 *
 * Response `202`: `{ queued: n, request_id }`.
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
    body = (await request.json().catch(() => ({}))) as unknown;
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return errorJson(
      requestId,
      'validation_error',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  const queueOne = async (
    entityType: BusinessEntityType,
    entityId: string,
    operation: QueueOperation,
  ): Promise<void> => {
    await enqueueBusinessIndex(user.id, entityType, entityId, operation, supabase);
  };

  try {
    let queued = 0;

    if (parsed.data.entity_type && parsed.data.entity_id) {
      // Re-index 1 entity cụ thể.
      const entityType = parsed.data.entity_type;
      const entityId = parsed.data.entity_id;
      const table =
        entityType === 'contact'
          ? 'contacts'
          : entityType === 'company'
            ? 'companies'
            : 'meeting_notes';
      let exists = false;
      if (table === 'contacts') {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('id', entityId)
          .eq('user_id', user.id)
          .maybeSingle();
        exists = Boolean(data);
      } else if (table === 'companies') {
        const { data } = await supabase
          .from('companies')
          .select('id')
          .eq('id', entityId)
          .eq('user_id', user.id)
          .maybeSingle();
        exists = Boolean(data);
      } else {
        const { data } = await supabase
          .from('meeting_notes')
          .select('id')
          .eq('id', entityId)
          .eq('user_id', user.id)
          .maybeSingle();
        exists = Boolean(data);
      }
      if (!exists) {
        return errorJson(requestId, 'not_found', 'Không tìm thấy hồ sơ.', 404);
      }
      await queueOne(entityType, entityId, 'upsert');
      queued = 1;
    } else {
      // Backfill toàn bộ danh bạ của user — insert theo lô 500 dòng
      // để backfill lớn không timeout (thay vì insert từng dòng).
      const pending: {
        user_id: string;
        entity_type: BusinessEntityType;
        entity_id: string;
        operation: QueueOperation;
        status: 'pending';
      }[] = [];

      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, archived_at')
        .eq('user_id', user.id)
        .limit(10000);
      if (contactsError) throw new Error(`Không đọc được contacts: ${contactsError.message}`);
      for (const row of contacts ?? []) {
        pending.push({
          user_id: user.id,
          entity_type: 'contact',
          entity_id: row.id,
          operation: row.archived_at ? 'delete' : 'upsert',
          status: 'pending',
        });
      }

      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .limit(10000);
      if (companiesError) throw new Error(`Không đọc được companies: ${companiesError.message}`);
      for (const row of companies ?? []) {
        pending.push({
          user_id: user.id,
          entity_type: 'company',
          entity_id: row.id,
          operation: 'upsert',
          status: 'pending',
        });
      }

      const { data: notes, error: notesError } = await supabase
        .from('meeting_notes')
        .select('id, deleted_at')
        .eq('user_id', user.id)
        .limit(10000);
      if (notesError) throw new Error(`Không đọc được meeting_notes: ${notesError.message}`);
      for (const row of notes ?? []) {
        pending.push({
          user_id: user.id,
          entity_type: 'meeting_note',
          entity_id: row.id,
          operation: row.deleted_at ? 'delete' : 'upsert',
          status: 'pending',
        });
      }

      for (let i = 0; i < pending.length; i += 500) {
        const { error } = await supabase
          .from('rag_index_queue')
          .insert(pending.slice(i, i + 500));
        if (error) throw new Error(`Không enqueue được hàng đợi: ${error.message}`);
      }
      queued = pending.length;
    }

    return NextResponse.json({ queued, request_id: requestId }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorJson(
      requestId,
      'internal',
      ragNotReady(message)
        ? 'Chức năng index chưa sẵn sàng: migration bảng RAG chưa được áp dụng trên Supabase (xem issue #35).'
        : `Re-index thất bại: ${message}`,
      500,
    );
  }
}
