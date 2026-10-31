import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@kit/supabase/database";

import { logAudit } from "~/lib/audit/log-audit";

import {
  COMPANY_FIELDS,
  companyFindingsSchema,
  type CompanyField,
  type CompanyFindings,
} from "./types";

/**
 * Áp kết quả nghiên cứu company của agent enrichment vào bảng `companies`.
 *
 * ĐƯỜNG NỀN (durable workflow): khi run enrichment cho contact có company_id
 * hoàn tất, `workflow.ts` gọi `applyCompanyFindings` để điền các trường công
 * ty CÒN TRỐNG từ `result.company`. Đường sync panel (recognition-review)
 * KHÔNG tự ghi — frontend sẽ gọi PATCH /api/companies/[id] (người quyết định).
 *
 * NGUYÊN TẮC (hiến chương "AI gợi ý, người quyết định" + FR-009):
 * - CHỈ điền trường đang trống — không ghi đè giá trị user đã nhập.
 * - confidence < MIN_CONFIDENCE (0.5) bị bỏ qua.
 * - Mọi giá trị được validate/normalize trước khi ghi (country_code 2 chữ,
 *   founded_year 1000–2200, website URL http(s)).
 * - Có ít nhất 1 trường được điền → `profile_state` nâng lên
 *   'partially_verified' (chỉ từ 'user_provided'/'needs_review'; không bao
 *   giờ hạ 'verified').
 * - Toàn bộ nguồn ghi vào audit_logs (action 'company.enriched') — company
 *   level không dùng contact_field_evidence (bảng đó là của contact).
 */

/** Ngưỡng tối thiểu để áp một gợi ý company. */
export const MIN_CONFIDENCE = 0.5;

const COMPANY_PROFILE_STATES = [
  "user_provided",
  "partially_verified",
  "verified",
  "needs_review",
] as const;

export type CompanyProfileState = (typeof COMPANY_PROFILE_STATES)[number];

/** Các cột companies mà apply đọc để biết trường nào còn trống. */
export const COMPANY_CURRENT_COLUMNS = [
  "id",
  "legal_name",
  "country_code",
  "industry",
  "market_summary",
  "employee_size_range",
  "founded_year",
  "products_summary",
  "tax_or_registration_id",
  "website",
  "profile_state",
] as const;

export interface CompanyCurrentRow {
  id: string;
  legal_name: string | null;
  country_code: string | null;
  industry: string | null;
  market_summary: string | null;
  employee_size_range: string | null;
  founded_year: number | null;
  products_summary: string | null;
  tax_or_registration_id: string | null;
  website: string | null;
  profile_state: string;
}

