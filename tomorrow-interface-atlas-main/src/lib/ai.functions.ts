import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Buffer } from "node:buffer";
import type { Database } from "@/integrations/supabase/types";
import { parseGeneratedAppProject } from "@/lib/app-engine";
import { getStudioCreditCostForTier, METERED, parseTier, type StudioId } from "@/lib/plans";
import { MAX_AUTO_VIDEO_EDIT_PROMPT_CHARS, parseAutoVideoEditPlan } from "@/lib/auto-video-edit";
import { generateSpeech } from "@/lib/edge-tts";
import { formatGeminiError, shouldRetryWithFallback } from "@/lib/provider-errors";
import { formatRpcError } from "@/lib/supabase-errors";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_TEXT_MODEL = "gemini-3.6-flash";
const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-lite-image";
const GEMINI_TEXT_FALLBACK_MODEL = "gemini-3.5-flash-lite";
const GEMINI_IMAGE_FALLBACK_MODEL = "gemini-3.1-flash-image";
const MAX_VIDEO_MEDIA_BYTES = 50 * 1024 * 1024;
const EDGE_TTS_LANGUAGES = [
  "Arabic",
  "Chinese",
  "Dutch",
  "English",
  "French",
  "German",
  "Greek",
  "Hebrew",
  "Hindi",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Malay",
  "Persian",
  "Polish",
  "Portuguese",
  "Russian",
  "Spanish",
  "Swahili",
  "Swedish",
  "Thai",
  "Turkish",
  "Urdu",
  "Vietnamese",
] as const;

type VideoFrame = {
  timeSeconds: number;
  imageData: string;
};

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

type Input = {
  studio: StudioId;
  prompt: string;
  options?: {
    platform?: string;
    mood?: string;
    mode?: string;
    dialect?: string;
    target?: string;
    ratio?: string;
    enhance?: string;
    template?: string;
    file?: string;
    mediaPath?: string;
    mediaSize?: number;
    mediaType?: string;
    lang?: string;
    renderVideo?: string;
    clipDuration?: string;
    voiceTone?: string;
    voiceLanguage?: string;
    projectType?: "website" | "mobile";
    techStack?: "html" | "react" | "python" | "java" | "cpp" | "kotlin";
    imageStyle?: string;
    imageUse?: string;
    videoFrames?: VideoFrame[];
  };
};

function isMeteredStudio(studio: string): studio is StudioId {
  return METERED.some((meteredStudio) => meteredStudio === studio);
}

async function removeGeneratedMedia(supabase: SupabaseClient<Database>, path: string | null) {
  if (!path) return;
  const { error } = await supabase.storage.from("project-vault").remove([path]);
  if (error) console.error("[Studio] Could not remove uncommitted generated media", error);
}

async function streamText(
  system: string,
  prompt: string,
  videoFrames?: VideoFrame[],
): Promise<string> {
  return generateGeminiText(system, prompt, videoFrames);
}

