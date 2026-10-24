import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { Database, Json } from '@kit/supabase/database';

import { isCardRecognitionEnabled } from '~/lib/ai/card-recognition';
import {
  getAiModelConfig,
  type AiModelConfigSource,
} from '~/lib/ai/model-config';

/**
 * Các capability AI mà EventLead biết cách dùng.
 * Người dùng vẫn có thể lưu capability tùy ý qua POST (không giới hạn cứng).
 */
const CAPABILITIES = [
  {
    id: 'card_recognition',
    label: 'Nhận dạng danh thiếp',
    description:
      'Chuyển ảnh danh thiếp thành dữ liệu có cấu trúc ở bước Quét & nhận dạng.',
  },
  {
    id: 'lead_enrichment',
    label: 'Bổ sung thông tin lead bằng AI',
    description:
      'Gợi ý bổ sung thông tin công ty/người liên hệ từ dữ liệu đã quét. Agent chỉ gợi ý, người dùng quyết định.',
  },
  {
    id: 'followup_draft',
    label: 'Soạn tin nhắn follow-up',
    description:
      'Soạn nháp tin nhắn chăm sóc từ thông tin liên hệ và ghi chú cuộc gặp. Chỉ trả bản nháp, không tự gửi.',
  },
  {
    id: 'sourcing_assist',
    label: 'Trợ lý sourcing',
    description:
      'Gợi ý ứng viên từ danh bạ, soạn câu hỏi/RFQ/dàn ý đàm phán. Chỉ gợi ý và soạn nháp, người dùng quyết định.',
  },
  {
    id: 'rag_chat',
    label: 'Chatbot RAG tra cứu tri thức',
    description:
      'Trả lời câu hỏi từ tài liệu đã tải lên và danh bạ, kèm trích dẫn nguồn. Chỉ tư vấn và dựng dự thảo, không tự tính toán hay tự gửi.',
  },
  {
    id: 'rag_embeddings',
    label: 'Embedding cho RAG',
    description:
      'Vector hóa nội dung tài liệu và danh bạ để chatbot tìm kiếm ngữ nghĩa. Mặc định openai/text-embedding-3-small (1536 chiều).',
  },
] as const;

const upsertSchema = z.object({
  capability: z
    .string()
    .trim()
    .min(1, 'Tên capability không được để trống.')
    .max(80, 'Tên capability tối đa 80 ký tự.'),
  provider: z
    .string()
    .trim()
    .min(1, 'Provider không được để trống.')
    .max(80, 'Tên provider tối đa 80 ký tự.'),
  model: z
    .string()
    .trim()
    .max(200, 'Tên model tối đa 200 ký tự.')
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

export interface CapabilityStatus {
  capability: string;
  label: string;
  description: string;
  /** Cấu hình đang có hiệu lực (DB ưu tiên, env fallback). */
  provider: string;
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
  /** Trạng thái env hiện tại của server (để so sánh với DB). */
  envProvider: string;
  envModel: string | null;
  envEnabled: boolean;
  /** Config JSON hiện có trong DB (chuỗi đã stringify, "" nếu chưa có). */
  configJson: string;
  /** updated_at của dòng DB, null khi chưa có dòng nào. */
  updatedAt: string | null;
}

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

async function requireUser(requestId: string) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401),
    };
  }
  return { supabase, user };
}

function getEnvInfo(capability: string): {
  envProvider: string;
  envModel: string | null;
  envEnabled: boolean;
} {
  if (capability === 'lead_enrichment') {
    const envModel = (process.env.ENRICHMENT_MODEL ?? '').trim() || null;
    return { envProvider: 'AI Gateway', envModel, envEnabled: Boolean(envModel) };
  }
  if (capability === 'rag_chat') {
    const envModel = (process.env.RAG_CHAT_MODEL ?? '').trim() || null;
    return { envProvider: 'AI Gateway', envModel, envEnabled: Boolean(envModel) };
  }
  if (capability === 'rag_embeddings') {
    const envModel =
      (process.env.RAG_EMBEDDING_MODEL ?? '').trim() ||
      'openai/text-embedding-3-small';
    return {
      envProvider: 'AI Gateway',
      envModel,
      envEnabled: Boolean(
        (process.env.RAG_EMBEDDING_MODEL ?? '').trim() ||
          process.env.AI_GATEWAY_API_KEY,
      ),
    };
  }
  return {
    envProvider:
      (process.env.CARD_RECOGNITION_PROVIDER ?? '').trim().toLowerCase() || 'mock',
    envModel: null,
    envEnabled: isCardRecognitionEnabled(),
  };
}