export interface CompanyUpdateOutcome {
  /** Các trường đã điền (đúng tên cột DB). Rỗng = không ghi gì. */
  appliedFields: CompanyField[];
  /** Các gợi ý bị bỏ qua kèm lý do (confidence thấp / giá trị sai / đã có). */
  skipped: Array<{ field: CompanyField; reason: string }>;
  /** Trạng thái sau khi áp; null khi không đổi. */
  profileState: CompanyProfileState | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hàm thuần (pure) — test được mà không cần DB/mạng
// ---------------------------------------------------------------------------

/** Normalize + validate giá trị một trường company. Trả null khi bỏ qua. */
export function normalizeCompanyFieldValue(
  field: CompanyField,
  raw: string,
): string | number | null {
  const value = raw.trim();
  if (!value) return null;

  if (field === "country_code") {
    const code = value.toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
  }

  if (field === "founded_year") {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return null;
    const year = Number.parseInt(digits, 10);
    if (!Number.isFinite(year) || year < 1000 || year > 2200) return null;
    return year;
  }

  if (field === "website") {
    const withScheme = /^https?:\/\//i.test(value) ? value : "https://" + value;
    try {
      const url = new URL(withScheme);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  return value;
}

/**
 * Trạng thái profile_state sau khi áp gợi ý AI: nâng lên 'partially_verified'
 * khi đang 'user_provided' hoặc 'needs_review'; giữ nguyên các trạng thái
 * khác (không bao giờ hạ 'verified' hay đụng 'partially_verified').
 */
export function nextProfileStateAfterEnrichment(
  current: string,
): CompanyProfileState | null {
  if (current === "user_provided" || current === "needs_review") {
    return "partially_verified";
  }
  return null;
}

export interface CompanyUpdates {
  updates: Partial<Record<CompanyField, string | number>>;
  skipped: CompanyUpdateOutcome["skipped"];
}

/**
 * Đổi map updates (key = tên trường findings) thành payload khớp kiểu Update
 * của bảng companies: text fields là string, founded_year là number.
 */
export function toCompanyUpdate(
  updates: CompanyUpdates["updates"],
): Database["public"]["Tables"]["companies"]["Update"] {
  const payload: Database["public"]["Tables"]["companies"]["Update"] = {};
  for (const field of COMPANY_FIELDS) {
    const value = updates[field];
    if (value === undefined) continue;
    switch (field) {
      case "legal_name":
        payload.legal_name = String(value);
        break;
      case "country_code":
        payload.country_code = String(value);
        break;
      case "industry":
        payload.industry = String(value);
        break;
      case "market_summary":
        payload.market_summary = String(value);
        break;
      case "employee_size_range":
        payload.employee_size_range = String(value);
        break;
      case "founded_year":
        payload.founded_year = Number(value);
        break;
      case "products_summary":
        payload.products_summary = String(value);
        break;
      case "tax_or_registration_id":
        payload.tax_or_registration_id = String(value);
        break;
      case "website":
        payload.website = String(value);
        break;
    }
  }
  return payload;
}

/** Giá trị hiện tại của các trường company — CompanyCurrentRow thỏa kiểu này. */
export type CompanyCurrentValues = Partial<
  Record<CompanyField, string | number | null>
>;

/**
 * Chọn các gợi ý đáng áp: chỉ trường đang trống, confidence đủ ngưỡng,
 * giá trị normalize/validate thành công.
 */
export function selectCompanyUpdates(
  current: CompanyCurrentValues,
  findings: CompanyFindings,
  minConfidence: number = MIN_CONFIDENCE,
): CompanyUpdates {
  const updates: CompanyUpdates["updates"] = {};
  const skipped: CompanyUpdates["skipped"] = [];

  for (const field of COMPANY_FIELDS) {
    const finding = findings[field];
    if (!finding) continue;

    const existing = current[field];
    const hasValue =
      typeof existing === "string"
        ? existing.trim().length > 0
        : existing !== null && existing !== undefined;

    if (hasValue) {
      skipped.push({ field, reason: "already_filled" });
      continue;
    }

    if (finding.confidence < minConfidence) {
      skipped.push({ field, reason: "low_confidence" });
      continue;
    }

    const normalized = normalizeCompanyFieldValue(field, finding.value);
    if (normalized === null) {
      skipped.push({ field, reason: "invalid_value" });
      continue;
    }

    updates[field] = normalized;
  }

  return { updates, skipped };
}

// ---------------------------------------------------------------------------
// Hàm áp vào DB — dùng ở đường nền (workflow step, admin client)
// ---------------------------------------------------------------------------

type ApplyClient = SupabaseClient<Database>;

/**
 * Áp company findings vào một công ty của đúng `userId`.
 *
 * - Công ty không tồn tại / không thuộc user → trả `error: 'not_found'`
 *   (không ném — caller quyết định log hay bỏ qua).
 * - Không có trường nào đáng áp → không UPDATE, không audit, trả rỗng.
 * - Có ít nhất 1 trường → UPDATE + nâng profile_state (nếu cần) + audit
 *   'company.enriched' với đầy đủ confidence/evidence trong metadata.
 * - Lỗi UPDATE/audit không ném ra ngoài (best-effort, đường nền không được
 *   làm fail run enrichment vì phần apply công ty).
 */
export async function applyCompanyFindings(
  userId: string,
  companyId: string,
  companyFindings: unknown,
  supabase: ApplyClient,
): Promise<CompanyUpdateOutcome> {
  const emptyOutcome: CompanyUpdateOutcome = {
    appliedFields: [],
    skipped: [],
    profileState: null,
    error: null,
  };

  // Parse chống dữ liệu bẩn từ LLM — schema sai coi như không có gợi ý nào.
  const parsed = companyFindingsSchema.safeParse(companyFindings);
  if (!parsed.success) {
    return { ...emptyOutcome, error: "invalid_findings" };
  }
  const findings = parsed.data;

  const { data: company, error } = await supabase
    .from("companies")
    .select(COMPANY_CURRENT_COLUMNS.join(", "))
    .eq("id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { ...emptyOutcome, error: "lookup_failed" };
  }
  if (!company) {
    return { ...emptyOutcome, error: "not_found" };
  }
  const current = company as unknown as CompanyCurrentRow;

  const { updates, skipped } = selectCompanyUpdates(current, findings);
  const appliedFields = Object.keys(updates) as CompanyField[];
  if (appliedFields.length === 0) {
    return { appliedFields: [], skipped, profileState: null, error: null };
  }

  const nextState = nextProfileStateAfterEnrichment(current.profile_state);
  const updatePayload = toCompanyUpdate(updates);
  if (nextState) updatePayload.profile_state = nextState;

  const { error: updateError } = await supabase
    .from("companies")
    .update(updatePayload)
    .eq("id", companyId)
    .eq("user_id", userId);

  if (updateError) {
    return {
      appliedFields: [],
      skipped,
      profileState: null,
      error: "update_failed",
    };
  }

  // Audit: mỗi nguồn một mục trong metadata — truy vết được FR-009.
  const fieldSources: Record<string, Json> = {};
  for (const field of appliedFields) {
    const finding = findings[field];
    fieldSources[field] = {
      value: String(updates[field]),
      confidence: finding?.confidence ?? null,
      evidence: finding?.evidence ?? null,
      source_url: finding?.sourceUrl ?? null,
    };
  }
  await logAudit(supabase, userId, {
    action: "company.enriched",
    entityType: "company",
    entityId: companyId,
    summary:
      "AI điền " + appliedFields.length + " trường công ty còn trống: " +
      appliedFields.join(", "),
    metadata: { fields: fieldSources, profile_state: nextState ?? current.profile_state },
  });

  return {
    appliedFields,
    skipped,
    profileState: nextState,
    error: null,
  };
}
