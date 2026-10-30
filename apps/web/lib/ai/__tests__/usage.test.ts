import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bareModelName,
  computeCostUsd,
  parseGatewayModelPrices,
  parseLiteLlmModelPrices,
  recordUsage,
  type AiUsageTokens,
} from "../usage";

/**
 * Test KHÔNG gọi mạng/DB thật: client service-role bị mock qua
 * vi.mock('@kit/supabase/server-admin-client'); bảng giá do test tự nạp.
 * Shape pricing trong mock khớp nguồn thật đã kiểm chứng 2026-10-29:
 * - Gateway /v1/models: pricing là CHUỖI USD per token
 *   (input / output / input_cache_read).
 * - LiteLLM: SỐ USD per token (input_cost_per_token / output_cost_per_token /
 *   cache_read_input_token_cost).
 */

interface TestState {
  priceRows: Array<Record<string, unknown>>;
  inserted: Array<Record<string, unknown>>;
  insertError: unknown;
}

const hoisted = vi.hoisted(() => {
  const state: TestState = { priceRows: [], inserted: [], insertError: null };
  const adminClient = {
    from: (table: string) => {
      if (table === "model_prices") {
        return {
          select: () => ({
            in: () => ({
              in: () => ({ data: state.priceRows, error: null }),
            }),
          }),
        };
      }
      if (table === "agent_config") {
        // recordUsage gọi enforceBudgets sau khi insert thành công — test này
        // không khai báo budgets nên trả {} (không ngưỡng → bỏ qua sớm).
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => ({ data: { budgets: {} }, error: null }),
            }),
          }),
        };
      }
      throw new Error("admin client không mong đợi bảng: " + table);
    },
  };
  return { state, adminClient };
});

vi.mock("@kit/supabase/server-admin-client", () => ({
  getSupabaseServerAdminClient: () => hoisted.adminClient,
}));

/** Client người dùng chỉ cần hỗ trợ insert vào ai_usage. */
function makeInsertClient(state: TestState): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === "ai_usage") {
        return {
          insert: (row: unknown) => {
            state.inserted.push(row as Record<string, unknown>);
            return { error: state.insertError };
          },
        };
      }
      throw new Error("user client không mong đợi bảng: " + table);
    },
  } as unknown as SupabaseClient;
}

const PRICE_ROW = {
  provider: "gateway",
  model: "openai/gpt-4o",
  input_per_million: 2.5,
  cached_input_per_million: 1.25,
  output_per_million: 10,
};

