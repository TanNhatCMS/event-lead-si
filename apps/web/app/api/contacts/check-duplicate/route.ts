import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const bodySchema = z.object({
  full_name: z.string().trim().max(240).optional().default(''),
  email: z.string().trim().max(240).optional().default(''),
  phone: z.string().trim().max(60).optional().default(''),
  /** id liên hệ đang sửa (nếu có) — loại khỏi kết quả. */
  exclude_id: z.string().uuid().optional(),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/** Chuẩn hóa SĐT về chuỗi số, bỏ +84/84 đầu → 0 + 9 số. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let d = digits;
  if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2);
  if (d.length < 9) return null;
  return d.slice(-9);
}

function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard trên tập token — đủ tốt cho tên người Việt ngắn. */
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

type MatchReason = 'phone' | 'email' | 'name';

/**
 * POST /api/contacts/check-duplicate
 *
 * Kiểm tra liên hệ sắp tạo/sửa có trùng với danh bạ hiện có không.
 * Tiêu chí (mạnh → yếu): SĐT trùng > email trùng > tên gần giống.
 * Chỉ gợi ý — không chặn, người dùng quyết định tạo mới hay dùng hồ sơ cũ.
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
  const { full_name, email, phone, exclude_id } = parsed.data;

  const qName = normalizeName(full_name);
  const qEmail = email.trim().toLowerCase() || null;
  const qPhone = normalizePhone(phone);

  if (!qName && !qEmail && !qPhone) {
    return NextResponse.json({ matches: [], request_id: requestId });
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('id, full_name, job_title, email, phone, archived_at, companies(display_name)')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .limit(500);

  if (error) {
    return errorJson(requestId, 'check_failed', 'Chưa kiểm tra được trùng lặp.', 500);
  }

  const matches: Array<{
    contact: {
      id: string;
      full_name: string;
      job_title: string | null;
      company_name: string | null;
    };
    reasons: MatchReason[];
    score: number;
  }> = [];

  for (const row of data ?? []) {
    if (exclude_id && row.id === exclude_id) continue;
    const reasons: MatchReason[] = [];
    let score = 0;

    const rPhone = row.phone ? normalizePhone(row.phone) : null;
    if (qPhone && rPhone && qPhone === rPhone) {
      reasons.push('phone');
      score += 50;
    }
    const rEmail = row.email?.trim().toLowerCase() || null;
    if (qEmail && rEmail && qEmail === rEmail) {
      reasons.push('email');
      score += 40;
    }
    const rName = normalizeName(row.full_name ?? '');
    if (qName && rName) {
      if (qName === rName) {
        reasons.push('name');
        score += 30;
      } else {
        const sim = nameSimilarity(qName, rName);
        if (sim >= 0.75) {
          reasons.push('name');
          score += Math.round(sim * 20);
        }
      }
    }

    if (reasons.length > 0) {
      const company = row.companies as unknown as { display_name: string } | null;
      matches.push({
        contact: {
          id: row.id,
          full_name: row.full_name,
          job_title: row.job_title,
          company_name: company?.display_name ?? null,
        },
        reasons,
        score,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    matches: matches.slice(0, 5),
    request_id: requestId,
  });
}
