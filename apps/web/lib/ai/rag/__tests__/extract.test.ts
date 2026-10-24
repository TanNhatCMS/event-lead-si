import { describe, expect, it } from 'vitest';

import { splitHtmlSections, splitSections } from '../extract';

describe('splitHtmlSections — heading thật từ DOCX (handbook Phần 9.5)', () => {
  it('h1-h4 thành section_title, p gom vào section gần nhất', () => {
    const html = `
      <h1>Bảng giá dịch vụ</h1>
      <p>Dịch vụ A giá 1.000.000đ.</p>
      <p>Dịch vụ B giá 2.000.000đ.</p>
      <h2>Điều khoản</h2>
      <p>Thanh toán trong 30 ngày.</p>
    `;
    const sections = splitHtmlSections(html);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.section_title).toBe('Bảng giá dịch vụ');
    expect(sections[0]?.text).toContain('Dịch vụ A');
    expect(sections[0]?.text).toContain('Dịch vụ B');
    expect(sections[1]?.section_title).toBe('Điều khoản');
  });

  it('bỏ qua thẻ rỗng, giới hạn độ dài tiêu đề', () => {
    const longTitle = 'A'.repeat(200);
    const sections = splitHtmlSections(`<h1>${longTitle}</h1><p>Nội dung.</p>`);
    expect(sections[0]?.section_title?.length).toBeLessThanOrEqual(120);
  });

  it('HTML không có heading vẫn tách được', () => {
    const sections = splitHtmlSections('<p>Đoạn một.</p><p>Đoạn hai.</p>');
    expect(sections).toHaveLength(1);
    expect(sections[0]?.section_title).toBeNull();
  });
});

describe('splitSections — heuristic cho TXT', () => {
  it('dòng VIẾT HOA thành tiêu đề', () => {
    const sections = splitSections('BẢNG GIÁ\nDịch vụ A giá 100k.');
    expect(sections[0]?.section_title).toBe('BẢNG GIÁ');
  });
});
