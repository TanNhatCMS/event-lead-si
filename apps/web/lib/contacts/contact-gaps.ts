/**
 * FR-011/012 — khoảng trống dữ liệu ("evidence gaps") của một liên hệ.
 *
 * Trả về cho UI hai danh sách để gợi ý bổ sung thông tin:
 * - missing_fields: các trường chính CHƯA có giá trị trên contact (kể cả
 *   website/company_name — lấy từ company liên kết).
 * - unverified_fields: các trường CÓ evidence nhưng chưa được xác thực
 *   (verification_state là unreviewed/uncertain/inferred).
 *
 * Phần thuần (so sánh giá trị, chọn evidence mới nhất theo field) tách ra
 * đây để unit test không cần DB; `GET /api/contacts/[id]/timeline` dùng.
 */

/** Các trường chính được theo dõi khoảng trống. `website` và `company_name`
 * không nằm trên contacts — bên gọi map từ company liên kết vào. */
export const GAP_TRACKED_FIELDS = [
  'email',
  'phone',
  'address',
  'website',
  'job_title',
  'company_name',
] as const;

export type GapTrackedField = (typeof GAP_TRACKED_FIELDS)[number];

export type ContactGapValues = Partial<Record<GapTrackedField, string | null | undefined>>;

/** Một dòng evidence rút gọn từ bảng contact_field_evidence. */
export type EvidenceVerificationRow = {
  field_name: string;
  verification_state: string;
};

export type ContactGaps = {
  missing_fields: string[];
  unverified_fields: { field_name: string; verification_state: string }[];
};

/** Các verification_state tính là "chưa xác thực". user_confirmed và
 * source_verified là đã xác thực; unavailable là đã biết chắc là không có. */
export const UNVERIFIED_EVIDENCE_STATES: readonly string[] = [
  'unreviewed',
  'uncertain',
  'inferred',
];

/** Giá trị rỗng (null, chuỗi rỗng, chỉ khoảng trắng) tính là chưa có. */
export function hasFieldValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Tính khoảng trống cho một liên hệ.
 *
 * @param contact  giá trị các trường (đã map company → website/company_name).
 * @param evidence evidence của contact, sắp xếp `created_at` MỚI NHẤT TRƯỚC —
 *                 với mỗi field, dòng đầu tiên gặp được là state hiện hành
 *                 (evidence cũ hơn bị bỏ qua).
 */
export function computeContactGaps(
  contact: ContactGapValues,
  evidence: readonly EvidenceVerificationRow[],
): ContactGaps {
  const missing_fields = GAP_TRACKED_FIELDS.filter((field) => !hasFieldValue(contact[field]));

  const latestByField = new Map<string, string>();
  for (const row of evidence) {
    if (!row || typeof row.field_name !== 'string' || row.field_name.length === 0) continue;
    if (!latestByField.has(row.field_name)) {
      latestByField.set(row.field_name, row.verification_state);
    }
  }

  const unverified_fields: ContactGaps['unverified_fields'] = [];
  for (const [field_name, verification_state] of latestByField) {
    if (UNVERIFIED_EVIDENCE_STATES.includes(verification_state)) {
      unverified_fields.push({ field_name, verification_state });
    }
  }

  return { missing_fields, unverified_fields };
}
