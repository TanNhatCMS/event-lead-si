import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@kit/supabase/server-client";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const maxFileBytes = 10 * 1024 * 1024;

/**
 * POST /api/card-imports
 *
 * Tạo yêu cầu nhập danh thiếp: cấp signed URL tải ảnh lên bucket private
 * `business-cards` và ghi bản ghi `card_imports` ở trạng thái `uploaded`.
 * Single-user: bản ghi thuộc về user đang đăng nhập.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { code: "unauthorized", message: "Vui lòng đăng nhập.", request_id: requestId },
      { status: 401 },
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { code: "invalid_json", message: "Nội dung yêu cầu không hợp lệ.", request_id: requestId },
      { status: 400 },
    );
  }

  if (!input || typeof input !== "object") {
    return NextResponse.json(
      { code: "invalid_input", message: "Thiếu thông tin tệp.", request_id: requestId },
      { status: 400 },
    );
  }

  const { fileName, mediaType, fileSize } = input as Record<string, unknown>;
  if (
    typeof fileName !== "string" ||
    fileName.length > 180 ||
    typeof mediaType !== "string" ||
    !allowedTypes.has(mediaType) ||
    typeof fileSize !== "number" ||
    !Number.isInteger(fileSize) ||
    fileSize < 1 ||
    fileSize > maxFileBytes
  ) {
    return NextResponse.json(
      {
        code: "invalid_file",
        message: "Tệp phải là ảnh JPEG, PNG, WebP hoặc HEIC không quá 10 MB.",
        request_id: requestId,
      },
      { status: 400 },
    );
  }

  const importId = crypto.randomUUID();
  const path = `${user.id}/${importId}`;
  const { data: signedUpload, error: signError } = await supabase.storage
    .from("business-cards")
    .createSignedUploadUrl(path);

  if (signError || !signedUpload) {
    return NextResponse.json(
      {
        code: "upload_unavailable",
        message: "Chưa tạo được quyền tải ảnh lên. Vui lòng thử lại.",
        request_id: requestId,
      },
      { status: 503 },
    );
  }

  const { error: insertError } = await supabase.from("card_imports").insert({
    id: importId,
    user_id: user.id,
    submitted_by: user.id,
    storage_path: path,
    media_type: mediaType,
    file_size: fileSize,
    state: "uploaded",
    schema_version: 1,
  });

  if (insertError) {
    return NextResponse.json(
      {
        code: "import_create_failed",
        message: "Chưa lưu được yêu cầu nhập danh thiếp.",
        request_id: requestId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { import_id: importId, path: signedUpload.path, token: signedUpload.token, request_id: requestId },
    { status: 201 },
  );
}
