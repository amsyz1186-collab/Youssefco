import { describe, expect, it } from "vitest";
import { countBriefWords, parseGeneratedAppProject } from "@/lib/app-engine";

describe("countBriefWords", () => {
  it("counts whitespace-separated words and ignores surrounding whitespace", () => {
    expect(countBriefWords("  Build   a booking app \n for restaurants.  ")).toBe(6);
    expect(countBriefWords("")).toBe(0);
  });

  it("recognizes the exact free-trial brief limit", () => {
    const brief = Array.from({ length: 55 }, (_, index) => `word${index}`).join(" ");
    expect(countBriefWords(brief)).toBe(55);
    expect(countBriefWords(`${brief} extra`)).toBe(56);
  });
});

describe("parseGeneratedAppProject", () => {
  it("parses generated source and the matching HTML preview", () => {
    const project = parseGeneratedAppProject(
      '```json\n{"source":"print(\\"hello\\")","previewHtml":"<!doctype html><html><body>Hello</body></html>"}\n```',
    );
    expect(project.source).toBe('print("hello")');
    expect(project.previewHtml).toContain("<body>Hello</body>");
  });

  it("rejects malformed or incomplete generated projects", () => {
    expect(() => parseGeneratedAppProject("not json")).toThrow("تعذر قراءة ملفات المشروع");
    expect(() =>
      parseGeneratedAppProject('{"source":"print(1)","previewHtml":"not html"}'),
    ).toThrow("غير صالحة");
  });
});
