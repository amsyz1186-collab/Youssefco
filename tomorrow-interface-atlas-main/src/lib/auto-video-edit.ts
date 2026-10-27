export type AutoVideoEditSegment = {
  start: number;
  end: number;
  caption: string;
  sound: "none" | "whoosh" | "pop" | "impact";
};

export type AutoVideoEditPlan = {
  title: string;
  segments: AutoVideoEditSegment[];
};

export function parseAutoVideoEditPlan(raw: string, duration: number): AutoVideoEditPlan {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) {
    throw new Error("مدة الفيديو غير مدعومة للمونتاج داخل المتصفح (الحد الأقصى 10 دقائق).");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ""));
  } catch {
    throw new Error("لم تُنتج خطة المونتاج بصيغة قابلة للتنفيذ. حاول مرة أخرى.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("خطة المونتاج التي أنشأها الذكاء الاصطناعي غير صالحة.");
  }

  const candidate = parsed as {
    title?: unknown;
    segments?: unknown;
  };
  if (
    typeof candidate.title !== "string" ||
    !Array.isArray(candidate.segments) ||
    candidate.segments.length === 0 ||
    candidate.segments.length > 12
  ) {
    throw new Error("خطة المونتاج ناقصة أو تحتوي على عدد غير مدعوم من المشاهد.");
  }

  const segments: AutoVideoEditSegment[] = [];
  for (const item of candidate.segments) {
    if (typeof item !== "object" || item === null) {
      throw new Error("أحد مقاطع خطة المونتاج غير صالح.");
    }
    const segment = item as Record<string, unknown>;
    const start = segment["start"];
    const end = segment["end"];
    const caption = segment["caption"];
    const sound = segment["sound"];
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > duration ||
      end - start < 0.4 ||
      typeof caption !== "string" ||
      caption.length > 160 ||
      (sound !== "none" && sound !== "whoosh" && sound !== "pop" && sound !== "impact")
    ) {
      throw new Error("تحتوي خطة المونتاج على توقيت أو عنوان أو مؤثر صوتي غير صالح.");
    }
    segments.push({ start, end, caption: caption.trim(), sound });
  }

  segments.sort((left, right) => left.start - right.start);
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index]!.start < segments[index - 1]!.end - 0.05) {
      throw new Error("مقاطع خطة المونتاج متداخلة؛ تعذرت مواصلة الرندر.");
    }
  }
  return { title: candidate.title.slice(0, 120), segments };
}
