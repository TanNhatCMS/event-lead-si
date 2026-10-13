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
  request_id: z.string().uuid('Mã yêu cầu không hợp lệ.'),
  /** 'questions' | 'rfq' | 'negotiation' */
  kind: z.enum(['questions', 'rfq', 'negotiation']).optional().default('questions'),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

const SYSTEM_PROMPT = `Bạn là trợ lý sourcing B2B tại Việt Nam.
Nhiệm vụ: dựa trên yêu cầu tìm nhà cung cấp và danh sách ứng viên (kèm bằng chứng),
soạn nội dung theo loại được yêu cầu:

- questions: bộ câu hỏi cần xác minh cho từng ứng viên (năng lực, giá, tiến độ, bảo hành...),
  tập trung vào "khoảng trống bằng chứng" — những gì chưa có bằng chứng thì hỏi.
- rfq: thư yêu cầu báo giá (RFQ) chuyên nghiệp bằng tiếng Việt: giới thiệu nhu cầu,
  mô tả sản phẩm/dịch vụ, tiêu chí đánh giá, thời hạn phản hồi (để trống để người dùng điền).
- negotiation: dàn ý chuẩn bị đàm phán: mục tiêu, BATNA gợi ý, điểm mặc cả theo tiêu chí,
  câu hỏi mở và lưu ý văn hóa đàm phán B2B Việt Nam.

Nguyên tắc:
- Tiếng Việt, chuyên nghiệp, súc tích. Dùng đúng tên ứng viên/tiêu chí được cung cấp.
- KHÔNG bịa bằng chứng. Khoảng trống bằng chứng thì ghi rõ "cần xác minh".
- Chỉ trả về nội dung soạn thảo, không thêm lời giải thích.`;

/**
 * POST /api/sourcing/draft-rfq
 *
 * AI soạn câu hỏi xác minh / thư RFQ / dàn ý đàm phán từ yêu cầu sourcing
 * và ứng viên trong danh sách ngắn.
 * Chỉ trả BẢN NHÁP — người dùng duyệt trước khi dùng bên ngoài (FR-021).
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

  const { data: req } = await supabase
    .from('sourcing_requests')
    .select('id, title, product_description, target_market, criteria')
    .eq('id', parsed.data.request_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!req) return errorJson(requestId, 'not_found', 'Không tìm thấy yêu cầu.', 404);

  const { data: candidates } = await supabase
    .from('sourcing_candidates')
    .select('name, notes, evidence, fit_summary, shortlisted')
    .eq('user_id', user.id)
    .eq('request_id', req.id)
    .order('shortlisted', { ascending: false });

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

  const criteria = Array.isArray(req.criteria) ? req.criteria : [];
  const candText = (candidates ?? [])
    .map((c, i) => {
      const ev = Array.isArray(c.evidence) ? c.evidence : [];
      return `${i + 1}. ${c.name}${c.shortlisted ? ' (danh sách ngắn)' : ''}\n` +
        (c.fit_summary ? `   Đánh giá: ${c.fit_summary}\n` : '') +
        (c.notes ? `   Ghi chú: ${c.notes}\n` : '') +
        (ev.length > 0
          ? `   Bằng chứng:\n${ev.map((e: { label?: string; url?: string; note?: string }) => `   - ${e.label}${e.url ? ` (${e.url})` : ''}${e.note ? `: ${e.note}` : ''}`).join('\n')}\n`
          : '   Bằng chứng: chưa có\n');
    })
    .join('\n');

  const kindLabel = { questions: 'bộ câu hỏi xác minh', rfq: 'thư yêu cầu báo giá (RFQ)', negotiation: 'dàn ý chuẩn bị đàm phán' }[parsed.data.kind];

  const prompt = [
    `Loại nội dung cần soạn: ${kindLabel}`,
    `Yêu cầu: ${req.title}`,
    req.product_description ? `Mô tả: ${req.product_description}` : null,
    req.target_market ? `Thị trường: ${req.target_market}` : null,
    criteria.length > 0
      ? `Tiêu chí:\n${criteria.map((c: { label?: string; detail?: string }) => `- ${c.label}${c.detail ? `: ${c.detail}` : ''}`).join('\n')}`
      : null,
    '',
    'Ứng viên:',
    candText || '(chưa có ứng viên)',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const provider = createGateway({ apiKey });
    const generated = await withUserSpan('sourcing.draft_rfq', user.id, () =>
      generateText({
        model: provider(model),
        system: SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 2500,
        experimental_telemetry: { isEnabled: true },
      }),
    );
    return NextResponse.json({
      draft: generated.text.trim(),
      kind: parsed.data.kind,
      model_used: `${dbConfig ? 'database' : 'env'}:${model}`,
      request_id: requestId,
    });
  } catch (err) {
    return errorJson(
      requestId,
      'draft_failed',
      'Soạn thảo thất bại: ' + (err instanceof Error ? err.message : 'lỗi không xác định'),
      500,
    );
  }
}