async function generateGeminiText(
  system: string,
  prompt: string,
  videoFrames?: VideoFrame[],
): Promise<string> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("خدمة Gemini غير مهيأة. أضف GEMINI_API_KEY إلى أسرار Vercel.");

  const parts: GeminiPart[] = [{ text: prompt }];
  for (const frame of videoFrames ?? []) {
    const commaIndex = frame.imageData.indexOf(",");
    if (commaIndex < 0) throw new Error("صيغة لقطة الفيديو غير صالحة.");
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: frame.imageData.slice(commaIndex + 1),
      },
    });
  }

  let response: Response | undefined;
  for (const model of [GEMINI_TEXT_MODEL, GEMINI_TEXT_FALLBACK_MODEL]) {
    response = await fetch(
      `${GEMINI_API}/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
        }),
      },
    );
    if (!shouldRetryWithFallback(response.status)) break;
  }
  if (!response) throw new Error("تعذر الاتصال بخدمة Gemini.");
  if (!response.ok) {
    throw new Error(formatGeminiError(response.status));
  }
  const result = (await response.json()) as GeminiResponse;
  const text = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("أعاد Gemini استجابة بلا نص.");
  return text;
}

async function generateAutoVideoPlan(
  fileName: string,
  notes: string,
  options: NonNullable<Input["options"]>,
  language: string,
) {
  const moods: Record<string, string> = {
    Comedy: "comedic timing, reaction beats, and light punchlines",
    Action: "fast pacing, decisive cuts, and energetic transitions",
    Drama: "measured pacing, emotional pauses, and dramatic reveals",
    Mix: "a balanced progression combining comedy, action, and drama",
  };
  const mood = moods[options.mood ?? "Mix"] ?? moods["Mix"]!;
  const duration = Number(options.clipDuration);
  const minSegments = duration < 2.2 ? 1 : 3;
  const raw = await streamText(
    `You are an experienced short-form video editor. Reply with only valid JSON in this exact schema: {"title":"short edit title","segments":[{"start":0,"end":3.2,"sound":"none|whoosh|pop|impact","textOverlay":"short title"}]}. Use numeric source timestamps between 0 and ${duration.toFixed(3)} seconds. Each kept clip must be at least 0.4 seconds. Create ${minSegments}-6 chronological, non-overlapping highlight clips; do not simply divide the video equally. Make a purposeful montage by omitting pauses, repetitive footage, and low-value intervals; gaps between selected source clips are allowed. Aim to keep roughly 55%-80% of the source when the frames support a tighter edit, but preserve a continuous essential action rather than cutting arbitrarily. Use strong, natural cut points. Add a concise, designed editorial title in ${language} to at least one selected clip, based on the visible subject and the user's intent. Use exact wording supplied by the user when available; do not invent factual claims or add generic filler. Return null for textOverlay only if the user explicitly asks for no on-screen text. Do not add narration. Use the selected ${options.platform ?? "video"} format and ${mood}. At each useful cut choose exactly one sound from "none", "whoosh", "pop", or "impact"; prefer an appropriate transition sound over "none". Analyze the attached representative still frames and editor notes; they do not reveal motion or audio, so do not claim details you cannot see. Never include markdown, commentary, or fields beyond title and segments.`,
    `Write the edit title in ${language}. Source file: ${fileName || "uploaded video"}. The frame times are ${
      options.videoFrames?.map((frame) => `${frame.timeSeconds}s`).join(", ") || "unknown"
    }. Editor notes: ${notes || "No notes supplied; create a concise highlight montage from the visible scenes."}`,
    options.videoFrames,
  );
  return JSON.stringify(parseAutoVideoEditPlan(raw, duration));
}

async function genImage(prompt: string, size: string): Promise<string> {
  return generateGeminiImage(prompt, size);
}

