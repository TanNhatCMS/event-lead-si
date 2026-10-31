import { z } from "zod";

/**
 * Các trường của danh thiếp mà agent làm giàu có thể gợi ý bổ sung.
 * Trùng tên field với RecognizedCard["fields"] để UI "Áp dụng" map 1-1.
 */
export const ENRICHABLE_FIELDS = [
  "fullName",
  "jobTitle",
  "companyName",
  "email",
  "phone",
  "address",
  "website",
] as const;

export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

export const enrichableFieldSchema = z.enum(ENRICHABLE_FIELDS);

/**
 * Đầu vào của agent: các giá trị trường đã biết (thường là kết quả OCR ở bước
 * review — người dùng đã sửa tay một phần). Trường trống = chưa có dữ liệu,
 * agent sẽ cố suy ra thêm hoặc bỏ qua.
 */
export const enrichmentInputSchema = z.object({
  fullName: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  website: z.string().trim().optional(),
});

export type EnrichmentInput = z.infer<typeof enrichmentInputSchema>;

/**
 * Một phát hiện của agent. NGUYÊN TẮC HIẾN CHƯƠNG "AI gợi ý, người quyết định":
 * finding chỉ mang giá trị + độ tin cậy + nguồn, KHÔNG tự ghi đè dữ liệu.
 */
export const enrichmentFindingSchema = z.object({
  field: enrichableFieldSchema,
  value: z.string().min(1, "Giá trị gợi ý không được rỗng"),
  confidence: z
    .number()
    .min(0, "Độ tin cậy phải từ 0 đến 1")
    .max(1, "Độ tin cậy phải từ 0 đến 1"),
  source: z.string().min(1, "Phải ghi rõ nguồn của gợi ý"),
  // Không validate .url() — URL do LLM bịa có thể sai format, loop sẽ tự làm sạch.
  sourceUrl: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export type EnrichmentFinding = z.infer<typeof enrichmentFindingSchema>;

/**
 * Trạng thái một lượt gọi tool trong step — pattern bóc từ ZCode
 * (`ToolCallState`/`ToolResultState` trong `agent/turn-state.ts`):
 * ZCode theo dõi từng tool call thành công/thất bại riêng, không chỉ tên tool.
 */
export const enrichmentToolCallStatusSchema = z.enum(["ok", "unavailable", "error"]);

export type EnrichmentToolCallStatus = z.infer<typeof enrichmentToolCallStatusSchema>;

export const enrichmentToolCallSchema = z.object({
  name: z.string(),
  status: enrichmentToolCallStatusSchema,
  /** Ghi chú ngắn khi không ok (VD: lý do unavailable, message lỗi). */
  note: z.string().optional(),
});

export type EnrichmentToolCall = z.infer<typeof enrichmentToolCallSchema>;

/**
 * Một bước trong vòng lặp agent (để hiển thị minh bạch quá trình).
 */
export const enrichmentStepSchema = z.object({
  step: z.number().int().min(1),
  /** Tên các tool đã gọi — giữ để tương thích UI cũ. */
  tools: z.array(z.string()),
  /** Chi tiết từng lượt gọi tool kèm trạng thái. */
  toolCalls: z.array(enrichmentToolCallSchema).default([]),
  summary: z.string(),
});

export type EnrichmentStep = z.infer<typeof enrichmentStepSchema>;

// ---------------------------------------------------------------------------
// Company findings — nghiên cứu hồ sơ doanh nghiệp (spec FR-008/FR-009)
// ---------------------------------------------------------------------------

/**
 * Các trường hồ sơ doanh nghiệp (bảng `companies`) mà agent nghiên cứu được
 * sau khi đã làm giàu dữ liệu contact. Tên trường khớp cột DB 1-1 để hàm
 * apply ghi thẳng (sau khi validate), chỉ điền trường còn trống.
 */
export const COMPANY_FIELDS = [
  "legal_name",
  "country_code",
  "industry",
  "market_summary",
  "employee_size_range",
  "founded_year",
  "products_summary",
  "tax_or_registration_id",
  "website",
] as const;

export type CompanyField = (typeof COMPANY_FIELDS)[number];

/**
 * Một phát hiện về công ty. KHÁC finding của contact: value luôn là CHUỖI
 * (kể cả founded_year — "1999" — hàm apply mới parse + validate số), và
 * `evidence` BẮT BUỘC là nguồn web agent tìm thấy (URL hoặc tên trang),
 * theo FR-009 phân biệt nguồn ngoài với dữ liệu user nhập.
 */
export const companyFindingSchema = z.object({
  value: z.string().min(1, "Giá trị gợi ý không được rỗng"),
  confidence: z
    .number()
    .min(0, "Độ tin cậy phải từ 0 đến 1")
    .max(1, "Độ tin cậy phải từ 0 đến 1"),
  evidence: z.string().min(1, "Phải ghi rõ nguồn web của phát hiện"),
  sourceUrl: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export type CompanyFinding = z.infer<typeof companyFindingSchema>;

export const companyFindingsSchema = z.object({
  legal_name: companyFindingSchema.optional(),
  country_code: companyFindingSchema.optional(),
  industry: companyFindingSchema.optional(),
  market_summary: companyFindingSchema.optional(),
  employee_size_range: companyFindingSchema.optional(),
  founded_year: companyFindingSchema.optional(),
  products_summary: companyFindingSchema.optional(),
  tax_or_registration_id: companyFindingSchema.optional(),
  website: companyFindingSchema.optional(),
});

export type CompanyFindings = z.infer<typeof companyFindingsSchema>;

// ---------------------------------------------------------------------------
// Lead assessment — chấm điểm độ nóng lead (AI gợi ý, không ghi đè contact)
// ---------------------------------------------------------------------------

/**
 * Đánh giá độ nóng lead do agent chấm sau khi làm giàu dữ liệu. CHỈ là gợi ý
 * hiển thị cho người dùng (badge + timeline) — KHÔNG tự đổi relationship_stage
 * hay labels của contact (hiến chương "AI gợi ý, người quyết định").
 */
export const leadAssessmentSchema = z.object({
  heat: z.enum(["hot", "warm", "cold"]),
  /** Độ tin cậy của mức heat vừa chấm (0–1). */
  heat_confidence: z
    .number()
    .min(0, "Độ tin cậy phải từ 0 đến 1")
    .max(1, "Độ tin cậy phải từ 0 đến 1"),
  /** Tối đa 5 nhãn gợi ý — UI tự merge, không ghi đè nhãn user đã tạo. */
  suggested_labels: z
    .array(z.string().min(1, "Nhãn không được rỗng").max(40))
    .max(5, "Tối đa 5 nhãn gợi ý"),
  /** Tóm tắt ngắn lý do chấm (tiếng Việt). */
  reason: z.string().min(1, "Phải nêu lý do chấm").max(500),
});

export type LeadAssessment = z.infer<typeof leadAssessmentSchema>;

export const enrichmentResultSchema = z.object({
  findings: z.array(enrichmentFindingSchema),
  company: companyFindingsSchema.optional(),
  lead_assessment: leadAssessmentSchema.optional(),
  steps: z.array(enrichmentStepSchema),
  modelUsed: z.string(),
});

export type EnrichmentResult = z.infer<typeof enrichmentResultSchema>;

/** Schema cho output có cấu trúc mà LLM trả ở bước cuối của vòng lặp. */
export const enrichmentOutputSchema = z.object({
  findings: z.array(enrichmentFindingSchema).max(10),
  company: companyFindingsSchema.optional(),
  lead_assessment: leadAssessmentSchema.optional(),
});

export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;
