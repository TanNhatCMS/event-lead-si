import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@kit/supabase/database';

/**
 * Audit log cho nhóm tính năng lead lifecycle (events, follow-ups, CSV import,
 * share contact, outgoing webhooks, budgets).
 *
 * Các action này KHÔNG nằm trong union `AuditAction` của `lib/audit/log-audit.ts`
 * (file đó thuộc phạm vi của nhóm tính năng khác) nên viết helper riêng với
 * hành vi giống hệt: fire-and-forget, lỗi chỉ console.error, không bao giờ làm
 * fail API chính. Constraint DB: action <= 80 ký tự, entity_type <= 40 ký tự.
 */

type ServerClient = SupabaseClient<Database>;

export interface LogLifecycleAuditInput {
  action: string;
  entityType: string;
  entityId?: string;
  summary?: string;
  metadata?: Json;
}

export async function logLifecycleAudit(
  supabase: ServerClient,
  userId: string,
  input: LogLifecycleAuditInput,
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId,
      action: input.action.slice(0, 80),
      entity_type: input.entityType.slice(0, 40),
      entity_id: input.entityId ?? null,
      summary: input.summary ?? '',
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error('[lifecycle-audit] insert failed: ' + error.message);
    }
  } catch (err) {
    console.error(
      '[lifecycle-audit] unexpected error: ' +
        (err instanceof Error ? err.message : 'lỗi không xác định'),
    );
  }
}