async function generateGeminiImage(prompt: string, size: string): Promise<string> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("توليد الصور غير مهيأ. أضف GEMINI_API_KEY إلى أسرار Vercel.");
  const aspectRatio = size === "1536x1024" ? "16:9" : size === "1024x1536" ? "9:16" : "1:1";
  let response: Response | undefined;
  const models = [GEMINI_IMAGE_MODEL, GEMINI_IMAGE_FALLBACK_MODEL];
  for (const [index, model] of models.entries()) {
    try {
      response = await fetch(
        `${GEMINI_API}/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(18_000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["IMAGE"],
              imageConfig: { aspectRatio },
            },
          }),
        },
      );
    } catch (error) {
      if (index === 0 && error instanceof Error && error.name === "TimeoutError") continue;
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("انتهت مهلة توليد الصورة على نموذجي Gemini. حاول مرة أخرى لاحقاً.");
      }
      throw error;
    }
    if (!shouldRetryWithFallback(response.status)) break;
  }
  if (!response) throw new Error("تعذر الاتصال بخدمة توليد الصور من Gemini.");
  if (!response.ok) {
    throw new Error(formatGeminiError(response.status));
  }
  const result = (await response.json()) as GeminiResponse;
  const image = result.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
  if (image?.inlineData) {
    return `data:${image.inlineData.mimeType};base64,${image.inlineData.data}`;
  }
  const text = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (text) throw new Error(`أعاد Gemini وصفاً بدلاً من صورة: ${text.slice(0, 200)}`);
  throw new Error("لم يُرجع Gemini صورة.");
}

const SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
};

export const runStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: Input) => {
    if (
      !i ||
      typeof i.studio !== "string" ||
      !isMeteredStudio(i.studio) ||
      typeof i.prompt !== "string" ||
      i.prompt.length > (i.studio === "auto_video" ? MAX_AUTO_VIDEO_EDIT_PROMPT_CHARS : 8000) ||
      (i.studio === "app_engine" &&
        ((i.options?.projectType !== undefined &&
          !["website", "mobile"].includes(i.options.projectType)) ||
          (i.options?.techStack !== undefined &&
            !["html", "react", "python", "java", "cpp", "kotlin"].includes(i.options.techStack))))
    ) {
      throw new Error("Invalid input");
    }
    if (i.studio === "auto_video" && !i.prompt.trim()) {
      throw new Error("اكتب وصف التعديلات المطلوبة على الفيديو قبل تشغيل المونتاج.");
    }
    if (
      i.studio === "auto_video" &&
      (!i.options?.mediaType?.startsWith("video/") ||
        !Number.isSafeInteger(i.options.mediaSize) ||
        i.options.mediaSize! <= 0 ||
        i.options.mediaSize! > MAX_VIDEO_MEDIA_BYTES ||
        !Array.isArray(i.options.videoFrames) ||
        i.options.videoFrames.length !== 3 ||
        !i.options.videoFrames.every(
          (frame) =>
            typeof frame === "object" &&
            frame !== null &&
            Number.isFinite(frame.timeSeconds) &&
            frame.timeSeconds >= 0 &&
            typeof frame.imageData === "string" &&
            frame.imageData.length <= 250_000 &&
            /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(frame.imageData),
        ) ||
        i.options.videoFrames.reduce((total, frame) => total + frame.imageData.length, 0) > 700_000)
    ) {
      throw new Error("ارفع فيديو صالحاً وانتظر تجهيز اللقطات الثلاث قبل تشغيل استوديو المونتاج.");
    }
    if (i.studio === "animation" && i.options?.renderVideo === "1" && i.prompt.length > 5000) {
      throw new Error("اختصر وصف المشهد إلى 5000 حرف أو أقل لإنشاء التعليق الصوتي.");
    }
    return i;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: account, error: accountError } = await supabase
      .from("profiles")
      .select("balance,plan_name")
      .eq("id", userId)
      .maybeSingle();
    if (accountError) throw new Error(`تعذر التحقق من رصيدك: ${accountError.message}`);
    if (!account) throw new Error("ملف حسابك غير موجود في profiles.");
    if (!Number.isSafeInteger(account.balance) || account.balance < 0) {
      throw new Error("رصيد حسابك غير صالح. تواصل مع الإدارة قبل تشغيل الاستوديو.");
    }
    const o = data.options ?? {};
    if (
      data.studio === "auto_video" &&
      (!o.mediaType?.startsWith("video/") ||
        !Number.isSafeInteger(o.mediaSize) ||
        (o.mediaSize ?? 0) <= 0 ||
        (o.mediaSize ?? 0) > MAX_VIDEO_MEDIA_BYTES)
    ) {
      throw new Error("ملف الفيديو غير صالح أو لا ينتمي إلى حسابك.");
    }
    const tier = parseTier(account.plan_name);
    const freePlan = tier === "free";
    const creditCost = getStudioCreditCostForTier(tier, data.studio);
    if (account.balance === 0 && !freePlan) return { blocked: true as const };
    if (!freePlan && account.balance < creditCost) {
      return { blocked: true as const, reason: "insufficient_credits" as const };
    }
    if (!process.env["GEMINI_API_KEY"]) {
      throw new Error("خدمة Gemini غير مهيأة. أضف GEMINI_API_KEY إلى أسرار الخادم.");
    }
    if (
      data.studio === "voice" ||
      data.studio === "dubbing" ||
      (data.studio === "animation" && o.renderVideo === "1")
    ) {
      if (!process.env["EDGE_TTS_SERVICE_URL"] || !process.env["EDGE_TTS_SERVICE_TOKEN"]) {
        throw new Error(
          "خدمة edge-tts غير مهيأة. اضبط EDGE_TTS_SERVICE_URL وEDGE_TTS_SERVICE_TOKEN.",
        );
      }
    }

    let kind: "text" | "html" | "code" | "image" | "audio" = "text";
    let output = "";
    let previewHtml: string | undefined;
    let outputPath: string | null = null;
    let outputFileSize: number | null = null;
    let resultMediaUrl: string | null = null;
    let narrationUrl: string | null = null;
    let outputFileType: string | null = null;
    const languageCode = o.lang ?? "ar";
    if (!/^[a-z]{2,3}$/.test(languageCode)) {
      throw new Error("لغة الإخراج غير صالحة.");
    }
    const lang = new Intl.DisplayNames(["en"], { type: "language" }).of(languageCode);
    if (!lang) throw new Error("لغة الإخراج غير مدعومة.");

    switch (data.studio) {
      case "auto_video":
        output = await generateAutoVideoPlan(o.file ?? "", data.prompt, o, lang);
        break;
      case "animation":
        output = await streamText(
          `You are an award-winning screenwriter and visual development artist. Reply in ${lang}. Turn the user's requested events into a coherent short story without replacing them with unrelated plot. Start with a concise visual concept, then define each main character's appearance, motivation, and movement style. Follow with a scene-by-scene screenplay with numbered scenes, setting, action, dialogue, camera direction, lighting, and a useful shot list for ${o.mode === "3d" ? "3D animation" : "live-action cinema"}. Give the story a clear beginning, development, and ending.`,
          data.prompt,
        );
        if (o.renderVideo === "1") {
          const voiceLanguage = lang;
          const dialect =
            voiceLanguage === "Arabic" ? "msa" : voiceLanguage === "English" ? "us" : "standard";
          const narration = await streamText(
            `Write a concise spoken narration in ${voiceLanguage}, based on this screenplay. Keep it natural, avoid stage directions, and limit it to about 120 words. Return only the narration text.`,
            output,
          );
          const audio = await generateSpeech(narration, voiceLanguage, dialect, "warm");
          outputPath = `${userId}/${crypto.randomUUID()}-motion.mp3`;
          const { error: uploadError } = await supabase.storage
            .from("project-vault")
            .upload(outputPath, audio, { contentType: "audio/mpeg", upsert: false });
          if (uploadError)
            throw new Error(`تعذر حفظ التعليق الصوتي للفيديو: ${uploadError.message}`);
          outputFileSize = audio.length;
          outputFileType = "audio/mpeg";
          const { data: signed, error: signedError } = await supabase.storage
            .from("project-vault")
            .createSignedUrl(outputPath, 3600);
          if (signedError) {
            await removeGeneratedMedia(supabase, outputPath);
            throw new Error(`تعذر تجهيز التعليق الصوتي للفيديو: ${signedError.message}`);
          }
          narrationUrl = signed.signedUrl;
        }
        break;
      case "voice": {
        const tones: Record<string, string> = {
          warm: "warm, reassuring, and personable",
          energetic: "energetic, upbeat, and lively",
          dramatic: "dramatic, expressive, and suspenseful",
          calm: "calm, measured, and soothing",
          persuasive: "confident, persuasive, and suitable for an advertisement",
        };
        const tone = o.voiceTone ?? "warm";
        const toneDescription = tones[tone] ?? tones["warm"]!;
        const voiceLanguage = o.voiceLanguage ?? "Arabic";
        if (!EDGE_TTS_LANGUAGES.includes(voiceLanguage as (typeof EDGE_TTS_LANGUAGES)[number])) {
          throw new Error("لغة التعليق الصوتي غير مدعومة.");
        }
        const dialects: Record<string, Record<string, string>> = {
          Arabic: {
            egyptian: "Egyptian Arabic",
            msa: "Modern Standard Arabic",
            levantine: "Levantine Arabic",
            gulf: "Gulf Arabic",
            iraqi: "Iraqi Arabic",
            maghrebi: "Maghrebi Arabic",
            sudanese: "Sudanese Arabic",
            yemeni: "Yemeni Arabic",
          },
          English: {
            us: "US English",
            uk: "UK English",
            australian: "Australian English",
            indian: "Indian English",
          },
          Spanish: {
            spain: "Spanish from Spain",
            mexican: "Mexican Spanish",
            latin_american: "Latin American Spanish",
          },
          French: { france: "French from France", canadian: "Canadian French" },
          Portuguese: { brazilian: "Brazilian Portuguese", european: "European Portuguese" },
          Chinese: { mandarin: "Mandarin Chinese", cantonese: "Cantonese Chinese" },
          German: { standard: "Standard German", austrian: "Austrian German" },
        };
        const dialect = dialects[o.voiceLanguage ?? "Arabic"]?.[o.dialect ?? "egyptian"];
        output = await streamText(
          `Rewrite the text as a polished voice-over script in ${voiceLanguage}${
            dialect ? ` (${dialect} dialect/accent)` : ""
          }, with a ${toneDescription} delivery. Preserve the original meaning, adapt wording for natural speech, and add only useful pause markers. Return only the script.`,
          data.prompt,
        );
        const audio = await generateSpeech(output, voiceLanguage, o.dialect ?? "standard", tone);
        outputPath = `${userId}/${crypto.randomUUID()}-voice.mp3`;
        const { error: uploadError } = await supabase.storage
          .from("project-vault")
          .upload(outputPath, audio, { contentType: "audio/mpeg", upsert: false });
        if (uploadError) throw new Error(`تعذر حفظ التعليق الصوتي: ${uploadError.message}`);
        outputFileSize = audio.length;
        const { data: signed, error: signedError } = await supabase.storage
          .from("project-vault")
          .createSignedUrl(outputPath, 3600);
        if (signedError) {
          await removeGeneratedMedia(supabase, outputPath);
          throw new Error(`تعذر تجهيز الصوت للمعاينة: ${signedError.message}`);
        }
        kind = "audio";
        outputFileType = "audio/mpeg";
        resultMediaUrl = signed.signedUrl;
        break;
      }
      case "dubbing": {
        const targetLanguage = o.target ?? "English";
        if (!EDGE_TTS_LANGUAGES.includes(targetLanguage as (typeof EDGE_TTS_LANGUAGES)[number])) {
          throw new Error("لغة الترجمة والتعليق الصوتي غير مدعومة.");
        }
        output = await streamText(
          `You are a professional translator. Translate the supplied script into ${targetLanguage}. Preserve its meaning and tone, adapt phrasing for natural spoken delivery, and return only the translated script.`,
          data.prompt,
        );
        const audio = await generateSpeech(
          output,
          targetLanguage,
          "standard",
          o.voiceTone ?? "warm",
        );
        outputPath = `${userId}/${crypto.randomUUID()}-translation.mp3`;
        const { error: uploadError } = await supabase.storage
          .from("project-vault")
          .upload(outputPath, audio, { contentType: "audio/mpeg", upsert: false });
        if (uploadError) throw new Error(`تعذر حفظ التعليق المترجم: ${uploadError.message}`);
        outputFileSize = audio.length;
        const { data: signed, error: signedError } = await supabase.storage
          .from("project-vault")
          .createSignedUrl(outputPath, 3600);
        if (signedError) {
          await removeGeneratedMedia(supabase, outputPath);
          throw new Error(`تعذر تجهيز الصوت للمعاينة: ${signedError.message}`);
        }
        kind = "audio";
        outputFileType = "audio/mpeg";
        resultMediaUrl = signed.signedUrl;
        break;
      }
      case "app_engine":
        {
          const techStack = o.techStack ?? "html";
          const projectType =
            o.projectType === "mobile" ? "mobile application" : "website/web application";
          const stackInstructions: Record<NonNullable<typeof o.techStack>, string> = {
            html: "a complete, self-contained HTML document with inline CSS and JavaScript",
            react:
              "a complete React JSX source file with inline styles and no external component libraries",
            python:
              "a complete Python 3 source file using the standard library; for a website, use a small HTTP server that renders HTML, CSS and JavaScript",
            java: "a complete Java source file; for mobile, use an Android Activity and standard Android SDK widgets, otherwise make it a runnable standalone application",
            cpp: "a complete, compilable C++17 source file with a main function and standard-library-only dependencies",
            kotlin:
              "a complete Kotlin Android Activity source file using standard Android SDK widgets",
          };
          const brief = `Create a complete, functional ${projectType} from the user's brief. Target technology: ${stackInstructions[techStack]}. Implement the core workflow with useful working controls, realistic sample content, validation, accessible labels, and polished responsive UI. Write user-facing UI text in ${lang}.`;

          if (techStack === "html") {
            kind = "html";
            output = await streamText(
              `${brief} Return only a complete HTML document, with no markdown fences or explanatory prose.`,
              data.prompt,
            );
            output = output.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "");
            previewHtml = output;
          } else {
            kind = "code";
            const generated = await streamText(
              `${brief} Also create a self-contained HTML preview that visually represents the same application and its main interaction. Return only a valid JSON object with exactly two string properties: "source" (the complete ${techStack} source code) and "previewHtml" (the complete standalone HTML preview). Do not use markdown fences or include other properties.`,
              data.prompt,
            );
            const project = parseGeneratedAppProject(generated);
            output = project.source;
            previewHtml = project.previewHtml;
          }
        }
        break;
      case "image": {
        kind = "image";
        const styles: Record<string, string> = {
          cinematic: "cinematic still, intentional composition and dramatic lighting",
          product: "professional product photography, clean commercial composition",
          illustration: "refined editorial illustration with a clear focal point",
          editorial: "high-end editorial art direction and thoughtful composition",
        };
        const uses: Record<string, string> = {
          campaign: "designed for an advertising campaign",
          social: "composed for a social media post",
          story: "designed as a narrative story scene",
        };
        const direction = `${styles[o.imageStyle ?? "cinematic"] ?? styles["cinematic"]}; ${uses[o.imageUse ?? "campaign"] ?? uses["campaign"]}`;
        let prompt = `${data.prompt}. Visual style: ${direction}. Aspect ratio: ${o.ratio ?? "1:1"}.`;
        if (o.enhance === "1") {
          prompt = await streamText(
            "Translate and enhance the following image brief into a detailed English prompt for an image model. Preserve the subject, and use the requested visual style, project purpose, and aspect ratio to guide lighting, lens, composition, and art direction. Return only the prompt.",
            prompt,
          );
        }
        output = await genImage(prompt, SIZES[o.ratio ?? "1:1"] ?? "1024x1024");
        break;
      }
      case "templates":
        output = await streamText(
          `You are a social media ad copywriter. Reply in ${lang}. Fill the template "${o.template}" with headline, body, CTA, hashtags and a visual direction.`,
          data.prompt || "منتج عام",
        );
        break;
      default:
        throw new Error("Unknown studio");
    }

    if (data.studio === "auto_video") {
      return {
        blocked: false as const,
        kind: "edit_plan" as const,
        output,
        left: account.balance,
        mediaUrl: null,
      };
    }

    const mediaType = outputFileType ?? o.mediaType ?? "";
    const { data: savedProject, error: saveError } = await supabase
      .from("media_vault")
      .insert({
        user_id: userId,
        file_name: (data.prompt || data.studio).slice(0, 60),
        file_type:
          mediaType ||
          (kind === "image" ? "image/png" : kind === "html" ? "text/html" : "text/plain"),
        file_url:
          outputPath ?? o.mediaPath ?? (kind === "image" && output.length <= 900_000 ? output : ""),
        file_size: outputFileSize ?? o.mediaSize ?? output.length,
        notes: output,
      })
      .select("id")
      .single();
    if (saveError) {
      await removeGeneratedMedia(supabase, outputPath);
      throw new Error(`تعذر حفظ المشروع في الخزنة: ${saveError.message}`);
    }

    if (freePlan) {
      return {
        blocked: false as const,
        kind,
        output,
        left: account.balance,
        mediaUrl: resultMediaUrl,
        ...(narrationUrl ? { narrationUrl } : {}),
        ...(previewHtml ? { previewHtml } : {}),
      };
    }

    const { data: left, error: consumeError } = await supabase.rpc("consume_credits", {
      _amount: creditCost,
    });
    if (consumeError || left === -1 || !Number.isSafeInteger(left)) {
      const { error: cleanupError } = await supabase
        .from("media_vault")
        .delete()
        .eq("id", savedProject.id);
      if (cleanupError) {
        await removeGeneratedMedia(supabase, outputPath);
        throw new Error(
          `تعذر خصم ${creditCost} نقاط${consumeError ? `: ${consumeError.message}` : left === -1 ? " لعدم كفاية الرصيد" : " لأن قاعدة البيانات أعادت رصيداً غير صالح"}، وتعذر حذف النتيجة المؤقتة من الخزنة: ${cleanupError.message}`,
        );
      }
      await removeGeneratedMedia(supabase, outputPath);
      if (consumeError) {
        throw new Error(
          `تعذر خصم ${creditCost} نقاط: ${formatRpcError(consumeError, "consume_credits(integer)", "20261026130000_studio_credit_costs.sql")}`,
        );
      }
      if (left === -1) return { blocked: true as const };
      throw new Error("تعذر التحقق من الرصيد بعد إنشاء النتيجة؛ لم يتم خصم نقاط.");
    }

    return {
      blocked: false as const,
      kind,
      output,
      left,
      mediaUrl: resultMediaUrl,
      ...(narrationUrl ? { narrationUrl } : {}),
      ...(previewHtml ? { previewHtml } : {}),
    };
  });

