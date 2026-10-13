import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";

import { embedTexts, resolveEmbeddingModel } from "./embeddings";
import type { BusinessEntityType, QueueOperation } from "./types";

/**
 * T005 — Index danh bạ + worker re-index.
 *
 * - Chunk danh bạ là template văn bản chuẩn hóa theo từng entity
 *   (không cắt bừa như chunk tài liệu).
 * - Các API contacts/companies/notes gọi `enqueueBusinessIndex*` sau khi ghi
 *   DB thành công; worker (`GET /api/knowledge/worker`) gọi
 *   `processIndexQueue` theo lịch ≤ 5 phút để tạo embedding và upsert vào
 *   `business_chunks`.
 * - Hồ sơ xóa mềm (`contacts.archived_at`, `meeting_notes.deleted_at`) được
 *   coi như delete: không index, chunk cũ (nếu có) bị xóa.
 */

/** Phiên bản embedding của chunk danh bạ — tăng khi đổi model/kích thước. */
export const EMBEDDING_VERSION = 1;

type DbClient = SupabaseClient<Database>;

type QueueRow = Database["public"]["Tables"]["rag_index_queue"]["Row"];

/* ------------------------------------------------------------------ */
/* 1. Template văn bản chuẩn hóa theo entity                            */
/* ------------------------------------------------------------------ */

export interface ContactTextInput {
  full_name: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  relationship_stage?: string | null;
  labels?: string[] | null;
  company_name?: string | null;
}

export interface CompanyTextInput {
  display_name: string;
  website?: string | null;
  industry?: string | null;
  employee_size_range?: string | null;
  products_summary?: string | null;
  market_summary?: string | null;
}

export interface MeetingNoteTextInput {
  note_type: string;
  created_at: string;
  body: string;
  contact_name?: string | null;
}

function line(label: string, value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? `${label}: ${v}` : null;
}

export function buildContactText(input: ContactTextInput): string {
  const lines = [
    `Hồ sơ liên hệ: ${input.full_name.trim()}`,
    line("Chức danh", input.job_title),
    line("Công ty", input.company_name),
    line("Email", input.email),
    line("Điện thoại", input.phone),
    line("Địa chỉ", input.address),
    line("Giai đoạn quan hệ", input.relationship_stage),
    input.labels && input.labels.length > 0
      ? `Nhãn: ${input.labels.join(", ")}`
      : null,
  ].filter((l): l is string => Boolean(l));
  return lines.join("\n");
}

export function buildCompanyText(input: CompanyTextInput): string {
  const lines = [
    `Công ty: ${input.display_name.trim()}`,
    line("Website", input.website),
    line("Lĩnh vực", input.industry),
    line("Quy mô", input.employee_size_range),
    line("Sản phẩm/dịch vụ", input.products_summary),
    line("Thị trường", input.market_summary),
  ].filter((l): l is string => Boolean(l));
  return lines.join("\n");
}

export const NOTE_TYPE_LABEL: Record<string, string> = {
  meeting_note: "cuộc gặp",
  need: "nhu cầu",
  opportunity: "cơ hội",
  next_step: "bước tiếp theo",
};

