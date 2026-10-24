import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createGateway, generateText, Output } from 'ai';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getPrompt } from '~/lib/ai/prompts/manager';
import { withUserSpan } from '~/lib/otel/trace';

import {
  getAiModelConfig,
  getGatewayApiKey,
} from '~/lib/ai/enrichment/model-config';

const bodySchema = z.object({
  request_id: z.string().uuid('Mã yêu cầu không hợp lệ.'),
});

const suggestionSchema = z.object({
  suggestions: z.array(
    z.object({
      contact_id: z.string().nullable(),
      company_id: z.string().nullable(),
      name: z.string(),
      reason: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * POST /api/sourcing/suggest
 *
 * AI gợi ý ứng viên từ danh bạ cho một yêu cầu sourcing.
 * Chỉ trả GỢI Ý — người dùng chọn ứng viên nào để thêm, không tự thêm.
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

  const [{ data: contacts }, { data: companies }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, full_name, job_title, email, phone, companies(display_name, industry)')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .limit(200),
    supabase
      .from('companies')
      .select('id, display_name, industry, website')
      .eq('user_id', user.id)
      .limit(200),
  ]);

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
  const dirText = [
    'DANH BẠ LIÊN HỆ:',
    ...((contacts ?? []).map((c) => {
      const co = c.companies as unknown as { display_name: string; industry: string | null } | null;
      return `- [contact:${c.id}] ${c.full_name} | ${c.job_title ?? ''} | ${co?.display_name ?? ''} | ${co?.industry ?? ''}`;
    })),
    '',
    'DANH SÁCH CÔNG TY:',
    ...((companies ?? []).map((co) => `- [company:${co.id}] ${co.display_name} | ${co.industry ?? ''} | ${co.website ?? ''}`)),
  ].join('\n');

  const prompt = [
    `YÊU CẦU: ${req.title}`,
    req.product_description ? `Mô tả sản phẩm/dịch vụ cần tìm: ${req.product_description}` : null,
    req.target_market ? `Thị trường mục tiêu: ${req.target_market}` : null,
    criteria.length > 0
      ? `Tiêu chí:\n${criteria.map((c: { label?: string; detail?: string }) => `- ${c.label}${c.detail ? `: ${c.detail}` : ''}`).join('\n')}`
      : null,
    '',
    dirText,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const provider = createGateway({ apiKey });
    const generated = await withUserSpan('sourcing.suggest', user.id, async () =>
      generateText({
        model: provider(model),
        system: await getPrompt('sourcing_suggest', user.id, supabase),
        prompt,
        output: Output.object({ schema: suggestionSchema }),
        maxOutputTokens: 2000,
        experimental_telemetry: { isEnabled: true },
      }),
    );
    return NextResponse.json({
      suggestions: generated.output?.suggestions ?? [],
      model_used: `${dbConfig ? 'database' : 'env'}:${model}`,
      request_id: requestId,
    });
  } catch (err) {
    return errorJson(
      requestId,
      'suggest_failed',
      'Gợi ý ứng viên thất bại: ' + (err instanceof Error ? err.message : 'lỗi không xác định'),
      500,
    );
  }
}
