'use client';

import { useState } from 'react';
import { FileDown } from 'lucide-react';

import { Button } from '@kit/ui/button';
import { toast } from '@kit/ui/sonner';

/**
 * Số liệu sự kiện cho báo cáo PDF — khớp hợp đồng GET /api/events/[id]/stats
 * (các trường mới là tuỳ chọn để không vỡ khi backend chưa trả).
 */
export type EventReportStats = {
  contacts: number;
  cardImports: number;
  followUpsSent: number;
  funnel?: { total: number; contacted: number; meeting: number; deal: number } | null;
  costUsd?: number | null;
  leadsPerCost?: number | null;
};

type ReportContactRow = {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  relationship_stage: string | null;
};

/**
 * PHƯƠNG ÁN PDF TIẾNG VIỆT (thử phương án chính trước, có fallback):
 *
 * 1. CHÍNH — doc.html(): render báo cáo từ một DOM ẩn gắn vào document.body
 *    (inline style, không phụ thuộc Tailwind). jspdf 4.2.1 khai báo html2canvas
 *    là optionalDependency và pnpm đã cài (html2canvas@1.4.1 resolve cạnh
 *    jspdf — import('html2canvas') động trong jspdf.es.js bundle được), nên
 *    chữ tiếng Việt có dấu render ĐẦY ĐỦ qua fillText của trình duyệt.
 *
 * 2. DỰ PHÒNG — nếu doc.html() lỗi (html2canvas bị chặn, iframe/CSP, canvas
 *    quá lớn...) thì vẽ lại bằng jsPDF primitives (text/rect/line) với nội
 *    dung đã bỏ dấu (toAsciiSafe) — font helvetica chuẩn của PDF không có
 *    glyph tiếng Việt. PDF dự phòng ghi chú rõ "(phiên bản không dấu)".
 *
 * Tên file: eventlead-bao-cao.pdf.
 */

