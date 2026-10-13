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

export const enrichmentResultSchema = z.object({
  findings: z.array(enrichmentFindingSchema),
  steps: z.array(enrichmentStepSchema),
  modelUsed: z.string(),
});

export type EnrichmentResult = z.infer<typeof enrichmentResultSchema>;

/** Schema cho output có cấu trúc mà LLM trả ở bước cuối của vòng lặp. */
export const enrichmentOutputSchema = z.object({
  findings: z.array(enrichmentFindingSchema).max(10),
});

export type EnrichmentOutput = z.infer<typeof enrichmentOutputSchema>;
