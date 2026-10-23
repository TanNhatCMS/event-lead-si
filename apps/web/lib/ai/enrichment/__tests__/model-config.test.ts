import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEnrichmentModel,
  getEnrichmentConfigIssue,
  normalizeEnrichmentProvider,
  resolveEnrichmentConfig,
} from "../model-config";

/**
 * Kiểm chứng phân giải provider cho enrichment (đường env — không cần DB):
 * mặc định gọi thẳng OpenAI theo quyết định người dùng 2026-10-24,
 * Gateway chỉ khi cấu hình ghi tường minh.
 */
describe("normalizeEnrichmentProvider", () => {
  it("mặc định (rỗng/không rõ) về openai", () => {
    expect(normalizeEnrichmentProvider(undefined)).toBe("openai");
    expect(normalizeEnrichmentProvider("")).toBe("openai");
    expect(normalizeEnrichmentProvider("openai")).toBe("openai");
    expect(normalizeEnrichmentProvider("openai-compatible")).toBe("openai");
  });

  it("chỉ về gateway khi ghi tường minh", () => {
    expect(normalizeEnrichmentProvider("gateway")).toBe("gateway");
    expect(normalizeEnrichmentProvider("AI-Gateway")).toBe("gateway");
  });
});

describe("resolveEnrichmentConfig — đường env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("chưa đặt ENRICHMENT_MODEL thì enabled=false, provider=openai", async () => {
    vi.stubEnv("ENRICHMENT_MODEL", "");
    const config = await resolveEnrichmentConfig(null);
    expect(config).toMatchObject({
      provider: "openai",
      model: null,
      enabled: false,
      source: "env",
      baseUrl: null,
    });
  });

  it("đọc model + OPENAI_BASE_URL từ env", async () => {
    vi.stubEnv("ENRICHMENT_MODEL", "gpt-5-mini");
    vi.stubEnv("OPENAI_BASE_URL", "https://proxy.example.com/v1");
    const config = await resolveEnrichmentConfig(null);
    expect(config).toMatchObject({
      provider: "openai",
      model: "gpt-5-mini",
      enabled: true,
      baseUrl: "https://proxy.example.com/v1",
    });
  });

  it("ENRICHMENT_PROVIDER=gateway mới chuyển sang gateway", async () => {
    vi.stubEnv("ENRICHMENT_MODEL", "anthropic/claude-sonnet-4-5");
    vi.stubEnv("ENRICHMENT_PROVIDER", "gateway");
    const config = await resolveEnrichmentConfig(null);
    expect(config.provider).toBe("gateway");
  });
});

describe("getEnrichmentConfigIssue + createEnrichmentModel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("openai thiếu OPENAI_API_KEY thì báo lỗi rõ ràng, có key thì tạo được model", async () => {
    vi.stubEnv("ENRICHMENT_MODEL", "gpt-5-mini");
    vi.stubEnv("OPENAI_API_KEY", "");
    const config = await resolveEnrichmentConfig(null);
    expect(getEnrichmentConfigIssue(config)).toContain("OPENAI_API_KEY");
    expect(() =>
      createEnrichmentModel({ ...config, model: "gpt-5-mini" }),
    ).toThrow("OPENAI_API_KEY");

    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(getEnrichmentConfigIssue(config)).toBeNull();
    const model = createEnrichmentModel({ ...config, model: "gpt-5-mini" });
    if (typeof model !== "object") {
      throw new Error("kỳ vọng LanguageModel dạng object");
    }
    expect(model.modelId).toBe("gpt-5-mini");
    expect(model.provider).toContain("openai");
  });

  it("gateway thiếu AI_GATEWAY_API_KEY thì báo lỗi gateway", async () => {
    vi.stubEnv("ENRICHMENT_MODEL", "anthropic/claude-sonnet-4-5");
    vi.stubEnv("ENRICHMENT_PROVIDER", "gateway");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const config = await resolveEnrichmentConfig(null);
    expect(getEnrichmentConfigIssue(config)).toContain("AI_GATEWAY_API_KEY");
  });
});
