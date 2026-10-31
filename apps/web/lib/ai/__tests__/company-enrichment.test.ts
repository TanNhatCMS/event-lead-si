import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { enrichmentOutputSchema } from "../enrichment/types";
import {
  applyCompanyFindings,
  nextProfileStateAfterEnrichment,
  normalizeCompanyFieldValue,
  selectCompanyUpdates,
} from "../enrichment/apply";

/**
 * Kiểm thử nghiên cứu hồ sơ công ty (FR-008/FR-009):
 * - Schema company findings của output agent.
 * - Logic "chỉ điền trường trống" + validate/normalize giá trị.
 * - Chuyển trạng thái profile_state.
 * - applyCompanyFindings với Supabase client giả (không gọi mạng, không DB).
 */

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";

describe("enrichmentOutputSchema — company findings", () => {
  it("nhận output có findings + company kèm confidence/evidence", () => {
    const parsed = enrichmentOutputSchema.parse({
      findings: [],
      company: {
        founded_year: { value: "1999", confidence: 0.9, evidence: "saoviet.com.vn/gioi-thieu" },
        country_code: { value: "vn", confidence: 1, evidence: "Wikipedia", sourceUrl: "https://vi.wikipedia.org/wiki/Sao_Viet" },
      },
    });
    expect(parsed.company?.founded_year?.value).toBe("1999");
    expect(parsed.company?.country_code?.sourceUrl).toContain("wikipedia.org");
  });

  it("company là tùy chọn — output cũ chỉ findings vẫn parse được", () => {
    const parsed = enrichmentOutputSchema.parse({ findings: [] });
    expect(parsed.company).toBeUndefined();
  });

  it("chặn confidence ngoài 0..1 và evidence rỗng", () => {
    expect(
      enrichmentOutputSchema.safeParse({
        company: { industry: { value: "CNTT", confidence: 1.5, evidence: "x" } },
      }).success,
    ).toBe(false);
    expect(
      enrichmentOutputSchema.safeParse({
        company: { industry: { value: "CNTT", confidence: 0.9, evidence: "" } },
      }).success,
    ).toBe(false);
  });
});

describe("normalizeCompanyFieldValue", () => {
  it("country_code: 2 chữ cái, tự viết hoa; sai thì bỏ", () => {
    expect(normalizeCompanyFieldValue("country_code", " vn ")).toBe("VN");
    expect(normalizeCompanyFieldValue("country_code", "VNM")).toBeNull();
    expect(normalizeCompanyFieldValue("country_code", "12")).toBeNull();
  });

  it("founded_year: parse số trong 1000-2200; sai thì bỏ", () => {
    expect(normalizeCompanyFieldValue("founded_year", " 1999 ")).toBe(1999);
    expect(normalizeCompanyFieldValue("founded_year", "thành lập 2005")).toBe(2005);
    expect(normalizeCompanyFieldValue("founded_year", "999")).toBeNull();
    expect(normalizeCompanyFieldValue("founded_year", "3000")).toBeNull();
    expect(normalizeCompanyFieldValue("founded_year", "không rõ")).toBeNull();
  });

  it("website: tự thêm https:// và validate URL; sai thì bỏ", () => {
    expect(normalizeCompanyFieldValue("website", "saoviet.com.vn")).toBe(
      "https://saoviet.com.vn/",
    );
    expect(normalizeCompanyFieldValue("website", "http://ocb.com.vn")).toBe(
      "http://ocb.com.vn/",
    );
    expect(normalizeCompanyFieldValue("website", "not a url")).toBeNull();
    expect(normalizeCompanyFieldValue("website", "  ")).toBeNull();
  });

  it("trường text: trim, giữ nguyên", () => {
    expect(normalizeCompanyFieldValue("industry", "  CNTT  ")).toBe("CNTT");
  });
});

describe("nextProfileStateAfterEnrichment", () => {
  it("nâng user_provided/needs_review lên partially_verified", () => {
    expect(nextProfileStateAfterEnrichment("user_provided")).toBe("partially_verified");
    expect(nextProfileStateAfterEnrichment("needs_review")).toBe("partially_verified");
  });

  it("không đổi verified/partially_verified", () => {
    expect(nextProfileStateAfterEnrichment("verified")).toBeNull();
    expect(nextProfileStateAfterEnrichment("partially_verified")).toBeNull();
  });
});

describe("selectCompanyUpdates — chỉ điền trường trống", () => {
  const findings = {
    legal_name: { value: "Công ty CP Sao Việt", confidence: 0.9, evidence: "web" },
    industry: { value: "CNTT", confidence: 0.8, evidence: "web" },
    website: { value: "https://saoviet.com.vn", confidence: 0.7, evidence: "web" },
    founded_year: { value: "1999", confidence: 0.6, evidence: "web" },
    tax_or_registration_id: { value: "0123456789", confidence: 0.3, evidence: "web" },
    country_code: { value: "VNM", confidence: 0.9, evidence: "web" },
  };

  it("bỏ qua trường đã có giá trị, confidence thấp, giá trị sai", () => {
    const { updates, skipped } = selectCompanyUpdates(
      { industry: "Đã có", website: "https://da-co.vn" },
      findings,
    );
    expect(updates).toEqual({
      legal_name: "Công ty CP Sao Việt",
      founded_year: 1999,
    });
    const reasons = skipped.map((s) => [s.field, s.reason]);
    expect(reasons).toContainEqual(["industry", "already_filled"]);
    expect(reasons).toContainEqual(["website", "already_filled"]);
    expect(reasons).toContainEqual(["tax_or_registration_id", "low_confidence"]);
    expect(reasons).toContainEqual(["country_code", "invalid_value"]);
  });

  it("không có findings thì không cập nhật gì", () => {
    const { updates, skipped } = selectCompanyUpdates({}, {});
    expect(updates).toEqual({});
    expect(skipped).toEqual([]);
  });
});

