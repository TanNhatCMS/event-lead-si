import { describe, expect, it } from 'vitest';

import {
  CSV_IMPORT_MAX_ROWS,
  emailKeyForDedupe,
  mapCsvRows,
  parseCsv,
  phoneKeyForDedupe,
} from '../contacts/csv';

/**
 * Test parse CSV nhập danh bạ + key dedupe — thuần, không gọi mạng/DB.
 * normalizeVnPhone được import qua `~/lib/ai/enrichment/tools` (alias đã cấu
 * hình trong vitest.config.ts).
 */

describe('parseCsv', () => {
  it('parse cơ bản: header + dòng, bỏ dòng rỗng và BOM', () => {
    const parsed = parseCsv(
      '\uFEFFfull_name,email,phone\nNguyễn Văn A,a@x.com,0912345678\n\n',
    );
    expect(parsed.headers).toEqual(['full_name', 'email', 'phone']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.rowNumber).toBe(1);
    expect(parsed.rows[0]?.values).toEqual(['Nguyễn Văn A', 'a@x.com', '0912345678']);
  });

  it('nháy kép: dấu phẩy trong trường và nháy kép lồng ghép ("" → ")', () => {
    // RFC 4180: nháy kép bên trong trường bọc nháy được ghi đôi ("" → ").
    const parsed = parseCsv(
      'full_name,email\n"Trần, Thị B",b@x.com\n"""Quốc"" C",c@x.com\n',
    );
    expect(parsed.rows[0]?.values).toEqual(['Trần, Thị B', 'b@x.com']);
    expect(parsed.rows[1]?.values).toEqual(['"Quốc" C', 'c@x.com']);
  });

  it('CRLF và file trống', () => {
    const crlf = parseCsv('full_name,email\r\nA D,a@x.com\r\n');
    expect(crlf.rows[0]?.values).toEqual(['A D', 'a@x.com']);

    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
    expect(parseCsv('\n\n  \n')).toEqual({ headers: [], rows: [] });
  });

  it('mapCsvRows nhận header linh hoạt (name/company/sdt/chức danh)', () => {
    const parsed = parseCsv(
      [
        'Name,SDT,Email,Company,Chuc danh',
        'Lê E,+84 912 345 678,e@x.com,Công ty F,Trưởng phòng',
      ].join('\n'),
    );
    const rows = mapCsvRows(parsed);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.full_name).toBe('Lê E');
    expect(row?.phone).toBe('+84 912 345 678');
    expect(row?.email).toBe('e@x.com');
    expect(row?.company_name).toBe('Công ty F');
    expect(row?.job_title).toBe('Trưởng phòng');
  });

  it('mapCsvRows: thiếu cột → trường rỗng; giới hạn 500 dòng được xuất khẩu', () => {
    const parsed = parseCsv('full_name,email\nG Chỉ Có Tên\n');
    const rows = mapCsvRows(parsed);
    expect(rows[0]?.full_name).toBe('G Chỉ Có Tên');
    expect(rows[0]?.email).toBe('');
    expect(rows[0]?.phone).toBe('');

    expect(CSV_IMPORT_MAX_ROWS).toBe(500);
  });
});

describe('dedupe keys', () => {
  it('phoneKeyForDedupe: 09xx, +84 9xx, 849xx → cùng key E.164', () => {
    expect(phoneKeyForDedupe('0912 345 678')).toBe('+84912345678');
    expect(phoneKeyForDedupe('+84 912 345 678')).toBe('+84912345678');
    expect(phoneKeyForDedupe('84912345678')).toBe('+84912345678');
    expect(phoneKeyForDedupe('(091)-234-5678')).toBe('+84912345678');
  });

  it('phoneKeyForDedupe: số cố định, số nước ngoài đủ dài dùng raw digits, rỗng → null', () => {
    // Cố định Hà Nội 024 3826 9999 → hợp lệ chuẩn VN.
    expect(phoneKeyForDedupe('02438269999')).toBe('+842438269999');
    // Không hợp lệ chuẩn VN nhưng đủ 8 số → key raw.
    expect(phoneKeyForDedupe('+1-415-555-1234')).toBe('raw:14155551234');
    expect(phoneKeyForDedupe('123')).toBeNull();
    expect(phoneKeyForDedupe('   ')).toBeNull();
  });

  it('emailKeyForDedupe: lowercase, phải có @', () => {
    expect(emailKeyForDedupe('  User@Example.COM ')).toBe('user@example.com');
    expect(emailKeyForDedupe('không-phải-email')).toBeNull();
    expect(emailKeyForDedupe('')).toBeNull();
  });
});
