import { describe, expect, it } from 'vitest';

import { selectNewestDocumentRows, type MatchRow } from '../retrieval';

function row(over: Partial<MatchRow> & { source_id: string }): MatchRow {
  return {
    chunk_id: `chunk-${over.source_id}`,
    source_type: 'document',
    label: `file-${over.source_id}.pdf`,
    document_type: 'price_list',
    effective_date: '2026-01-01',
    section_title: null,
    page_number: 1,
    content: 'nội dung',
    similarity: 0.9,
    ...over,
  };
}

describe('selectNewestDocumentRows — QĐ2', () => {
  it('cùng document_type: chỉ giữ bản effective_date mới nhất', () => {
    const rows = [
      row({ source_id: 'old', effective_date: '2025-01-01' }),
      row({ source_id: 'new', effective_date: '2026-01-01' }),
    ];
    const kept = selectNewestDocumentRows(rows, new Map());
    expect(kept.map((r) => r.source_id)).toEqual(['new']);
  });

  it('cùng effective_date: giữ bản created_at (tải lên) mới nhất', () => {
    const rows = [
      row({ source_id: 'a', effective_date: '2026-01-01' }),
      row({ source_id: 'b', effective_date: '2026-01-01' }),
    ];
    const createdAt = new Map([
      ['a', '2026-02-01T00:00:00Z'],
      ['b', '2026-03-01T00:00:00Z'],
    ]);
    const kept = selectNewestDocumentRows(rows, createdAt);
    expect(kept.map((r) => r.source_id)).toEqual(['b']);
  });

  it('khác document_type: giữ tất cả', () => {
    const rows = [
      row({ source_id: 'price', document_type: 'price_list' }),
      row({ source_id: 'cat', document_type: 'catalogue' }),
    ];
    const kept = selectNewestDocumentRows(rows, new Map());
    expect(kept.map((r) => r.source_id).sort()).toEqual(['cat', 'price']);
  });

  it('giữ mọi chunk của bản mới nhất (không chỉ 1 chunk)', () => {
    const rows = [
      row({ source_id: 'old', chunk_id: 'c-old-1', effective_date: '2025-01-01' }),
      row({ source_id: 'new', chunk_id: 'c-new-1', effective_date: '2026-01-01' }),
      row({ source_id: 'new', chunk_id: 'c-new-2', effective_date: '2026-01-01' }),
    ];
    const kept = selectNewestDocumentRows(rows, new Map());
    expect(kept.map((r) => r.chunk_id).sort()).toEqual(['c-new-1', 'c-new-2']);
  });

  it('document_type null được gom chung một nhóm', () => {
    const rows = [
      row({ source_id: 'x', document_type: null, effective_date: '2025-06-01' }),
      row({ source_id: 'y', document_type: null, effective_date: '2026-06-01' }),
    ];
    const kept = selectNewestDocumentRows(rows, new Map());
    expect(kept.map((r) => r.source_id)).toEqual(['y']);
  });

  it('mảng rỗng trả về mảng rỗng', () => {
    expect(selectNewestDocumentRows([], new Map())).toEqual([]);
  });
});
