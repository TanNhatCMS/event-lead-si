/**
 * Tiện ích thuần cho global search (GET /api/search) — không đụng DB/mạng
 * nên test được riêng bằng unit test.
 */

/** Giới hạn kết quả mỗi nhóm của GET /api/search. */
export const SEARCH_LIMITS = {
  contacts: 8,
  companies: 5,
  notes: 5,
} as const;

/** Độ dài tối thiểu của từ khoá tìm kiếm. */
export const SEARCH_MIN_LENGTH = 2;

/** Độ dài tối đa của snippet ghi chú trả về. */
export const NOTE_SNIPPET_LENGTH = 160;

/**
 * Escape các ký tự đặc biệt của LIKE (% _ \) để từ khoá người dùng được tìm
 * theo NGHĨA ĐEN — VD "a%b" chỉ khớp chuỗi "a%b", không khớp "a<b>b". Cùng
 * quy ước với route card-imports/confirm (ilike + backslash escape).
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (m) => '\\' + m);
}

/**
 * Bọc giá trị trong cú pháp `or=` của PostgREST: đặt trong ngoặc kép và nhân
 * đôi ngoặc kép bên trong — dấu phẩy/ngoặc đơn trong từ khoá không phá vỡ
 * biểu thức lọc (VD từ khoá "Nguyễn, A" vẫn tìm đúng nghĩa đen).
 */
export function quotePostgrestOrValue(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

/**
 * Biểu thức `or=` cho bảng contacts: tìm trên full_name, email, phone với
 * cùng một pattern LIKE đã escape. Dùng kèm `.or(...)` của supabase-js.
 */
export function buildContactSearchOr(escapedPattern: string): string {
  const value = quotePostgrestOrValue(escapedPattern);
  return (
    'full_name.ilike.' + value +
    ',email.ilike.' + value +
    ',phone.ilike.' + value
  );
}

/**
 * Cắt ghi chú thành snippet 1 dòng (gộp whitespace) với dấu … khi dài quá
 * `max` ký tự — dùng cho nhóm `notes` của search response.
 */
export function noteSnippet(
  body: string | null | undefined,
  max: number = NOTE_SNIPPET_LENGTH,
): string {
  const flat = (body ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}
