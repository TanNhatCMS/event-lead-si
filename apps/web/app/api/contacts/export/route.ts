import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

const exportSchema = z.object({
  format: z.enum(['csv', 'vcard', 'excel']),
  /** Danh sách id cần xuất. Bỏ trống = xuất theo bộ lọc hiện tại. */
  ids: z.array(z.string().uuid()).max(1000).optional().default([]),
  q: z.string().trim().max(200).optional().default(''),
  archived: z.boolean().optional().default(false),
});

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

type ExportRow = {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  preferred_language: string | null;
  relationship_stage: string | null;
  created_at: string;
  companies: { display_name: string } | null;
};

const STAGE_LABELS: Record<string, string> = {
  new: 'Mới',
  contacted: 'Đã liên hệ',
  meeting: 'Đã gặp',
  negotiating: 'Đang đàm phán',
  customer: 'Khách hàng',
  lost: 'Không tiếp tục',
};

/** Escape một ô CSV theo RFC 4180. */
function csvCell(value: string | null | undefined): string {
  const v = value ?? '';
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function toCsv(rows: ExportRow[]): string {
  const header = ['Họ và tên', 'Chức danh', 'Công ty', 'Email', 'SĐT', 'Địa chỉ', 'Giai đoạn', 'Ngày tạo'];
  const lines = rows.map((r) =>
    [
      r.full_name,
      r.job_title,
      r.companies?.display_name,
      r.email,
      r.phone,
      r.address,
      r.relationship_stage ? (STAGE_LABELS[r.relationship_stage] ?? r.relationship_stage) : '',
      new Date(r.created_at).toLocaleDateString('vi-VN'),
    ]
      .map(csvCell)
      .join(','),
  );
  // BOM giúp Excel mở đúng UTF-8 tiếng Việt.
  return '﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n');
}

/** Escape giá trị vCard: \ -> \\, \n -> \n, , -> \,, ; -> \; */
function vcardEscape(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toVCard(rows: ExportRow[]): string {
  return rows
    .map((r) => {
      const stage = r.relationship_stage
        ? (STAGE_LABELS[r.relationship_stage] ?? r.relationship_stage)
        : '';
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${vcardEscape(r.full_name)}`,
        `N:${vcardEscape(r.full_name)};;;;`,
      ];
      if (r.job_title) lines.push(`TITLE:${vcardEscape(r.job_title)}`);
      if (r.companies?.display_name) lines.push(`ORG:${vcardEscape(r.companies.display_name)}`);
      if (r.email) lines.push(`EMAIL;TYPE=WORK:${vcardEscape(r.email)}`);
      if (r.phone) lines.push(`TEL;TYPE=CELL:${vcardEscape(r.phone)}`);
      if (r.address) lines.push(`ADR;TYPE=WORK:;;${vcardEscape(r.address)};;;;`);
      if (stage) lines.push(`NOTE:${vcardEscape(`Giai đoạn: ${stage}`)}`);
      lines.push(`UID:eventlead-${r.id}`);
      lines.push('END:VCARD');
      return lines.join('\r\n');
    })
    .join('\r\n');
}

function toExcel(rows: ExportRow[]): Buffer {
  // Lazy import: xlsx chỉ cần ở server khi xuất Excel.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx');
  const header = ['Họ và tên', 'Chức danh', 'Công ty', 'Email', 'SĐT', 'Địa chỉ', 'Giai đoạn', 'Ngày tạo'];
  const aoa = rows.map((r) => [
    r.full_name,
    r.job_title ?? '',
    r.companies?.display_name ?? '',
    r.email ?? '',
    r.phone ?? '',
    r.address ?? '',
    r.relationship_stage ? (STAGE_LABELS[r.relationship_stage] ?? r.relationship_stage) : '',
    new Date(r.created_at).toLocaleDateString('vi-VN'),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...aoa]);
  ws['!cols'] = [
    { wch: 28 }, { wch: 24 }, { wch: 28 }, { wch: 30 },
    { wch: 18 }, { wch: 40 }, { wch: 16 }, { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Danh ba');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * POST /api/contacts/export
 *
 * Xuất liên hệ của user thành file CSV, Excel (.xlsx) hoặc vCard (.vcf).
 * Body: { format: 'csv' | 'vcard' | 'excel', ids?: string[], q?: string, archived?: boolean }
 * - ids: chỉ xuất các liên hệ được chọn (đều phải thuộc về user).
 * - không có ids: xuất theo bộ lọc tìm kiếm hiện tại (tối đa 1000).
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorJson(requestId, 'unauthorized', 'Vui lòng đăng nhập.', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson(requestId, 'invalid_body', 'Nội dung yêu cầu không hợp lệ.', 400);
  }
  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'invalid_body', 'Dữ liệu không hợp lệ.', 400);
  }
  const { format, ids, q, archived } = parsed.data;

  let query = supabase
    .from('contacts')
    .select(
      'id, full_name, job_title, email, phone, address, preferred_language, relationship_stage, created_at, companies(display_name)',
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (ids.length > 0) {
    query = query.in('id', ids);
  } else {
    query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
    if (q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      query = query.or(
        `full_name.ilike.${like},email.ilike.${like},phone.ilike.${like},job_title.ilike.${like}`,
      );
    }
  }

  const { data, error } = await query;
  if (error) {
    return errorJson(requestId, 'export_failed', 'Chưa xuất được dữ liệu.', 500);
  }
  // database.types.ts chưa có FK contacts->companies nên cast qua unknown
  // (query runtime vẫn join đúng nhờ FK trong DB).
  const rows = (data ?? []) as unknown as ExportRow[];
  if (rows.length === 0) {
    return errorJson(requestId, 'empty', 'Không có liên hệ nào để xuất.', 400);
  }

  const date = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="danh-ba-${date}.csv"`,
      },
    });
  }
  if (format === 'excel') {
    return new NextResponse(new Uint8Array(toExcel(rows)), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="danh-ba-${date}.xlsx"`,
      },
    });
  }
  return new NextResponse(toVCard(rows), {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="danh-ba-${date}.vcf"`,
    },
  });
}