/** Bỏ dấu tiếng Việt + ký tự ngoài ASCII in được (d/đ xử lý trước NFD). */
export function toAsciiSafe(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

/** Cắt ô bảng để không tràn cột (đếm ký tự — dùng ở phương án ASCII). */
function truncateCell(value: string, maxChars: number): string {
  const v = toAsciiSafe(value).trim();
  return v.length <= maxChars ? v : v.slice(0, maxChars - 1) + '.';
}

const STAGE_LABELS: Record<string, string> = {
  new: 'Mới',
  contacted: 'Đã liên hệ',
  meeting: 'Đã gặp',
  negotiating: 'Đang đàm phán',
  customer: 'Khách hàng',
  lost: 'Không tiếp tục',
};

const FUNNEL_ROWS = [
  { key: 'total', label: 'Tổng lead' },
  { key: 'contacted', label: 'Đã liên hệ' },
  { key: 'meeting', label: 'Hẹn meeting' },
  { key: 'deal', label: 'Deal' },
] as const;

// Khổ A4 dọc (mm).
const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Cột bảng liên hệ (phương án ASCII): STT | Ho ten | Chuc danh | Email | DT | GD.
const COLS = [
  { key: 'stt', label: 'STT', width: 10, maxChars: 4 },
  { key: 'name', label: 'Ho ten', width: 45, maxChars: 26 },
  { key: 'job', label: 'Chuc danh', width: 30, maxChars: 17 },
  { key: 'email', label: 'Email', width: 45, maxChars: 26 },
  { key: 'phone', label: 'Dien thoai', width: 28, maxChars: 16 },
  { key: 'stage', label: 'Giai doan', width: 24, maxChars: 14 },
] as const;

const ROW_HEIGHT = 7;
const MAX_TABLE_ROWS = 100;

/** Tên file PDF theo spec. */
const FILE_NAME = 'eventlead-bao-cao.pdf';

function formatExportedAt(now: Date): string {
  return (
    ('0' + now.getDate()).slice(-2) +
    '/' +
    ('0' + (now.getMonth() + 1)).slice(-2) +
    '/' +
    now.getFullYear()
  );
}

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '—';
  return STAGE_LABELS[stage] ?? stage;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ */
/* PHƯƠNG ÁN CHÍNH: doc.html() — UTF-8 tiếng Việt đầy đủ               */
/* ------------------------------------------------------------------ */

/**
 * Dựng DOM ẩn của báo cáo (inline style hoàn toàn — html2canvas đọc computed
 * style, không phụ thuộc Tailwind/Turbopack). Container được gắn vào
 * document.body tại vị trí ngoài màn hình (left -10000px).
 */
function buildReportElement(
  eventName: string,
  exportedAt: string,
  stats: EventReportStats,
  contacts: ReportContactRow[],
): HTMLElement {
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:760px;background:#ffffff;' +
    'color:#1a1a1a;font-family:Arial,"Segoe UI",Roboto,sans-serif;padding:28px;box-sizing:border-box;z-index:-1;';

  const funnel = stats.funnel ?? null;
  const maxFunnel = funnel
    ? Math.max(funnel.total, funnel.contacted, funnel.meeting, funnel.deal, 1)
    : 1;

  const headline = [
    { label: 'Liên hệ', value: stats.contacts },
    { label: 'Danh thiếp đã quét', value: stats.cardImports },
    { label: 'Follow-up đã gửi', value: stats.followUpsSent },
  ];

  const statBoxes = headline
    .map(
      (s) =>
        '<td style="width:33%;border:1px solid #d4d4d4;border-radius:6px;' +
        'text-align:center;padding:12px 8px;">' +
        '<div style="font-size:22px;font-weight:bold;">' +
        String(s.value) +
        '</div>' +
        '<div style="font-size:11px;color:#666;margin-top:4px;">' +
        escapeHtml(s.label) +
        '</div></td>',
    )
    .join('');

  const funnelRows = FUNNEL_ROWS.map((row) => {
    const value = funnel ? (funnel[row.key] ?? 0) : 0;
    const width = Math.round((value / maxFunnel) * 100);
    return (
      '<tr><td style="padding:5px 0;font-size:13px;width:130px;">' +
      escapeHtml(row.label) +
      '</td><td style="padding:5px 8px;">' +
      '<div style="height:10px;border-radius:5px;overflow:hidden;background:#ececec;">' +
      '<div style="height:10px;width:' +
      Math.max(width, 1) +
      '%;background:#5566cc;border-radius:5px;"></div>' +
      '</div></td><td style="padding:5px 0;font-size:13px;font-weight:bold;' +
      'text-align:right;width:60px;">' +
      String(value) +
      '</td></tr>'
    );
  }).join('');

  const tableRows = contacts
    .slice(0, MAX_TABLE_ROWS)
    .map(
      (row, i) =>
        '<tr style="background:' +
        (i % 2 === 1 ? '#f7f7f7' : '#ffffff') +
        ';">' +
        '<td style="border-bottom:1px solid #e5e5e5;padding:6px 8px;font-size:12px;">' +
        String(i + 1) +
        '</td>' +
        '<td style="border-bottom:1px solid #e5e5e5;padding:6px 8px;font-size:12px;">' +
        escapeHtml(row.full_name) +
        '</td>' +
        '<td style="border-bottom:1px solid #e5e5e5;padding:6px 8px;font-size:12px;">' +
        escapeHtml(row.job_title ?? '—') +
        '</td>' +
        '<td style="border-bottom:1px solid #e5e5e5;padding:6px 8px;font-size:12px;">' +
        escapeHtml(row.email ?? '—') +
        '</td>' +
        '<td style="border-bottom:1px solid #e5e5e5;padding:6px 8px;font-size:12px;">' +
        escapeHtml(row.phone ?? '—') +
        '</td>' +
        '<td style="border-bottom:1px solid #e5e5e5;padding:6px 8px;font-size:12px;">' +
        escapeHtml(stageLabel(row.relationship_stage)) +
        '</td></tr>',
    )
    .join('');

  const headerCells =
    ['STT', 'Họ tên', 'Chức danh', 'Email', 'Điện thoại', 'Giai đoạn']
      .map(
        (label) =>
          '<th style="border-bottom:2px solid #999;background:#f0f0f0;padding:6px 8px;' +
          'font-size:12px;text-align:left;">' +
          label +
          '</th>',
      )
      .join('');

  const truncatedNote =
    contacts.length > MAX_TABLE_ROWS
      ? '<p style="font-size:10px;color:#888;margin:6px 0 0;">(Chỉ hiển thị ' +
        String(MAX_TABLE_ROWS) +
        '/' +
        String(contacts.length) +
        ' liên hệ đầu tiên.)</p>'
      : '';

  container.innerHTML =
    '<h1 style="font-size:24px;font-weight:bold;margin:0;">Báo cáo sự kiện</h1>' +
    '<p style="font-size:15px;margin:6px 0 0;">' +
    escapeHtml(eventName) +
    '</p>' +
    '<p style="font-size:11px;color:#777;margin:4px 0 18px;">Xuất ngày: ' +
    exportedAt +
    '</p>' +
    '<table style="width:100%;border-collapse:separate;border-spacing:6px 0;margin:0 0 18px;"><tr>' +
    statBoxes +
    '</tr></table>' +
    '<h2 style="font-size:15px;font-weight:bold;margin:0 0 8px;">Phễu chuyển đổi</h2>' +
    '<table style="width:100%;border-collapse:collapse;margin:0 0 18px;">' +
    funnelRows +
    '</table>' +
    '<p style="font-size:12px;margin:0 0 18px;">' +
    'Chi phí AI (ước lượng): <b>' +
    (stats.costUsd != null ? '$' + stats.costUsd.toFixed(2) : '—') +
    '</b> &nbsp;·&nbsp; Chi phí mỗi lead: <b>' +
    (stats.leadsPerCost != null ? '$' + stats.leadsPerCost.toFixed(2) : '—') +
    '</b></p>' +
    '<h2 style="font-size:15px;font-weight:bold;margin:0 0 8px;">Danh sách liên hệ (' +
    String(contacts.length) +
    ')</h2>' +
    '<table style="width:100%;border-collapse:collapse;">' +
    '<thead><tr>' +
    headerCells +
    '</tr></thead><tbody>' +
    (tableRows ||
      '<tr><td colspan="6" style="padding:10px 8px;font-size:12px;color:#888;">' +
      'Không có liên hệ nào thuộc sự kiện này.</td></tr>') +
    '</tbody></table>' +
    truncatedNote;

  return container;
}

/**
 * Render PDF tiếng Việt đầy đủ bằng doc.html() (html2canvas). Ném lỗi nếu
 * html2canvas không tải được — caller fallback sang phương án ASCII.
 */
async function renderUtf8Pdf(
  JsPdfCtor: typeof import('jspdf').jsPDF,
  eventName: string,
  exportedAt: string,
  stats: EventReportStats,
  contacts: ReportContactRow[],
): Promise<InstanceType<typeof import('jspdf').jsPDF>> {
  const doc = new JsPdfCtor({ unit: 'mm', format: 'a4' });
  const container = buildReportElement(eventName, exportedAt, stats, contacts);
  document.body.appendChild(container);
  try {
    await doc.html(container, {
      x: MARGIN - 4,
      y: MARGIN - 4,
      width: CONTENT_W + 8,
      windowWidth: 760,
      html2canvas: { scale: 2, backgroundColor: '#ffffff' },
    });
  } finally {
    container.remove();
  }
  return doc;
}

/* ------------------------------------------------------------------ */
/* PHƯƠNG ÁN DỰ PHÒNG: jsPDF primitives + ASCII (bỏ dấu)               */
/* ------------------------------------------------------------------ */

function renderAsciiPdf(
  JsPdfCtor: typeof import('jspdf').jsPDF,
  eventName: string,
  exportedAt: string,
  stats: EventReportStats,
  contacts: ReportContactRow[],
): InstanceType<typeof import('jspdf').jsPDF> {
  const doc = new JsPdfCtor({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  // Tiêu đề.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BAO CAO SU KIEN', MARGIN, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(truncateCell(eventName, 60), MARGIN, y);
  y += 6;

  doc.setFontSize(10);
  doc.text('Xuat ngay: ' + exportedAt, MARGIN, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('(Phien ban PDF khong dau - ASCII)', MARGIN, y);
  doc.setTextColor(0);
  y += 8;

  // 3 số liệu chính.
  const headline = [
    { label: 'Lien he', value: String(stats.contacts) },
    { label: 'Danh thiep da quet', value: String(stats.cardImports) },
    { label: 'Follow-up da gui', value: String(stats.followUpsSent) },
  ];
  const boxW = CONTENT_W / 3 - 3;
  let boxX = MARGIN;
  doc.setFontSize(9);
  for (const item of headline) {
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(boxX, y, boxW, 16, 2, 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(item.value, boxX + boxW / 2, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(item.label, boxX + boxW / 2, y + 13, { align: 'center' });
    doc.setTextColor(0);
    boxX += boxW + 4.5;
  }
  y += 22;

  // Phễu chuyển đổi — vẽ thanh bằng rect.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Pheu chuyen doi', MARGIN, y);
  y += 3;
  const funnel = stats.funnel ?? null;
  const maxFunnel = funnel
    ? Math.max(funnel.total, funnel.contacted, funnel.meeting, funnel.deal, 1)
    : 1;
  for (const stage of FUNNEL_ROWS) {
    const value = funnel ? (funnel[stage.key] ?? 0) : 0;
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(toAsciiSafe(stage.label), MARGIN, y);
    doc.text(String(value), PAGE_W - MARGIN, y, { align: 'right' });
    const barW = (value / maxFunnel) * (CONTENT_W - 30);
    doc.setFillColor(120, 120, 220);
    doc.rect(MARGIN + 26, y - 3, Math.max(barW, 0.5), 3.5, 'F');
  }
  y += 9;

  // Chi phí AI (ước lượng).
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const costText =
    'Chi phi AI (uoc luong): ' +
    (stats.costUsd != null ? '$' + stats.costUsd.toFixed(2) : '-');
  const perLeadText =
    'Chi phi moi lead: ' +
    (stats.leadsPerCost != null ? '$' + stats.leadsPerCost.toFixed(2) : '-');
  doc.text(costText, MARGIN, y);
  doc.text(perLeadText, MARGIN + 90, y);
  y += 10;

  // Bảng liên hệ của sự kiện.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Danh sach lien he (' + contacts.length + ')', MARGIN, y);
  y += 5;

  // Tiêu đề cột.
  doc.setFontSize(8);
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(235, 235, 235);
  doc.rect(MARGIN, y, CONTENT_W, 6, 'FD');
  let colX = MARGIN;
  for (const col of COLS) {
    doc.setFont('helvetica', 'bold');
    doc.text(col.label, colX + 1.5, y + 4);
    colX += col.width;
  }
  y += 6;

  const rows = contacts.slice(0, MAX_TABLE_ROWS);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (y + ROW_HEIGHT > 292) {
      doc.addPage();
      y = MARGIN;
    }
    if (i % 2 === 1) {
      doc.setFillColor(245, 245, 245);
      doc.rect(MARGIN, y, CONTENT_W, ROW_HEIGHT, 'F');
    }
    const values: string[] = [
      String(i + 1),
      row.full_name,
      row.job_title ?? '',
      row.email ?? '',
      row.phone ?? '',
      stageLabel(row.relationship_stage),
    ];
    colX = MARGIN;
    for (let c = 0; c < COLS.length; c++) {
      const col = COLS[c];
      if (!col) continue;
      doc.setFont('helvetica', 'normal');
      doc.text(truncateCell(values[c] ?? '', col.maxChars), colX + 1.5, y + 4.5);
      colX += col.width;
    }
    doc.setDrawColor(225, 225, 225);
    doc.line(MARGIN, y + ROW_HEIGHT, PAGE_W - MARGIN, y + ROW_HEIGHT);
    y += ROW_HEIGHT;
  }
  if (rows.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Khong co lien he nao thuoc su kien nay.', MARGIN, y + 4.5);
  }

  return doc;
}

/* ------------------------------------------------------------------ */
/* Nút "Xuất PDF"                                                      */
/* ------------------------------------------------------------------ */

/**
 * Nút "Xuất PDF" của widget sự kiện: tạo báo cáo A4 — tên sự kiện + ngày xuất,
 * 3 số liệu chính, phễu 4 giai đoạn, chi phí AI ước lượng và bảng liên hệ của
 * sự kiện (GET /api/contacts?event_id=). Ưu tiên doc.html() (tiếng Việt đầy
 * đủ); lỗi thì fallback nội dung không dấu bằng jsPDF primitives.
 * Tên file: eventlead-bao-cao.pdf.
 */
export function EventReportPdfButton({
  eventId,
  eventName,
  stats,
}: {
  eventId: string;
  eventName: string;
  stats: EventReportStats;
}) {
  const [exporting, setExporting] = useState(false);

  async function fetchEventContacts(): Promise<ReportContactRow[]> {
    try {
      const res = await fetch(
        '/api/contacts?event_id=' + encodeURIComponent(eventId) + '&limit=200',
      );
      if (!res.ok) return [];
      const json = await res.json().catch(() => ({}));
      return Array.isArray(json?.contacts) ? (json.contacts as ReportContactRow[]) : [];
    } catch {
      return [];
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const contacts = await fetchEventContacts();
      const { jsPDF } = await import('jspdf');
      const exportedAt = formatExportedAt(new Date());

      let doc: InstanceType<typeof jsPDF>;
      let asciiFallback = false;
      try {
        // Phương án chính: render từ DOM ẩn — tiếng Việt đầy đủ dấu.
        doc = await renderUtf8Pdf(jsPDF, eventName, exportedAt, stats, contacts);
      } catch (err) {
        console.warn(
          '[event-report-pdf] doc.html() thất bại, dùng phương án ASCII:',
          err,
        );
        asciiFallback = true;
        doc = renderAsciiPdf(jsPDF, eventName, exportedAt, stats, contacts);
      }

      doc.save(FILE_NAME);
      if (asciiFallback) {
        toast.success('Đã xuất báo cáo PDF (phiên bản không dấu).');
      } else {
        toast.success('Đã xuất báo cáo PDF.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Xuất PDF thất bại.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={exporting}
      onClick={() => void handleExport()}
      title="Tải báo cáo sự kiện dạng PDF"
    >
      <FileDown className="mr-1.5 h-3.5 w-3.5" />
      {exporting ? 'Đang xuất...' : 'Xuất PDF'}
    </Button>
  );
}
