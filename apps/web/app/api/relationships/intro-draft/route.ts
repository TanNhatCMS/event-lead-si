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
  target_id: z.string().uuid('Mã liên hệ không hợp lệ.'),
  connector_id: z.string().uuid('Mã người giới thiệu không hợp lệ.'),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

const SYSTEM_PROMPT = `Bạn là trợ lý soạn tin nhắn giới thiệu trong mạng lưới quan hệ B2B người Việt.
Nhiệm vụ: soạn MỘT tin nhắn ngắn để người dùng gửi cho "cầu nối", nhờ giới thiệu
mình với "mục tiêu".

Nguyên tắc:
- Tiếng Việt, lịch sự, không sến. Dưới 100 từ.
- Nêu rõ: mình là ai (để trống tên nếu không biết), muốn kết nối với mục tiêu vì lý do gì
  (để chung chung "hợp tác trong lĩnh vực [X]" nếu không có ngữ cảnh cụ thể), và
  đề xuất cách giới thiệu nhẹ nhàng (tin nhắn nhóm, email giới thiệu...).
- KHÔNG bịa chi tiết về mối quan hệ giữa các bên.
- Chỉ trả về nội dung tin nhắn, không thêm giải thích.`;

/**
 * POST /api/relationships/intro-draft
 *
 * AI soạn nháp tin nhắn nhờ giới thiệu (FR-022).
 * Chỉ trả BẢN NHÁP — người dùng tự quyết định gửi hay không,
 * hệ thống KHÔNG tự gửi.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

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

  const [{ data: target }, { data: connector }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, full_name, job_title, companies(display_name)')
      .eq('id', parsed.data.target_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('contacts')
      .select('id, full_name, job_title, companies(display_name)')
      .eq('id', parsed.data.connector_id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);
  if (!target || !connector) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);
  }

  const apiKey = getGatewayApiKey();
  if (!apiKey) {
    return errorJson(requestId, 'not_configured', 'Chưa cấu hình AI Gateway (AI_GATEWAY_API_KEY).', 503);
  }
  const dbConfig = await getAiModelConfig('sourcing_assist', user.id, supabase);
  const model = dbConfig?.model?.trim()
    ? dbConfig.model.trim()
    : (process.env.SOURCING_MODEL ?? '').trim();
  if (!model || (dbConfig && !dbConfig.enabled)) {
    return errorJson(
      requestId,
      'not_configured',
      'Chưa cấu hình model cho trợ lý sourcing (capability sourcing_assist).',
      503,
    );
  }

  const coOf = (c: typeof target) =>
    (c.companies as unknown as { display_name: string } | null)?.display_name ?? null;
  const prompt = [
    `Cầu nối: ${connector.full_name}${connector.job_title ? ` (${connector.job_title})` : ''}${coOf(connector) ? ` — ${coOf(connector)}` : ''}`,
    `Mục tiêu: ${target.full_name}${target.job_title ? ` (${target.job_title})` : ''}${coOf(target) ? ` — ${coOf(target)}` : ''}`,
  ].join('\n');

  try {
    const provider = createGateway({ apiKey });
    const generated = await withUserSpan('relationships.intro_draft', user.id, () =>
      generateText({
        model: provider(model),
        system: SYSTEM_PROMPT,
        prompt,
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
