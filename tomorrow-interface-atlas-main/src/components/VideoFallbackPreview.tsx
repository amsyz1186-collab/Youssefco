import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type StockVideo = {
  src: string;
  tags: string[];
  durationSeconds: number;
};

function isStockVideo(value: unknown): value is StockVideo {
  if (!value || typeof value !== "object") return false;
  const video = value as Partial<StockVideo>;
  return (
    typeof video.src === "string" &&
    video.src.startsWith("/video-stock/") &&
    video.src.endsWith(".mp4") &&
    Array.isArray(video.tags) &&
    video.tags.every((tag) => typeof tag === "string") &&
    typeof video.durationSeconds === "number" &&
    video.durationSeconds >= 5 &&
    video.durationSeconds <= 10
  );
}

function pickStockVideo(videos: StockVideo[], prompt: string) {
  const keywords = new Set(
    prompt
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2),
  );
  const matching = videos.filter((video) =>
    video.tags.some((tag) => keywords.has(tag.toLocaleLowerCase())),
  );
  const candidates = matching.length ? matching : videos;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function VideoFallbackPreview({
  prompt,
  audioUrl,
  ratio,
  ar,
  onLocalFallbackExhausted,
}: {
  prompt: string;
  audioUrl: string;
  ratio: string;
  ar: boolean;
  onLocalFallbackExhausted: () => void;
}) {
  const [stockVideo, setStockVideo] = useState<StockVideo | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/video-stock/manifest.json")
      .then((response) => {
        if (!response.ok) throw new Error(`Video stock manifest returned ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((manifest) => {
        if (!active || !manifest || typeof manifest !== "object" || !("videos" in manifest)) return;
        const videos = Array.isArray(manifest.videos) ? manifest.videos.filter(isStockVideo) : [];
        setStockVideo(pickStockVideo(videos, prompt) ?? null);
      })
      .catch((error: unknown) => {
        console.error("[Video preview] Could not load the local stock manifest", error);
      });
    return () => {
      active = false;
    };
  }, [prompt]);

  useEffect(() => {
    return () => {
      if (renderedUrl) URL.revokeObjectURL(renderedUrl);
    };
  }, [renderedUrl]);

  async function renderLocally() {
    setRendering(true);
    setProgress(0);
    setError(null);
    setFallbackNotice(null);
    try {
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) throw new Error("تعذر تنزيل التعليق الصوتي للتصدير.");
      const audio = await audioResponse.blob();
      const { renderMotionVideo } = await import("@/lib/video-renderer");
      if (stockVideo) {
        try {
          const stockResponse = await fetch(stockVideo.src);
          if (!stockResponse.ok) throw new Error("تعذر تحميل مقطع stock المحلي.");
          const stock = await stockResponse.blob();
          const bytes = await renderMotionVideo(audio, stock, ratio, setProgress);
          setRenderedUrl(
            URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "video/mp4" })),
          );
          setFallbackNotice(null);
          return;
        } catch (stockError) {
          console.warn(
            "[Video preview] Stock render failed; trying local image animation",
            stockError,
          );
          setFallbackNotice(
            ar
              ? "تعذر إخراج مقطع المكتبة؛ نجرب الآن تحريك الصورة محلياً."
              : "Stock rendering failed; trying browser-side artwork animation.",
          );
          setProgress(0);
        }
      }

      try {
        const bytes = await renderMotionVideo(audio, null, ratio, setProgress);
        setRenderedUrl(
          URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "video/mp4" })),
        );
        if (stockVideo) {
          setFallbackNotice(
            ar
              ? "أخرجنا الفيديو باستخدام تحريك الصورة المحلي بعد تعذر إخراج مقطع المكتبة."
              : "The stock clip could not be rendered, so the video was exported using local artwork animation.",
          );
        }
      } catch (imageError) {
        console.error("[Video preview] Both local video tiers failed", imageError);
        const message =
          imageError instanceof Error
            ? imageError.message
            : ar
              ? "تعذر إخراج الفيديو محلياً."
              : "Could not render the video locally.";
        setError(message);
        onLocalFallbackExhausted();
      }
    } catch (renderError) {
      const message =
        renderError instanceof Error
          ? renderError.message
          : ar
            ? "تعذر إخراج الفيديو في هذا المتصفح."
            : "Could not export a video in this browser.";
      setError(message);
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="space-y-3">
      {stockVideo ? (
        <video
          aria-label={ar ? "معاينة فيديو محلي" : "Local stock video preview"}
          autoPlay
          loop
          muted
          playsInline
          src={stockVideo.src}
          className="aspect-video w-full rounded-xl bg-black object-cover"
        />
      ) : (
        <div className="motion-preview relative aspect-video overflow-hidden rounded-xl bg-slate-950">
          <img
            src="/studio-cinema.jpg"
            alt=""
            className="motion-preview__image absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-black/20" />
          <p className="absolute inset-x-5 bottom-5 line-clamp-3 text-center text-sm font-semibold text-white md:text-lg">
            {prompt}
          </p>
        </div>
      )}
      <audio controls src={audioUrl} className="w-full" />
      <Button
        type="button"
        variant="outline"
        disabled={rendering}
        onClick={() => void renderLocally()}
      >
        <Download className="h-4 w-4" />
        {rendering
          ? ar
            ? `إخراج MP4 ${progress}%`
            : `Rendering MP4 ${progress}%`
          : ar
            ? "إخراج MP4 محلياً"
            : "Export MP4 locally"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {fallbackNotice && !error && !renderedUrl && (
        <p role="status" className="text-sm text-muted-foreground">
          {fallbackNotice}
        </p>
      )}
      {renderedUrl && (
        <div className="space-y-2">
          <video controls playsInline src={renderedUrl} className="w-full rounded-xl bg-black" />
          <a
            href={renderedUrl}
            download="youssefco-motion.mp4"
            className="inline-flex items-center gap-2 text-sm text-cyan-100 hover:underline"
          >
            <Download className="h-4 w-4" />
            {ar ? "تنزيل MP4 المدمج" : "Download merged MP4"}
          </a>
        </div>
      )}
    </div>
  );
}
