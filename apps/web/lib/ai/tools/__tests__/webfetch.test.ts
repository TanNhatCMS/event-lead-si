import { afterEach, describe, expect, it, vi } from "vitest";

import { runWebFetch } from "../webfetch";

vi.mock("../egress-guard", () => ({
  assertEgressAllowed: async (url: string) => new URL(url),
  EgressBlockedError: class EgressBlockedError extends Error {},
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runWebFetch", () => {
  it("decodes HTML entities only once", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("A &amp; B &amp;lt;tag&amp;gt;", {
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const result = await runWebFetch(
      `https://example.com/${crypto.randomUUID()}`,
    );

    expect(result.text).toBe("A & B &lt;tag&gt;");
  });

  it("removes script content when the closing tag contains whitespace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          "<p>Visible</p><script>alert(1)</script ><p>Also visible</p>",
          {
            headers: { "content-type": "text/html" },
          },
        ),
      ),
    );

    const result = await runWebFetch(
      `https://script-end-tag-${Date.now()}.example`,
    );

    expect(result.available).toBe(true);
    expect(result.text).toBe("Visible Also visible");
  });
});