export const completeAutoVideoEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { mediaPath: string; mediaSize: number; editPlan: string }) => {
    if (
      !input ||
      typeof input.mediaPath !== "string" ||
      !Number.isSafeInteger(input.mediaSize) ||
      input.mediaSize <= 0 ||
      input.mediaSize > MAX_VIDEO_MEDIA_BYTES ||
      typeof input.editPlan !== "string" ||
      input.editPlan.length > 20_000
    ) {
      throw new Error("ملف الفيديو النهائي غير صالح أو يتجاوز الحد المسموح (50 ميجابايت).");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const prefix = `${userId}/`;
    const fileName = data.mediaPath.startsWith(prefix) ? data.mediaPath.slice(prefix.length) : "";
    if (!/^youssefco-edit-[0-9a-f-]{36}\.mp4$/i.test(fileName)) {
      throw new Error("مسار ملف الفيديو النهائي غير صالح.");
    }

    const { data: uploadedFiles, error: listError } = await supabase.storage
      .from("project-vault")
      .list(userId, { search: fileName, limit: 10 });
    if (listError) throw new Error(`تعذر التحقق من ملف الفيديو النهائي: ${listError.message}`);
    const uploadedFile = uploadedFiles?.find((file) => file.name === fileName);
    if (
      !uploadedFile ||
      uploadedFile.metadata?.size !== data.mediaSize ||
      uploadedFile.metadata.mimetype !== "video/mp4"
    ) {
      throw new Error("ملف الفيديو النهائي غير موجود أو لم يكتمل رفعه.");
    }

    const { data: account, error: accountError } = await supabase
      .from("profiles")
      .select("balance,plan_name")
      .eq("id", userId)
      .maybeSingle();
    if (accountError) throw new Error(`تعذر التحقق من رصيدك: ${accountError.message}`);
    if (!account) throw new Error("ملف حسابك غير موجود في profiles.");
    if (!Number.isSafeInteger(account.balance) || account.balance < 0) {
      throw new Error("رصيد حسابك غير صالح.");
    }
    const tier = parseTier(account.plan_name);
    const freePlan = tier === "free";
    const creditCost = getStudioCreditCostForTier(tier, "auto_video");
    if (account.balance === 0 && !freePlan) return { blocked: true as const };
    if (!freePlan && account.balance < creditCost) {
      return { blocked: true as const, reason: "insufficient_credits" as const };
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("project-vault")
      .createSignedUrl(data.mediaPath, 3600);
    if (signedError) throw new Error(`تعذر تجهيز الفيديو النهائي للمعاينة: ${signedError.message}`);
    const { data: downloadable, error: downloadError } = await supabase.storage
      .from("project-vault")
      .createSignedUrl(data.mediaPath, 3600, { download: "youssefco-edited.mp4" });
    if (downloadError) {
      throw new Error(`تعذر تجهيز تنزيل الفيديو النهائي: ${downloadError.message}`);
    }

    const { data: saved, error: saveError } = await supabase
      .from("media_vault")
      .insert({
        user_id: userId,
        file_name: "Youssefco auto edit.mp4",
        file_type: "video/mp4",
        file_url: data.mediaPath,
        file_size: data.mediaSize,
        notes: data.editPlan,
      })
      .select("id")
      .single();
    if (saveError) throw new Error(`تعذر حفظ الفيديو النهائي في الخزنة: ${saveError.message}`);

    const removeVaultRow = async () => {
      const { error } = await supabase.from("media_vault").delete().eq("id", saved.id);
      if (error) {
        throw new Error(`تعذر التراجع عن حفظ الفيديو النهائي: ${error.message}`);
      }
    };

    if (freePlan) {
      return {
        blocked: false as const,
        mediaUrl: signed.signedUrl,
        downloadUrl: downloadable.signedUrl,
      };
    }

    const { data: left, error: consumeError } = await supabase.rpc("consume_credits", {
      _amount: creditCost,
    });
    if (consumeError || left === -1 || !Number.isSafeInteger(left)) {
      await removeVaultRow();
      if (consumeError)
        throw new Error(
          `تعذر خصم ${creditCost} نقاط للمونتاج: ${formatRpcError(consumeError, "consume_credits(integer)", "20261026130000_studio_credit_costs.sql")}`,
        );
      if (left === -1) return { blocked: true as const };
      throw new Error("تعذر التحقق من الرصيد؛ لم يتم تأكيد خصم نقطة المونتاج.");
    }
    return {
      blocked: false as const,
      mediaUrl: signed.signedUrl,
      downloadUrl: downloadable.signedUrl,
    };
  });

export const publishAppWebsite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { html: string }) => {
    if (
      !input ||
      typeof input.html !== "string" ||
      input.html.length > 1_000_000 ||
      !/^<!doctype html|^<html/i.test(input.html.trim())
    ) {
      throw new Error("ملف الموقع غير صالح أو يتجاوز الحد المسموح للنشر.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: account, error: accountError } = await supabase
      .from("profiles")
      .select("balance,plan_name")
      .eq("id", userId)
      .maybeSingle();
    if (accountError) throw new Error(`تعذر التحقق من الباقة: ${accountError.message}`);
    if (!account) throw new Error("ملف حسابك غير موجود في profiles.");
    if (parseTier(account.plan_name) === "free" || account.balance <= 0) {
      return { blocked: true as const };
    }

    const path = `${userId}/${crypto.randomUUID()}.html`;
    const content = Buffer.from(data.html, "utf8");
    if (content.byteLength > 1_048_576) {
      throw new Error("ملف الموقع المنشور يجب ألا يتجاوز 1 ميجابايت.");
    }

    const { error: uploadError } = await supabase.storage
      .from("published-sites")
      .upload(path, content, { contentType: "text/html", upsert: false });
    if (uploadError) throw new Error(`تعذر رفع الموقع للنشر: ${uploadError.message}`);
    const removePublishedFile = async () => {
      const { error } = await supabase.storage.from("published-sites").remove([path]);
      if (error) console.error("[App Engine] تعذر حذف ملف موقع لم يكتمل نشره.", error);
    };

    const { data: publicUrl } = supabase.storage.from("published-sites").getPublicUrl(path);
    const { error: recordError } = await supabase.from("media_vault").insert({
      user_id: userId,
      file_name: "Published website",
      file_type: "text/html",
      file_url: `published-sites/${path}`,
      file_size: content.byteLength,
      notes: "Public static website generated by the App Engine.",
    });
    if (recordError) {
      await removePublishedFile();
      throw new Error(`تعذر حفظ الموقع المنشور في الخزنة: ${recordError.message}`);
    }

    return { blocked: false as const, url: publicUrl.publicUrl };
  });