describe("computeCostUsd", () => {
  beforeEach(() => {
    hoisted.state.priceRows = [];
    hoisted.state.inserted = [];
    hoisted.state.insertError = null;
  });

  it("tính cost với giá cached: input không cache theo giá input, cached theo giá cache", async () => {
    hoisted.state.priceRows = [PRICE_ROW];
    const tokens: AiUsageTokens = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cachedInputTokens: 200_000,
    };
    // 800k*2.5/1M + 200k*1.25/1M + 1M*10/1M = 2 + 0.25 + 10
    const cost = await computeCostUsd("gateway", "openai/gpt-4o", tokens);
    expect(cost).toBeCloseTo(12.25, 6);
  });

  it("không có giá cached: cached được tính như input thường", async () => {
    hoisted.state.priceRows = [
      { ...PRICE_ROW, cached_input_per_million: null },
    ];
    const cost = await computeCostUsd("gateway", "openai/gpt-4o", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 500_000,
    });
    // 500k giá thường + 500k giá thường = 1M * 2.5/1M = 2.5
    expect(cost).toBeCloseTo(2.5, 6);
  });

  it("cached lớn hơn input bị kẹp về input", async () => {
    hoisted.state.priceRows = [PRICE_ROW];
    const cost = await computeCostUsd("gateway", "openai/gpt-4o", {
      inputTokens: 100_000,
      outputTokens: 0,
      cachedInputTokens: 999_999,
    });
    // 100k * 1.25/1M = 0.125
    expect(cost).toBeCloseTo(0.125, 6);
  });

  it("không có dòng giá nào → null", async () => {
    hoisted.state.priceRows = [];
    const cost = await computeCostUsd("gateway", "openai/gpt-4o", {
      inputTokens: 100,
      outputTokens: 10,
    });
    expect(cost).toBeNull();
  });

  it("fallback nguồn 'litellm' khi provider gốc không có giá (model nguyên văn)", async () => {
    hoisted.state.priceRows = [
      {
        provider: "litellm",
        model: "gpt-4o",
        input_per_million: 2.5,
        cached_input_per_million: null,
        output_per_million: 10,
      },
    ];
    const cost = await computeCostUsd("openai", "gpt-4o", {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(2.5, 6);
  });

  it("fallback model bỏ prefix: giá litellm key bare khớp model gateway có prefix", async () => {
    hoisted.state.priceRows = [
      {
        provider: "litellm",
        model: "gemini-2.5-pro",
        input_per_million: 1.25,
        cached_input_per_million: null,
        output_per_million: 10,
      },
    ];
    const cost = await computeCostUsd("gateway", "google/gemini-2.5-pro", {
      inputTokens: 2_000_000,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(2.5, 6);
  });
});

describe("parseGatewayModelPrices", () => {
  it("chuỗi USD per token được nhân 1M; bỏ entry thiếu pricing/output", () => {
    const rows = parseGatewayModelPrices({
      data: [
        {
          id: "openai/gpt-4o",
          pricing: {
            input: "0.0000025",
            output: "0.00001",
            input_cache_read: "0.00000125",
            web_search: "10",
          },
        },
        // embedding: chỉ có input → bỏ (thiếu output)
        { id: "openai/text-embedding-3-small", pricing: { input: "0.00000002" } },
        // không có pricing
        { id: "some-image-model" },
        "rác",
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      provider: "gateway",
      model: "openai/gpt-4o",
      inputPerMillion: 2.5,
      cachedInputPerMillion: 1.25,
      outputPerMillion: 10,
      source: "api",
    });
  });

  it("payload sai shape → mảng rỗng, không ném", () => {
    expect(parseGatewayModelPrices(null)).toEqual([]);
    expect(parseGatewayModelPrices({ data: "không phải mảng" })).toEqual([]);
  });
});

describe("parseLiteLlmModelPrices", () => {
  it("số per token nhân 1M; lấy cả entry output cost = 0; bỏ sample_spec và entry thiếu giá", () => {
    const rows = parseLiteLlmModelPrices({
      sample_spec: {
        input_cost_per_token: 0,
        output_cost_per_token: 0,
      },
      "gpt-4o": {
        mode: "chat",
        input_cost_per_token: 0.0000025,
        output_cost_per_token: 0.00001,
        cache_read_input_token_cost: 0.00000125,
      },
      "gemini-2.5-pro": {
        mode: "chat",
        input_cost_per_token: 0.00000125,
        output_cost_per_token: 0.00001,
        cache_read_input_token_cost: 1.25e-7,
      },
      "text-embedding-3-small": {
        mode: "embedding",
        input_cost_per_token: 2e-8,
        output_cost_per_token: 0,
      },
      "thieu-output": { mode: "chat", input_cost_per_token: 0.001 },
      "khong-phai-object": "rác",
    });
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.model === "gpt-4o")).toEqual({
      provider: "litellm",
      model: "gpt-4o",
      inputPerMillion: 2.5,
      cachedInputPerMillion: 1.25,
      outputPerMillion: 10,
      source: "scrape",
    });
    expect(rows.find((r) => r.model === "gemini-2.5-pro")?.cachedInputPerMillion).toBeCloseTo(0.125, 6);
    expect(rows.find((r) => r.model === "text-embedding-3-small")).toEqual({
      provider: "litellm",
      model: "text-embedding-3-small",
      inputPerMillion: 0.02,
      cachedInputPerMillion: null,
      outputPerMillion: 0,
      source: "scrape",
    });
  });

  it("payload sai shape → mảng rỗng, không ném", () => {
    expect(parseLiteLlmModelPrices(null)).toEqual([]);
    expect(parseLiteLlmModelPrices("rác")).toEqual([]);
  });
});

describe("bareModelName", () => {
  it("bỏ prefix tới dấu '/' đầu tiên", () => {
    expect(bareModelName("openai/gpt-4o")).toBe("gpt-4o");
    expect(bareModelName("openrouter/deepseek/deepseek-chat")).toBe("deepseek/deepseek-chat");
    expect(bareModelName("gpt-4o")).toBe("gpt-4o");
  });
});

describe("recordUsage", () => {
  beforeEach(() => {
    hoisted.state.priceRows = [];
    hoisted.state.inserted = [];
    hoisted.state.insertError = null;
  });

  it("ghi dòng ai_usage với cost đã tính và token đã ép nguyên", async () => {
    hoisted.state.priceRows = [PRICE_ROW];
    const client = makeInsertClient(hoisted.state);
    await recordUsage({
      userId: "u-1",
      source: "enrichment",
      provider: "gateway",
      model: "openai/gpt-4o",
      usage: {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        totalTokens: 1_500_000,
        cachedInputTokens: 200_000,
      },
      latencyMs: 1234.6,
      supabase: client,
    });
    expect(hoisted.state.inserted).toHaveLength(1);
    const row = hoisted.state.inserted[0] ?? {};
    expect(row.user_id).toBe("u-1");
    expect(row.source).toBe("enrichment");
    expect(row.provider).toBe("gateway");
    expect(row.model).toBe("openai/gpt-4o");
    expect(row.input_tokens).toBe(1_000_000);
    expect(row.output_tokens).toBe(500_000);
    expect(row.cached_tokens).toBe(200_000);
    expect(row.total_tokens).toBe(1_500_000);
    expect(row.latency_ms).toBe(1235);
    // (1M-200k)*2.5/1M + 200k*1.25/1M + 500k*10/1M = 2 + 0.25 + 5 = 7.25
    expect(row.cost_usd).toBeCloseTo(7.25, 6);
  });

  it("usage null → token 0, total 0; thiếu userId → không ghi", async () => {
    const client = makeInsertClient(hoisted.state);
    await recordUsage({
      userId: "u-1",
      source: "embeddings",
      provider: "gateway",
      model: "openai/text-embedding-3-small",
      usage: null,
      supabase: client,
    });
    expect(hoisted.state.inserted).toHaveLength(1);
    const zeroRow = hoisted.state.inserted[0] ?? {};
    expect(zeroRow.input_tokens).toBe(0);
    expect(zeroRow.total_tokens).toBe(0);
    expect(zeroRow.cost_usd).toBeNull();

    await recordUsage({
      userId: null,
      source: "enrichment",
      provider: "gateway",
      model: "openai/gpt-4o",
      usage: { inputTokens: 10 },
      supabase: client,
    });
    expect(hoisted.state.inserted).toHaveLength(1);
  });

  it("lỗi insert không ném ra ngoài (best-effort)", async () => {
    hoisted.state.priceRows = [PRICE_ROW];
    hoisted.state.insertError = { message: "RLS chặn" };
    const client = makeInsertClient(hoisted.state);
    await expect(
      recordUsage({
        userId: "u-1",
        source: "rag_chat",
        provider: "gateway",
        model: "openai/gpt-4o",
        usage: { inputTokens: 10, outputTokens: 5 },
        supabase: client,
      }),
    ).resolves.toBeUndefined();
  });
});
