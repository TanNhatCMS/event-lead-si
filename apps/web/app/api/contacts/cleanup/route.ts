import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logAudit } from '~/lib/audit/log-audit';
import { isRetentionExpired, retentionCutoff } from '~/lib/contacts/retention';
import { normalizeContactSettings } from '~/lib/contacts/settings';

/**
 * FR-024 — POST /api/contacts/cleanup
 *
 * Tự dọn liên hệ ĐÃ LƯU TRỮ (archived_at không null) quá `retention_days`
 * ngày, theo cấu hình `agent_config.settings.retention_days` của user.
 *
 * - Body `{ dry_run: true }` → chỉ đếm: `{ would_delete, older_than, cutoff }`.
 * - Không dry_run → DELETE hẳn các contact đó (meeting_notes / follow_ups /
 *   evidence… cascade theo FK) + ghi audit_logs action
 *   'contact.retention_cleanup' (metadata: count, days) → `{ deleted }`.
 * - `retention_days` null / chưa cấu hình → 400 `{ code: 'no_policy' }`.
 *
 * KHÔNG có cron: user chủ động bấm nút chạy endpoint này (dry_run trước để
 * xem trước số lượng).
 */

const bodySchema = z.object({
  dry_run: z.boolean().optional().default(false),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_input', 'Body không hợp lệ.', 400);
  }

  const { data: config } = await supabase
    .from('agent_config')
    .select('settings')
    .eq('user_id', user.id)
    .maybeSingle();
  const settings = normalizeContactSettings(config?.settings);
  if (settings.retention_days === null) {
    return errorJson(
      requestId,
      'no_policy',
      'Chưa đặt số ngày lưu trữ (retention_days) trong cấu hình.',
      400,
    );
  }

  const days = settings.retention_days;
  const cutoff = retentionCutoff(new Date(), days);

  // Chọn trước danh sách id để đếm được số lượng và ghi audit log chính xác.
  const { data: archived, error: selectError } = await supabase
    .from('contacts')
    .select('id, archived_at')
    .eq('user_id', user.id)
    .not('archived_at', 'is', null)
    .lt('archived_at', cutoff.toISOString());

  if (selectError) {
    return errorJson(requestId, 'query_failed', 'Chưa xác định được danh sách liên hệ cần dọn.', 500);
  }

  // Lọc lần hai phía app (mốc so sánh giờ địa phương/không phải ISO) — dương
  // tính thừa nhưng đảm bảo chỉ xóa đúng cái quá hạn theo helper đã test.
  const expiredIds = (archived ?? [])
    .filter((row) => isRetentionExpired(row.archived_at, cutoff))
    .map((row) => row.id);

  if (parsed.data.dry_run) {
    return NextResponse.json({
      dry_run: true,
      would_delete: expiredIds.length,
      older_than: days,
      cutoff: cutoff.toISOString(),
      request_id: requestId,
    });
  }

  if (expiredIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', user.id)
      .in('id', expiredIds);

    if (deleteError) {
      return errorJson(requestId, 'delete_failed', 'Chưa xóa được liên hệ hết hạn lưu trữ.', 500);
    }

    await logAudit(supabase, user.id, {
      action: 'contact.retention_cleanup',
      entityType: 'contact',
      summary: 'Tự dọn liên hệ đã lưu trữ quá hạn',
      metadata: { count: expiredIds.length, days },
    });
  }

  return NextResponse.json({
    deleted: expiredIds.length,
    older_than: days,
    request_id: requestId,
  });
}
