import { describe, expect, it } from 'vitest';

import {
  NOTE_SNIPPET_LENGTH,
  SEARCH_LIMITS,
  SEARCH_MIN_LENGTH,
  buildContactSearchOr,
  escapeLikePattern,
  noteSnippet,
  quotePostgrestOrValue,
} from '../query';

/**
 * Test thuần cho tiện ích global search (GET /api/search): escape LIKE,
 * bọc giá trị cú pháp or= của PostgREST và cắt snippet ghi chú.
 */

describe('escapeLikePattern', () => {
  it('escape % _ \\ theo nghĩa đen', () => {
    expect(escapeLikePattern('a%b')).toBe('a\\%b');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
    expect(escapeLikePattern('Nguyễn Văn A')).toBe('Nguyễn Văn A');
  });

  it('giữ nguyên từ khoá không có ký tự đặc biệt', () => {
    expect(escapeLikePattern('công ty ABC')).toBe('công ty ABC');
    expect(escapeLikePattern('0912 345')).toBe('0912 345');
  });
});

describe('quotePostgrestOrValue', () => {
  it('bọc ngoặc kép và nhân đôi ngoặc kép bên trong', () => {
    expect(quotePostgrestOrValue('abc')).toBe('"abc"');
    expect(quotePostgrestOrValue('a"b')).toBe('"a""b"');
  });

  it('giữ dấu phẩy/ngoặc bên trong giá trị (không phá biểu thức or=)', () => {
    const quoted = quotePostgrestOrValue('Nguyễn, A(b)');
    expect(quoted).toBe('"Nguyễn, A(b)"');
  });
});

describe('buildContactSearchOr', () => {
  it('sinh or= trên cả 3 trường với cùng pattern', () => {
    const expr = buildContactSearchOr('ng\\%uyen');
    expect(expr).toBe(
      'full_name.ilike."ng\\%uyen",email.ilike."ng\\%uyen",phone.ilike."ng\\%uyen"',
    );
  });
});

describe('noteSnippet', () => {
  it('gộp whitespace và giữ nguyên chuỗi ngắn', () => {
    expect(noteSnippet('  dòng 1\n\ndòng 2  ')).toBe('dòng 1 dòng 2');
    expect(noteSnippet(null)).toBe('');
    expect(noteSnippet(undefined)).toBe('');
  });

  it('cắt chuỗi dài quá giới hạn và thêm dấu …', () => {
    const long = 'x'.repeat(NOTE_SNIPPET_LENGTH + 10);
    const snippet = noteSnippet(long);
    expect(snippet.length).toBe(NOTE_SNIPPET_LENGTH + 1);
    expect(snippet.endsWith('…')).toBe(true);
  });
});

describe('hằng số giới hạn', () => {
  it('khớp shape API của command palette', () => {
    expect(SEARCH_LIMITS).toEqual({ contacts: 8, companies: 5, notes: 5 });
    expect(SEARCH_MIN_LENGTH).toBe(2);
  });
});
