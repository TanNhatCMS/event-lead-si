import "server-only";

import { createGateway, generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import type {
  CardRecognitionProvider,
  RecognizedCard,
} from "./card-recognition";
import { getGatewayApiKey } from "./enrichment/model-config";
import { createDirectModel, type DirectProviderId } from "./model-config";
import { getPrompt } from "./prompts/manager";

/**
 * Provider nhận dạng danh thiếp bằng MODEL AI CÓ KHẢ NĂNG XEM ẢNH (vision).
 *
 * Hai đường đi:
 * - "vision" (mặc định): qua AI Gateway (AI_GATEWAY_API_KEY), model dạng
 *   "openai/gpt-4o" — một key cho mọi nhà cung cấp.
 * - provider trực tiếp (openai, anthropic, google, xai…): gọi thẳng nhà cung
 *   cấp bằng `@ai-sdk/<provider>` với API key env riêng, chọn ở trang
 *   Mô hình AI.
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
  readonly name: string;
  private readonly languageModel: LanguageModel;

  /**
   * @param provider "vision" (qua AI Gateway) hoặc id provider trực tiếp
   *   ("openai", "anthropic", "google", …).
   * @param model Model id: với gateway dạng "openai/gpt-4o"; với provider
   *   trực tiếp là model id của nhà cung cấp (vd "gpt-4o"). Phải là model có
   *   khả năng đọc ảnh (vision).
   * @param baseUrl Base URL tuỳ chọn cho provider trực tiếp (proxy/self-host).
   */
  constructor(opts: {
    provider?: string;
    model: string;
    baseUrl?: string | null;
  }) {
    const model = opts.model.trim();
    if (!model) {
      throw new Error(
        "Provider nhận dạng danh thiếp cần cấu hình model (capability card_recognition trong trang Mô hình AI, hoặc biến CARD_RECOGNITION_MODEL).",
      );
    }

    const providerId = (opts.provider ?? "vision").trim().toLowerCase();
    this.name = providerId;

    if (providerId === "vision" || providerId === "gateway") {
      const apiKey = getGatewayApiKey();
      if (!apiKey) {
        throw new Error(
          "Chưa cấu hình AI Gateway (AI_GATEWAY_API_KEY). Không thể nhận dạng bằng model AI.",
        );
      }
      this.languageModel = createGateway({ apiKey })(model);
      return;
    }

    this.languageModel = createDirectModel(providerId as DirectProviderId, {
      model,
      baseUrl: opts.baseUrl ?? null,
    });
  }

  async recognize(input: {
    image: Uint8Array;
    mediaType: string;
    userId?: string;
    supabase?: unknown;
  }): Promise<RecognizedCard> {
    if (!input.image || input.image.length === 0) {
      throw new Error("Ảnh trống, không thể nhận dạng.");
    }
    if (input.mediaType === "image/heic") {
      throw new Error(
        "Ảnh HEIC chưa được hỗ trợ bởi provider vision. Vui lòng chụp/chọn lại ảnh JPG hoặc PNG.",
      );
    }

    const systemPrompt =
      input.userId && input.supabase
        ? await getPrompt(
            'card_recognize',
            input.userId,
            input.supabase as import('@supabase/supabase-js').SupabaseClient<import('@kit/supabase/database').Database>,
          )
        : (await import('./prompts/defaults')).getPromptDefault('card_recognize')?.content ?? '';

    let generated;
    try {
      generated = await generateText({
        model: this.languageModel,
        system: systemPrompt,
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
