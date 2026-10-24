'use client';

import type { RagCitation, RagSourceType } from '~/lib/ai/rag/db-types';

/** Trích dẫn theo contracts/rag-api.md (QĐ3). */
export type Citation = RagCitation;

export type CitationSourceType = RagSourceType;

const SOURCE_ICON: Record<CitationSourceType, string> = {
  document: '📄',
  contact: '👤',
  company: '🏢',
  meeting_note: '📝',
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Chuỗi chip hiển thị cho một citation:
 * - PDF: "📄 <tên file> — trang N"
 * - DOCX/TXT: "📄 <tên file> — <tiêu đề mục>" (hoặc "đoạn văn bản gần nhất")
 * - Danh bạ: "👤 <tên hồ sơ>" / "🏢 <tên công ty>" / "📝 <tên ghi chú>"
 * + ngày hiệu lực cho tài liệu (QĐ2).
 */
export function citationChipLabel(citation: Citation): string {
  const icon = SOURCE_ICON[citation.source_type] ?? '📎';
  let label = `${icon} ${citation.label}`;

  if (citation.source_type === 'document') {
    if (citation.page_number != null) {
      label += ` — trang ${citation.page_number}`;
    } else if (citation.section_title) {
      label += ` — ${citation.section_title}`;
    } else {
      label += ' — đoạn văn bản gần nhất';
    }
    if (citation.effective_date) {
      label += ` · hiệu lực từ ${formatDate(citation.effective_date)}`;
    }
  }

  return label;
}

/** Trích ra mảng citations hợp lệ từ một UI message part `data-citations`. */
export function extractCitations(parts: unknown[]): Citation[] {
  const out: Citation[] = [];
  for (const part of parts ?? []) {
    if (
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      (part as { type: string }).type === 'data-citations'
    ) {
      const data = (part as { data?: unknown }).data;
      if (Array.isArray(data)) {
        for (const item of data) {
          if (
            typeof item === 'object' &&
            item !== null &&
            'source_type' in item &&
            'label' in item
          ) {
            out.push(item as Citation);
          }
        }
      }
    }
  }
  return out;
}
