import { NextResponse } from "next/server";

import { getOrganizationContext } from "@/lib/auth/organization";
import {
  isCardRecognitionEnabled,
  recognizedCardSchema,
} from "@/lib/ai/card-recognition";
import { getCardRecognitionProvider } from "@/lib/ai/recognition-providers";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const maxFileBytes = 10 * 1024 * 1024;

function unauthorized(requestId: string, organizationRequired = false) {
  return NextResponse.json(
    organizationRequired
      ? { code: "organization_required", message: "Tài khoản chưa thuộc tổ chức nào.", request_id: requestId }
      : { code: "unauthorized", message: "Vui lòng đăng nhập.", request_id: requestId },
    { status: organizationRequired ? 403 : 401 },
  );
}

/**
 * POST /api/card-imports/recognize
 *
 * Nhận ảnh danh thiếp (multipart: `image`, `import_id` tùy chọn) và chạy qua
 * CardRecognitionProvider phía máy chủ. Hiện dùng MockCardRecognitionProvider —
 * provider OCR thật chưa được chọn (plan.md Giai đoạn 0.3).
 *
 * Kết quả là dữ liệu CHƯA XÁC MINH — route này KHÔNG tự lưu hồ sơ. Hồ sơ chỉ
 * được tạo khi người dùng bấm XÁC NHẬN ở POST /api/card-imports/confirm
 * (hiến chương "con người kiểm soát").
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const context = await getOrganizationContext();

  if (!context.user) return unauthorized(requestId);
  if (!context.supabase || !context.membership) return unauthorized(requestId, true);

  if (!isCardRecognitionEnabled()) {
    return NextResponse.json(
      {
        code: "recognition_disabled",
        message: "Chức năng nhận dạng chưa được bật (thiếu CARD_RECOGNITION_ENABLED=true).",
        request_id: requestId,
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { code: "invalid_request", message: "Yêu cầu phải là multipart/form-data.", request_id: requestId },
      { status: 400 },
    );
  }

  const image = form.get("image");
  const importId = form.get("import_id");

  if (!(image instanceof Blob) || image.size === 0) {
    return NextResponse.json(
      { code: "missing_image", message: "Thiếu ảnh danh thiếp.", request_id: requestId },
      { status: 400 },
    );
  }
  if (image.size > maxFileBytes) {
    return NextResponse.json(
      { code: "file_too_large", message: "Ảnh vượt quá 10 MB.", request_id: requestId },
      { status: 413 },
    );
  }
  if (image.type && !allowedTypes.has(image.type)) {
    return NextResponse.json(
      { code: "invalid_type", message: "Tệp phải là ảnh JPEG, PNG, WebP hoặc HEIC.", request_id: requestId },
      { status: 400 },
    );
  }
  if (importId !== null && (typeof importId !== "string" || importId.length === 0)) {
    return NextResponse.json(
      { code: "missing_import_id", message: "Mã import_id không hợp lệ.", request_id: requestId },
      { status: 400 },
    );
  }

  let recognized;
  let providerName: string;
  try {
    const provider = getCardRecognitionProvider();
    providerName = provider.name;
    const buffer = Buffer.from(await image.arrayBuffer());
    const result = await provider.recognize({
      image: new Uint8Array(buffer),
      mediaType: image.type || "application/octet-stream",
    });
    recognized = recognizedCardSchema.parse(result);
  } catch (err) {
    return NextResponse.json(
      {
        code: "recognize_failed",
        message: err instanceof Error ? err.message : "Nhận dạng thất bại, vui lòng thử lại.",
        request_id: requestId,
      },
      { status: 502 },
    );
  }

  // Ghi nhận trạng thái xử lý — KHÔNG tạo hồ sơ liên hệ tại đây.
  if (typeof importId === "string") {
    const { error: stateError } = await context.supabase
      .from("card_imports")
      .update({
        state: "needs_review",
        recognition_provider: providerName,
        processing_started_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      })
      .eq("id", importId)
      .eq("organization_id", context.membership.organization_id);
    if (stateError) {
      return NextResponse.json(
        { code: "import_state_failed", message: "Không cập nhật được trạng thái bản ghi nhập.", request_id: requestId },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    {
      import_id: typeof importId === "string" ? importId : null,
      provider: providerName,
      recognized,
      request_id: requestId,
    },
    { status: 200 },
  );
}