async function buildCapabilityStatus(
  capability: (typeof CAPABILITIES)[number],
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<CapabilityStatus> {
  const dbRow = await getAiModelConfig(capability.id, userId, supabase);
  const { envProvider, envModel, envEnabled } = getEnvInfo(capability.id);
  return {
    capability: capability.id,
    label: capability.label,
    description: capability.description,
    provider: dbRow ? dbRow.provider : envProvider,
    model: dbRow ? dbRow.model : envModel,
    enabled: dbRow ? dbRow.enabled : envEnabled,
    source: dbRow ? 'database' : 'env',
    envProvider,
    envModel,
    envEnabled,
    configJson: dbRow ? JSON.stringify(dbRow.config ?? {}, null, 2) : '',
    updatedAt: dbRow ? dbRow.updated_at : null,
  };
}

/**
 * GET /api/ai-models
 *
 * Trả về danh sách cấu hình model AI của người dùng đang đăng nhập.
 * - `configs`: các dòng trong bảng `ai_model_configs` (sắp xếp theo capability).
 * - `capabilities`: trạng thái hiệu lực của từng capability đã biết
 *   (DB ưu tiên, env fallback) kèm snapshot env server để so sánh.
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  const { data: configs, error } = await supabase
    .from('ai_model_configs')
    .select(
      'id, user_id, capability, provider, model, enabled, config, created_at, updated_at',
    )
    .eq('user_id', user.id)
    .order('capability', { ascending: true });

  if (error) {
    return errorJson(
      requestId,
      'database_error',
      `Không đọc được cấu hình AI: ${error.message}`,
      500,
    );
  }

  const capabilities: CapabilityStatus[] = [];
  for (const capability of CAPABILITIES) {
    capabilities.push(await buildCapabilityStatus(capability, user.id, supabase));
  }

  return NextResponse.json({ configs: configs ?? [], capabilities });
}

/**
 * POST /api/ai-models
 *
 * Tạo mới hoặc cập nhật cấu hình model cho một capability của người dùng
 * (upsert theo cặp user_id + capability).
 *
 * Body: { capability, provider, model?, enabled?, config? }
 * - `config` chỉ chứa tham số KHÔNG nhạy cảm. Tuyệt đối không gửi API key/secret.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  const body: unknown = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'invalid_input',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }
  const { capability, provider, model, enabled, config } = parsed.data;

  if (
    typeof config !== 'object' ||
    config === null ||
    Array.isArray(config)
  ) {
    return errorJson(
      requestId,
      'invalid_input',
      'Cấu hình JSON phải là một object (ví dụ {"timeout_ms": 30000}).',
      400,
    );
  }

  const { data, error } = await supabase
    .from('ai_model_configs')
    .upsert(
      {
        user_id: user.id,
        capability,
        provider,
        model,
        enabled,
        config: config as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,capability' },
    )
    .select(
      'id, user_id, capability, provider, model, enabled, config, created_at, updated_at',
    )
    .single();

  if (error) {
    return errorJson(
      requestId,
      'database_error',
      `Không lưu được cấu hình: ${error.message}`,
      500,
    );
  }

  return NextResponse.json({ config: data });
}

/**
 * DELETE /api/ai-models
 *
 * Xóa cấu hình DB của một capability → capability đó quay về dùng env server.
 * Body: { capability }
 */
export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  const auth = await requireUser(requestId);
  if ('error' in auth) return auth.error;

  const { supabase, user } = auth;

  const body: unknown = await request.json().catch(() => null);
  const capability =
    typeof body === 'object' && body !== null && 'capability' in body
      ? String((body as { capability: unknown }).capability ?? '').trim()
      : '';

  if (!capability) {
    return errorJson(
      requestId,
      'invalid_input',
      'Thiếu tên capability cần xóa.',
      400,
    );
  }

  const { error } = await supabase
    .from('ai_model_configs')
    .delete()
    .eq('user_id', user.id)
    .eq('capability', capability);

  if (error) {
    return errorJson(
      requestId,
      'database_error',
      `Không xóa được cấu hình: ${error.message}`,
      500,
    );
  }

  return NextResponse.json({ ok: true });
}
