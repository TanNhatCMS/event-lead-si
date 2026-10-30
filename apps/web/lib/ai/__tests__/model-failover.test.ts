import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@kit/supabase/database";

import {
  buildModelChain,
  isRetryableModelError,
  ModelFailoverError,
  resolveProviderKeys,
  runWithModelFailover,
  type ModelChainLink,
} from "../model-failover";

/**
 * Kiểm chứng failover engine KHÔNG gọi mạng: model do factory tạo ra chỉ là
 * object; `execute` mock quyết định thành/bại theo số lượt gọi. Lỗi mô phỏng
 * mang property `statusCode` / `data.statusCode` giống APICallError của AI SDK,
 * hoặc message "fetch failed" như undici.
 */

function makeSupabase(
  credentials: Record<string, unknown>,
): SupabaseClient<Database> {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { credentials }, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

function statusError(statusCode: number, message: string): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function dataStatusError(
  statusCode: number,
  code: string,
  message: string,
): Error {
  const err = new Error(message) as Error & {
    data: { statusCode: number; code: string };
  };
  err.data = { statusCode, code };
  return err;
}

function egressBlockedError(): Error {
  const err = new Error("URL bị chặn bởi egress guard.");
  err.name = "EgressBlockedError";
  (err as Error & { code: string }).code = "EgressBlocked";
  return err;
}

/** execute ném lỗi tuần tự theo danh sách rồi trả về giá trị thành công. */
function flakyExecute<T>(errors: unknown[], value: T) {
  let calls = 0;
  const models: unknown[] = [];
  const execute = async (): Promise<T> => {
    const current = calls;
    calls += 1;
    if (current < errors.length) {
      throw errors[current];
    }
    return value;
  };
  return {
    execute: (model: unknown) => {
      models.push(model);
      return execute();
    },
    callCount: () => calls,
    modelCount: () => models.length,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runWithModelFailover — xoay key", () => {
  it("key[0] ném lỗi 429 thì thử key[1] và thành công", async () => {
    const chain: ModelChainLink[] = [
      {
        provider: "openai",
        model: "gpt-4o",
        baseUrl: null,
        keys: ["test-key-first-key", "test-key-second-key"],
        source: "database",
      },
    ];
    const failing = statusError(429, "Rate limit exceeded, vui lòng thử lại sau.");
    const runner = flakyExecute([failing], "ok");

    const outcome = await runWithModelFailover({
      chain,
      execute: runner.execute,
    });

    expect(outcome.result).toBe("ok");
    expect(outcome.attempts).toBe(2);
    expect(outcome.used.provider).toBe("openai");
    expect(outcome.used.model).toBe("gpt-4o");
    expect(runner.callCount()).toBe(2);
    // Mỗi attempt dùng model MỚI (tạo lại theo key).
    expect(runner.modelCount()).toBe(2);
  });

  it("hết mọi key mà vẫn 429 thì ném ModelFailoverError với attempts chi tiết", async () => {
    const chain: ModelChainLink[] = [
      {
        provider: "openai",
        model: "gpt-4o",
        baseUrl: null,
        keys: ["test-key-key-a", "test-key-key-b"],
        source: "database",
      },
    ];
    const runner = flakyExecute(
      [statusError(429, "rate limited"), statusError(503, "service unavailable")],
      "ok",
    );

    const error = await runWithModelFailover({
      chain,
      execute: runner.execute,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ModelFailoverError);
    if (error instanceof ModelFailoverError) {
      expect(error.message).toBe("Mọi model/key đều thất bại.");
      expect(error.attempts).toHaveLength(2);
      expect(error.attempts[0]).toMatchObject({
        provider: "openai",
        model: "gpt-4o",
        keyIndex: 0,
      });
      expect(error.attempts[1]).toMatchObject({ keyIndex: 1 });
    }
  });
});

describe("runWithModelFailover — fallback model", () => {
  it("cả 2 key của link 1 fail thì chuyển sang link 2", async () => {
    const chain: ModelChainLink[] = [
      {
        provider: "openai",
        model: "gpt-4o",
        baseUrl: null,
        keys: ["test-key-openai-a", "test-key-openai-b"],
        source: "database",
      },
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        baseUrl: null,
        keys: ["test-key-anthropic-a"],
        source: "database",
      },
    ];
    const rateLimited = statusError(429, "rate limited");
    const overloaded = statusError(500, "internal error");
    const runner = flakyExecute([rateLimited, overloaded], "done");

    const outcome = await runWithModelFailover({
      chain,
      execute: runner.execute,
    });

    expect(outcome.result).toBe("done");
    expect(outcome.attempts).toBe(3);
    expect(outcome.used.provider).toBe("anthropic");
    expect(outcome.used.model).toBe("claude-sonnet-4-5");
    expect(runner.callCount()).toBe(3);
  });

  it("hết cả chuỗi thì ném ModelFailoverError tổng hợp đủ số lần thử", async () => {
    const chain: ModelChainLink[] = [
      {
        provider: "openai",
        model: "gpt-4o",
        baseUrl: null,
        keys: ["test-key-openai-a"],
        source: "database",
      },
      {
        provider: "google",
        model: "gemini-2.5-flash",
        baseUrl: null,
        keys: ["test-key-google-a"],
        source: "database",
      },
    ];
    const runner = flakyExecute(
      [statusError(429, "rate limited"), statusError(429, "rate limited")],
      "done",
    );

    const error = await runWithModelFailover({
      chain,
      execute: runner.execute,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ModelFailoverError);
    if (error instanceof ModelFailoverError) {
      expect(error.attempts).toHaveLength(2);
      expect(error.attempts.map((a) => a.model)).toEqual([
        "gpt-4o",
        "gemini-2.5-flash",
      ]);
    }
  });
});

describe("runWithModelFailover — lỗi không retryable", () => {
  it("lỗi 400 dừng ngay, KHÔNG failover sang key/model kế", async () => {
    const chain: ModelChainLink[] = [
      {
        provider: "openai",
        model: "gpt-4o",
        baseUrl: null,
        keys: ["test-key-openai-a", "test-key-openai-b"],
        source: "database",
      },
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        baseUrl: null,
        keys: ["test-key-anthropic-a"],
        source: "database",
      },
    ];
    const badRequest = statusError(400, "Tham số không hợp lệ.");
    const runner = flakyExecute([badRequest], "done");

    const error = await runWithModelFailover({
      chain,
      execute: runner.execute,
    }).catch((err: unknown) => err);

    // Ném lại NGUYÊN bản lỗi 400 — không bọc, không thử key/model kế.
    expect(error).toBe(badRequest);
    expect(runner.callCount()).toBe(1);
  });
});

describe("isRetryableModelError", () => {
  it("retryable với 401/402/429/500/502/503/504 (statusCode trực tiếp)", () => {
    for (const status of [401, 402, 429, 500, 502, 503, 504]) {
      expect(isRetryableModelError(statusError(status, "lỗi server"))).toBe(true);
    }
  });

  it("đọc được statusCode lồng trong err.data (AI SDK)", () => {
    expect(
      isRetryableModelError(dataStatusError(429, "rate_limit", "rate limited")),
    ).toBe(true);
    expect(
      isRetryableModelError(dataStatusError(400, "invalid_request", "bad input")),
    ).toBe(false);
  });

  it("retryable với lỗi mạng/fetch failed/timeout", () => {
    expect(isRetryableModelError(new Error("fetch failed"))).toBe(true);
    const timeout = new Error("Request timed out.");
    timeout.name = "TimeoutError";
    expect(isRetryableModelError(timeout)).toBe(true);
    expect(isRetryableModelError(new Error("connect ECONNREFUSED 127.0.0.1:443"))).toBe(
      true,
    );
  });

  it("retryable với model_not_found (kể cả 404) và quota_exceeded", () => {
    expect(
      isRetryableModelError(
        dataStatusError(404, "model_not_found", "The model does not exist."),
      ),
    ).toBe(true);
    expect(
      isRetryableModelError(statusError(404, "model_not_found: unknown model")),
    ).toBe(true);
    expect(
      isRetryableModelError(dataStatusError(400, "quota_exceeded", "hết quota")),
    ).toBe(true);
  });

  it("KHÔNG retryable với 400/422, 404 thường và EgressBlocked", () => {
    expect(isRetryableModelError(statusError(400, "bad request"))).toBe(false);
    expect(isRetryableModelError(statusError(422, "unprocessable"))).toBe(false);
    expect(isRetryableModelError(statusError(404, "resource not found"))).toBe(false);
    expect(isRetryableModelError(egressBlockedError())).toBe(false);
    expect(isRetryableModelError(null)).toBe(false);
  });
});

describe("resolveProviderKeys — đa key + back-compat", () => {
  it("DB array → legacy đơn → env (dedupe giữ thứ tự)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "env-openai-key");
    const supabase = makeSupabase({
      openai_api_keys: ["key-a", "key-b", "key-a"],
      openai_api_key: "legacy-openai-key",
    });

    const keys = await resolveProviderKeys("openai", "user-1", supabase);

    expect(keys).toEqual(["key-a", "key-b", "legacy-openai-key", "env-openai-key"]);
  });

  it("không có DB array thì legacy đơn làm key active, env vẫn cuối", async () => {
    vi.stubEnv("OPENAI_API_KEY", "env-openai-key");
    const supabase = makeSupabase({ openai_api_key: "legacy-only-key" });

    const keys = await resolveProviderKeys("openai", "user-1", supabase);

    expect(keys).toEqual(["legacy-only-key", "env-openai-key"]);
  });

  it("nhận cả jsonb lưu dạng chuỗi JSON array", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const supabase = makeSupabase({
      groq_api_keys: JSON.stringify(["json-key-1", "json-key-2"]),
    });

    const keys = await resolveProviderKeys("groq", "user-1", supabase);

    expect(keys).toEqual(["json-key-1", "json-key-2"]);
  });

  it("không có gì thì trả mảng rỗng; không đọc DB khi thiếu userId", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "");
    const supabase = makeSupabase({ mistral_api_key: "unused" });

    expect(await resolveProviderKeys("mistral", null, supabase)).toEqual([]);
    expect(await resolveProviderKeys("mistral", "user-1", supabase)).toEqual([
      "unused",
    ]);
  });
});

