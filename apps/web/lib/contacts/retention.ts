/**
 * FR-024 — retention (tự dọn liên hệ đã lưu trữ quá N ngày).
 *
 * Phần thuần (tính mốc thời gian, so sánh hết hạn) tách ra đây để unit test
 * không cần DB; endpoint `POST /api/contacts/cleanup` dùng các hàm này.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Mốc thời gian cắt: contact có `archived_at` TRƯỚC mốc này là quá hạn.
 * Giữ nguyên giờ:phút:giây của `now` (30 ngày trước đúng bằng 30 × 24h).
 */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - Math.max(0, days) * MS_PER_DAY);
}

/**
 * Liên hệ đã lưu trữ có quá hạn không? `archived_at` null/không parse được
 * nghĩa là KHÔNG đủ điều kiện xóa (an toàn mặc định). Đúng bằng mốc thì
 * CHƯA xóa — chỉ xóa cái cũ hơn mốc.
 */
export function isRetentionExpired(
  archivedAt: string | Date | null | undefined,
  cutoff: Date,
): boolean {
  if (archivedAt === null || archivedAt === undefined || archivedAt === '') {
    return false;
  }
  const time = archivedAt instanceof Date ? archivedAt.getTime() : new Date(archivedAt).getTime();
  if (Number.isNaN(time)) return false;
  return time < cutoff.getTime();
}
