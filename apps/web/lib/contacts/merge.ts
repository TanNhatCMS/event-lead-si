/**
 * Logic thuần cho gộp liên hệ trùng (merge duplicates) — không đụng DB/mạng
 * nên test được riêng bằng unit test (lib/__tests__/contacts-merge.test.ts).
 *
 * Được dùng bởi:
 * - GET /api/contacts/merge/candidates — tìm ứng viên gộp + lý do khớp.
 * - POST /api/contacts/merge — tính patch gộp trường từ source sang target.
 */

/** Trường contact dùng để so khớp trùng lặp. */
export interface MergeContactCore {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  labels?: string[] | null;
  company_id?: string | null;
  archived_at?: string | null;
}

/** Lý do một contact được đề xuất làm ứng viên gộp. */
export type MergeReason = 'same_company' | 'email' | 'phone' | 'name';

/** Ngưỡng khoảng cách Levenshtein tối đa cho tên "gần giống". */
export const NAME_SIMILARITY_MAX_DISTANCE = 3;

/**
 * Chuẩn hoá tên để so khớp: lowercase, bỏ dấu tiếng Việt, bỏ ký tự không
 * chữ/số (kể cả khoảng trắng). "Nguyễn Văn Ả" và "nguyen van a" → cùng chuỗi.
 */
export function normalizeMergeName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Chuẩn hoá email để so khớp: lowercase + trim (đủ dùng cho trùng lặp). */
export function normalizeMergeEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  return value || null;
}

/**
 * Chuẩn hoá SĐT để so khớp — cùng quy tắc với check-duplicate:
 * chỉ giữ số, +84/84 đầu → 0, so khớp theo 9 số cuối.
 */
export function normalizeMergePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  let d = digits;
  if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2);
  if (d.length < 9) return null;
  return d.slice(-9);
}

/**
 * Levenshtein giới hạn: dừng đếm khi vượt cap (trả cap + 1) — tránh O(m*n)
 * tốn kém trên tên dài. Implementation 1 hàng, không dùng thư viện.
 */
export function levenshteinCapped(a: string, b: string, cap: number): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  // Hai hàng của ma trận khoảng cách (noUncheckedIndexedAccess: mọi truy cập
  // mảng đều có thể undefined → dùng ?? Infinity, không bao giờ xảy ra thực tế).
  let prev: number[] = new Array<number>(b.length + 1);
  let curr: number[] = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (prev[j] ?? Infinity) + 1,
        (curr[j - 1] ?? Infinity) + 1,
        (prev[j - 1] ?? Infinity) + cost,
      );
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > cap) return cap + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length] ?? cap + 1;
}

/**
 * Hai tên "gần giống": chuẩn hoá rồi so inclusion (một chuỗi chứa chuỗi kia)
 * HOẶC Levenshtein ≤ NAME_SIMILARITY_MAX_DISTANCE. Bỏ qua tên rỗng.
 */
export function namesSimilar(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeMergeName(a);
  const nb = normalizeMergeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return (
    levenshteinCapped(na, nb, NAME_SIMILARITY_MAX_DISTANCE) <=
    NAME_SIMILARITY_MAX_DISTANCE
  );
}

/**
 * Các lý do `candidate` là ứng viên gộp của `source` (2 contact khác nhau):
 * cùng company_id, HOẶC trùng email chuẩn hoá, HOẶC trùng SĐT chuẩn hoá,
 * HOẶC tên giống nhau. Trả mảng rỗng nếu không có lý do nào.
 */
export function findMergeReasons(
  source: MergeContactCore,
  candidate: MergeContactCore,
): MergeReason[] {
  if (source.id === candidate.id) return [];
  const reasons: MergeReason[] = [];

  const srcCompany = source.company_id ?? null;
  const candCompany = candidate.company_id ?? null;
  if (srcCompany && candCompany && srcCompany === candCompany) {
    reasons.push('same_company');
  }

  const srcEmail = normalizeMergeEmail(source.email);
  const candEmail = normalizeMergeEmail(candidate.email);
  if (srcEmail && candEmail && srcEmail === candEmail) {
    reasons.push('email');
  }

  const srcPhone = normalizeMergePhone(source.phone);
  const candPhone = normalizeMergePhone(candidate.phone);
  if (srcPhone && candPhone && srcPhone === candPhone) {
    reasons.push('phone');
  }

  if (namesSimilar(source.full_name, candidate.full_name)) {
    reasons.push('name');
  }

  return reasons;
}

/** Trường của target được phép lấy từ source khi target đang trống. */
export const MERGEABLE_FIELDS = ['email', 'phone', 'address', 'job_title'] as const;
export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

export interface MergePatch {
  email?: string;
  phone?: string;
  address?: string;
  job_title?: string;
  labels?: string[];
}

export interface MergePlan {
  /** Patch áp lên contact target (bỏ qua khi không có gì thay đổi). */
  patch: MergePatch;
  /** Tên các trường target lấy từ source (kể cả 'labels' khi gộp nhãn). */
  fieldsTaken: MergeableField[] | string[];
  /** Hợp (union) nhãn của target + source — áp khi khác nhãn hiện có. */
  labels: string[];
}

function hasValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Kế hoạch gộp: điền trường TRỐNG của target từ source (email/phone/address/
 * job_title) và hợp nhãn (union, giữ thứ tự). Thuần — route chỉ việc ghi DB.
 */
export function computeMergePlan(
  target: MergeContactCore,
  source: MergeContactCore,
): MergePlan {
  const patch: MergePatch = {};
  const fieldsTaken: string[] = [];

  for (const field of MERGEABLE_FIELDS) {
    const targetValue = target[field];
    const sourceValue = source[field];
    if (!hasValue(targetValue) && hasValue(sourceValue)) {
      patch[field] = (sourceValue as string).trim();
      fieldsTaken.push(field);
    }
  }

  const labels = [
    ...new Set([...(target.labels ?? []), ...(source.labels ?? [])]),
  ];
  const labelsChanged =
    labels.length !== (target.labels ?? []).length ||
    labels.some((l, i) => l !== (target.labels ?? [])[i]);
  if (labelsChanged) {
    patch.labels = labels;
    fieldsTaken.push('labels');
  }

  return { patch, fieldsTaken, labels };
}

/** Nhãn lý do khớp hiển thị cho người dùng (merge dialog). */
export const MERGE_REASON_LABELS: Record<MergeReason, string> = {
  same_company: 'Cùng công ty',
  email: 'Trùng email',
  phone: 'Trùng số điện thoại',
  name: 'Tên giống nhau',
};
