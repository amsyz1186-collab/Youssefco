import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, Download, Trash2, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PaywallModal } from "@/components/PaywallModal";
import { StudioIcon } from "@/components/StudioIcon";
import { VideoFallbackPreview } from "@/components/VideoFallbackPreview";
import { supabase } from "@/integrations/supabase/client";
import { completeAutoVideoEdit, publishAppWebsite, runStudio } from "@/lib/ai.functions";
import { parseAutoVideoEditPlan } from "@/lib/auto-video-edit";
import { getKlingVideoQuota, pollKlingVideo, startKlingVideo } from "@/lib/kling-video.functions";
import { pick, useLang } from "@/lib/i18n";
import { getStudioCreditCost, METERED, STUDIOS, type StudioId } from "@/lib/plans";
import { useAuth, useProfile } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/studio/$id")({
  beforeLoad: ({ params }) => {
    if (!STUDIOS.some((s) => s.id === params.id)) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "استوديو — Youssefco" },
      { name: "description", content: "استوديو ذكاء اصطناعي في Youssefco." },
    ],
  }),
  component: StudioPage,
});

const LANGS = [
  "English",
  "Arabic",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Portuguese",
  "Turkish",
  "Russian",
  "Chinese",
  "Japanese",
  "Korean",
  "Hindi",
  "Urdu",
  "Persian",
  "Indonesian",
  "Malay",
  "Swahili",
  "Dutch",
  "Swedish",
  "Polish",
  "Greek",
  "Hebrew",
  "Thai",
  "Vietnamese",
];
const VOICE_DIALECTS: Record<string, [string, string][]> = {
  Arabic: [
    ["egyptian", "Egyptian Arabic"],
    ["msa", "Modern Standard Arabic"],
    ["levantine", "Levantine Arabic"],
    ["gulf", "Gulf Arabic"],
    ["iraqi", "Iraqi Arabic"],
    ["maghrebi", "Maghrebi Arabic"],
    ["sudanese", "Sudanese Arabic"],
    ["yemeni", "Yemeni Arabic"],
  ],
  English: [
    ["us", "US English"],
    ["uk", "UK English"],
    ["australian", "Australian English"],
    ["indian", "Indian English"],
  ],
  Spanish: [
    ["spain", "Spain Spanish"],
    ["mexican", "Mexican Spanish"],
    ["latin_american", "Latin American Spanish"],
  ],
  French: [
    ["france", "France French"],
    ["canadian", "Canadian French"],
  ],
  Portuguese: [
    ["brazilian", "Brazilian Portuguese"],
    ["european", "European Portuguese"],
  ],
  Chinese: [
    ["mandarin", "Mandarin"],
    ["cantonese", "Cantonese"],
  ],
  German: [
    ["standard", "Standard German"],
    ["austrian", "Austrian German"],
  ],
};
type VideoKeyframe = { timeSeconds: number; imageData: string };

function dialectLabelAr(value: string) {
  const labels: Record<string, string> = {
    egyptian: "مصرية",
    msa: "العربية الفصحى",
    levantine: "شامية",
    gulf: "خليجية",
    iraqi: "عراقية",
    maghrebi: "مغاربية",
    sudanese: "سودانية",
    yemeni: "يمنية",
    us: "إنجليزية أمريكية",
    uk: "إنجليزية بريطانية",
    australian: "إنجليزية أسترالية",
    indian: "إنجليزية هندية",
    spain: "إسبانية من إسبانيا",
    mexican: "إسبانية مكسيكية",
    latin_american: "إسبانية لاتينية",
    france: "فرنسية من فرنسا",
    canadian: "فرنسية كندية",
    brazilian: "برتغالية برازيلية",
    european: "برتغالية أوروبية",
    mandarin: "ماندرين",
    cantonese: "كانتونية",
    standard: "ألمانية معيارية",
    austrian: "ألمانية نمساوية",
  };
  return labels[value] ?? value;
}

const TEMPLATES = [
  { id: "ramadan", ar: "حملة رمضان", en: "Ramadan campaign" },
  { id: "launch", ar: "إطلاق منتج", en: "Product launch" },
  { id: "sale", ar: "تخفيضات كبرى", en: "Mega sale" },
  { id: "restaurant", ar: "إعلان مطعم", en: "Restaurant ad" },
  { id: "realestate", ar: "عقارات فاخرة", en: "Luxury real estate" },
  { id: "tiktok", ar: "ترند تيك توك", en: "TikTok trend" },
  { id: "course", ar: "كورس أونلاين", en: "Online course" },
  { id: "event", ar: "دعوة فعالية", en: "Event invite" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} onClick={onClick}>
      {children}
    </Button>
  );
}

