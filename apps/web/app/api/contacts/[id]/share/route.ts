import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { logLifecycleAudit } from '~/lib/lifecycle/audit';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/** Cấu hình URL gốc của app ( NEXT_PUBLIC_SITE_URL, có thể rỗng ở dev). */
function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
}

/**
 * POST /api/contacts/[id]/share
 *
 * Tạo/lấy link chia sẻ công khai cho MỘT liên hệ:
 * - `contacts.share_token` có sẵn (default gen_random_uuid()); nếu dòng cũ bị
 *   NULL thì sinh token mới và lưu.
 * - Link = NEXT_PUBLIC_SITE_URL + /chia-se-lien-he/<share_token>.
 * - Trang công khai chỉ hiển thị tên / chức danh / công ty — không có email,
 *   SĐT hay dữ liệu nhạy cảm khác.
 */
export async function POST(request: Request, context: RouteContext) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }
  const { id: contactId } = await context.params;
  if (!contactId?.trim()) {
    return errorJson(requestId, 'invalid_id', 'Thiếu mã liên hệ.', 400);
  }

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, full_name, share_token')
    .eq('id', contactId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (contactError) {
    return errorJson(requestId, 'lookup_failed', 'Chưa tra cứu được liên hệ.', 500);
  }
  if (!contact) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy liên hệ.', 404);
  }

  let shareToken = contact.share_token;
  if (!shareToken) {
    shareToken = crypto.randomUUID();
    const { error: updateError } = await supabase
      .from('contacts')
      .update({ share_token: shareToken })
      .eq('id', contact.id)
      .eq('user_id', user.id);
    if (updateError) {
      return errorJson(requestId, 'share_failed', 'Chưa tạo được link chia sẻ.', 500);
    }
  }

  const path = '/chia-se-lien-he/' + shareToken;
  const shareUrl = (getSiteUrl() || new URL(request.url).origin) + path;

  await logLifecycleAudit(supabase, user.id, {
    action: 'contact.share',
    entityType: 'contact',
    entityId: contact.id,
    summary: 'Tạo link chia sẻ liên hệ: ' + contact.full_name,
    metadata: { path },
  });

  // `shareUrl` là tên theo đặc tả; `share_url` giữ nhất quán với các API khác.
  return NextResponse.json({
    shareUrl,
    share_url: shareUrl,
    path,
    request_id: requestId,
  });
}
