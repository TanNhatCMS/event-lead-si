import "server-only";

import { createGateway, generateText, Output } from "ai";
import { z } from "zod";

import type {
  CardRecognitionProvider,
  RecognizedCard,
} from "./card-recognition";
import { getGatewayApiKey } from "./enrichment/model-config";

/**
 * Provider nhận dạng danh thiếp bằng MODEL AI CÓ KHẢ NĂNG XEM ẢNH (vision),
 * chạy qua AI Gateway đã cấu hình (AI_GATEWAY_API_KEY).
 *
 * Không phải OCR API chuyên dụng (Google Vision/Azure) — theo quyết định của
 * người dùng ngày 2026-10-13, OCR thật = model AI đọc ảnh và trích xuất
 * thông tin có cấu trúc.
 *
 * Luồng: ảnh danh thiếp -> vision model -> JSON 7 trường kèm confidence ->
 * map sang RecognizedCard (confidence thấp => `uncertain`, trống => `missing`).
 * Kết quả vẫn phải qua bước review của người dùng trước khi lưu (hiến chương
 * "con người kiểm soát" không đổi).
 */

const FIELD_KEYS = [
  "fullName",
  "jobTitle",
  "companyName",
  "email",
  "phone",
  "address",
  "website",
] as const;

const visionFieldSchema = z.object({
  /** Giá trị đọc được trên ảnh, null khi không thấy trường này. */
  value: z.string().nullable(),
  /** Độ tin cậy 0..1 của model cho giá trị trên. */
  confidence: z.number().min(0).max(1),
});

const visionOutputSchema = z.object({
  detectedLanguage: z.enum(["vi", "en", "ko", "ja", "zh", "unknown"]),
  fields: z.object({
    fullName: visionFieldSchema,
    jobTitle: visionFieldSchema,
    companyName: visionFieldSchema,
    email: visionFieldSchema,
    phone: visionFieldSchema,
    address: visionFieldSchema,
    website: visionFieldSchema,
  }),
});

const SYSTEM_PROMPT = `Bạn trích xuất thông tin liên hệ từ ảnh danh thiếp (business card).

Nguyên tắc bắt buộc:
- Chỉ trích xuất những gì NHÌN THẤY RÕ trên ảnh. Không đoán, không bịa, không tự điền.
- Trường nào không có trên ảnh: value = null, confidence = 0.
- confidence: 1.0 = đọc chắc chắn; 0.5-0.8 = đọc được nhưng mờ/nghi ngờ (ví dụ ký tự dễ nhầm như 0/O, 1/l); dưới 0.5 = không chắc.
- Giữ nguyên giá trị như trên ảnh (kể cả viết hoa, dấu câu). Không chuẩn hóa SĐT hay địa chỉ.
- detectedLanguage: ngôn ngữ chính của danh thiếp (vi/en/ko/ja/zh/unknown).
- Trả về đúng schema JSON được yêu cầu, không thêm giải thích.`;

const USER_PROMPT =
  "Trích xuất 7 trường (họ tên, chức danh, công ty, email, điện thoại, địa chỉ, website) từ ảnh danh thiếp này.";

function toRecognizedCard(output: z.infer<typeof visionOutputSchema>): RecognizedCard {
  const fields = {} as RecognizedCard["fields"];
  for (const key of FIELD_KEYS) {
    const f = output.fields[key];
    const value = f.value?.trim() || null;
    fields[key] = {
      rawValue: value,
      normalizedValue: value,
      state:
        value == null || f.confidence < 0.4
          ? "missing"
          : f.confidence < 0.75
            ? "uncertain"
            : "extracted",
    };
  }
  return {
    schemaVersion: 1,
    detectedLanguage: output.detectedLanguage,
    fields,
  };
}

export class VisionCardRecognitionProvider implements CardRecognitionProvider {
  readonly name = "vision";
  private readonly model: string;

  /**
   * @param model Model id cho AI Gateway, ví dụ "openai/gpt-4o".
   *   Phải là model có khả năng đọc ảnh (vision).
   */
  constructor(opts: { model: string }) {
    const model = opts.model.trim();
    if (!model) {
      throw new Error(
        "Provider vision cần cấu hình model (capability card_recognition trong trang Mô hình AI, hoặc biến CARD_RECOGNITION_MODEL).",
      );
    }
    this.model = model;
  }

  async recognize(input: {
    image: Uint8Array;
    mediaType: string;
  }): Promise<RecognizedCard> {
    if (!input.image || input.image.length === 0) {
      throw new Error("Ảnh trống, không thể nhận dạng.");
    }
    if (input.mediaType === "image/heic") {
      throw new Error(
        "Ảnh HEIC chưa được hỗ trợ bởi provider vision. Vui lòng chụp/chọn lại ảnh JPG hoặc PNG.",
      );
    }

    const apiKey = getGatewayApiKey();
    if (!apiKey) {
      throw new Error(
        "Chưa cấu hình AI Gateway (AI_GATEWAY_API_KEY). Không thể nhận dạng bằng model AI.",
      );
    }

    const provider = createGateway({ apiKey });

    let generated;
    try {
      generated = await generateText({
        model: provider(this.model),
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", image: input.image },
              { type: "text", text: USER_PROMPT },
            ],
          },
        ],
        output: Output.object({ schema: visionOutputSchema }),
        maxOutputTokens: 1500,
        experimental_telemetry: { isEnabled: true },
      });
    } catch (err) {
      throw new Error(
        "Model AI đọc ảnh thất bại: " +
          (err instanceof Error ? err.message : "lỗi không xác định"),
      );
    }

    if (!generated.output) {
      throw new Error("Model AI không trả về kết quả có cấu trúc.");
    }

    return toRecognizedCard(generated.output);
  }
}
