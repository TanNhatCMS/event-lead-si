import { NextResponse } from "next/server";
import { z } from "zod";

import { getOrganizationContext } from "@/lib/auth/organization";
import { recognizedCardSchema } from "@/lib/ai/card-recognition";

const fieldKeys = [
  "fullName",
  "jobTitle",
  "companyName",
  "email",
  "phone",
  "address",
  "website",
] as const;

const fieldValuesSchema = z.object({
  fullName: z.string().trim().min(1, "Thiếu họ và tên.").max(240),
  jobTitle: z.string().trim().max(240).optional(),
  companyName: z.string().trim().max(240).optional(),
  email: z.string().trim().max(240).optional(),
  phone: z.string().trim().max(60).optional(),
  address: z.string().trim().max(500).optional(),
  website: z.string().trim().max(240).optional(),
});

const confirmSchema = z.object({
  importId: z.string().uuid("Mã importId không hợp lệ."),
  provider: z.string().min(1).max(80),
  detectedLanguage: z.enum(["vi", "en", "ko", "ja", "zh", "unknown"]),
  // Ảnh chụp kết quả nhận dạng gốc — dùng để ghi evidence (giá trị máy đọc thô).
  recognized: recognizedCardSchema,
  fields: fieldValuesSchema,
  // Bằng chứng người dùng đã xem qua TỪNG trường (hiến chương "con người kiểm soát").
  reviewedFields: z.array(z.enum(fieldKeys)).refine(
    (list) => fieldKeys.every((key) => list.includes(key)),
    "Phải xác nhận đã xem qua tất cả các trường.",
  ),
  eventName: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

type ConfirmInput = z.infer<typeof confirmSchema>;

/**
 * POST /api/card-imports/confirm
 *
 * Tạo hồ sơ liên hệ từ các giá trị ĐÃ ĐƯỢC NGƯỜI DÙNG xem/sửa và bấm XÁC NHẬN.
 *
 * HIẾN CHƯƠNG "con người kiểm soát": đây là code path DUY NHẤT được phép tạo
 * hồ sơ từ kết quả nhận dạng. Route /recognize không bao giờ tự lưu.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const context = await getOrganizationContext();

  if (!context.user) {
    return NextResponse.json(
      { code: "unauthorized", message: "Vui lòng đăng nhập.", request_id: requestId },
      { status: 401 },
    );
  }
  if (!context.supabase || !context.membership) {
    return NextResponse.json(
      { code: "organization_required", message: "Tài khoản chưa thuộc tổ chức nào.", request_id: requestId },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: "invalid_json", message: "Nội dung yêu cầu không phải JSON hợp lệ.", request_id: requestId },
      { status: 400 },
    );
  }

  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "validation_error",
        message: "Dữ liệu xác nhận không hợp lệ.",
        details: parsed.error.flatten().fieldErrors,
        request_id: requestId,
      },
      { status: 400 },
    );
  }
  const input = parsed.data as ConfirmInput;
  const organizationId = context.membership.organization_id;

  // Bản ghi nhập phải thuộc đúng tổ chức và chưa được xác nhận trước đó.
  const { data: cardImport, error: importError } = await context.supabase
    .from("card_imports")
    .select("id, state")
    .eq("id", input.importId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (importError || !cardImport) {
    return NextResponse.json(
      { code: "import_not_found", message: "Không tìm thấy bản ghi nhập danh thiếp.", request_id: requestId },
      { status: 404 },
    );
  }
  if (cardImport.state === "confirmed") {
    return NextResponse.json(
      { code: "already_confirmed", message: "Danh thiếp này đã được xác nhận trước đó.", request_id: requestId },
      { status: 409 },
    );
  }

  const normalized = (value: string | undefined) => (value?.trim() ? value.trim() : null);

  // 1) Tạo contact từ các giá trị người dùng đã xác nhận.
  const { data: contact, error: contactError } = await context.supabase
    .from("contacts")
    .insert({
      organization_id: organizationId,
      full_name: input.fields.fullName.trim(),
      job_title: normalized(input.fields.jobTitle),
      email: normalized(input.fields.email),
      phone: normalized(input.fields.phone),
      address: normalized(input.fields.address),
      preferred_language: input.detectedLanguage === "unknown" ? null : input.detectedLanguage,
      owner_user_id: context.user.id,
      relationship_stage: "new",
      schema_version: 1,
    })
    .select("id")
    .single();

  if (contactError || !contact) {
    return NextResponse.json(
      { code: "contact_create_failed", message: "Chưa tạo được hồ sơ liên hệ.", request_id: requestId },
      { status: 500 },
    );
  }

  // 2) Ghi evidence từng trường: giá trị máy đọc thô + giá trị đã xác nhận.
  const reviewedAt = new Date().toISOString();
  const evidenceRows = fieldKeys
    .map((key) => {
      const confirmedValue = normalized(input.fields[key]);
      const recognizedField = input.recognized.fields[key];
      const rawValue = recognizedField.rawValue;
      if (!confirmedValue && !rawValue) return null;
      const edited = (recognizedField.normalizedValue ?? "") !== (confirmedValue ?? "");
      return {
        organization_id: organizationId,
        contact_id: contact.id,
        field_name: key,
        raw_value: rawValue,
        normalized_value: confirmedValue,
        value_snapshot: confirmedValue,
        schema_version: 1,
        // 'user' khi người dùng đã sửa tay, 'card_ocr' khi giữ nguyên máy đọc.
        source_type: edited ? "user" : "card_ocr",
        source_reference: input.importId,
        verification_state: "user_confirmed",
        reviewed_by: context.user.id,
        reviewed_at: reviewedAt,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (evidenceRows.length > 0) {
    const { error: evidenceError } = await context.supabase
      .from("contact_field_evidence")
      .insert(evidenceRows);
    if (evidenceError) {
      return NextResponse.json(
        { code: "evidence_save_failed", message: "Đã tạo hồ sơ nhưng chưa lưu được bằng chứng trường.", request_id: requestId },
        { status: 500 },
      );
    }
  }

  // 3) Lưu ghi chú cuộc gặp (tùy chọn) vào meeting_notes.
  const noteBody = [input.eventName, input.notes].filter(Boolean).join("\n\n");
  if (noteBody) {
    const { error: noteError } = await context.supabase.from("meeting_notes").insert({
      organization_id: organizationId,
      contact_id: contact.id,
      author_user_id: context.user.id,
      body: noteBody.slice(0, 20000),
      note_type: "meeting_note",
    });
    if (noteError) {
      return NextResponse.json(
        { code: "note_save_failed", message: "Đã tạo hồ sơ nhưng chưa lưu được ghi chú.", request_id: requestId },
        { status: 500 },
      );
    }
  }

  // 4) Đánh dấu card_import đã xác nhận, lưu snapshot kết quả.
  const { error: confirmError } = await context.supabase
    .from("card_imports")
    .update({
      state: "confirmed",
      recognition_provider: input.provider,
      recognition_result: {
        confirmed: {
          fullName: normalized(input.fields.fullName),
          jobTitle: normalized(input.fields.jobTitle),
          companyName: normalized(input.fields.companyName),
          email: normalized(input.fields.email),
          phone: normalized(input.fields.phone),
          address: normalized(input.fields.address),
          website: normalized(input.fields.website),
        },
        recognized_snapshot: input.recognized,
      },
      confirmed_contact_id: contact.id,
      processed_at: reviewedAt,
    })
    .eq("id", input.importId)
    .eq("organization_id", organizationId);

  if (confirmError) {
    return NextResponse.json(
      { code: "import_confirm_failed", message: "Đã tạo hồ sơ nhưng chưa cập nhật được trạng thái bản ghi nhập.", request_id: requestId },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      status: "confirmed",
      import_id: input.importId,
      contact_id: contact.id,
      provider: input.provider,
      request_id: requestId,
    },
    { status: 201 },
  );
}
