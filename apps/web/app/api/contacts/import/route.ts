import 'server-only';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { normalizeVnPhone } from '~/lib/ai/enrichment/tools';
import {
  CSV_IMPORT_MAX_ROWS,
  emailKeyForDedupe,
  mapCsvRows,
  parseCsv,
  phoneKeyForDedupe,
} from '~/lib/contacts/csv';
import { dispatchWebhook } from '~/lib/webhooks/dispatch';
import { logLifecycleAudit } from '~/lib/lifecycle/audit';

function errorJson(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json({ code, message, request_id: requestId }, { status });
}

const importSchema = z.object({
  /** Nội dung file CSV dạng text (có header). Tối đa 500 dòng dữ liệu. */
  csv: z.string().min(1, 'Thiếu nội dung CSV.').max(2_000_000),
});

/** Lý do một dòng bị bỏ qua khi nhập. */
type SkipReason = 'phone' | 'email' | 'invalid_row';

interface DuplicateEntry {
  name: string;
  reason: SkipReason;
}

/** Nhóm công ty đã tra cứu/tạo trong request — tránh query/insert lặp. */
class CompanyCache {
  private byName = new Map<string, string>();

  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async resolve(rawName: string): Promise<string | null> {
    const name = rawName.trim();
    if (!name) return null;
    const lookup = name.toLowerCase();
    const cached = this.byName.get(lookup);
    if (cached) return cached;

    // Tra cứu theo display_name (escape ký tự wildcard của ilike) rồi so khớp
    // chính xác không phân biệt hoa/thường — cùng pattern card-imports/confirm.
    const escaped = name.replace(/[%_\\]/g, (m) => '\\' + m);
    const { data: candidates } = await this.supabase
      .from('companies')
      .select('id, display_name')
      .eq('user_id', this.userId)
      .ilike('display_name', escaped)
      .limit(10);
    const existing = (candidates ?? []).find(
      (row) => row.display_name.trim().toLowerCase() === lookup,
    );
    if (existing) {
      this.byName.set(lookup, existing.id);
      return existing.id;
    }

    const { data: created, error } = await this.supabase
      .from('companies')
      .insert({ user_id: this.userId, display_name: name, profile_state: 'user_provided' })
      .select('id')
      .single();
    if (error || !created) {
      return null;
    }
    this.byName.set(lookup, created.id);
    return created.id;
  }
}

/**
 * POST /api/contacts/import
 *
 * Nhập danh bạ từ CSV text (có header). Parse cột linh hoạt, chuẩn hoá SĐT VN,
 * dedupe theo email/SĐT (cả trong file lẫn với danh bạ hiện có), tự tạo company
 * mới khi chưa có. Trả { created, skipped, duplicates: [{ name, reason }] }.
 * Mỗi contact tạo mới được dispatch webhook 'contact.created' (fire-and-forget);
 * tổng kết nhập ghi một dòng audit.
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
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return errorJson(requestId, 'validation_error', 'Thiếu nội dung CSV.', 400);
  }

  const parsedCsv = parseCsv(parsed.data.csv);
  if (parsedCsv.rows.length === 0) {
    return errorJson(requestId, 'empty_csv', 'File CSV không có dòng dữ liệu nào.', 400);
  }
  if (parsedCsv.rows.length > CSV_IMPORT_MAX_ROWS) {
    return errorJson(
      requestId,
      'too_many_rows',
      'CSV có quá 500 dòng dữ liệu — tách nhỏ lại để nhập.',
      400,
    );
  }

  // Danh bạ hiện có: chỉ chọn trường dedupe cần (single-user, lưỡng lự 5000 dòng).
  // Bỏ qua liên hệ đã lưu trữ — người dùng lưu trữ chủ động thì nhập lại là hợp lệ.
  const { data: existing, error: existingError } = await supabase
    .from('contacts')
    .select('id, email, phone')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .limit(5000);
  if (existingError) {
    return errorJson(requestId, 'lookup_failed', 'Chưa kiểm tra được danh bạ hiện có.', 500);
  }
  const existingPhones = new Set<string>();
  const existingEmails = new Set<string>();
  for (const row of existing ?? []) {
    const pKey = phoneKeyForDedupe(row.phone ?? '');
    if (pKey) existingPhones.add(pKey);
    const eKey = emailKeyForDedupe(row.email ?? '');
    if (eKey) existingEmails.add(eKey);
  }

  const rows = mapCsvRows(parsedCsv);
  const seenPhones = new Set<string>(existingPhones);
  const seenEmails = new Set<string>(existingEmails);
  const duplicates: DuplicateEntry[] = [];
  const companies = new CompanyCache(supabase, user.id);
  let created = 0;
  let skipped = 0;
  const createdContactIds: string[] = [];

  for (const row of rows) {
    const pKey = phoneKeyForDedupe(row.phone);
    const eKey = emailKeyForDedupe(row.email);
    const displayName = row.full_name || row.email || row.phone || ('Dòng ' + row.rowNumber);

    // Dòng không có gì đáng lưu → bỏ qua.
    if (!row.full_name && !eKey && !pKey && !row.company_name) {
      skipped++;
      duplicates.push({ name: displayName, reason: 'invalid_row' });
      continue;
    }

    // Dedupe theo email trước, rồi SĐT.
    if (eKey && seenEmails.has(eKey)) {
      duplicates.push({ name: displayName, reason: 'email' });
      continue;
    }
    if (pKey && seenPhones.has(pKey)) {
      duplicates.push({ name: displayName, reason: 'phone' });
      continue;
    }

    const normalized = normalizeVnPhone(row.phone);
    const phoneToStore = normalized.valid ? normalized.display : row.phone || null;
    const companyId = await companies.resolve(row.company_name);

    const { data: contact, error: insertError } = await supabase
      .from('contacts')
      .insert({
        user_id: user.id,
        company_id: companyId,
        full_name:
          row.full_name ||
          (row.email ? (row.email.split('@')[0] ?? row.email) : 'Không tên'),
        job_title: row.job_title || null,
        email: row.email || null,
        phone: phoneToStore,
        owner_user_id: user.id,
        schema_version: 1,
      })
      .select('id')
      .single();

    if (insertError || !contact) {
      // Lỗi insert từng dòng (constraint...) → tính là bỏ qua, không fail cả lô.
      skipped++;
      duplicates.push({ name: displayName, reason: 'invalid_row' });
      continue;
    }

    created++;
    createdContactIds.push(contact.id);
    if (eKey) seenEmails.add(eKey);
    if (pKey) seenPhones.add(pKey);

    void dispatchWebhook(user.id, 'contact.created', {
      contact_id: contact.id,
      company_id: companyId,
      source: 'csv_import',
    });
  }

  await logLifecycleAudit(supabase, user.id, {
    action: 'contact.import',
    entityType: 'contact',
    summary: 'Nhập CSV: tạo ' + created + ', bỏ qua ' + skipped + ', trùng ' + duplicates.length,
    metadata: {
      created,
      skipped,
      duplicate_count: duplicates.length,
      total_rows: rows.length,
    },
  });

  return NextResponse.json({
    created,
    skipped,
    duplicates,
    contact_ids: createdContactIds,
    request_id: requestId,
  });
}