describe("buildModelChain — thứ tự link + lọc link thiếu model", () => {
  it("link đầu từ config, sau đó fallbacks; mỗi link kèm keys của provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "env-openai-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "env-anthropic-key");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const supabase = makeSupabase({
      openai_api_keys: ["openai-db-key"],
    });

    const chain = await buildModelChain({
      userId: "user-1",
      supabase,
      config: {
        provider: "openai",
        model: "gpt-4o",
        baseUrl: null,
        source: "database",
        fallbacks: [
          { provider: "anthropic", model: "claude-sonnet-4-5" },
          { provider: "gateway", model: "openai/gpt-4o-mini" },
        ],
      },
    });

    expect(chain).toHaveLength(3);
    expect(chain[0]).toMatchObject({
      provider: "openai",
      model: "gpt-4o",
      source: "database",
    });
    expect(chain[0]?.keys).toEqual(["openai-db-key", "env-openai-key"]);
    expect(chain[1]).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      source: "database",
    });
    expect(chain[1]?.keys).toEqual(["env-anthropic-key"]);
    // gateway: key env AI_GATEWAY_API_KEY — chưa đặt nên rỗng nhưng link vẫn giữ.
    expect(chain[2]).toMatchObject({
      provider: "gateway",
      model: "openai/gpt-4o-mini",
      source: "database",
    });
    expect(chain[2]?.keys).toEqual([]);
  });

  it("bỏ link thiếu model (primary null model hoặc fallback thiếu model)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const chain = await buildModelChain({
      config: {
        provider: "openai",
        model: null,
        source: "env",
        fallbacks: [
          { provider: "openai", model: "gpt-4o-mini" },
          { provider: "openai", model: "   " },
        ],
      },
    });

    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({ model: "gpt-4o-mini", source: "database" });
    expect(chain[0]?.keys).toEqual([]);
  });

  it("config env không có fallbacks thì chuỗi chỉ có 1 link, source env", async () => {
    vi.stubEnv("OPENAI_API_KEY", "env-openai-key");
    const chain = await buildModelChain({
      config: { provider: "openai", model: "gpt-4o", source: "env" },
    });

    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({
      provider: "openai",
      model: "gpt-4o",
      source: "env",
    });
    expect(chain[0]?.keys).toEqual(["env-openai-key"]);
  });
});