interface FakeRow {
  [key: string]: unknown;
}

/**
 * Supabase client giả: bảng companies trả row cho maybeSingle và ghi nhận
 * update; bảng audit_logs ghi nhận insert. Không mạng, không DB thật.
 */
function fakeSupabase(options: { row?: FakeRow | null; failUpdate?: boolean } = {}) {
  const state = {
    companyUpdate: null as Record<string, unknown> | null,
    auditInsert: null as Record<string, unknown> | null,
  };
  const companyRow = options.row === undefined
    ? {
        id: COMPANY_ID,
        legal_name: null,
        country_code: "VN",
        industry: null,
        market_summary: null,
        employee_size_range: null,
        founded_year: null,
        products_summary: null,
        tax_or_registration_id: null,
        website: null,
        profile_state: "user_provided",
      }
    : options.row;
  const client = {
    from(table: string) {
      if (table === "companies") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle() {
                        return Promise.resolve({ data: companyRow, error: null });
                      },
                    };
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            state.companyUpdate = payload;
            return {
              eq() {
                return {
                  eq() {
                    return Promise.resolve(
                      options.failUpdate
                        ? { error: { message: "boom" } }
                        : { error: null },
                    );
                  },
                };
              },
            };
          },
        };
      }
      if (table === "audit_logs") {
        return {
          insert(row: Record<string, unknown>) {
            state.auditInsert = row;
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  };
  return { client: client as unknown as SupabaseClient, state };
}

describe("applyCompanyFindings", () => {
  it("điền đúng các trường trống + nâng profile_state + ghi audit", async () => {
    const fake = fakeSupabase();

    const outcome = await applyCompanyFindings(
      USER_ID,
      COMPANY_ID,
      {
        legal_name: { value: "Công ty CP Sao Việt", confidence: 0.9, evidence: "saoviet.com.vn" },
        country_code: { value: "VN", confidence: 1, evidence: "web" },
      },
      fake.client,
    );

    expect(outcome.error).toBeNull();
    expect(outcome.appliedFields).toEqual(["legal_name"]);
    expect(outcome.profileState).toBe("partially_verified");
    expect(fake.state.companyUpdate).toMatchObject({
      legal_name: "Công ty CP Sao Việt",
      profile_state: "partially_verified",
    });
    expect(fake.state.auditInsert).toMatchObject({
      action: "company.enriched",
      entity_type: "company",
      entity_id: COMPANY_ID,
      user_id: USER_ID,
    });
  });

  it("không ghi đè trường đã có + bỏ confidence thấp", async () => {
    const fake = fakeSupabase();

    const outcome = await applyCompanyFindings(
      USER_ID,
      COMPANY_ID,
      {
        country_code: { value: "VN", confidence: 1, evidence: "web" },
        industry: { value: "CNTT", confidence: 0.2, evidence: "web" },
      },
      fake.client,
    );

    expect(outcome.appliedFields).toEqual([]);
    expect(outcome.skipped.map((s) => s.reason)).toEqual(
      expect.arrayContaining(["already_filled", "low_confidence"]),
    );
    expect(fake.state.companyUpdate).toBeNull();
    expect(fake.state.auditInsert).toBeNull();
  });

  it("công ty không thuộc user → error not_found, không ghi gì", async () => {
    const fake = fakeSupabase({ row: null });
    const outcome = await applyCompanyFindings(
      USER_ID,
      COMPANY_ID,
      { industry: { value: "CNTT", confidence: 0.9, evidence: "web" } },
      fake.client,
    );
    expect(outcome.error).toBe("not_found");
    expect(outcome.appliedFields).toEqual([]);
    expect(fake.state.auditInsert).toBeNull();
  });

  it("findings sai schema → invalid_findings, không ghi gì", async () => {
    const fake = fakeSupabase();
    const outcome = await applyCompanyFindings(
      USER_ID,
      COMPANY_ID,
      { industry: { value: "CNTT", confidence: "không phải số", evidence: "web" } },
      fake.client,
    );
    expect(outcome.error).toBe("invalid_findings");
    expect(fake.state.companyUpdate).toBeNull();
  });

  it("lỗi UPDATE → error update_failed, không ghi audit", async () => {
    const fake = fakeSupabase({ failUpdate: true });
    const outcome = await applyCompanyFindings(
      USER_ID,
      COMPANY_ID,
      { industry: { value: "CNTT", confidence: 0.9, evidence: "web" } },
      fake.client,
    );
    expect(outcome.error).toBe("update_failed");
    expect(fake.state.auditInsert).toBeNull();
  });
});
