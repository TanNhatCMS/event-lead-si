import type { LanguageModel } from "ai";

import {
  createChatModelForLink,
  isRetryableModelError,
  type ModelChainLink,
} from "../../lib/ai/model-failover";

/**
 * LanguageModel bọc chuỗi failover của EventLead cho agent eve.
 *
 * eve nhận model qua `defineDynamic` ở `agent/agent.ts` (chỉ `step.started`
 * được phép trả về một LanguageModel "sống" — xem docs/agent-config.md của
 * eve). Wrapper này dựng model tương ứng cho TỪNG (link, key) bằng
 * `createChatModelForLink` rồi luân phiên:
 *
 * - `doGenerate`: gọi thử — lỗi retryable (401/402/429/5xx, mạng,
 *   model_not_found…) → sang key/link kế; lỗi không retryable → ném lại.
 * - `doStream`: đọc SỚM phần đầu của stream — phần `error` (lỗi request-time)
 *   được phân loại như trên; khi đã có phần dữ liệu đầu tiên thì trả một
 *   stream mới phát lại phần đó + toàn bộ phần còn lại.
 *
 * GIỚI HẠN ĐÃ BIẾT (giống RAG chat): lỗi xảy ra GIỮA stream sau khi đã phát
 * dữ liệu không failover được — AI SDK đã nhận các phần đó rồi.
 */

/** Chụp shape V4 từ union `LanguageModel` của AI SDK (không cần @ai-sdk/provider). */
type LanguageModelV4Like = Extract<LanguageModel, { specificationVersion: "v4" }>;
type V4CallOptions = Parameters<LanguageModelV4Like["doGenerate"]>[0];
type V4GenerateResult = Awaited<ReturnType<LanguageModelV4Like["doGenerate"]>>;
type V4StreamResult = Awaited<ReturnType<LanguageModelV4Like["doStream"]>>;
type V4StreamPart = V4StreamResult["stream"] extends ReadableStream<infer T>
  ? T
  : never;

/** Một lượt thử: một link trong chuỗi với MỘT key tường minh (null = không key). */
interface ModelAttempt {
  readonly link: ModelChainLink;
  readonly keyIndex: number;
  readonly apiKey: string | null;
}

/** Mở rộng chuỗi thành danh sách lượt thử theo thứ tự: link 0 key 0,1… → link 1… */
function expandAttempts(chain: readonly ModelChainLink[]): ModelAttempt[] {
  const attempts: ModelAttempt[] = [];
  for (const link of chain) {
    // Link không có key nào: vẫn thử 1 lần không key (openai-compatible
    // self-host có thể không cần key) để lấy lỗi cấu hình rõ ràng.
    const keys: ReadonlyArray<string | null> =
      link.keys.length > 0 ? link.keys : [null];
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      attempts.push({ link, keyIndex, apiKey: keys[keyIndex] ?? null });
    }
  }
  return attempts;
}

function describeError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err;
  }
  return "lỗi không xác định";
}

/**
 * Trả một stream mới phát `first` trước rồi phát tiếp phần còn lại của
 * `stream` — dùng khi wrapper đã đọc sớm phần đầu để kiểm tra lỗi.
 */
function prependToStream(
  first: V4StreamPart,
  stream: ReadableStream<V4StreamPart>,
): ReadableStream<V4StreamPart> {
  const reader = stream.getReader();
  let firstSent = false;
  return new ReadableStream<V4StreamPart>({
    async pull(controller) {
      if (!firstSent) {
        firstSent = true;
        controller.enqueue(first);
        return;
      }
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch {
        // ignore
      }
    },
  });
}

/**
 * Provider/runtime id mà wrapper báo cho eve (dùng cho metadata + telemetry):
 * mirror link ĐẦU của chuỗi — "gateway" cho gateway/vision, id provider trực
 * tiếp (vd "openai") cho provider trực tiếp, "openai-compatible" cho endpoint
 * tự trỏ. Nhờ đó eve tra metadata context window trong catalog AI Gateway
 * đúng như khi gọi model đó trực tiếp.
 */
export function primaryRuntimeProvider(
  chain: readonly ModelChainLink[],
): string {
  const raw = (chain[0]?.provider ?? "").trim().toLowerCase();
  if (raw === "vision" || raw === "gateway") {
    return "gateway";
  }
  return raw || "gateway";
}

/**
 * Kết quả đưa vào resolver `step.started` của eve:
 * - LanguageModel trần khi model chính nằm trong catalog AI Gateway (eve tự
 *   tra context window theo provider/modelId).
 * - Selection object kèm `modelContextWindowTokens` khi không thể tra catalog
 *   (provider "openai-compatible" — endpoint tự trỏ — hoặc override env).
 */
