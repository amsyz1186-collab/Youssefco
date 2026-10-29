import { describe, expect, it } from "vitest";
import { parseAutoVideoEditPlan } from "@/lib/auto-video-edit";

describe("parseAutoVideoEditPlan", () => {
  it("accepts a valid timed edit and strips JSON fences", () => {
    const result = parseAutoVideoEditPlan(
      '```json\n{"title":"Launch","segments":[{"start":0,"end":2.5,"sound":"pop"},{"start":2.5,"end":5,"sound":"none"}]}\n```',
      5,
    );
    expect(result.title).toBe("Launch");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.sound).toBe("pop");
  });

  it("repairs generated timings that exceed the source duration", () => {
    const result = parseAutoVideoEditPlan(
      '{"title":"Recovered","segments":[{"start":0,"end":9,"sound":"none"}]}',
      5,
    );
    expect(result.segments).toEqual([{ start: 0, end: 5, sound: "none" }]);
  });

  it("replaces unsupported effects and trims overlaps without erasing the cut plan", () => {
    const result = parseAutoVideoEditPlan(
      '{"title":"Recovered","segments":[{"start":0,"end":3,"sound":"explosion"},{"start":2,"end":5,"sound":"pop"}]}',
      5,
    );
    expect(result.segments).toEqual([
      { start: 0, end: 3, sound: "none" },
      { start: 3, end: 5, sound: "pop" },
    ]);
  });

  it("accepts string timestamps and ignores generated text overlays", () => {
    const result = parseAutoVideoEditPlan(
      `{"title":"Strings","segments":[{"start":"0","end":"5","caption":"${"x".repeat(170)}","sound":"none"}]}`,
      5,
    );
    expect(result.segments[0]?.start).toBe(0);
    expect(result.segments[0]).not.toHaveProperty("caption");
  });

  it("preserves gaps between selected source clips for tighter edits", () => {
    const result = parseAutoVideoEditPlan(
      '{"title":"Highlights","segments":[{"start":1,"end":3,"sound":"whoosh"},{"start":6,"end":8,"sound":"impact"}]}',
      10,
    );
    expect(result.segments.map(({ start, end }) => [start, end])).toEqual([
      [1, 3],
      [6, 8],
    ]);
  });

  it("keeps brief-requested text overlays and ignores unrequested captions", () => {
    const result = parseAutoVideoEditPlan(
      '{"title":"Product","segments":[{"start":0,"end":2,"sound":"whoosh","textOverlay":"اكتشف المنتج"},{"start":3,"end":5,"sound":"pop","caption":"invented filler"}]}',
      5,
    );
    expect(result.segments).toEqual([
      { start: 0, end: 2, sound: "whoosh", textOverlay: "اكتشف المنتج" },
      { start: 3, end: 5, sound: "pop" },
    ]);
  });

  it("limits overlay text to a short on-screen title", () => {
    const result = parseAutoVideoEditPlan(
      `{"title":"Title","segments":[{"start":0,"end":5,"sound":"none","textOverlay":"${"عنوان ".repeat(30)}"}]}`,
      5,
    );
    expect(result.segments[0]!.textOverlay).toHaveLength(120);
  });

  it("limits the number of segments to what the source duration supports", () => {
    const result = parseAutoVideoEditPlan(
      '{"title":"Short","segments":[{"start":0,"end":0.2,"sound":"none"},{"start":0.2,"end":0.4,"sound":"none"},{"start":0.4,"end":0.6,"sound":"none"}]}',
      0.6,
    );
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({ start: 0, end: 0.6 });
  });
});
