import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { getPromptDefault } from '~/lib/ai/prompts/defaults';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ key: string }> };

const updateSchema = z.object({
  content: z
    .string({ message: 'Nội dung prompt không hợp lệ.' })
    .min(10, { message: 'Prompt quá ngắn (tối thiểu 10 ký tự).' })
    .max(20000, { message: 'Prompt quá dài (tối đa 20.000 ký tự).' }),
});

/**
 * GET /api/prompts/[key] — lấy một prompt.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { key } = await params;

  const def = getPromptDefault(key);
  if (!def) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy prompt.', 404);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const { data } = await supabase
    .from('ai_prompts')
    .select('content, is_custom, updated_at')
    .eq('user_id', user.id)
    .eq('prompt_key', key)
    .maybeSingle();

  return NextResponse.json({
    key: def.key,
    name: def.name,
    description: def.description,
    content: data?.content ?? def.content,
    is_custom: data?.is_custom ?? false,
    updated_at: data?.updated_at ?? null,
    request_id: requestId,
  });
}

/**
 * PUT /api/prompts/[key] — cập nhật nội dung prompt (upsert).
 * Body: { content: string }
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { key } = await params;

  const def = getPromptDefault(key);
  if (!def) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy prompt.', 404);
  }

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
    return errorJson(requestId, 'validation_error', 'Body không phải JSON hợp lệ.', 400);
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(
      requestId,
      'validation_error',
      parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.',
      400,
    );
  }

  const { error } = await supabase.from('ai_prompts').upsert(
    {
      user_id: user.id,
      prompt_key: key,
      name: def.name,
      description: def.description,
      content: parsed.data.content,
      is_custom: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,prompt_key' },
  );

  if (error) {
    return errorJson(requestId, 'internal', 'Không lưu được prompt.', 500);
  }

  return NextResponse.json({ key, is_custom: true, request_id: requestId });
}

/**
 * DELETE /api/prompts/[key] — khôi phục về bản mặc định (xóa bản custom).
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { key } = await params;

  if (!getPromptDefault(key)) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy prompt.', 404);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const { error } = await supabase
    .from('ai_prompts')
    .delete()
    .eq('user_id', user.id)
    .eq('prompt_key', key);

  if (error) {
    return errorJson(requestId, 'internal', 'Không khôi phục được prompt.', 500);
  }

  return NextResponse.json({ key, is_custom: false, request_id: requestId });
}
