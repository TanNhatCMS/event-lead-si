import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';

import {
  recognizedCardSchema,
  type RecognizedCard,
} from '~/lib/ai/card-recognition';
import { checkEnrichmentConfigured } from '~/lib/ai/enrichment/loop';
import { recordRunOwner } from '~/lib/ai/enrichment/run-ownership';
import { start } from 'workflow/api';
import { enrichLeadWorkflow } from '~/lib/ai/enrichment/workflow';
import type { EnrichmentTarget } from '~/lib/ai/enrichment/workflow';

/**
 * Helper dùng chung để đẩy một loạt contact vào hàng đợi enrichment nền
 * (mỗi contact MỘT durable run fire-and-forget + ghi sở hữu run→user).
 *
 * Dùng ở 2 nơi:
 * - POST /api/enrichment/batch (người dùng chọn tay danh sách contact).
 * - Auto-enrich sau khi xác nhận danh thiếp (plugin `auto_enrich_on_scan`
 *   trong agent_config.plugins — xem POST /api/card-imports/confirm).
 *
 * Kết quả enrichment chỉ là gợi ý — helper này KHÔNG ghi dữ liệu contact.
 * Route batch vẫn tự kiểm tra cấu hình trước để trả 503 thân thiện; helper
 * tự kiểm tra lại bên trong và skip toàn bộ khi chưa cấu hình (an toàn cho
 * đường auto-enrich best-effort, không ném lỗi ra ngoài caller).
 */

/** Số contact tối đa mỗi lượt gọi (đồng bộ zod schema của route batch). */
export const MAX_BATCH_ENRICHMENT_CONTACTS = 20;

export interface BatchEnrichmentOutcome {
  /** Số run đã start thành công. */
  started: number;
  runIds: string[];
  skipped: Array<{ contact_id: string; reason: string }>;
}

export interface StartBatchEnrichmentOptions {
  userId: string;
  contactIds: string[];
  /** Client của user (RLS) — dùng đọc dữ liệu contact. */
  supabase: SupabaseClient<Database>;
}

const CONTACT_FIELDS = [
  'id',
  'full_name',
  'job_title',
  'email',
  'phone',
  'address',
  'company_id',
  'companies(name)',
] as const;

interface ContactRow {
  id: string;
  full_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  company_id: string | null;
  companies: { name: string | null } | { name: string | null }[] | null;
}

function field(value: string | null) {
  const normalized = value?.trim() ? value.trim() : null;
  return {
    rawValue: null,
    normalizedValue: normalized,
    state: normalized ? 'extracted' : 'missing',
  } as const;
}

/** Dựng RecognizedCard từ dữ liệu contact của danh bạ. */
export function contactToRecognized(contact: ContactRow): RecognizedCard {
  const company = Array.isArray(contact.companies)
    ? (contact.companies[0]?.name ?? null)
    : (contact.companies?.name ?? null);
  return recognizedCardSchema.parse({
    schemaVersion: 1,
    detectedLanguage: 'unknown',
    fields: {
      fullName: field(contact.full_name),
      jobTitle: field(contact.job_title),
      companyName: field(company),
      email: field(contact.email),
      phone: field(contact.phone),
      address: field(contact.address),
      website: field(null),
    },
  });
}

/**
 * Đích áp company findings: contact có gắn công ty thì run nền hoàn tất sẽ
 * tự điền các trường công ty còn trống (FR-008, xem lib/ai/enrichment/apply.ts).
 */
function targetFor(contact: ContactRow): EnrichmentTarget {
  return { contactId: contact.id, companyId: contact.company_id ?? undefined };
}

/**
 * Đẩy các contact vào hàng đợi enrichment nền. KHÔNG ném lỗi nghiệp vụ —
 * contact lỗi được ghi vào `skipped` kèm lý do; lỗi bất ngờ của từng contact
 * cũng bị nuốt thành `skipped: start_failed` để một contact hỏng không chặn
 * các contact còn lại.
 */
export async function startBatchEnrichment(
  options: StartBatchEnrichmentOptions,
): Promise<BatchEnrichmentOutcome> {
  const outcome: BatchEnrichmentOutcome = { started: 0, runIds: [], skipped: [] };

  // Dedupe giữ thứ tự — một contact chỉ tạo một run trong lượt gọi này.
  const ids = Array.from(new Set(options.contactIds));

  // Cổng cấu hình: chưa cấu hình model/key thì không start run nào cả.
  const check = await checkEnrichmentConfigured(options.userId, options.supabase);
  if (!check.configured) {
    for (const contactId of ids) {
      outcome.skipped.push({ contact_id: contactId, reason: 'not_configured' });
    }
    return outcome;
  }

  for (const contactId of ids) {
    if (outcome.runIds.length >= MAX_BATCH_ENRICHMENT_CONTACTS) {
      outcome.skipped.push({ contact_id: contactId, reason: 'limit_exceeded' });
      continue;
    }

    try {
      const { data, error } = await options.supabase
        .from('contacts')
        .select(CONTACT_FIELDS.join(', '))
        .eq('id', contactId)
        .eq('user_id', options.userId)
        .maybeSingle();

      if (error || !data) {
        outcome.skipped.push({ contact_id: contactId, reason: 'not_found' });
        continue;
      }

      let recognized: RecognizedCard;
      try {
        recognized = contactToRecognized(data as unknown as ContactRow);
      } catch {
        outcome.skipped.push({ contact_id: contactId, reason: 'invalid_contact' });
        continue;
      }

      const run = await start(enrichLeadWorkflow, [
        recognized,
        options.userId,
        targetFor(data as unknown as ContactRow),
      ]);
      // Sở hữu lần chạy (FR-015, fail-closed): không ghi được mapping thì
      // KHÔNG phát hành runId — run vẫn chạy nền nhưng bị coi là không tồn
      // tại khi tra cứu (cùng hành vi với route /start và route batch cũ).
      const recorded = await recordRunOwner(
        getSupabaseServerAdminClient(),
        run.runId,
        options.userId,
      );
      if (!recorded) {
        outcome.skipped.push({ contact_id: contactId, reason: 'run_tracking_failed' });
        continue;
      }
      outcome.runIds.push(run.runId);
      outcome.started += 1;
    } catch (err) {
      console.warn(
        '[enrichment/batch] start run cho contact ' +
          contactId +
          ' thất bại: ' +
          (err instanceof Error ? err.message : String(err))
      );
      outcome.skipped.push({ contact_id: contactId, reason: 'start_failed' });
    }
  }

  return outcome;
}