function StudioPage() {
  const { id } = Route.useParams() as { id: StudioId };
  const studio = STUDIOS.find((s) => s.id === id)!;
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const { user } = useAuth();
  const {
    data: profile,
    isError: profileError,
    error: profileLoadError,
    isLoading: profileLoading,
    refetch: retryProfile,
  } = useProfile(user?.id);
  const qc = useQueryClient();
  const run = useServerFn(runStudio);
  const publishWebsite = useServerFn(publishAppWebsite);
  const loadKlingQuota = useServerFn(getKlingVideoQuota);
  const startKling = useServerFn(startKlingVideo);
  const pollKling = useServerFn(pollKlingVideo);

  const [prompt, setPrompt] = useState("");
  const [opts, setOpts] = useState<{
    platform: string;
    mood: string;
    mode: string;
    dialect: string;
    target: string;
    ratio: string;
    enhance: string;
    renderVideo: string;
    clipDuration: string;
    voiceTone: string;
    imageStyle: string;
    imageUse: string;
    videoAnalysisConsent: boolean;
    includeMusic: boolean;
    includeEffects: boolean;
    voiceLanguage: string;
    template?: string;
    projectType: "website" | "mobile";
    techStack: "html" | "react" | "python" | "java" | "cpp" | "kotlin";
  }>({
    platform: "YouTube 16:9",
    mood: "Mix",
    mode: "3d",
    dialect: "egyptian",
    target: "English",
    ratio: "1:1",
    enhance: "1",
    renderVideo: "0",
    clipDuration: "0",
    voiceTone: "warm",
    imageStyle: "cinematic",
    imageUse: "campaign",
    videoAnalysisConsent: false,
    includeMusic: true,
    includeEffects: true,
    voiceLanguage: "Arabic",
    projectType: "website",
    techStack: "html",
  });
  const [fileName, setFileName] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [videoFrames, setVideoFrames] = useState<VideoKeyframe[]>([]);
  const [clipDurationSeconds, setClipDurationSeconds] = useState(0);
  const [framesLoading, setFramesLoading] = useState(false);
  const [frameExtractionError, setFrameExtractionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{
    kind: string;
    output: string;
    mediaUrl: string | null;
    narrationUrl?: string;
    downloadUrl?: string;
    fileName?: string;
    previewHtml?: string;
  } | null>(null);
  const [localFallbackFailed, setLocalFallbackFailed] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState(t("paywall"));
  const [appOutputTab, setAppOutputTab] = useState<"preview" | "code">("preview");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [klingQuota, setKlingQuota] = useState<{
    configured: boolean;
    enabled: boolean;
    limit: number;
    remaining: number;
    resetsAt: string | null;
    tier: string;
  } | null>(null);
  const [klingQuotaError, setKlingQuotaError] = useState<string | null>(null);
  const [klingBusy, setKlingBusy] = useState(false);
  const [klingPolling, setKlingPolling] = useState(false);
  const [klingRequestId, setKlingRequestId] = useState<string | null>(null);
  const [klingVideoUrl, setKlingVideoUrl] = useState<string | null>(null);
  const [klingError, setKlingError] = useState<string | null>(null);
  const [klingIdempotencyKey, setKlingIdempotencyKey] = useState<string | null>(null);
  const set = (
    k:
      | "platform"
      | "mood"
      | "mode"
      | "dialect"
      | "target"
      | "ratio"
      | "enhance"
      | "renderVideo"
      | "clipDuration"
      | "voiceTone"
      | "voiceLanguage"
      | "imageStyle"
      | "imageUse"
      | "videoAnalysisConsent"
      | "template",
    v: string,
  ) => setOpts((o) => ({ ...o, [k]: v }));

  const balance = profile?.balance ?? null;
  const creditCost = getStudioCreditCost(id);
  const finalizeEdit = useServerFn(completeAutoVideoEdit);

  useEffect(() => {
    if (id !== "animation") return;
    let active = true;
    void loadKlingQuota({ data: {} })
      .then((quota) => {
        if (active) {
          setKlingQuota(quota);
          setKlingQuotaError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setKlingQuotaError(error instanceof Error ? error.message : "تعذر تحميل حصة Kling.");
        }
      });
    return () => {
      active = false;
    };
  }, [id, loadKlingQuota]);

  useEffect(() => {
    if (!klingPolling || !klingRequestId) return;
    let active = true;
    let checking = false;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (checking || !active) return;
      checking = true;
      attempts += 1;
      void pollKling({ data: { requestId: klingRequestId } })
        .then((status) => {
          if (!active) return;
          if (status.status === "succeed") {
            setKlingVideoUrl(status.videoUrl);
            setKlingRequestId(null);
            setKlingPolling(false);
            void loadKlingQuota({ data: {} }).then(setKlingQuota).catch(console.error);
          } else if (status.status === "failed") {
            setKlingError(
              ar
                ? "أخفقت خدمة Kling في إنشاء الفيديو. حُسب الطلب ضمن الكوتا لأنه قُبل من الخادم."
                : "Kling could not generate the video. The accepted request counts toward your quota.",
            );
            setKlingRequestId(null);
            setKlingPolling(false);
            void loadKlingQuota({ data: {} }).then(setKlingQuota).catch(console.error);
          } else if (attempts >= 120) {
            setKlingError(
              ar
                ? "ما زال الفيديو قيد المعالجة. أعد الفحص لاحقاً؛ لن يُرسل طلب جديد."
                : "The video is still processing. Resume status checks later; no new generation will be submitted.",
            );
            setKlingPolling(false);
          }
        })
        .catch((error: unknown) => {
          if (!active) return;
          setKlingError(error instanceof Error ? error.message : "تعذر فحص حالة مهمة Kling.");
          setKlingPolling(false);
        })
        .finally(() => {
          checking = false;
        });
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [ar, klingPolling, klingRequestId, loadKlingQuota, pollKling]);

  async function createKlingVideo() {
    if (klingBusy || klingPolling || !prompt.trim()) return;
    setKlingBusy(true);
    setKlingError(null);
    setKlingVideoUrl(null);
    const idempotencyKey = klingIdempotencyKey ?? crypto.randomUUID();
    setKlingIdempotencyKey(idempotencyKey);
    try {
      const request = await startKling({
        data: { prompt: prompt.trim(), ratio: opts.ratio, idempotencyKey },
      });
      if (request.blocked) {
        setKlingIdempotencyKey(null);
        if (request.reason === "paid_required") {
          setPaywallReason(
            ar
              ? "Kling متاح للخطط المدفوعة فقط. يمكن للحساب المجاني متابعة استخدام الفيديو المحلي دون أي خصم."
              : "Kling is restricted to paid plans. Free accounts can continue using local video without any credit deduction.",
          );
        } else if (request.reason === "credits") {
          setPaywallReason(
            ar
              ? "تحتاج محاولات Kling المدفوعة إلى نقطتين لكل فيديو. اشحن رصيدك، أو استخدم Tier 1 وTier 2 مجاناً."
              : "Paid Kling generation needs 2 credits per video. Top up or continue with free Tier 1 and Tier 2.",
          );
        } else {
          setPaywallReason(
            ar
              ? `استهلكت حصة Kling (${request.used}/${request.limit}). انتظر التجديد أو رقِّ باقتك، أو واصل استخدام الفيديو المحلي مجاناً.`
              : `Your Kling quota is used (${request.used}/${request.limit}). Wait for renewal or upgrade, or keep using free local video.`,
          );
        }
        setPaywall(true);
        return;
      }
      if ("failed" in request && request.failed) {
        setKlingIdempotencyKey(null);
        setKlingError(request.message);
        void loadKlingQuota({ data: {} }).then(setKlingQuota).catch(console.error);
        return;
      }
      setKlingIdempotencyKey(null);
      setKlingRequestId(request.requestId);
      setKlingPolling(true);
      void loadKlingQuota({ data: {} }).then(setKlingQuota).catch(console.error);
      void qc.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success(
        ar
          ? "قُبل طلب Kling. سيُحتسب ضمن حصتك حتى إذا تعذر المزوّد لاحقاً."
          : "Kling accepted the request. It counts toward quota even if the provider later fails.",
      );
    } catch (error) {
      setKlingError(error instanceof Error ? error.message : "تعذر بدء توليد Kling.");
      void loadKlingQuota({ data: {} }).then(setKlingQuota).catch(console.error);
    } finally {
      setKlingBusy(false);
    }
  }

  useEffect(() => {
    if (!mediaFile) {
      const frame = requestAnimationFrame(() => setMediaUrl(null));
      return () => cancelAnimationFrame(frame);
    }
    const url = URL.createObjectURL(mediaFile);
    const frame = requestAnimationFrame(() => setMediaUrl(url));
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(url);
    };
  }, [mediaFile]);

  useEffect(() => {
    setVideoFrames([]);
    setClipDurationSeconds(0);
    setFrameExtractionError(null);
    if (id !== "auto_video" || !mediaFile?.type.startsWith("video/")) {
      setFramesLoading(false);
      return;
    }

    let cancelled = false;
    setFramesLoading(true);
    void extractVideoKeyframes(mediaFile)
      .then(({ frames, duration }) => {
        if (!cancelled) {
          setVideoFrames(frames);
          setClipDurationSeconds(duration);
          setOpts((current) => ({ ...current, clipDuration: String(Math.ceil(duration)) }));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFrameExtractionError(
            error instanceof Error ? error.message : "تعذر استخراج لقطات من الفيديو.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setFramesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, mediaFile]);

  async function execute() {
    if (!profile || balance === null) {
      toast.error(
        profileLoadError instanceof Error
          ? profileLoadError.message
          : ar
            ? "تعذر تحميل رصيد الاستوديو. أعد المحاولة بعد التأكد من إعداد قاعدة البيانات."
            : lang === "zh"
              ? "工作室余额不可用，请检查数据库配置后重试。"
              : "Studio balance is unavailable. Check the database setup and retry.",
      );
      return;
    }
    if (profile.tier !== "free" && (balance === 0 || balance < creditCost)) {
      setPaywallReason(
        ar
          ? `هذا الاستوديو يحتاج ${creditCost} نقاط لكل تشغيل، ورصيدك الحالي ${balance}.`
          : `This studio needs ${creditCost} credits per run; your balance is ${balance}.`,
      );
      return setPaywall(true);
    }
    setBusy(true);
    setResult(null);
    setLocalFallbackFailed(false);
    let uploadedPath: string | null = null;
    let renderedPath: string | null = null;
    try {
      if (id === "auto_video" && !mediaFile?.type.startsWith("video/")) {
        throw new Error(ar ? "ارفع فيديو صالحاً أولاً." : "Upload a valid video first.");
      }
      const r = await run({
        data: {
          studio: id,
          prompt,
          options: {
            ...opts,
            file: fileName,
            lang,
            ...(uploadedPath && mediaFile
              ? {
                  mediaPath: uploadedPath,
                  mediaSize: mediaFile.size,
                  mediaType: mediaFile.type,
                  ...(id === "auto_video" ? { clipDuration: opts.clipDuration } : {}),
                  ...(id === "auto_video" ? { videoFrames } : {}),
                }
              : {}),
            ...(id === "auto_video" && mediaFile
              ? {
                  mediaSize: mediaFile.size,
                  mediaType: mediaFile.type,
                  clipDuration: String(clipDurationSeconds),
                  videoFrames,
                }
              : {}),
          },
        },
      });
      if (r.blocked) {
        if (uploadedPath) {
          const { error } = await supabase.storage.from("project-vault").remove([uploadedPath]);
          if (error) throw error;
          uploadedPath = null;
        }
        setPaywallReason(
          ar
            ? `هذا الاستوديو يحتاج ${creditCost} نقاط لكل تشغيل. أضف رصيداً للمتابعة.`
            : `This studio needs ${creditCost} credits per run. Add credits to continue.`,
        );
        setPaywall(true);
        return;
      }
      if ("kind" in r && r.kind === "edit_plan") {
        if (!mediaFile || !user) throw new Error("ملف الفيديو أو الحساب غير متاح لإتمام المونتاج.");
        const plan = parseAutoVideoEditPlan(r.output, clipDurationSeconds);
        setRenderProgress(0);
        const { renderVideoEdit } = await import("@/lib/video-renderer");
        const rendered = await renderVideoEdit(
          mediaFile,
          plan,
          {
            mood: opts.mood,
            platform: opts.platform,
            includeMusic: opts.includeMusic,
            includeEffects: opts.includeEffects,
          },
          setRenderProgress,
        );
        if (rendered.byteLength > 50 * 1024 * 1024) {
          throw new Error("حجم الفيديو النهائي يتجاوز حد الخزنة (50 ميجابايت).");
        }
        const renderedBlob = new Blob([rendered.slice().buffer], { type: "video/mp4" });
        renderedPath = `${user.id}/youssefco-edit-${crypto.randomUUID()}.mp4`;
        const { error: resultUploadError } = await supabase.storage
          .from("project-vault")
          .upload(renderedPath, renderedBlob, { contentType: "video/mp4", upsert: false });
        if (resultUploadError) throw resultUploadError;

        const completed = await finalizeEdit({
          data: {
            mediaPath: renderedPath,
            mediaSize: renderedBlob.size,
            editPlan: r.output,
          },
        });
        if (completed.blocked) {
          const { error: removeError } = await supabase.storage
            .from("project-vault")
            .remove([renderedPath]);
          if (removeError) throw removeError;
          renderedPath = null;
          if (uploadedPath) {
            const { error } = await supabase.storage.from("project-vault").remove([uploadedPath]);
            if (error) throw error;
            uploadedPath = null;
          }
          setPaywallReason(t("paywall"));
          setPaywall(true);
          return;
        }

        renderedPath = null;
        if (uploadedPath) {
          const { error } = await supabase.storage.from("project-vault").remove([uploadedPath]);
          if (error) {
            console.error("[Auto video] Could not remove the temporary source upload", error);
            toast.error(
              ar
                ? "تم حفظ الفيديو النهائي، لكن تعذر حذف الرفع المؤقت للمصدر."
                : "The final video was saved, but the temporary source upload could not be removed.",
            );
          }
          uploadedPath = null;
        }
        setResult({
          kind: "video",
          output: plan.title,
          mediaUrl: completed.mediaUrl,
          downloadUrl: completed.downloadUrl,
        });
        void qc.invalidateQueries({ queryKey: ["profile", user?.id] });
        toast.success(
          ar
            ? "اكتمل الفيديو النهائي وجاهز للتنزيل والنشر."
            : "Your finished video is ready to download and publish.",
        );
        return;
      }
      setResult({
        kind: r.kind,
        output: r.output,
        mediaUrl: r.mediaUrl ?? mediaUrl,
        ...("narrationUrl" in r && r.narrationUrl ? { narrationUrl: r.narrationUrl } : {}),
        ...("previewHtml" in r ? { previewHtml: r.previewHtml } : {}),
        ...(id === "app_engine"
          ? { fileName: appEngineFileName(opts.techStack, opts.projectType) }
          : {}),
      });
      setAppOutputTab("preview");
      setPublishedUrl(null);
      void qc.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast.success(
        profile.tier === "free"
          ? ar
            ? "حُفظت النتيجة دون خصم رصيد للخطة الأساسية."
            : "Result saved without deducting basic-plan credits."
          : t("saved"),
      );
    } catch (e) {
      if (renderedPath) {
        const { error } = await supabase.storage.from("project-vault").remove([renderedPath]);
        if (error) console.error("Failed to remove an uncommitted rendered video", error);
      }
      if (uploadedPath) {
        const { error } = await supabase.storage.from("project-vault").remove([uploadedPath]);
        if (error) console.error("Failed to remove an uncommitted studio upload", error);
      }
      toast.error((e as Error).message);
    } finally {
      setRenderProgress(null);
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["profile"] });
    }
  }

  async function publishAppPreview() {
    if (!result || id !== "app_engine") return;
    if (profile?.tier === "free") {
      setPaywallReason(
        ar
          ? "نشر المشروع ومشاركة رابطه متاحان للمشتركين."
          : "Publishing and sharing project links are available on paid plans.",
      );
      setPaywall(true);
      return;
    }
    if (opts.projectType !== "website") {
      toast.error(
        ar
          ? "تطبيقات الجوال تُصدّر إلى Android Studio؛ النشر كرابط ويب متاح لمشاريع المواقع."
          : "Mobile apps export to Android Studio. Web-link publishing is available for website projects.",
      );
      return;
    }
    const html = result.previewHtml ?? (result.kind === "html" ? result.output : null);
    if (!html) {
      toast.error(
        ar ? "معاينة الموقع غير متاحة للنشر." : "The website preview is not available to publish.",
      );
      return;
    }
    if (!user) {
      toast.error(ar ? "سجّل الدخول أولاً لنشر الموقع." : "Sign in before publishing the website.");
      return;
    }

    setPublishing(true);
    try {
      const publishResult = await publishWebsite({ data: { html } });
      if (publishResult.blocked) {
        setPaywallReason(
          ar
            ? "نشر المشروع ومشاركة رابطه متاحان للمشتركين ذوي الرصيد."
            : "Publishing project links requires an active paid plan with available credits.",
        );
        setPaywall(true);
        return;
      }

      setPublishedUrl(publishResult.url);
      void qc.invalidateQueries({ queryKey: ["vault"] });
      toast.success(
        ar
          ? "تم نشر الموقع وأصبح متاحاً عبر الرابط."
          : "Website published and available at its public link.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر نشر معاينة الموقع."
            : "Could not publish the website preview.",
      );
    } finally {
      setPublishing(false);
    }
  }

  const uploader = (accept: string, label: string) => (
    <label className="glass flex cursor-pointer items-center justify-center gap-2 border-dashed p-8 text-sm text-muted-foreground hover:text-foreground">
      <Upload className="h-5 w-5" />
      {fileName || label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;
          setFileName(selected?.name ?? "");
          setMediaFile(selected);
          if (id === "auto_video") {
            setOpts((current) => ({ ...current, videoAnalysisConsent: false }));
          }
          setResult(null);
        }}
      />
    </label>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Button
          asChild
          variant="outline"
          size="icon"
          aria-label={ar ? "العودة إلى لوحة القيادة" : "Back to dashboard"}
        >
          <Link to="/dashboard">
            <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
          </Link>
        </Button>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground glow-gold">
          <StudioIcon name={studio.icon} className="h-7 w-7" />
        </span>
        <div className="flex-1">
          <div className="font-display text-xs text-muted-foreground">
            {ar ? "منصة يوسفكو الإبداعية" : studio.en.toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold md:text-3xl">{pick(studio, lang)}</h1>
          {METERED.includes(id) && profile?.tier !== "free" && (
            <p className="mt-1 text-xs text-muted-foreground">
              {ar
                ? `${creditCost} نقاط لكل تشغيل`
                : lang === "zh"
                  ? `每次运行消耗 ${creditCost} 积分`
                  : `${creditCost} credits per run`}
            </p>
          )}
          {METERED.includes(id) && profile?.tier === "free" && (
            <p className="mt-1 text-xs text-emerald-500">
              {ar
                ? "مشمول مجاناً — دون خصم رصيد المستخدم"
                : "Included free — no user credit deduction"}
            </p>
          )}
        </div>
        {METERED.includes(id) && profile && balance !== null && (
          <div className="glass px-4 py-2 font-display text-sm text-gold">
            {balance} {ar ? "نقطة متاحة" : lang === "zh" ? "可用积分" : "credits available"}
          </div>
        )}
        {METERED.includes(id) && !profile && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <span>
              {profileLoading
                ? ar
                  ? "جارٍ تحميل الرصيد…"
                  : lang === "zh"
                    ? "正在加载余额…"
                    : "Loading balance…"
                : ar
                  ? "الرصيد غير متاح"
                  : lang === "zh"
                    ? "余额不可用"
                    : "Balance unavailable"}
            </span>
            {profileError && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void retryProfile()}>
                {ar ? "إعادة المحاولة" : lang === "zh" ? "重试" : "Retry"}
              </Button>
            )}
          </div>
        )}
      </div>

      {id === "vault" ? (
        <Vault />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="glass hud-corners space-y-4 p-6">
            {id === "auto_video" && (
              <>
                {uploader(
                  "video/*",
                  ar ? "ارفع الفيديو الذي تريد مونتاجه" : "Upload the video to edit",
                )}
                {mediaUrl && (
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    src={mediaUrl}
                    onLoadedMetadata={(event) =>
                      set("clipDuration", String(Math.round(event.currentTarget.duration)))
                    }
                    className="max-h-64 w-full rounded-xl bg-black"
                  />
                )}
                {mediaFile?.type.startsWith("video/") && (
                  <>
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      {framesLoading
                        ? ar
                          ? "جارٍ تجهيز 3 لقطات ثابتة لتحليل المشاهد..."
                          : "Preparing 3 still frames for scene analysis..."
                        : frameExtractionError ||
                          (videoFrames.length === 3
                            ? ar
                              ? "تم تجهيز 3 لقطات ثابتة. لن يُرسل الصوت."
                              : "3 still frames are ready. Audio will not be sent."
                            : "")}
                    </p>
                    <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-muted-foreground">
                      <Checkbox
                        checked={opts.videoAnalysisConsent}
                        onCheckedChange={(checked) =>
                          setOpts((current) => ({
                            ...current,
                            videoAnalysisConsent: checked === true,
                          }))
                        }
                        disabled={framesLoading || videoFrames.length !== 3}
                      />
                      <span>
                        {ar
                          ? "أوافق على إرسال 3 لقطات ثابتة من الفيديو إلى مزوّد الذكاء الاصطناعي لتحليل المشاهد. لن يُرسل ملف الفيديو أو صوته للتحليل."
                          : "I agree to send 3 still frames to the AI provider for scene analysis. The video file and its audio will not be sent for analysis."}
                      </span>
                    </label>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  {["YouTube 16:9", "TikTok 9:16", "Facebook"].map((p) => (
                    <Chip key={p} active={opts.platform === p} onClick={() => set("platform", p)}>
                      {p}
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["Comedy", "كوميدي"],
                    ["Action", "أكشن"],
                    ["Drama", "دراما"],
                    ["Mix", "دمج الكل"],
                  ].map(([v, a]) => (
                    <Chip key={v} active={opts.mood === v} onClick={() => set("mood", v!)}>
                      {ar ? a : v}
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={opts.includeMusic}
                      onCheckedChange={(checked) =>
                        setOpts((current) => ({ ...current, includeMusic: checked === true }))
                      }
                    />
                    {ar ? "إضافة موسيقى خلفية مناسبة للأسلوب" : "Add a mood-matched music bed"}
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={opts.includeEffects}
                      onCheckedChange={(checked) =>
                        setOpts((current) => ({ ...current, includeEffects: checked === true }))
                      }
                    />
                    {ar ? "إضافة مؤثرات صوتية مع القصّات" : "Add sound effects at cuts"}
                  </label>
                </div>
                <p className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs leading-6 text-muted-foreground">
                  {ar
                    ? "سيحلّل الذكاء الاصطناعي 3 لقطات ثابتة وملاحظاتك ليحدد القصّات والعناوين، ثم ينفّذها محلياً في المتصفح ويصدر MP4 جاهزاً. يظل صوتك الأصلي، وتُضاف موسيقى ومؤثرات تركيبية حسب اختيارك. حجم الفيديو الأقصى 50 ميجابايت والمدة 10 دقائق."
                    : "AI uses 3 still frames and your notes to plan cuts and captions, then renders them locally in your browser to a publish-ready MP4. Original audio is kept; optional synthesized music and sound effects are added. Max 50 MB and 10 minutes."}
                </p>
                <Textarea
                  rows={3}
                  placeholder={ar ? "ملاحظات للمونتير الذكي..." : "Notes for the AI editor..."}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </>
            )}
            {id === "animation" && (
              <>
                <div className="flex gap-2">
                  <Chip active={opts.mode === "3d"} onClick={() => set("mode", "3d")}>
                    {ar ? "أنيميشن 3D" : "3D Animation"}
                  </Chip>
                  <Chip active={opts.mode === "live"} onClick={() => set("mode", "live")}>
                    {ar ? "سينما واقعية" : "Live-Action"}
                  </Chip>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Switch
                    checked={opts.renderVideo === "1"}
                    onCheckedChange={(checked) => set("renderVideo", checked ? "1" : "0")}
                    aria-label={ar ? "معاينة حركة محلية" : "Local motion preview"}
                  />
                  {ar ? "معاينة فيديو محلية مجانية" : "Free local video preview"}
                </div>
                {opts.renderVideo === "1" && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        ["16:9", "أفقي 16:9"],
                        ["9:16", "عمودي 9:16"],
                        ["1:1", "مربع 1:1"],
                      ].map(([ratio, label]) => (
                        <Chip
                          key={ratio}
                          active={opts.ratio === ratio}
                          onClick={() => set("ratio", ratio!)}
                        >
                          {ar ? label : ratio}
                        </Chip>
                      ))}
                    </div>
                    <p className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs leading-6 text-muted-foreground">
                      {ar
                        ? "تُختار لقطة محلية مرخّصة عند توفر تطابق؛ وإلا تُحرّك صورة المشروع. لا يُرسل وصفك إلى خدمة خارجية، ويمكنك إخراج MP4 محلياً بعد المعاينة."
                        : "A matching licensed local stock clip is selected when available; otherwise project artwork is animated in your browser. Your prompt is not sent to an external video service. Preview the scene, then export an MP4 locally."}
                    </p>
                  </>
                )}
                <Textarea
                  rows={8}
                  placeholder={
                    ar
                      ? "اكتب فكرة القصة أو السيناريو، وسيكمله كاتب السيناريو الذكي..."
                      : "Write your story idea..."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </>
            )}
            {id === "voice" && (
              <>
                <select
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  value={opts.voiceLanguage}
                  onChange={(event) => {
                    const nextLanguage = event.target.value;
                    setOpts((current) => ({
                      ...current,
                      voiceLanguage: nextLanguage,
                      dialect: VOICE_DIALECTS[nextLanguage]?.[0]?.[0] ?? "standard",
                    }));
                  }}
                  aria-label={ar ? "لغة التعليق الصوتي" : "Voice-over language"}
                >
                  {LANGS.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  {VOICE_DIALECTS[opts.voiceLanguage]?.map(([value, label]) => (
                    <Chip
                      key={value}
                      active={opts.dialect === value}
                      onClick={() => set("dialect", value!)}
                    >
                      {ar ? dialectLabelAr(value) : label}
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip active={opts.voiceTone === "warm"} onClick={() => set("voiceTone", "warm")}>
                    {ar ? "دافئة" : "Warm"}
                  </Chip>
                  <Chip
                    active={opts.voiceTone === "energetic"}
                    onClick={() => set("voiceTone", "energetic")}
                  >
                    {ar ? "حماسية" : "Energetic"}
                  </Chip>
                  <Chip
                    active={opts.voiceTone === "dramatic"}
                    onClick={() => set("voiceTone", "dramatic")}
                  >
                    {ar ? "درامية" : "Dramatic"}
                  </Chip>
                  <Chip active={opts.voiceTone === "calm"} onClick={() => set("voiceTone", "calm")}>
                    {ar ? "هادئة" : "Calm"}
                  </Chip>
                  <Chip
                    active={opts.voiceTone === "persuasive"}
                    onClick={() => set("voiceTone", "persuasive")}
                  >
                    {ar ? "إعلانية مقنعة" : "Persuasive ad"}
                  </Chip>
                </div>
                <Textarea
                  rows={7}
                  placeholder={ar ? "النص المراد تحويله لصوت..." : "Text to speak..."}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <p className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs leading-6 text-muted-foreground">
                  {ar
                    ? "يُعاد تحرير النص ثم يُنشأ MP3 بواسطة edge-tts. تعتمد اللهجة المتاحة على الأصوات المنشورة للخدمة."
                    : "The script is adapted and rendered as an MP3 with edge-tts. Available accents depend on the voices exposed by the service."}
                </p>
              </>
            )}
            {id === "dubbing" && (
              <>
                <Textarea
                  rows={7}
                  placeholder={
                    ar
                      ? "أدخل النص المراد ترجمته ونطقه..."
                      : "Enter the script to translate and speak..."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <select
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  value={opts.target}
                  onChange={(event) => set("target", event.target.value)}
                  aria-label={ar ? "لغة الترجمة والصوت" : "Translation and voice language"}
                >
                  {LANGS.map((language) => (
                    <option key={language}>{language}</option>
                  ))}
                </select>
                <p className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs leading-6 text-muted-foreground">
                  {ar
                    ? "يُترجم النص ويُنشأ ملف MP3 بـ edge-tts. لا يتطلب رفع فيديو، ولا ينتج مزامنة شفاه أو دمجاً آلياً لمسار فيديو."
                    : "The script is translated and rendered as an MP3 with edge-tts. No video upload is needed; this does not create lip sync or merge audio into a video file."}
                </p>
              </>
            )}
            {id === "app_engine" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm text-muted-foreground">
                    {ar ? "نوع المشروع" : "Project type"}
                    <select
                      className="rounded-md border border-input bg-background p-2 text-foreground"
                      value={opts.projectType}
                      onChange={(event) =>
                        setOpts((current) => {
                          const projectType = event.target.value as "website" | "mobile";
                          const mobileStack =
                            current.techStack === "java" || current.techStack === "kotlin"
                              ? current.techStack
                              : "kotlin";
                          return {
                            ...current,
                            projectType,
                            techStack:
                              projectType === "mobile"
                                ? mobileStack
                                : current.techStack === "kotlin"
                                  ? "html"
                                  : current.techStack,
                          };
                        })
                      }
                    >
                      <option value="website">
                        {ar ? "موقع / تطبيق ويب" : "Website / web app"}
                      </option>
                      <option value="mobile">{ar ? "تطبيق جوال" : "Mobile app"}</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-muted-foreground">
                    {ar ? "التقنية" : "Technology"}
                    <select
                      className="rounded-md border border-input bg-background p-2 text-foreground"
                      value={opts.techStack}
                      onChange={(event) =>
                        setOpts((current) => ({
                          ...current,
                          techStack: event.target.value as
                            "html" | "react" | "python" | "java" | "cpp" | "kotlin",
                        }))
                      }
                    >
                      {opts.projectType === "website" ? (
                        <>
                          <option value="html">HTML / CSS / JavaScript</option>
                          <option value="react">React (JSX)</option>
                          <option value="python">Python 3</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++17</option>
                        </>
                      ) : (
                        <>
                          <option value="kotlin">Kotlin / Android Studio</option>
                          <option value="java">Java / Android Studio</option>
                        </>
                      )}
                    </select>
                  </label>
                </div>
                <Textarea
                  rows={10}
                  placeholder={
                    ar
                      ? "صف الموقع أو التطبيق بالكلام، مثلاً: تطبيق مطعم يعرض القائمة ويسمح باختيار موعد الطاولة وتأكيد الحجز..."
                      : "Describe the website or app, e.g. a restaurant app with a menu, table availability, and booking confirmation..."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </>
            )}
            {id === "image" && (
              <>
                <Textarea
                  rows={6}
                  placeholder={
                    ar
                      ? "صف الصورة بالعربي: قطة رائد فضاء فوق القاهرة ليلاً..."
                      : "Describe the image..."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">
                    {ar ? "الأسلوب البصري" : "Visual style"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(ar
                      ? [
                          ["cinematic", "سينمائي"],
                          ["product", "تصوير منتجات"],
                          ["illustration", "رسم توضيحي"],
                          ["editorial", "تحريري"],
                        ]
                      : [
                          ["cinematic", "Cinematic"],
                          ["product", "Product photo"],
                          ["illustration", "Illustration"],
                          ["editorial", "Editorial"],
                        ]
                    ).map(([value, label]) => (
                      <Chip
                        key={value}
                        active={opts.imageStyle === value}
                        onClick={() => set("imageStyle", value!)}
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">
                    {ar ? "استخدام الصورة" : "Image purpose"}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(ar
                      ? [
                          ["campaign", "حملة إعلانية"],
                          ["social", "منشور اجتماعي"],
                          ["story", "مشهد قصصي"],
                        ]
                      : [
                          ["campaign", "Ad campaign"],
                          ["social", "Social post"],
                          ["story", "Story scene"],
                        ]
                    ).map(([value, label]) => (
                      <Chip
                        key={value}
                        active={opts.imageUse === value}
                        onClick={() => set("imageUse", value!)}
                      >
                        {label}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Switch
                    checked={opts.enhance === "1"}
                    onCheckedChange={(c) => set("enhance", c ? "1" : "0")}
                  />
                  {ar ? "محسّن الوصف العربي" : "Arabic prompt enhancer"}
                </div>
                <div className="flex gap-2">
                  {["1:1", "16:9", "9:16"].map((r) => (
                    <Chip key={r} active={opts.ratio === r} onClick={() => set("ratio", r)}>
                      {r}
                    </Chip>
                  ))}
                </div>
              </>
            )}
            {id === "templates" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {TEMPLATES.map((tp) => (
                    <button
                      key={tp.id}
                      onClick={() => set("template", tp.en)}
                      className={`glass p-4 text-start text-sm transition hover:glow-violet ${opts.template === tp.en ? "border-gold glow-gold" : ""}`}
                    >
                      <div className="mb-2 h-14 rounded-lg bg-gradient-brand opacity-70" />
                      {ar ? tp.ar : tp.en}
                    </button>
                  ))}
                </div>
                <Textarea
                  rows={3}
                  placeholder={ar ? "اسم منتجك ونشاطك..." : "Your product/business..."}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </>
            )}

            <Button
              size="lg"
              disabled={
                busy ||
                !profile ||
                profileLoading ||
                profileError ||
                (id === "templates" && !opts.template) ||
                (id === "auto_video" &&
                  (!mediaFile?.type.startsWith("video/") ||
                    framesLoading ||
                    videoFrames.length !== 3 ||
                    !opts.videoAnalysisConsent)) ||
                (!prompt && !fileName && id !== "templates")
              }
              onClick={() => execute()}
              className="w-full bg-gradient-brand text-primary-foreground glow-gold"
            >
              <Wand2 className="h-4 w-4" />
              {busy ? t("running") : t("run")}
            </Button>
          </section>

          <section className="glass relative min-h-[420px] overflow-hidden p-6">
            <div className="mb-3 font-display text-xs text-gold">{t("result")}</div>
            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <div className="flex h-12 items-end gap-1">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <span
                      key={i}
                      className="w-1.5 rounded-full bg-gradient-brand animate-wave"
                      style={{ height: "100%", animationDelay: `${i * 0.08}s` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  {renderProgress === null
                    ? t("running")
                    : ar
                      ? `إخراج الفيديو محلياً… ${renderProgress}%`
                      : `Rendering locally… ${renderProgress}%`}
                </span>
                {renderProgress !== null && (
                  <div
                    className="h-2 w-3/4 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={renderProgress}
                    aria-label={ar ? "تقدم إخراج الفيديو" : "Video render progress"}
                  >
                    <div
                      className="h-full bg-gradient-brand transition-all"
                      style={{ width: `${renderProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {!busy && !result && (
              <div className="flex h-80 items-center justify-center text-muted-foreground grid-hud rounded-xl">
                ◇ ◇ ◇
              </div>
            )}
            {result?.kind === "image" && (
              <div className="space-y-3">
                <img src={result.output} alt={prompt} className="w-full rounded-xl" />
                <Button asChild variant="outline">
                  <a href={result.output} download="youssefco.png">
                    <Download className="h-4 w-4" />
                    PNG
                  </a>
                </Button>
              </div>
            )}
            {result?.kind === "video" && result.mediaUrl && (
              <div className="space-y-3">
                <p className="font-semibold text-cyan-100">{result.output}</p>
                {id === "auto_video" && (
                  <p className="text-xs text-muted-foreground">
                    {ar
                      ? "اكتمل تصدير MP4. راجع الفيديو قبل النشر؛ العناوين والمؤثرات تُولّد آلياً."
                      : "MP4 export complete. Review before publishing; captions and effects are automatically generated."}
                  </p>
                )}
                <video
                  controls
                  playsInline
                  src={result.mediaUrl}
                  className="max-h-[420px] w-full rounded-xl bg-black"
                />
                <a
                  href={result.downloadUrl ?? result.mediaUrl}
                  download={id === "auto_video" ? "youssefco-edited.mp4" : "youssefco-cinema.mp4"}
                  className="inline-flex items-center gap-2 text-sm text-cyan-100 hover:underline"
                >
                  <Download className="h-4 w-4" />
                  {ar ? "تنزيل الفيديو" : "Download video"}
                </a>
              </div>
            )}
            {result?.kind === "audio" && result.mediaUrl && (
              <div className="space-y-3">
                <audio controls src={result.mediaUrl} className="w-full" />
                <a
                  href={result.mediaUrl}
                  download="youssefco-voice.mp3"
                  className="inline-flex items-center gap-2 text-sm text-cyan-100 hover:underline"
                >
                  <Download className="h-4 w-4" />
                  {ar ? "تنزيل التعليق الصوتي" : "Download voice-over"}
                </a>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-sm leading-7">
                  {result.output}
                </pre>
              </div>
            )}
            {id === "app_engine" && (result?.kind === "html" || result?.kind === "code") && (
              <div className="space-y-3">
                <div
                  className="flex flex-wrap gap-2"
                  role="tablist"
                  aria-label={ar ? "عرض المشروع" : "Project view"}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={appOutputTab === "preview" ? "default" : "outline"}
                    role="tab"
                    aria-selected={appOutputTab === "preview"}
                    onClick={() => setAppOutputTab("preview")}
                  >
                    {ar ? "معاينة مباشرة" : "Live preview"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={appOutputTab === "code" ? "default" : "outline"}
                    role="tab"
                    aria-selected={appOutputTab === "code"}
                    onClick={() => setAppOutputTab("code")}
                  >
                    {ar ? "الكود" : "Code"}
                  </Button>
                </div>
                {appOutputTab === "preview" ? (
                  <iframe
                    title={ar ? "معاينة المشروع" : "Project preview"}
                    srcDoc={result.previewHtml ?? (result.kind === "html" ? result.output : "")}
                    sandbox="allow-scripts"
                    className="h-96 w-full rounded-xl border border-border bg-foreground"
                  />
                ) : (
                  <pre className="max-h-[420px] overflow-auto rounded-xl border border-border bg-black/30 p-4 text-start text-xs leading-6">
                    <code>{result.output}</code>
                  </pre>
                )}
                {result.kind === "code" && (
                  <p className="text-xs text-muted-foreground">
                    {ar
                      ? "المعاينة تمثل واجهة المشروع؛ نزّل المصدر وشغّله في بيئة التقنية المحددة."
                      : "The preview shows the app interface. Download and run the source in the selected technology environment."}
                  </p>
                )}
                {opts.projectType === "website" && (
                  <p className="text-xs text-muted-foreground">
                    {ar
                      ? "النشر ينشئ صفحة HTML عامة وثابتة؛ لن يعمل فيها خادم خلفي، ولا تضع بيانات خاصة."
                      : "Publishing creates a public static HTML page. Backend services are not hosted; do not include private data."}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      download(
                        result.fileName ?? "project.txt",
                        result.output,
                        "text/plain;charset=utf-8",
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                    {ar
                      ? `تصدير ${result.fileName ?? "index.html"} لـ VS Code أو GitHub`
                      : `Export ${result.fileName ?? "index.html"} for VS Code or GitHub`}
                  </Button>
                  {opts.projectType === "mobile" && opts.techStack === "html" && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        download(
                          "youssefco-android-webview.html",
                          androidReadme(result.output),
                          "text/plain;charset=utf-8",
                        )
                      }
                    >
                      {ar ? "تصدير لمشروع Android Studio" : "Export for Android Studio"}
                    </Button>
                  )}
                  {opts.projectType === "mobile" &&
                    (opts.techStack === "java" || opts.techStack === "kotlin") && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          download(
                            result.fileName ?? appEngineFileName(opts.techStack, opts.projectType),
                            result.output,
                            "text/plain;charset=utf-8",
                          )
                        }
                      >
                        {ar ? "تنزيل مصدر Android Studio" : "Download Android Studio source"}
                      </Button>
                    )}
                  {profile?.tier !== "free" && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        void shareAppProject(result.fileName ?? "project.txt", result.output, ar)
                      }
                    >
                      {ar ? "مشاركة المشروع" : "Share project"}
                    </Button>
                  )}
                  {opts.projectType === "website" && (
                    <Button
                      variant="outline"
                      disabled={publishing}
                      onClick={() => void publishAppPreview()}
                    >
                      {publishing
                        ? ar
                          ? "جارٍ النشر..."
                          : "Publishing..."
                        : ar
                          ? "نشر الموقع"
                          : "Publish website"}
                    </Button>
                  )}
                </div>
                {publishedUrl && (
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-sm">
                    <p className="mb-2 text-muted-foreground">
                      {ar
                        ? "الموقع منشور برابط عام دائم. لا تضع معلومات سرية في الصفحة:"
                        : "This is a permanent public link. Do not include private information on the page:"}
                    </p>
                    <a
                      href={publishedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-cyan-100 underline"
                    >
                      {publishedUrl}
                    </a>
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(publishedUrl);
                          toast.success(ar ? "تم نسخ رابط الموقع." : "Website link copied.");
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : ar
                                ? "تعذر نسخ رابط الموقع."
                                : "Could not copy the website link.",
                          );
                        }
                      }}
                    >
                      {ar ? "نسخ رابط الموقع" : "Copy website link"}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {result?.kind === "text" && (
              <div className="space-y-3">
                {id === "animation" && opts.renderVideo === "1" && result.narrationUrl && (
                  <div className="space-y-2">
                    <VideoFallbackPreview
                      key={`${result.narrationUrl}-${opts.ratio}-${prompt}`}
                      prompt={prompt}
                      audioUrl={result.narrationUrl}
                      ratio={opts.ratio}
                      ar={ar}
                      onLocalFallbackExhausted={() => setLocalFallbackFailed(true)}
                    />
                  </div>
                )}
                {id === "animation" && localFallbackFailed && (
                  <section className="space-y-3 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          {ar
                            ? "تعذر الخياران المحليان"
                            : "The two local video options are unavailable"}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ar
                            ? "جرّبنا مكتبة الفيديو والتحريك المحلي. لا يرسل التطبيق طلباً إلى Kling تلقائياً."
                            : "Stock video and local animation were attempted. The app never sends a Kling request automatically."}
                        </p>
                        {profile?.tier !== "free" && klingQuota?.enabled && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {ar
                              ? `المتاح: ${klingQuota.remaining} من ${klingQuota.limit} · يتجدد شهرياً`
                              : `Remaining: ${klingQuota.remaining} of ${klingQuota.limit} · resets monthly`}
                            {klingQuota.resetsAt
                              ? ` · ${new Date(klingQuota.resetsAt).toLocaleDateString(lang)}`
                              : ""}
                            {ar ? " · نقطتان لكل طلب" : " · 2 credits per request"}
                          </p>
                        )}
                      </div>
                    </div>
                    {profile?.tier === "free" ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          {ar
                            ? "انتهت الخيارات المتاحة للخطة المجانية في هذا المتصفح. لم نستخدم Kling ولم نخصم رصيداً. رقِّ إلى باقة مدفوعة للوصول إلى Tier 3."
                            : "Free local options are exhausted in this browser. Kling was not used and no credits were charged. Upgrade to a paid plan to access Tier 3."}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setPaywallReason(
                              ar
                                ? "Kling متاح للخطط المدفوعة فقط. يمكنك مواصلة استخدام الخيارات المحلية المجانية أو اختيار باقة مدفوعة."
                                : "Kling is only available to paid plans. Continue using free local options or choose a paid plan.",
                            );
                            setPaywall(true);
                          }}
                        >
                          {ar ? "عرض الباقات المدفوعة" : "View paid plans"}
                        </Button>
                      </div>
                    ) : (
                      <>
                        {klingQuotaError && (
                          <p role="alert" className="text-xs text-destructive">
                            {klingQuotaError}
                          </p>
                        )}
                        {!klingQuota?.configured && !klingQuotaError && (
                          <p className="text-xs text-muted-foreground">
                            {ar
                              ? "خدمة Kling غير مهيأة بعد؛ يمكنك الاستمرار باستخدام الخيارات المحلية."
                              : "Kling is not configured; you can continue using local options."}
                          </p>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            klingBusy ||
                            klingPolling ||
                            !prompt.trim() ||
                            !klingQuota?.enabled ||
                            !klingQuota.configured ||
                            !klingQuota.remaining
                          }
                          onClick={() => void createKlingVideo()}
                        >
                          {klingBusy || klingPolling
                            ? ar
                              ? "جارٍ توليد فيديو Kling…"
                              : "Generating Kling video…"
                            : ar
                              ? "متابعة اختيارية عبر Kling · نقطتان"
                              : "Continue with Kling · 2 credits"}
                        </Button>
                      </>
                    )}
                    {klingRequestId && !klingPolling && !klingVideoUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setKlingError(null);
                          setKlingPolling(true);
                        }}
                      >
                        {ar ? "استئناف فحص حالة الفيديو" : "Resume status checks"}
                      </Button>
                    )}
                    {klingError && (
                      <p role="alert" className="text-sm text-destructive">
                        {klingError}
                      </p>
                    )}
                    {klingVideoUrl && (
                      <div className="space-y-2">
                        <video
                          controls
                          playsInline
                          src={klingVideoUrl}
                          className="w-full rounded-xl bg-black"
                        />
                        <a
                          href={klingVideoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-cyan-100 hover:underline"
                        >
                          <Download className="h-4 w-4" />
                          {ar ? "فتح أو تنزيل فيديو Kling" : "Open or download Kling video"}
                        </a>
                      </div>
                    )}
                  </section>
                )}
                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-sm leading-7">
                  {result.output}
                </pre>
              </div>
            )}
          </section>
        </div>
      )}
      <PaywallModal open={paywall} onOpenChange={setPaywall} reason={paywallReason} />
    </main>
  );
}

async function extractVideoKeyframes(
  file: File,
): Promise<{ frames: VideoKeyframe[]; duration: number }> {
  if (file.size > 50 * 1024 * 1024) {
    throw new Error("حجم الفيديو يتجاوز الحد المسموح (50 ميجابايت).");
  }
  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  try {
    const metadataLoaded = waitForVideoEvent(video, "loadedmetadata");
    video.src = videoUrl;
    await metadataLoaded;
    if (
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      throw new Error("تعذر قراءة مدة الفيديو أو أبعاده.");
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 384 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز لقطات الفيديو في هذا المتصفح.");

    const frames: VideoKeyframe[] = [];
    for (const fraction of [0.12, 0.5, 0.88]) {
      const timeSeconds = Math.min(video.duration * fraction, video.duration * 0.98);
      if (Math.abs(video.currentTime - timeSeconds) < 0.001) {
        if (video.readyState < 2) await waitForVideoEvent(video, "loadeddata");
      } else {
        const seeked = waitForVideoEvent(video, "seeked");
        video.currentTime = timeSeconds;
        await seeked;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/jpeg", 0.6);
      if (imageData.length > 250_000) {
        throw new Error("تعذر ضغط لقطات الفيديو ضمن الحد المسموح.");
      }
      frames.push({ timeSeconds: Math.round(timeSeconds * 1000) / 1000, imageData });
    }
    return { frames, duration: video.duration };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(videoUrl);
  }
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadeddata" | "loadedmetadata" | "seeked",
) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("تعذر قراءة الفيديو في هذا المتصفح."));
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function download(name: string, content: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
}

function androidReadme(html: string) {
  return `<!-- Youssefco Android export
1) Create a new Android Studio project (Empty Activity).
2) Put this file in app/src/main/assets/index.html
3) In MainActivity: WebView w = new WebView(this); w.getSettings().setJavaScriptEnabled(true); w.loadUrl("file:///android_asset/index.html"); setContentView(w);
-->
${html}`;
}

function appEngineFileName(techStack: string, projectType: "website" | "mobile") {
  const names: Record<string, string> = {
    html: "index.html",
    react: "App.jsx",
    python: "main.py",
    cpp: "main.cpp",
    kotlin: "MainActivity.kt",
  };
  if (techStack === "java") return projectType === "mobile" ? "MainActivity.java" : "Main.java";
  return names[techStack] ?? "project.txt";
}

async function shareAppProject(fileName: string, source: string, ar: boolean) {
  try {
    if (navigator.share) {
      await navigator.share({ title: fileName, text: `${fileName}\n\n${source}` });
      return;
    }
    await navigator.clipboard.writeText(source);
    toast.success(ar ? "نُسخ الكود لمشاركته." : "Project source copied to share.");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    toast.error(
      error instanceof Error
        ? error.message
        : ar
          ? "تعذرت مشاركة المشروع."
          : "Could not share the project.",
    );
  }
}

function Vault() {
  const { lang } = useLang();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["vault"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_vault")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return Promise.all(
        (data ?? []).map(async (item) => {
          const fileUrl = item.file_url;
          if (!fileUrl || /^(https?:|data:|blob:)/i.test(fileUrl))
            return { ...item, mediaUrl: fileUrl };
          if (fileUrl.startsWith("published-sites/")) {
            const path = fileUrl.slice("published-sites/".length);
            const { data: publicFile } = supabase.storage
              .from("published-sites")
              .getPublicUrl(path);
            return { ...item, mediaUrl: publicFile.publicUrl };
          }
          const { data: signed, error: signedError } = await supabase.storage
            .from("project-vault")
            .createSignedUrl(fileUrl, 3600);
          if (signedError) throw signedError;
          return { ...item, mediaUrl: signed.signedUrl };
        }),
      );
    },
  });
  if (!data.length)
    return (
      <div className="glass p-12 text-center text-muted-foreground">
        {lang === "ar" ? "الخزنة فارغة — ابدأ في أي استوديو." : "Vault is empty."}
      </div>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((v) => {
        return (
          <div key={v.id} className="glass overflow-hidden">
            {v.file_type.startsWith("video/") && v.mediaUrl ? (
              <video
                controls
                preload="metadata"
                src={v.mediaUrl}
                className="aspect-video w-full bg-black object-contain"
              />
            ) : v.file_type.startsWith("audio/") && v.mediaUrl ? (
              <div className="flex h-40 items-center p-4">
                <audio controls src={v.mediaUrl} className="w-full" />
              </div>
            ) : v.file_type.startsWith("image/") && v.mediaUrl ? (
              <img
                src={v.mediaUrl}
                alt={v.file_name}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="h-40 overflow-hidden p-4 text-xs text-muted-foreground grid-hud">
                {v.notes?.slice(0, 400)}
              </div>
            )}
            <div className="flex items-center gap-2 p-4">
              <div className="flex-1">
                <div className="text-xs text-gold">{v.file_type}</div>
                <div className="line-clamp-1 text-sm font-bold">{v.file_name}</div>
              </div>
              {v.mediaUrl ? (
                <a
                  href={v.mediaUrl}
                  download={v.file_name}
                  aria-label="download"
                  className="rounded-md p-2 hover:bg-muted"
                >
                  <Download className="h-4 w-4" />
                </a>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="download"
                  onClick={() => download(v.file_name, v.notes ?? "", v.file_type)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label="delete"
                onClick={async () => {
                  const { error } = await supabase.from("media_vault").delete().eq("id", v.id);
                  if (error) {
                    toast.error(error.message);
                    return;
                  }
                  if (v.file_url && !/^(https?:|data:|blob:)/i.test(v.file_url)) {
                    const isPublishedSite = v.file_url.startsWith("published-sites/");
                    const bucket = isPublishedSite ? "published-sites" : "project-vault";
                    const path = isPublishedSite
                      ? v.file_url.slice("published-sites/".length)
                      : v.file_url;
                    const { error: removeError } = await supabase.storage
                      .from(bucket)
                      .remove([path]);
                    if (removeError) toast.error(removeError.message);
                  }
                  qc.invalidateQueries({ queryKey: ["vault"] });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
