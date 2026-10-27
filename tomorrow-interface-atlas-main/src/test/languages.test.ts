import { describe, expect, it } from "vitest";
import { isLanguageCode, isRtlLanguage, LANGUAGE_OPTIONS } from "@/lib/languages";

describe("language registry", () => {
  it("includes the ISO 639-3 language catalog and common two-letter aliases", () => {
    expect(LANGUAGE_OPTIONS.length).toBeGreaterThan(7_000);
    expect(new Set(LANGUAGE_OPTIONS.map(({ code }) => code)).size).toBe(LANGUAGE_OPTIONS.length);
    expect(new Set(LANGUAGE_OPTIONS.map(({ name }) => name)).size).toBe(LANGUAGE_OPTIONS.length);
    expect(isLanguageCode("ar")).toBe(true);
    expect(isLanguageCode("eng")).toBe(true);
    expect(isLanguageCode("not-a-language")).toBe(false);
    expect(isRtlLanguage("ur")).toBe(true);
    expect(isRtlLanguage("eng")).toBe(false);
  });
});
