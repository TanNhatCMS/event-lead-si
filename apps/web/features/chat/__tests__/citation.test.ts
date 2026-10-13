import { describe, expect, it } from 'vitest';

import { citationChipLabel, extractCitations } from '../citation';
import type { Citation } from '../citation';

describe('citationChipLabel — QĐ3', () => {
  it('PDF: tên file + số trang', () => {
    const label = citationChipLabel({
      source_type: 'document',
      label: 'bang-gia-2026.pdf',
      page_number: 3,
    } as Citation);
    expect(label).toContain('bang-gia-2026.pdf');
    expect(label).toContain('trang 3');
  });

  it('DOCX/TXT: tên file + tiêu đề mục', () => {
    const label = citationChipLabel({
      source_type: 'document',
      label: 'huong-dan.docx',
      section_title: 'Chính sách bảo hành',
    } as Citation);
    expect(label).toContain('huong-dan.docx');
    expect(label).toContain('Chính sách bảo hành');
  });

  it('không có page/section: "đoạn văn bản gần nhất"', () => {
    const label = citationChipLabel({
      source_type: 'document',
      label: 'tailieu.txt',
    } as Citation);
    expect(label).toContain('đoạn văn bản gần nhất');
  });

  it('tài liệu có ngày hiệu lực: ghi rõ QĐ2', () => {
    const label = citationChipLabel({
      source_type: 'document',
      label: 'bang-gia.pdf',
      page_number: 1,
      effective_date: '2026-01-01',
    } as Citation);
    expect(label).toContain('hiệu lực từ');
    expect(label).toContain('01/01/2026');
  });

  it('danh bạ: icon + tên hồ sơ', () => {
    expect(
      citationChipLabel({ source_type: 'contact', label: 'Nguyễn Văn A' } as Citation),
    ).toContain('Nguyễn Văn A');
    expect(
      citationChipLabel({ source_type: 'company', label: 'ABC Corp' } as Citation),
    ).toContain('ABC Corp');
  });
});

describe('extractCitations', () => {
  it('lấy citations từ part data-citations', () => {
    const parts = [
      { type: 'text', text: 'xin chào' },
      {
        type: 'data-citations',
        data: [
          { source_type: 'document', label: 'a.pdf', page_number: 1 },
          { source_type: 'contact', label: 'Nguyễn Văn A' },
        ],
      },
    ];
    const out = extractCitations(parts);
    expect(out).toHaveLength(2);
    expect(out[0]?.label).toBe('a.pdf');
  });

  it('bỏ qua part không hợp lệ', () => {
    expect(extractCitations([])).toEqual([]);
    expect(extractCitations([{ type: 'data-citations', data: 'oops' }])).toEqual([]);
    expect(
      extractCitations([{ type: 'data-citations', data: [{ no_label: 1 }] }]),
    ).toEqual([]);
  });
});
