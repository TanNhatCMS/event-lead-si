/**
 * Parser CSV cho nhập danh bạ (`/api/contacts/import`) — hàm thuần, không gọi
 * mạng, dễ test. Hỗ trợ:
 * - Cột phân cách bằng dấu phẩy, trường bọc nháy kép (dấu "," trong trường),
 *   nháy kép lồng ghép ("" → ").
 * - CRLF / LF, BOM UTF-8, dòng rỗng bị bỏ qua.
 * - Header linh hoạt (không phân biệt hoa/thường, bỏ khoảng trắng):
 *     tên:    full_name | name | ho_ten
 *     email:  email
 *     SĐT:    phone | phone_number | dien_thoai | sdt
 *     công ty: company | company_name | cong_ty
 *     chức danh: job_title | title | chuc_danh
 *
 * Ngoài ra chứa các hàm dedupe-key (thuần) dùng khi nhập: chuẩn hoá email/SĐT
 * thành key so khớp trùng lặp (SĐT Việt Nam qua `normalizeVnPhone`).
 */

import { normalizeVnPhone } from '~/lib/ai/enrichment/tools';

/** Số dòng tối đa mỗi request nhập. */
export const CSV_IMPORT_MAX_ROWS = 500;

/** Số cột tối đa mỗi dòng (chống dòng rác cực dài). */
const MAX_FIELDS_PER_ROW = 64;

export interface CsvRow {
  /** Số thứ tự dòng dữ liệu (bắt đầu từ 1, không tính header). */
  rowNumber: number;
  values: string[];
}

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
}

/**
 * Tách một dòng CSV thành các trường. ` remainder` trả về true khi dòng kết
 * thúc trong một trường đang mở nháy (dòng nhiều dòng — bản đơn giản: gộp lại
 * với dòng kế tiếp do caller xử lý qua parseCsv).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields.slice(0, MAX_FIELDS_PER_ROW);
}

/** Parse toàn bộ text CSV thành headers + rows (bỏ dòng rỗng). */
export function parseCsv(text: string): ParsedCsv {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rawLines = cleaned.split(/\r?\n/);
  const lines = rawLines.filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0] ?? '').map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push({ rowNumber: i, values: parseCsvLine(lines[i] ?? '') });
  }
  return { headers, rows };
}

/** Ánh xạ tên cột → trường dữ liệu liên hệ. */
const HEADER_ALIASES: Record<string, 'full_name' | 'email' | 'phone' | 'company_name' | 'job_title'> = {
  full_name: 'full_name',
  name: 'full_name',
  ho_ten: 'full_name',
  email: 'email',
  phone: 'phone',
  phone_number: 'phone',
  dien_thoai: 'phone',
  sdt: 'phone',
  company: 'company_name',
  company_name: 'company_name',
  cong_ty: 'company_name',
  job_title: 'job_title',
  title: 'job_title',
  chuc_danh: 'job_title',
};

export type ContactCsvField = 'full_name' | 'email' | 'phone' | 'company_name' | 'job_title';

/** Một dòng CSV đã map về trường liên hệ theo header. */
export interface ContactCsvRow {
  rowNumber: number;
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  job_title: string;
}

/**
 * Map các dòng CSV về trường liên hệ theo header. Trả về mảng (dòng nào thiếu
 * header tương ứng sẽ có trường rỗng).
 */
export function mapCsvRows(parsed: ParsedCsv): ContactCsvRow[] {
  const columnByField = new Map<string, number>();
  parsed.headers.forEach((header, index) => {
    const key = header.toLowerCase().replace(/\s+/g, '_');
    const field = HEADER_ALIASES[key];
    if (field && !columnByField.has(field)) {
      columnByField.set(field, index);
    }
  });

  const pick = (values: string[], field: string): string => {
    const index = columnByField.get(field);
    if (index === undefined) return '';
    return (values[index] ?? '').trim();
  };

  return parsed.rows.map((row) => ({
    rowNumber: row.rowNumber,
    full_name: pick(row.values, 'full_name'),
    email: pick(row.values, 'email'),
    phone: pick(row.values, 'phone'),
    company_name: pick(row.values, 'company_name'),
    job_title: pick(row.values, 'job_title'),
  }));
}

/* ------------------------------------------------------------------ */
/* Dedupe keys (thuần) — dùng khi nhập CSV và kiểm tra trùng            */
/* ------------------------------------------------------------------ */

/**
 * Key so khớp SĐT để dedupe: SĐT Việt Nam hợp lệ → dạng E.164 (+84…);
 * không hợp lệ chuẩn VN nhưng đủ dài → 'raw:' + digits; rỗng/quá ngắn → null.
 */
export function phoneKeyForDedupe(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = normalizeVnPhone(trimmed);
  if (normalized.valid) {
    return normalized.e164 ?? normalized.digits;
  }
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8 ? 'raw:' + digits : null;
}

/** Key so khớp email: lowercase + phải có '@', sai → null. */
export function emailKeyForDedupe(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}
