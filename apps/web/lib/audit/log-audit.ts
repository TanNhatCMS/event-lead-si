import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@kit/supabase/database';

export type AuditAction =
  | 'contact.create'
  | 'contact.update'
  | 'contact.delete'
  | 'company.create'
  | 'company.update'
  | 'company.delete'
  | 'note.create'
  | 'note.update'
  | 'note.delete'
  | 'card_import.confirm'
  | 'card_import.delete'
  | 'document.upload'
  | 'document.delete'
  | 'enrichment.run'
  | 'ai_model.update'
  | 'share.create';

type ServerClient = SupabaseClient<Database>;

interface LogAuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  summary: string;
  metadata?: Json;
}

/**
 * Ghi một dòng audit log. Fire-and-forget: không bao giờ ném lỗi,
 * không làm hỏng API chính nếu insert thất bại.
 */
export async function logAudit(
  supabase: ServerClient,
  userId: string,
  input: LogAuditInput,
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata ?? {},
    });
    if (error) {
      console.error('[audit] insert failed:', error.message);
    }
  } catch (err) {
    console.error('[audit] unexpected error:', err);
  }
}