export type EveModelSelection =
  | LanguageModel
  | { model: LanguageModel; modelContextWindowTokens: number };

/** Mặc định bảo thủ cho endpoint tự trỏ (compaction kích hoạt sớm hơn). */
const OPENAI_COMPATIBLE_DEFAULT_CONTEXT_TOKENS = 128_000;

/**
 * Dựng selection cho resolver model của eve từ chuỗi failover. Env
 * `EVE_MODEL_CONTEXT_WINDOW_TOKENS` (số nguyên dương) override context window
 * cho mọi trường hợp.
 */
export function createEveModelSelection(
  chain: readonly ModelChainLink[],
): EveModelSelection {
  const model = createFailoverLanguageModel(chain);
  const provider = primaryRuntimeProvider(chain);
  const envTokens = Number.parseInt(
    (process.env.EVE_MODEL_CONTEXT_WINDOW_TOKENS ?? "").trim(),
    10,
  );
  if (Number.isInteger(envTokens) && envTokens > 0) {
    return { model, modelContextWindowTokens: envTokens };
  }
  if (provider === "openai-compatible") {
    return {
      model,
      modelContextWindowTokens: OPENAI_COMPATIBLE_DEFAULT_CONTEXT_TOKENS,
    };
  }
  return model;
}

/**
 * Dựng một LanguageModel (spec V4) thực thi failover trên chuỗi đã cho.
 * `provider`/`modelId` của wrapper mirror link đầu để eve hiển thị/telemetry
 * đúng model dự kiến.
 */
export function createFailoverLanguageModel(
  chain: readonly ModelChainLink[],
): LanguageModel {
  const attempts = expandAttempts(chain);
  const primary = chain[0];

  const createUnderlying = (attempt: ModelAttempt): LanguageModelV4Like => {
    const attemptLink: ModelChainLink = {
      ...attempt.link,
      keys: attempt.apiKey ? [attempt.apiKey] : [],
    };
    // Các provider SDK của app (gateway/openai-compatible/@ai-sdk/*) đều xuất
    // model spec v4 ở ai@7 — cast để thoát union LanguageModel (v2|v3|v4).
    return createChatModelForLink(attemptLink) as LanguageModelV4Like;
  };

  const model: LanguageModelV4Like = {
    specificationVersion: "v4",
    provider: primaryRuntimeProvider(chain),
    modelId: primary?.model ?? "",
    supportedUrls: {},
    async doGenerate(options: V4CallOptions): Promise<V4GenerateResult> {
      const failures: string[] = [];
      for (const attempt of attempts) {
        let underlying: LanguageModelV4Like;
        try {
          underlying = createUnderlying(attempt);
        } catch (err) {
          failures.push(describeError(err));
          continue;
        }
        try {
          return await underlying.doGenerate(options);
        } catch (err) {
          failures.push(describeError(err));
          if (!isRetryableModelError(err)) {
            throw err;
          }
        }
      }
      throw new Error(
        `Mọi model/key đều thất bại (eve failover): ${failures.join(" | ") || "chuỗi rỗng"}`,
      );
    },
    async doStream(options: V4CallOptions): Promise<V4StreamResult> {
      const failures: string[] = [];
      for (const attempt of attempts) {
        let underlying: LanguageModelV4Like;
        try {
          underlying = createUnderlying(attempt);
        } catch (err) {
          failures.push(describeError(err));
          continue;
        }
        let result: V4StreamResult;
        try {
          result = await underlying.doStream(options);
        } catch (err) {
          failures.push(describeError(err));
          if (!isRetryableModelError(err)) {
            throw err;
          }
          continue;
        }
        // Đọc sớm phần đầu: lỗi request-time của AI SDK xuất hiện dưới dạng
        // phần `{ type: "error" }` trong stream chứ không phải rejection.
        const reader = result.stream.getReader();
        let first: ReadableStreamReadResult<V4StreamPart>;
        try {
          first = await reader.read();
        } catch (err) {
          try {
            await reader.cancel(err);
          } catch {
            // ignore
          }
          failures.push(describeError(err));
          if (!isRetryableModelError(err)) {
            throw err;
          }
          continue;
        }
        if (first.done) {
          failures.push("Model không trả về dữ liệu nào.");
          continue;
        }
        if (first.value.type === "error") {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          failures.push(describeError(first.value.error));
          if (!isRetryableModelError(first.value.error)) {
            throw first.value.error;
          }
          continue;
        }
        return {
          ...result,
          stream: prependToStream(first.value, result.stream),
        };
      }
      throw new Error(
        `Mọi model/key đều thất bại (eve failover): ${failures.join(" | ") || "chuỗi rỗng"}`,
      );
    },
  };

  return model;
}
