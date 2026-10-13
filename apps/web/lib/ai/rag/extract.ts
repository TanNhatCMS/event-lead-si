import 'server-only';

import { createRequire } from 'node:module';

/**
 * Trích xuất văn bản thô từ tài liệu upload (T002/T003).
 *
 * Trả về cấu trúc giữ `page_number` (PDF) và `section_title` (tiêu đề mục
 * gần nhất cho DOCX/TXT — theo QĐ3 của spec 002-rag-chatbot).
 *
 * - TXT: đọc trực tiếp, tách mục theo heuristic tiêu đề.
 * - PDF: dùng `pdfjs-dist` (legacy build chạy trên Node) — nạp động qua
 *   `createRequire` để typecheck/build không phụ thuộc package đã cài hay chưa.
 * - DOCX: dùng `mammoth` — nạp động tương tự.
 *
 * Khi package trích xuất chưa được cài (do T002 `pnpm add` sau), hàm ném lỗi
 * mô tả rõ để caller (ingest nền) đánh dấu tài liệu `failed` kèm thông báo
 * tiếng Việt, thay vì treo hay crash.
 */

export interface ExtractedSection {
  /** Tiêu đề mục/đoạn gần nhất; null khi không tách được (vd. trang PDF). */
  section_title: string | null;
  text: string;
}

export interface ExtractedPage {
  page_number: number;
  sections: ExtractedSection[];
}

export interface ExtractedDocument {
  pages: ExtractedPage[];
  /** Tổng số ký tự trích được (đã trim). */
  total_chars: number;
}

export const RAG_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
} as const;

export type RagMimeType = (typeof RAG_MIME_TYPES)[keyof typeof RAG_MIME_TYPES];

function normalizeSpace(text: string): string {
  return text.replace(/[ \t\u00a0]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Heuristic tách tiêu đề mục cho văn bản thuần (TXT / text từ DOCX):
 * dòng ngắn (<=80 ký tự) và (kiểu markdown `#...`, hoặc VIẾT HOA, hoặc kết
 * thúc bằng `:`) được coi là tiêu đề của các đoạn sau nó.
 */
export function splitSections(text: string): ExtractedSection[] {
  const lines = normalizeSpace(text).split('\n');
  const sections: ExtractedSection[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const body = normalizeSpace(currentLines.join('\n'));
    if (body) sections.push({ section_title: currentTitle, text: body });
    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const isMarkdownHeading = /^#{1,4}\s+\S/.test(line);
    const letters = line.replace(/[^A-Za-zÀ-ỹ]/g, '');
    const upperLetters = line.replace(/[^A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĐ]/g, '');
    const isAllCaps =
      letters.length >= 4 && upperLetters.length / letters.length >= 0.6;
    const isColonHeading = line.endsWith(':') && line.length <= 80;
    if (line.length <= 80 && (isMarkdownHeading || isAllCaps || isColonHeading)) {
      flush();
      currentTitle = line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim() || null;
    } else {
      currentLines.push(line);
    }
  }
  flush();
  return sections;
}

function extractTxt(buffer: Buffer): ExtractedDocument {
  const text = buffer.toString('utf-8');
  const sections = splitSections(text);
  const pages: ExtractedPage[] =
    sections.length > 0
      ? [{ page_number: 1, sections }]
      : [{ page_number: 1, sections: [] }];
  return { pages, total_chars: normalizeSpace(text).length };
}

type NodeRequireFn = (id: string) => unknown;

function nodeRequire(): NodeRequireFn {
  // `createRequire` thay vì `import()` tĩnh: module trích xuất (pdfjs-dist,
  // mammoth) do T002 cài sau — nạp động để typecheck và build không vỡ khi
  // package chưa có; lỗi MODULE_NOT_FOUND được bắt và chuyển thành Error
  // thân thiện ở dưới.
  return createRequire(import.meta.url) as unknown as NodeRequireFn;
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  let pdfjs: {
    getDocument: (opts: Record<string, unknown>) => { promise: Promise<PdfDocument> };
  };
  try {
    pdfjs = nodeRequire()('pdfjs-dist/legacy/build/pdf.mjs') as typeof pdfjs;
  } catch {
    throw new Error(
      'Chưa cài package pdfjs-dist nên không trích xuất được file PDF. ' +
        'Hãy chạy `pnpm add pdfjs-dist` (task T002) rồi upload lại.',
    );
  }

  interface PdfTextItem {
    str?: string;
  }
  interface PdfPage {
    getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  }
  interface PdfDocument {
    numPages: number;
    getPage: (n: number) => Promise<PdfPage>;
  }

  let pdf: PdfDocument;
  try {
    pdf = await pdfjs
      .getDocument({
        data: new Uint8Array(buffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      })
      .promise;
  } catch (err) {
    throw new Error(
      `Không đọc được file PDF: ${err instanceof Error ? err.message : 'file hỏng hoặc không đúng định dạng.'}`,
    );
  }

  const pages: ExtractedPage[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = normalizeSpace(
      content.items.map((item) => item.str ?? '').join(' '),
    );
    pages.push({
      page_number: i,
      sections: text ? [{ section_title: null, text }] : [],
    });
  }
  const total_chars = pages.reduce(
    (sum, p) => sum + p.sections.reduce((s, sec) => s + sec.text.length, 0),
    0,
  );
  return { pages, total_chars };
}

async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  let mammoth: {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  try {
    mammoth = nodeRequire()('mammoth') as typeof mammoth;
  } catch {
    throw new Error(
      'Chưa cài package mammoth nên không trích xuất được file DOCX. ' +
        'Hãy chạy `pnpm add mammoth` (task T002) rồi upload lại.',
    );
  }
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ buffer }));
  } catch (err) {
    throw new Error(
      `Không đọc được file DOCX: ${err instanceof Error ? err.message : 'file hỏng hoặc không đúng định dạng.'}`,
    );
  }
  const sections = splitSections(value);
  const pages: ExtractedPage[] = [
    { page_number: 1, sections },
  ];
  return { pages, total_chars: normalizeSpace(value).length };
}

/**
 * Trích xuất văn bản từ buffer file theo mime type.
 * Ném Error (tiếng Việt) khi định dạng không hỗ trợ hoặc package trích xuất
 * chưa được cài — caller chịu trách nhiệm chuyển thành trạng thái tài liệu.
 */
export async function extractDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractedDocument> {
  switch (mimeType) {
    case RAG_MIME_TYPES.txt:
      return extractTxt(buffer);
    case RAG_MIME_TYPES.pdf:
      return extractPdf(buffer);
    case RAG_MIME_TYPES.docx:
      return extractDocx(buffer);
    default:
      throw new Error(`Định dạng không hỗ trợ: ${mimeType}. Chỉ nhận PDF, DOCX, TXT.`);
  }
}
