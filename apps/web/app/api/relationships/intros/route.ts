import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const querySchema = z.object({
  target: z.string().uuid('Mã liên hệ không hợp lệ.'),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/relationships/intros?target=<contact_id>
 *
 * Gợi ý đường giới thiệu tới một liên hệ mục tiêu (FR-022):
 * tìm các liên hệ khác cùng công ty với mục tiêu — họ là "cầu nối"
 * tiềm năng. Kèm bằng chứng (cùng công ty nào, chức danh).
 * Chỉ hiển thị gợi ý — KHÔNG tự gửi bất kỳ lời giới thiệu nào;
 * người dùng tự quyết định.
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_query', 'Mã liên hệ không hợp lệ.', 400);
  }
  const targetId = parsed.data.target;

  const { data: target } = await supabase
    .from('contacts')
    .select('id, full_name, job_title, company_id, companies(display_name)')
    .eq('id', targetId)
    .eq('user_id', user.id)
    .is('archived_at', null)
    .maybeSingle();
  if (!target) return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);

  const intros: Array<{
    connector: { id: string; full_name: string; job_title: string | null };
    evidence: string;
  }> = [];

  // Cầu nối: liên hệ khác cùng công ty với mục tiêu.
  if (target.company_id) {
    const { data: colleagues } = await supabase
      .from('contacts')
      .select('id, full_name, job_title')
      .eq('user_id', user.id)
      .eq('company_id', target.company_id)
      .is('archived_at', null)
      .neq('id', targetId)
      .limit(10);
    const company = target.companies as unknown as { display_name: string } | null;
    for (const c of colleagues ?? []) {
      intros.push({
        connector: { id: c.id, full_name: c.full_name, job_title: c.job_title },
        evidence: `Cùng làm tại ${company?.display_name ?? 'công ty'} với ${target.full_name}`,
      });
    }
  }

  return NextResponse.json({
    target: {
      id: target.id,
      full_name: target.full_name,
      job_title: target.job_title,
    },
    intros,
    request_id: requestId,
  });
}
