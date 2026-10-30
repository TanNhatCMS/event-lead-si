import 'server-only';

import { createGateway, generateText } from 'ai';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';

import { getPrompt } from '~/lib/ai/prompts/manager';
import { withUserSpan } from '~/lib/otel/trace';

import {
  getAiModelConfig,
  getGatewayApiKey,
} from '~/lib/ai/enrichment/model-config';

/**
 * Logic AI soạn nháp tin nhắn follow-up — dùng chung giữa
 * `app/api/followup/draft` (route có sẵn, KHÔNG sửa) và `app/api/followups`
 * (POST thiếu body → tự sinh nháp). Bản port hành vi của route cũ:
 *
 * - Capability `followup_draft` trong `ai_model_configs` (ưu tiên), fallback
 *   env `FOLLOWUP_MODEL`. Cần `AI_GATEWAY_API_KEY`.
 * - Prompt system đọc từ `getPrompt('followup_draft', ...)` (bản custom của
 *   user qua UI, nếu không có dùng default).
 * - Chỉ trả BẢN NHÁP — hệ thống không tự gửi tin đi đâu cả.
 */

type DbClient = SupabaseClient<Database>;

/** Mã lỗi khi soạn nháp thất bại — message tĩnh, chi tiết để ở field `detail`. */
export class FollowupDraftError extends Error {
  readonly code: 'not_configured' | 'draft_failed';
  readonly detail: string;

  constructor(code: 'not_configured' | 'draft_failed', detail: string) {
    super(code === 'not_configured' ? 'Chưa cấu hình AI soạn tin follow-up.' : 'Soạn tin nhắn thất bại.');
    this.name = 'FollowupDraftError';
    this.code = code;
    this.detail = detail;
  }
}

export interface FollowupDraftContext {
  fullName: string;
  jobTitle: string | null;
  companyName: string | null;
  notes: string[];
  context: string;
  channel: string;
}

/** Dựng prompt đầu vào cho model — hàm thuần, dễ test. */
export function buildFollowupDraftPrompt(input: FollowupDraftContext): string {
  const lines = [
    'Liên hệ: ' + input.fullName,
    input.jobTitle ? 'Chức danh: ' + input.jobTitle : null,
    input.companyName ? 'Công ty: ' + input.companyName : null,
    'Kênh gửi dự kiến: ' + input.channel,
    input.context ? 'Ngữ cảnh thêm: ' + input.context : null,
    input.notes.length > 0
      ? 'Ghi chú cuộc gặp:\n' +
        input.notes.map((note, index) => String(index + 1) + '. ' + note).join('\n')
      : 'Chưa có ghi chú cuộc gặp.',
  ].filter(Boolean);
  return lines.join('\n');
}

export interface GenerateFollowupDraftInput {
  userId: string;
  supabase: DbClient;
  context: FollowupDraftContext;
}

export interface FollowupDraftResult {
  draft: string;
  /** Nhãn model đã dùng: "database:<id>" hoặc "env:<id>". */
  modelUsed: string;
}

/**
 * Sinh bản nháp follow-up bằng AI. Ném `FollowupDraftError` khi thiếu cấu
 * hình (code 'not_configured') hoặc model lỗi (code 'draft_failed').
 */
export async function generateFollowupDraft(
  input: GenerateFollowupDraftInput,
): Promise<FollowupDraftResult> {
  const apiKey = getGatewayApiKey();
  if (!apiKey) {
    throw new FollowupDraftError(
      'not_configured',
      'Chưa cấu hình AI Gateway (AI_GATEWAY_API_KEY).',
    );
  }

  const dbConfig = await getAiModelConfig('followup_draft', input.userId, input.supabase);
  const model = dbConfig?.model?.trim()
    ? dbConfig.model.trim()
    : (process.env.FOLLOWUP_MODEL ?? '').trim();
  if (!model || (dbConfig && !dbConfig.enabled)) {
    throw new FollowupDraftError(
      'not_configured',
      'Chưa cấu hình model cho tác vụ soạn tin follow-up (capability followup_draft).',
    );
  }

  try {
    const provider = createGateway({ apiKey });
    const systemPrompt = await getPrompt('followup_draft', input.userId, input.supabase);
    const generated = await withUserSpan('followup.draft', input.userId, () =>
      generateText({
        model: provider(model),
        system: systemPrompt,
        prompt: buildFollowupDraftPrompt(input.context),
        maxOutputTokens: 500,
        experimental_telemetry: { isEnabled: true },
      }),
    );
    return {
      draft: generated.text.trim(),
      modelUsed: (dbConfig ? 'database:' : 'env:') + model,
    };
  } catch (err) {
    throw new FollowupDraftError(
      'draft_failed',
      err instanceof Error ? err.message : 'lỗi không xác định',
    );
  }
}
