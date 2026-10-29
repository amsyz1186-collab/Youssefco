export type AutoVideoEditSegment = {
  start: number;
  end: number;
  sound: "none" | "whoosh" | "pop" | "impact";
  textOverlay?: string;
};

export type AutoVideoEditPlan = {
  title: string;
  segments: AutoVideoEditSegment[];
};

export const MAX_AUTO_VIDEO_EDIT_PROMPT_CHARS = 100_000;

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
  if (!Array.isArray(candidate.segments) || candidate.segments.length > 12) {
    throw new Error("خطة المونتاج ناقصة أو تحتوي على عدد غير مدعوم من المشاهد.");
  }

  const segments: AutoVideoEditSegment[] = [];
  if (candidate.segments.length === 0) {
    throw new Error("خطة المونتاج لا تحتوي على لقطات صالحة.");
  }
  for (const item of candidate.segments) {
    if (typeof item !== "object" || item === null) {
      throw new Error("أحد مقاطع خطة المونتاج غير صالح.");
    }
    const segment = item as Record<string, unknown>;
    const start = segment["start"];
    const end = segment["end"];
    const sound = segment["sound"];
    const textOverlay = segment["textOverlay"];
    const numericStart = typeof start === "number" ? start : Number(start);
    const numericEnd = typeof end === "number" ? end : Number(end);
    const hasValidTimings =
      (typeof start === "number" || (typeof start === "string" && start.trim() !== "")) &&
      (typeof end === "number" || (typeof end === "string" && end.trim() !== "")) &&
      Number.isFinite(numericStart) &&
      Number.isFinite(numericEnd);
    if (!hasValidTimings) {
      throw new Error("أحد مقاطع خطة المونتاج لا يحتوي على توقيت صالح.");
    }
    const normalizedStart = Math.max(0, Math.min(duration, numericStart));
    const normalizedEnd = Math.max(0, Math.min(duration, numericEnd));
    segments.push({
      start: normalizedStart,
      end: normalizedEnd,
      sound:
        sound === "whoosh" || sound === "pop" || sound === "impact" || sound === "none"
          ? sound
          : "none",
      ...(typeof textOverlay === "string" && textOverlay.trim()
        ? { textOverlay: textOverlay.trim().slice(0, 120) }
        : {}),
    });
  }

  segments.sort((left, right) => left.start - right.start);
  const nonOverlapping: AutoVideoEditSegment[] = [];
  for (const segment of segments) {
    const previous = nonOverlapping[nonOverlapping.length - 1];
    const start = Math.max(segment.start, previous?.end ?? 0);
    if (segment.end - start >= 0.4) {
      nonOverlapping.push({ ...segment, start });
    }
  }
  if (nonOverlapping.length === 0) {
    if (duration < 1.2) {
      return {
        title: (typeof candidate.title === "string" ? candidate.title : "Auto edit").slice(0, 120),
        segments: [{ start: 0, end: duration, sound: "none" }],
      };
    }
    throw new Error("خطة المونتاج لا تحتوي على لقطة طويلة بما يكفي للتصدير.");
  }
  return {
    title: (typeof candidate.title === "string" ? candidate.title : "Auto edit").slice(0, 120),
    segments: nonOverlapping,
  };
}
