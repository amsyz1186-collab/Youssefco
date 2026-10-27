import { describe, expect, it } from "vitest";
import { parseAutoVideoEditPlan } from "@/lib/auto-video-edit";

describe("parseAutoVideoEditPlan", () => {
  it("accepts a valid timed edit and strips JSON fences", () => {
    const result = parseAutoVideoEditPlan(
      '```json\n{"title":"Launch","segments":[{"start":0,"end":2.5,"caption":"Hello","sound":"pop"},{"start":2.5,"end":5,"caption":"","sound":"none"}]}\n```',
      5,
    );
    expect(result.title).toBe("Launch");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.sound).toBe("pop");
  });

  it("rejects segments beyond the source duration", () => {
    expect(() =>
      parseAutoVideoEditPlan(
        '{"title":"Bad","segments":[{"start":0,"end":9,"caption":"","sound":"none"}]}',
        5,
      ),
    ).toThrow("تحتوي خطة المونتاج على توقيت");
  });

  it("rejects unsupported effects and overlapping timings", () => {
    expect(() =>
      parseAutoVideoEditPlan(
        '{"title":"Bad","segments":[{"start":0,"end":3,"caption":"","sound":"explosion"},{"start":2,"end":5,"caption":"","sound":"none"}]}',
        5,
      ),
    ).toThrow("تحتوي خطة المونتاج على توقيت");
    expect(() =>
      parseAutoVideoEditPlan(
        '{"title":"Bad","segments":[{"start":0,"end":3,"caption":"","sound":"none"},{"start":2,"end":5,"caption":"","sound":"none"}]}',
        5,
      ),
    ).toThrow("مقاطع خطة المونتاج متداخلة");
  });
});
