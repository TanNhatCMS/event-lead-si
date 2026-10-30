import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";

import type {
  CardRecognitionProvider,
  RecognizedCard,
} from "./card-recognition";
import { getGatewayApiKey } from "./enrichment/model-config";
import type { AiModelConfigSource } from "./model-config";
import {
  createChatModelForLink,
  ModelFailoverError,
  runWithModelFailover,
  type ModelChainLink,
} from "./model-failover";
import { recordUsage } from "./usage";
import { getPrompt } from "./prompts/manager";

/**
 * Provider nhận dạng danh thiếp bằng MODEL AI CÓ KHẢ NĂNG XEM ẢNH (vision).
 *
 * Hai đường đi:
 * - "vision" (mặc định): qua AI Gateway (AI_GATEWAY_API_KEY), model dạng
 *   "openai/gpt-4o" — một key cho mọi nhà cung cấp.
 * - provider trực tiếp (openai, anthropic, google, xai…): gọi thẳng nhà cung
 *   cấp bằng `@ai-sdk/<provider>` với API key riêng, chọn ở trang Mô hình AI.
 *
 * FAILOVER: provider dựng một CHUỖI model (model chính + `config.fallbacks`
 * của capability card_recognition), mỗi mắt xích mang danh sách API key dự
 * phòng (DB đa key + legacy + env). Mỗi lượt `recognize()` tạo model mới cho
 * từng (link, key) và retry qua `runWithModelFailover` — lỗi retryable
 * (429/5xx/mạng/quota/model_not_found) thì sang key kế rồi model kế.
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

function dedupeKeys(keys: string[]): string[] {
  return Array.from(new Set(keys));
}

export class VisionCardRecognitionProvider implements CardRecognitionProvider {
  readonly name: string;
  private readonly chain: ModelChainLink[];

  /**
   * @param provider "vision" (qua AI Gateway) hoặc id provider trực tiếp
   *   ("openai", "anthropic", "google", …).
   * @param model Model id: với gateway dạng "openai/gpt-4o"; với provider
   *   trực tiếp là model id của nhà cung cấp (vd "gpt-4o"). Phải là model có
   *   khả năng đọc ảnh (vision).
   * @param baseUrl Base URL tuỳ chọn cho provider trực tiếp (proxy/self-host).
   * @param keys Danh sách API key của provider chính (từ `resolveProviderKeys`)
   *   — key[0] là key active; bù thêm `apiKey` nếu caller còn truyền key đơn.
   * @param fallbacks Các mắt xích dự phòng ĐÃ kèm keys (từ `buildFallbackLinks`).
   * @param source Nguồn cấu hình (database/env) — chỉ là metadata của link chính.
   */
  constructor(opts: {
    provider?: string;
    model: string;
    baseUrl?: string | null;
    apiKey?: string | null;
    keys?: string[];
    fallbacks?: ModelChainLink[];
    source?: AiModelConfigSource;
  }) {
    const model = opts.model.trim();
    if (!model) {
      throw new Error(
        "Provider nhận dạng danh thiếp cần cấu hình model (capability card_recognition trong trang Mô hình AI, hoặc biến CARD_RECOGNITION_MODEL).",
      );
    }

    const providerId = (opts.provider ?? "vision").trim().toLowerCase();
    this.name = providerId;

    const keys = dedupeKeys([
      ...(opts.keys ?? []),
      ...(opts.apiKey?.trim() ? [opts.apiKey.trim()] : []),
    ]);

    const primary: ModelChainLink = {
      provider: providerId,
      model,
      baseUrl: opts.baseUrl ?? null,
      keys,
      source: opts.source ?? "database",
    };

    if (
      (providerId === "vision" || providerId === "gateway") &&
      keys.length === 0 &&
      !getGatewayApiKey()
    ) {
      throw new Error(
        "Chưa cấu hình AI Gateway (AI_GATEWAY_API_KEY). Không thể nhận dạng bằng model AI.",
      );
    }

    this.chain = [primary, ...(opts.fallbacks ?? [])];

    // Kiểm tra sớm cấu hình mắt xích chính — giữ hành vi cũ: thiếu key/base URL
    // ném lỗi ngay khi dựng provider, không chờ đến lúc recognize().
    createChatModelForLink(primary);
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
      // Đo latency toàn lượt gọi (bao gồm các lượt failover bên trong).
      const startedAt = Date.now();
      const { result, used } = await runWithModelFailover({
        chain: this.chain,
        userId: input.userId ?? null,
        execute: (model) =>
          generateText({
            model,
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
          }),
      });
      generated = result;
      // Thống kê token/chi phí — best-effort (recordUsage tự nuốt lỗi).
      await recordUsage({
        userId: input.userId ?? null,
        source: "card_recognition",
        provider: used.provider,
        model: used.model,
        usage: generated.usage,
        latencyMs: Date.now() - startedAt,
        supabase:
          (input.supabase as import('@supabase/supabase-js').SupabaseClient | undefined) ??
          null,
      });
    } catch (err) {
      if (err instanceof ModelFailoverError) {
        // Message tĩnh + chi tiết từng lần thử ở field `attempts`.
        throw err;
      }
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
