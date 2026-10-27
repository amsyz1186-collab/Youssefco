export function countBriefWords(brief: string) {
  return brief.trim().split(/\s+/).filter(Boolean).length;
}

export function parseGeneratedAppProject(generated: string) {
  let project: unknown;
  try {
    const json = generated
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    project = JSON.parse(json);
  } catch {
    throw new Error("تعذر قراءة ملفات المشروع والمعاينة. أعد المحاولة لتوليد مخرجات صالحة.");
  }

  if (
    typeof project !== "object" ||
    project === null ||
    !("source" in project) ||
    typeof project.source !== "string" ||
    !project.source.trim() ||
    !("previewHtml" in project) ||
    typeof project.previewHtml !== "string" ||
    !/^<!doctype html|^<html/i.test(project.previewHtml.trim())
  ) {
    throw new Error("أنشأ المولد ملفات مشروع أو معاينة غير صالحة. أعد المحاولة.");
  }
  return { source: project.source, previewHtml: project.previewHtml };
}
