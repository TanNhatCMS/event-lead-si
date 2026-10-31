import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import {
  SEARCH_LIMITS,
  SEARCH_MIN_LENGTH,
  buildContactSearchOr,
  escapeLikePattern,
  noteSnippet,
} from '~/lib/search/query';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

/**
 * GET /api/search?q=... — tìm nhanh TOÀN CỤC cho command palette (Ctrl+K).
 *
 * Tìm ilike (%q%) trên 3 nhóm, mỗi nhóm độc lập:
 * - contacts: full_name / email / phone (bỏ contact đã lưu trữ) — tối đa 8.
 * - companies: display_name — tối đa 5.
 * - notes: meeting_notes.body (bỏ ghi chú đã xóa mềm) — tối đa 5, trả kèm
 *   tên contact để palette hiển thị ngữ cảnh.
 *
 * GUARD: requireUser + eq user_id (RLS vẫn tự lọc — phòng thủ 2 lớp). Dùng
 * ilike thường (KHÔNG full-text search) để phản hồi nhanh với index B-tree
 * sẵn có; từ khoá được escape LIKE để tìm nghĩa đen.
 *
 * Response shape (frontend command palette đọc):
 * {
 *   query: string,
 *   contacts:  { id, full_name, job_title, email }[],
 *   companies: { id, display_name, industry }[],
 *   notes:     { id, contact_id, contact_name, body }[],
 *   request_id
 * }
 */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length < SEARCH_MIN_LENGTH) {
    return errorJson(
      requestId,
      'invalid_query',
      'Từ khoá cần ít nhất ' + SEARCH_MIN_LENGTH + ' ký tự.',
      400,
    );
  }

  // Bọc wildcard %..% — tìm chuỗi con (escapeLikePattern chỉ escape ký tự
  // đặc biệt của LIKE, không tự thêm wildcard).
  const pattern = '%' + escapeLikePattern(q) + '%';
  const contactOr = buildContactSearchOr(pattern);

  const [contactsRes, companiesRes, notesRes] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, full_name, job_title, email')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .or(contactOr)
      .order('created_at', { ascending: false })
      .limit(SEARCH_LIMITS.contacts),
    supabase
      .from('companies')
      .select('id, display_name, industry')
      .eq('user_id', user.id)
      .ilike('display_name', pattern)
      .order('created_at', { ascending: false })
      .limit(SEARCH_LIMITS.companies),
    supabase
      .from('meeting_notes')
      .select('id, contact_id, body, contacts(full_name)')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .ilike('body', pattern)
      .order('created_at', { ascending: false })
      .limit(SEARCH_LIMITS.notes),
  ]);

  if (contactsRes.error || companiesRes.error || notesRes.error) {
    const firstError =
      contactsRes.error?.message ??
      companiesRes.error?.message ??
      notesRes.error?.message ??
      'không rõ';
    console.error('[search] truy vấn thất bại: ' + firstError);
    return errorJson(requestId, 'search_failed', 'Chưa tìm được kết quả.', 500);
  }

  // database.types.ts chưa khai báo quan hệ meeting_notes→contacts nên embed
  // được ép kiểu qua unknown (cùng pattern với route enrichment/batch).
  const noteRows = (notesRes.data ?? []) as unknown as Array<{
    id: string;
    contact_id: string;
    body: string | null;
    contacts: { full_name: string | null } | { full_name: string | null }[] | null;
  }>;

  const notes = noteRows.map((row) => {
    const contactName = Array.isArray(row.contacts)
      ? (row.contacts[0]?.full_name ?? null)
      : (row.contacts?.full_name ?? null);
    return {
      id: row.id,
      contact_id: row.contact_id,
      contact_name: contactName,
      body: noteSnippet(row.body),
    };
  });

  return NextResponse.json({
    query: q,
    contacts: contactsRes.data ?? [],
    companies: companiesRes.data ?? [],
    notes,
    request_id: requestId,
  });
}
