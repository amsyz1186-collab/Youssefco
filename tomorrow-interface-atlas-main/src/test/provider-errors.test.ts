import { describe, expect, it } from "vitest";
import { formatGeminiError, shouldRetryWithFallback } from "@/lib/provider-errors";

describe("AI provider fallback policy", () => {
  it.each([429, 500, 502, 503, 504])("retries a fallback model after status %i", (status) => {
    expect(shouldRetryWithFallback(status)).toBe(true);
  });

  it.each([200, 400, 401, 403, 404])(
    "does not retry a fallback model after status %i",
    (status) => {
      expect(shouldRetryWithFallback(status)).toBe(false);
    },
  );
});

describe("Gemini error messages", () => {
  it.each([401, 403])("does not expose provider response details for status %i", (status) => {
    expect(formatGeminiError(status)).toContain("GEMINI_API_KEY");
  });

  it("returns concise messages for rate limits and provider outages", () => {
    expect(formatGeminiError(429)).toContain("حد الاستخدام");
    expect(formatGeminiError(503)).toContain("غير متاحة مؤقتاً");
  });
});