export function formatViDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function buildMeetingNoteText(input: MeetingNoteTextInput): string {
  const typeLabel = NOTE_TYPE_LABEL[input.note_type] ?? input.note_type;
  const contact = (input.contact_name ?? "").trim();
  const lines = [
    contact
      ? `Ghi chú ${typeLabel} — ${contact}`
      : `Ghi chú ${typeLabel}`,
    formatViDate(input.created_at)
      ? `Ngày: ${formatViDate(input.created_at)}`
      : null,
    "Nội dung:",
    input.body.trim(),
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* 2. Nhãn nguồn cho trích dẫn (citation)                               */
/* ------------------------------------------------------------------ */

/** `Hồ sơ liên hệ: <tên>` | `Công ty: <tên>` | `Ghi chú <loại> (<ngày>) — <tên liên hệ>` */
export function buildSourceLabel(
  entityType: BusinessEntityType,
  input: { name: string; noteType?: string; dateIso?: string },
): string {
  const name = input.name.trim();
  if (entityType === "contact") return `Hồ sơ liên hệ: ${name}`;
  if (entityType === "company") return `Công ty: ${name}`;
  const typeLabel =
    NOTE_TYPE_LABEL[input.noteType ?? ""] ?? (input.noteType ?? "");
  const date = input.dateIso ? formatViDate(input.dateIso) : "";
  return date
    ? `Ghi chú ${typeLabel} (${date}) — ${name}`
    : `Ghi chú ${typeLabel} — ${name}`;
}

/* ------------------------------------------------------------------ */
/* 3. Enqueue vào rag_index_queue                                       */
/* ------------------------------------------------------------------ */

/**
 * Ghi một yêu cầu index vào `rag_index_queue`.
 * Ném lỗi khi DB lỗi (kể cả khi bảng RAG chưa được migrate) — caller quyết
 * định bắt lỗi hay không qua `enqueueBusinessIndexSafe`.
 */
export async function enqueueBusinessIndex(
  userId: string,
  entityType: BusinessEntityType,
  entityId: string,
  operation: QueueOperation,
  supabase: DbClient,
): Promise<void> {
  const { error } = await supabase.from("rag_index_queue").insert({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    operation,
    status: "pending",
  });
  if (error) throw new Error(`enqueue index thất bại: ${error.message}`);
}

/**
 * Bản an toàn cho các route API: không bao giờ ném lỗi, không làm hỏng
 * API chính nếu enqueue lỗi (đúng yêu cầu fire-and-forget của T005).
 */
export async function enqueueBusinessIndexSafe(
  userId: string,
  entityType: BusinessEntityType,
  entityId: string,
  operation: QueueOperation,
  supabase: DbClient,
): Promise<void> {
  try {
    await enqueueBusinessIndex(userId, entityType, entityId, operation, supabase);
  } catch (error) {
    console.error(
      `[rag-index] enqueue thất bại (${entityType}/${entityId}/${operation}):`,
      error instanceof Error ? error.message : error,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 4. Worker: processIndexQueue                                         */
/* ------------------------------------------------------------------ */

export interface QueueProcessResult {
  processed: number;
  upserted: number;
  deleted: number;
  failed: number;
  duration_ms: number;
}

interface QueueGroup {
  key: string;
  user_id: string;
  entity_type: BusinessEntityType;
  entity_id: string;
  operation: QueueOperation;
  ids: string[];
}

interface PreparedUpsert {
  group: QueueGroup;
  text: string;
}

function formatVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

function groupQueue(rows: QueueRow[]): QueueGroup[] {
  const map = new Map<string, QueueRow[]>();
  for (const row of rows) {
    const key = `${row.user_id}|${row.entity_type}|${row.entity_id}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  const groups: QueueGroup[] = [];
  for (const [key, list] of map) {
    list.sort((a, b) => {
      if (a.created_at !== b.created_at)
        return a.created_at < b.created_at ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
    const first = list[0];
    if (!first) continue;
    // Quy tắc gộp: delete thắng upsert; nếu không có delete thì bản ghi mới nhất thắng.
    // (CHECK constraint của DB đảm bảo giá trị nằm trong union — cast an toàn.)
    const operation: QueueOperation = list.some((r) => r.operation === "delete")
      ? "delete"
      : (first.operation as QueueOperation);
    groups.push({
      key,
      user_id: first.user_id,
      entity_type: first.entity_type as BusinessEntityType,
      entity_id: first.entity_id,
      operation,
      ids: list.map((r) => r.id),
    });
  }
  return groups;
}

async function markQueue(
  client: DbClient,
  ids: string[],
  status: "done" | "failed",
  errorMessage?: string,
): Promise<void> {
  if (ids.length === 0) return;
  await client
    .from("rag_index_queue")
    .update({
      status,
      error_message: errorMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
}

async function deleteChunk(
  client: DbClient,
  userId: string,
  entityType: BusinessEntityType,
  entityId: string,
): Promise<void> {
  await client
    .from("business_chunks")
    .delete()
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
}

/**
 * Chuẩn bị nội dung index cho một group upsert.
 * Trả về `null` khi entity không còn tồn tại hoặc đã xóa mềm → caller xử lý
 * như delete (xóa chunk cũ).
 */
async function prepareUpsert(
  client: DbClient,
  group: QueueGroup,
): Promise<PreparedUpsert | null> {
  const { user_id, entity_type, entity_id } = group;

  if (entity_type === "contact") {
    const { data: contact } = await client
      .from("contacts")
      .select(
        "id, full_name, job_title, email, phone, address, relationship_stage, labels, archived_at, company_id",
      )
      .eq("id", entity_id)
      .eq("user_id", user_id)
      .maybeSingle();
    if (!contact || contact.archived_at) return null; // xóa mềm → coi như delete

    let companyName: string | null = null;
    if (contact.company_id) {
      const { data: company } = await client
        .from("companies")
        .select("display_name")
        .eq("id", contact.company_id)
        .eq("user_id", user_id)
        .maybeSingle();
      companyName = company?.display_name ?? null;
    }
    return {
      group,
      text: buildContactText({ ...contact, company_name: companyName }),
    };
  }

  if (entity_type === "company") {
    const { data: company } = await client
      .from("companies")
      .select(
        "display_name, website, industry, employee_size_range, products_summary, market_summary",
      )
      .eq("id", entity_id)
      .eq("user_id", user_id)
      .maybeSingle();
    if (!company) return null; // công ty đã bị xóa cứng
    return { group, text: buildCompanyText(company) };
  }

  // meeting_note
  const { data: note } = await client
    .from("meeting_notes")
    .select("id, body, note_type, created_at, deleted_at, contact_id")
    .eq("id", entity_id)
    .eq("user_id", user_id)
    .maybeSingle();
  if (!note || note.deleted_at) return null; // xóa mềm → coi như delete

  const { data: contact } = await client
    .from("contacts")
    .select("full_name")
    .eq("id", note.contact_id)
    .eq("user_id", user_id)
    .maybeSingle();
  return {
    group,
    text: buildMeetingNoteText({
      note_type: note.note_type,
      created_at: note.created_at,
      body: note.body,
      contact_name: contact?.full_name ?? null,
    }),
  };
}

/**
 * Worker xử lý hàng đợi index danh bạ (FR-010).
 * Gọi từ `GET /api/knowledge/worker` theo lịch ≤ 5 phút.
 */
export async function processIndexQueue(
  supabase: DbClient,
  batchSize = 50,
): Promise<QueueProcessResult> {
  const startedAt = Date.now();
  const client = supabase;
  const result: QueueProcessResult = {
    processed: 0,
    upserted: 0,
    deleted: 0,
    failed: 0,
    duration_ms: 0,
  };

  const { data: rows, error: fetchError } = await client
    .from("rag_index_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(Math.max(1, Math.min(batchSize, 200)));

  if (fetchError) {
    throw new Error(`Không đọc được hàng đợi index: ${fetchError.message}`);
  }
  if (!rows || rows.length === 0) return result;

  // Đánh dấu đang xử lý (tránh worker khác trùng xử lý).
  for (const row of rows) {
    await client
      .from("rag_index_queue")
      .update({
        status: "processing",
        attempts: (row.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  const groups = groupQueue(rows);
  result.processed = groups.length;

  const deleteGroups = groups.filter((g) => g.operation === "delete");
  const upsertGroups = groups.filter((g) => g.operation === "upsert");

  // 1) delete: xóa chunk (idempotent).
  for (const group of deleteGroups) {
    try {
      await deleteChunk(client, group.user_id, group.entity_type, group.entity_id);
      await markQueue(client, group.ids, "done");
      result.deleted += 1;
    } catch (error) {
      await markQueue(
        client,
        group.ids,
        "failed",
        error instanceof Error ? error.message : String(error),
      );
      result.failed += 1;
    }
  }

  // 2) upsert: đọc entity → build text → embed theo lô (từng user) → upsert chunk.
  const prepared: PreparedUpsert[] = [];
  const softDeleted: QueueGroup[] = [];
  for (const group of upsertGroups) {
    try {
      const item = await prepareUpsert(supabase, group);
      if (item === null) {
        softDeleted.push(group);
      } else {
        prepared.push(item);
      }
    } catch (error) {
      await markQueue(
        client,
        group.ids,
        "failed",
        `Không đọc được entity: ${error instanceof Error ? error.message : String(error)}`,
      );
      result.failed += 1;
    }
  }

  // Hồ sơ xóa mềm / entity không còn tồn tại → coi như delete.
  for (const group of softDeleted) {
    try {
      await deleteChunk(client, group.user_id, group.entity_type, group.entity_id);
      await markQueue(client, group.ids, "done");
      result.deleted += 1;
    } catch (error) {
      await markQueue(
        client,
        group.ids,
        "failed",
        error instanceof Error ? error.message : String(error),
      );
      result.failed += 1;
    }
  }

  // Embed theo lô cho từng user (model embedding là cấu hình theo user).
  const byUser = new Map<string, PreparedUpsert[]>();
  for (const item of prepared) {
    const list = byUser.get(item.group.user_id) ?? [];
    list.push(item);
    byUser.set(item.group.user_id, list);
  }

  for (const [userId, items] of byUser) {
    try {
      const texts = items.map((i) => i.text);
      const embeddings = await embedTexts(userId, texts);
      const model = await resolveEmbeddingModel(userId);
      const now = new Date().toISOString();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const embedding = embeddings[i];
        if (!item || !embedding) continue;
        const { error: upsertError } = await client
          .from("business_chunks")
          .upsert(
            {
              user_id: item.group.user_id,
              entity_type: item.group.entity_type,
              entity_id: item.group.entity_id,
              content: item.text,
              embedding: formatVector(embedding),
              embedding_model: model,
              embedding_version: EMBEDDING_VERSION,
              updated_at: now,
            },
            { onConflict: "user_id,entity_type,entity_id" },
          );
        if (upsertError) {
          await markQueue(
            client,
            item.group.ids,
            "failed",
            `Upsert chunk thất bại: ${upsertError.message}`,
          );
          result.failed += 1;
        } else {
          await markQueue(client, item.group.ids, "done");
          result.upserted += 1;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      for (const item of items) {
        await markQueue(
          client,
          item.group.ids,
          "failed",
          `Embedding thất bại: ${message}`,
        );
        result.failed += 1;
      }
    }
  }

  result.duration_ms = Date.now() - startedAt;
  return result;
}
