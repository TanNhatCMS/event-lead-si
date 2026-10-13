import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isCardRecognitionEnabled,
  type CardRecognitionProvider,
  type RecognizedCard,
} from "./card-recognition";
import { resolveCardRecognitionConfig } from "./model-config";

/**
 * Provider nhận dạng danh thiếp GIẢ LẬP dùng cho phát triển UI và demo.
 *
 * Trả về một trong 3 danh thiếp mẫu tiếng Việt (xoay vòng theo hash của ảnh),
 * cố tình chứa field ở trạng thái `uncertain` và `missing` để UI thể hiện đúng
 * các trạng thái cần người dùng kiểm tra kỹ.
 *
 * KHÔNG dùng cho dữ liệu thật. Khi provider OCR thật được duyệt, tạo class mới
 * implements `CardRecognitionProvider` và đăng ký trong `getCardRecognitionProvider`.
 */

interface SampleField {
  rawValue: string | null;
  normalizedValue: string | null;
  state: "extracted" | "missing" | "uncertain";
}

type CardFields = Record<
  "fullName" | "jobTitle" | "companyName" | "email" | "phone" | "address" | "website",
  SampleField
>;

const SAMPLES: Array<{ detectedLanguage: "vi"; fields: CardFields }> = [
  {
    detectedLanguage: "vi",
    fields: {
      fullName: { rawValue: null, normalizedValue: "Nguyễn Văn An", state: "extracted" },
      jobTitle: { rawValue: null, normalizedValue: "Giám đốc Kinh doanh", state: "extracted" },
      companyName: {
        rawValue: "CÔNG TY CỔ PHẦN CÔNG NGHỆ SAO VIỆT",
        normalizedValue: "Công ty Cổ phần Công nghệ Sao Việt",
        state: "extracted",
      },
      email: { rawValue: null, normalizedValue: "an.nguyen@saoviet.vn", state: "extracted" },
      phone: { rawValue: "0912 345 678", normalizedValue: "+84 912 345 678", state: "extracted" },
      address: {
        rawValue: "Tâng 12, Tòa nhà Bitexco, Quân 1, TP. Hô Chí Minh",
        normalizedValue: "Tầng 12, Tòa nhà Bitexco, Quận 1, TP. Hồ Chí Minh",
        state: "uncertain",
      },
      website: { rawValue: null, normalizedValue: null, state: "missing" },
    },
  },
  {
    detectedLanguage: "vi",
    fields: {
      fullName: { rawValue: null, normalizedValue: "Trần Thị Bích Ngọc", state: "extracted" },
      jobTitle: { rawValue: null, normalizedValue: null, state: "missing" },
      companyName: {
        rawValue: "NGÂN HÀNG TMCP PHƯƠNG DÔNG",
        normalizedValue: "Ngân hàng TMCP Phương Đông",
        state: "extracted",
      },
      email: {
        rawValue: "bich.ngoc@ocb,com.vn",
        normalizedValue: "bich.ngoc@ocb.com.vn",
        state: "uncertain",
      },
      phone: { rawValue: null, normalizedValue: "+84 908 112 233", state: "extracted" },
      address: {
        rawValue: null,
        normalizedValue: "41 Lê Duẩn, Bến Nghé, Quận 1, TP. Hồ Chí Minh",
        state: "extracted",
      },
      website: { rawValue: null, normalizedValue: "https://www.ocb.com.vn", state: "extracted" },
    },
  },
  {
    detectedLanguage: "vi",
    fields: {
      fullName: { rawValue: "Lê Hoàng Phuc", normalizedValue: "Lê Hoàng Phúc", state: "uncertain" },
      jobTitle: { rawValue: null, normalizedValue: "Trưởng phòng Marketing", state: "extracted" },
      companyName: { rawValue: null, normalizedValue: "Công ty TNHH Du lịch Việt An", state: "extracted" },
      email: { rawValue: null, normalizedValue: "phuc.le@vietan.travel", state: "extracted" },
      phone: { rawValue: "+84 935 667 78B", normalizedValue: "+84 935 667 788", state: "uncertain" },
      address: { rawValue: null, normalizedValue: null, state: "missing" },
      website: { rawValue: null, normalizedValue: "https://vietan.travel", state: "extracted" },
    },
  },
];

function pickSample(image: Uint8Array) {
  let hash = image.length >>> 0;
  const step = Math.max(1, Math.floor(image.length / 1024));
  for (let i = 0; i < image.length; i += step) {
    hash = (hash * 31 + image[i]) >>> 0;
  }
  return SAMPLES[hash % SAMPLES.length];
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockCardRecognitionProvider implements CardRecognitionProvider {
  readonly name = "mock";

  async recognize(input: { image: Uint8Array; mediaType: string }): Promise<RecognizedCard> {
    if (!input.image || input.image.length === 0) {
      throw new Error("Ảnh trống, không thể nhận dạng.");
    }
    // Giả lập độ trễ xử lý của provider thật.
    await delay(1200);

    const sample = pickSample(input.image);
    return {
      schemaVersion: 1,
      detectedLanguage: sample.detectedLanguage,
      fields: { ...sample.fields },
    };
  }
}

export interface GetCardRecognitionProviderOpts {
  /**
   * Id tổ chức để ưu tiên cấu hình từ bảng `ai_model_configs`
   * (xem `resolveCardRecognitionConfig`). Bỏ qua để dùng env như trước đây.
   */
  organizationId?: string;
  /** Client Supabase của user (đã qua RLS) dùng để đọc `ai_model_configs`. */
  supabase?: SupabaseClient;
}

/**
 * Chọn provider nhận dạng danh thiếp.
 *
 * - Khi truyền `organizationId` + `supabase`: ưu tiên cấu hình DB của tổ chức
 *   (trang /cai-dat/ai-models), fallback sang env.
 * - Mặc định: `MockCardRecognitionProvider` (dữ liệu mẫu, không gọi dịch vụ ngoài).
 *
 * TODO: đăng ký provider thật tại đây khi OCR provider được chọn và phê duyệt
 * (specs/001-event-lead-platform, plan.md Giai đoạn 0.3). Khi đó cập nhật thêm
 * ALLOWED_PROVIDERS trong src/app/cai-dat/ai-models/actions.ts.
 */
export async function getCardRecognitionProvider(
  opts?: GetCardRecognitionProviderOpts,
): Promise<CardRecognitionProvider> {
  const resolved = await resolveCardRecognitionConfig(opts?.organizationId, opts?.supabase);
  if (resolved.provider && resolved.provider !== "mock") {
    // TODO: đăng ký provider thật tại đây khi được phê duyệt.
    throw new Error(
      `Provider nhận dạng "${resolved.provider}" chưa được triển khai. Chỉ hỗ trợ "mock" ở thời điểm hiện tại.`,
    );
  }
  return new MockCardRecognitionProvider();
}

export { isCardRecognitionEnabled };
