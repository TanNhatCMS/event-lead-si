import 'server-only';

import { NextResponse } from 'next/server';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/knowledge/documents/[id]
 *
 * Xóa tài liệu của user đăng nhập: xóa row `documents` (FK cascade sang
 * `document_chunks` theo migration T001), rồi xóa file trong bucket
 * `documents` (`{user_id}/{doc_id}/...`). 404 nếu không thuộc user.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const requestId = crypto.randomUUID();
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return errorJson(requestId, 'validation_error', 'Mã tài liệu không hợp lệ.', 400);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError) {
    return errorJson(requestId, 'internal', 'Không lấy được thông tin tài liệu.', 500);
  }
  if (!doc) {
    return errorJson(requestId, 'not_found', 'Không tìm thấy tài liệu.', 404);
  }

  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (deleteError) {
    return errorJson(requestId, 'internal', 'Chưa xóa được tài liệu, vui lòng thử lại.', 500);
  }

  // Xóa file trong bucket `documents`. Lỗi storage không chặn response —
  // row DB đã xóa (cascade chunks), log lỗi để dọn sau.
  try {
    const folder = doc.storage_path.split('/').slice(0, 2).join('/'); // {user_id}/{doc_id}
    const targets = [doc.storage_path];
    const { data: files, error: listError } = await supabase.storage
      .from('documents')
      .list(folder);
    if (!listError && files && files.length > 0) {
      targets.push(...files.map((file) => `${folder}/${file.name}`));
    }
    const { error: removeError } = await supabase.storage
      .from('documents')
      .remove(targets);
    if (removeError) {
      console.error('[documents] xóa file storage thất bại:', removeError.message);
    }
  } catch (err) {
    console.error(
      '[documents] lỗi dọn storage:',
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ deleted: true, request_id: requestId }, { status: 200 });
}
