import { afterEach, describe, expect, it, vi } from "vitest";

import { runWebSearch } from "../tools";

describe("runWebSearch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("decodes HTML entities without decoding escaped entity text twice", async () => {
    vi.stubEnv("SEARCH_PROVIDER", "fetch");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          '<a class="result__a" href="https://example.com">Title &amp;quot;text&amp;quot;</a><a class="result__snippet">Snippet &amp;quot;text&amp;quot; &quot;quoted&quot;</a>',
          { status: 200 },
        ),
      ),
    );

    const result = await runWebSearch("query");

    expect(result.results).toEqual([
      {
        title: 'Title &quot;text&quot;',
        url: "https://example.com",
        snippet: 'Snippet &quot;text&quot; "quoted"',
      },
    ]);
  });

  it("removes unmatched HTML delimiters from search results", async () => {
    vi.stubEnv("SEARCH_PROVIDER", "fetch");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          '<a class="result__a" href="https://example.com"><script</a><a class="result__snippet">Snippet</a>',
          { status: 200 },
        ),
      ),
    );

    const result = await runWebSearch("query");

    expect(result.results?.[0]?.title).toBe("script");
  });
});
