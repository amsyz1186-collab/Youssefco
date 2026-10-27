import { describe, expect, it } from "vitest";
import {
  formatPrice,
  getStudioCreditCost,
  getStudioCreditCostForTier,
  METERED,
  parseTier,
  PLANS,
} from "@/lib/plans";

describe("plans", () => {
  it("uses the agreed prices and point top-ups", () => {
    expect(PLANS.map((p) => [p.id, p.credits, p.price])).toEqual([
      ["pro", 13, 1500],
      ["plus", 22, 4000],
      ["vip", 30, 8000],
    ]);
  });

  it("formats Egyptian pound prices using Arabic numerals", () => {
    expect(formatPrice(1500)).toBe("١٬٥٠٠");
    expect(formatPrice(4000)).toBe("٤٬٠٠٠");
    expect(formatPrice(8000)).toBe("٨٬٠٠٠");
  });

  it("maps the persisted Supabase package labels to app tiers", () => {
    expect(parseTier("free")).toBe("free");
    expect(parseTier("Youssefco-Pro")).toBe("pro");
    expect(parseTier("youssefco-plus")).toBe("plus");
    expect(parseTier("VIP")).toBe("vip");
    expect(parseTier(null)).toBe("free");
  });

  it("includes every studio with a paid-plan credit schedule", () => {
    expect(METERED).toEqual([
      "auto_video",
      "animation",
      "voice",
      "dubbing",
      "app_engine",
      "image",
      "templates",
    ]);
  });

  it.each([
    ["auto_video", 2],
    ["animation", 2],
    ["voice", 2],
    ["app_engine", 4],
    ["image", 2],
    ["dubbing", 1],
    ["templates", 2],
  ] as const)("charges %s %d credit(s) per run", (studio, credits) => {
    expect(getStudioCreditCost(studio)).toBe(credits);
  });

  it.each(METERED)("does not deduct credits from the free plan for %s", (studio) => {
    expect(getStudioCreditCostForTier("free", studio)).toBe(0);
  });

  it("preserves paid-tier studio credit costs", () => {
    expect(getStudioCreditCostForTier("pro", "voice")).toBe(2);
    expect(getStudioCreditCostForTier("vip", "app_engine")).toBe(4);
  });
});
