import { describe, expect, it } from 'vitest';

import { chunkPages } from '../ingest';
import type { ExtractedPage } from '../extract';

function page(
  page_number: number,
  sections: { section_title: string | null; text: string }[],
): ExtractedPage {
  return { page_number, sections };
}

describe('chunkPages — tách câu tiếng Việt', () => {
  it('giữ dấu câu cuối câu và không cắt mất section_title', () => {
    const pages = [
      page(1, [
        {
          section_title: 'Bảng giá dịch vụ',
          text: 'Dịch vụ A giá 1.000.000đ! Liên hệ ngay? Khuyến mãi đến hết tháng.',
        },
      ]),
    ];
    // Text ngắn hơn CHUNK_SIZE → 1 chunk duy nhất.
    const chunks = chunkPages(pages);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain('1.000.000đ!');
    expect(chunks[0]?.content).toContain('Liên hệ ngay?');
    expect(chunks[0]?.section_title).toBe('Bảng giá dịch vụ');
    expect(chunks[0]?.page_number).toBe(1);
  });

  it('tách theo đoạn văn khi vượt quá kích thước chunk', () => {
    const para = 'Nội dung đoạn văn mẫu. '.repeat(40); // ~1000+ ký tự
    const pages = [
      page(2, [
        { section_title: null, text: `${para}\n\n${para}\n\n${para}` },
      ]),
    ];
    const chunks = chunkPages(pages);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThanOrEqual(1100);
      expect(c.page_number).toBe(2);
    }
  });

  it('giữ page_number riêng cho từng trang PDF', () => {
    const pages = [
      page(1, [{ section_title: null, text: 'Trang một.' }]),
      page(5, [{ section_title: null, text: 'Trang năm.' }]),
    ];
    const chunks = chunkPages(pages);
    expect(chunks.map((c) => c.page_number)).toEqual([1, 5]);
  });

  it('bỏ qua section rỗng, trả mảng rỗng khi không có text', () => {
    expect(chunkPages([])).toEqual([]);
    expect(
      chunkPages([page(1, [{ section_title: null, text: '   \n\n  ' }])]),
    ).toEqual([]);
  });

  it('chunk_index tăng dần liên tục', () => {
    const para = 'Câu mẫu. '.repeat(60);
    const chunks = chunkPages([
      page(1, [{ section_title: 'Mục 1', text: `${para}\n\n${para}` }]),
    ]);
    chunks.forEach((c, i) => expect(c.chunk_index).toBe(i));
  });
});
