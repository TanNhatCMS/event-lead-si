import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createGateway, generateText } from 'ai';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  getAiModelConfig,
  getGatewayApiKey,
} from '~/lib/ai/enrichment/model-config';
import { withUserSpan } from '~/lib/otel/trace';

const bodySchema = z.object({
  contact_id: z.string().uuid('Mã liên hệ không hợp lệ.'),
  /** Ngữ cảnh thêm do người dùng nhập (VD: "vừa gặp ở sự kiện X"). */
  context: z.string().trim().max(2000).optional().default(''),
  /** Kênh dự kiến: giúp AI chọn giọng văn. */
  channel: z.enum(['zalo', 'email', 'sms', 'khac']).optional().default('zalo'),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

const SYSTEM_PROMPT = `Bạn là trợ lý soạn tin nhắn chăm sóc khách hàng người Việt.
Nhiệm vụ: dựa trên thông tin liên hệ và ghi chú cuộc gặp, soạn MỘT tin nhắn follow-up ngắn gọn, lịch sự, tự nhiên.

Nguyên tắc:
- Tiếng Việt, giọng văn thân thiện, chuyên nghiệp, không sến.
- Dưới 120 từ. Không dùng emoji trừ khi ngữ cảnh rất thân thiết.
- Nhắc tới chi tiết cụ thể từ ghi chú (tên sự kiện, nhu cầu đã trao đổi) để tin nhắn không chung chung.
- Kết thúc bằng một câu hỏi mở hoặc đề xuất bước tiếp theo cụ thể.
- KHÔNG bịa thông tin không có trong dữ liệu. Nếu thiếu ngữ cảnh, soạn tin chào hỏi chung nhưng vẫn cá nhân hóa theo tên/chức danh/công ty.
- Chỉ trả về nội dung tin nhắn, không thêm lời giải thích.`;

function buildPrompt(input: {
  fullName: string;
  jobTitle: string | null;
  companyName: string | null;
  notes: string[];
  context: string;
  channel: string;
}): string {
  const lines = [
    `Liên hệ: ${input.fullName}`,
    input.jobTitle ? `Chức danh: ${input.jobTitle}` : null,
    input.companyName ? `Công ty: ${input.companyName}` : null,
    `Kênh gửi dự kiến: ${input.channel}`,
    input.context ? `Ngữ cảnh thêm: ${input.context}` : null,
    input.notes.length > 0
      ? `Ghi chú cuộc gặp:\n${input.notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}`
      : 'Chưa có ghi chú cuộc gặp.',
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * POST /api/followup/draft
 *
 * AI soạn nháp tin nhắn follow-up từ thông tin liên hệ + ghi chú.
 * Chỉ trả về BẢN NHÁP — người dùng tự quyết định dùng hay không,
 * hệ thống KHÔNG tự gửi bất kỳ đâu.
 *
 * Model: capability `followup_draft` trong ai_model_configs (ưu tiên),
 * fallback env FOLLOWUP_MODEL. Cần AI_GATEWAY_API_KEY.
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
  const { contact_id, context, channel } = parsed.data;

  const { data: contact } = await supabase
    .from('contacts')
    .select('id, full_name, job_title, companies(display_name)')
    .eq('id', contact_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!contact) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);
  }

  const { data: notes } = await supabase
    .from('meeting_notes')
    .select('body')
    .eq('contact_id', contact_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  const apiKey = getGatewayApiKey();
  if (!apiKey) {
    return errorJson(
      requestId,
      'not_configured',
      'Chưa cấu hình AI Gateway (AI_GATEWAY_API_KEY).',
      503,
    );
  }

  const dbConfig = await getAiModelConfig('followup_draft', user.id, supabase);
  const model = dbConfig?.model?.trim()
    ? dbConfig.model.trim()
    : (process.env.FOLLOWUP_MODEL ?? '').trim();
  if (!model || (dbConfig && !dbConfig.enabled)) {
    return errorJson(
      requestId,
      'not_configured',
      'Chưa cấu hình model cho tác vụ soạn tin follow-up (capability followup_draft).',
      503,
    );
  }

  const company = contact.companies as unknown as { display_name: string } | null;
  try {
    const provider = createGateway({ apiKey });
    const generated = await withUserSpan('followup.draft', user.id, () =>
      generateText({
        model: provider(model),
        system: SYSTEM_PROMPT,
        prompt: buildPrompt({
          fullName: contact.full_name,
          jobTitle: contact.job_title,
          companyName: company?.display_name ?? null,
          notes: (notes ?? []).map((n) => n.body),
          context,
          channel,
        }),
        maxOutputTokens: 500,
        experimental_telemetry: { isEnabled: true },
      }),
    );
    return NextResponse.json({
      draft: generated.text.trim(),
      model_used: `${dbConfig ? 'database' : 'env'}:${model}`,
      request_id: requestId,
    });
  } catch (err) {
    return errorJson(
      requestId,
      'draft_failed',
      'Soạn tin nhắn thất bại: ' + (err instanceof Error ? err.message : 'lỗi không xác định'),
      500,
    );
  }
}
