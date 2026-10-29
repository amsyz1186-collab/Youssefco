import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type { AutoVideoEditPlan } from "@/lib/auto-video-edit";
import { createVideoSoundtrack } from "@/lib/video-audio";

type RenderOptions = {
  mood: string;
  platform: string;
  includeMusic: boolean;
  includeEffects: boolean;
};

type RenderProgress = (progress: number) => void;

const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
const SAMPLE_RATE = 24_000;
const TRANSITION_SECONDS = 0.18;
let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
      ]);
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })().catch((error: unknown) => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
}

export async function renderVideoEdit(
  file: File,
  plan: AutoVideoEditPlan,
  options: RenderOptions,
  onProgress: RenderProgress,
): Promise<Uint8Array> {
  const ffmpeg = await getFFmpeg();
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "mp4";
  const inputName = `source.${extension}`;
  const outputName = "youssefco-edited.mp4";
  const ratio: [number, number] = options.platform === "TikTok 9:16" ? [720, 1280] : [1280, 720];
  const [width, height] = ratio;
  const transitionDuration = options.includeEffects ? TRANSITION_SECONDS : 0;
  const timeline: Array<{ start: number; end: number }> = [];
  let outputDuration = 0;
  for (const segment of plan.segments) {
    const segmentDuration = segment.end - segment.start;
    const outputStart = Math.max(0, outputDuration - transitionDuration);
    outputDuration = outputStart + segmentDuration;
    timeline.push({ start: outputStart, end: outputDuration });
  }
  const totalDuration = timeline[timeline.length - 1]?.end ?? 0;
  const fileNames = [inputName, outputName];
  let hasAudio = false;
  let logText = "";
  const onLog = ({ message }: { message: string }) => {
    logText += `${message}\n`;
  };
  ffmpeg.on("log", onLog);

  try {
    onProgress(2);
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));

    const probeExitCode = await ffmpeg.exec(["-hide_banner", "-i", inputName]);
    hasAudio = /Stream #0:\d+.*Audio:/i.test(logText);
    if (!/Stream #0:\d+.*Video:/i.test(logText)) {
      throw new Error("تعذر التعرف على مسار الفيديو داخل الملف المرفوع.");
    }
    if (probeExitCode === 0) {
      throw new Error("تعذر التحقق من مسارات الفيديو قبل المونتاج.");
    }
    logText = "";

    const soundTrack = createVideoSoundtrack(totalDuration, options.mood, plan, timeline, options);
    const soundTrackName = "mood-track.wav";
    if (soundTrack) {
      fileNames.push(soundTrackName);
      await ffmpeg.writeFile(soundTrackName, soundTrack);
    }

    const filters: string[] = [];
    const overlayNames: string[] = [];
    let overlayInputIndex = soundTrack ? 2 : 1;
    const gradeByMood: Record<string, string> = {
      Comedy: "eq=contrast=1.05:saturation=1.18:brightness=0.012",
      Action: "eq=contrast=1.12:saturation=1.16:brightness=0.004",
      Drama: "eq=contrast=1.09:saturation=0.91:brightness=-0.008,vignette=PI/6",
      Mix: "eq=contrast=1.07:saturation=1.1:brightness=0.006",
    };
    const grade = gradeByMood[options.mood] ?? gradeByMood["Mix"]!;
    for (const [index, segment] of plan.segments.entries()) {
      const segmentDuration = segment.end - segment.start;
      const zoomStep = (0.08 / Math.max(1, segmentDuration * 30)).toFixed(7);
      const zoom = index % 2 === 0 ? `min(1+on*${zoomStep},1.08)` : `max(1.0,1.08-on*${zoomStep})`;
      filters.push(
        `[0:v:0]trim=start=${segment.start.toFixed(3)}:end=${segment.end.toFixed(3)},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,${grade},unsharp=5:5:0.35:3:3:0.0,fps=30,zoompan=z='${zoom}':d=1:s=${width}x${height}:fps=30:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',format=yuv420p[v${index}]`,
      );
      if (segment.textOverlay) {
        const overlayName = `text-overlay-${index}.png`;
        fileNames.push(overlayName);
        overlayNames.push(overlayName);
        await ffmpeg.writeFile(
          overlayName,
          await createTextOverlay(segment.textOverlay, width, height),
        );
        filters.push(
          `[v${index}][${overlayInputIndex}:v]overlay=0:0:format=auto:eof_action=repeat:shortest=0[vtext${index}]`,
        );
        overlayInputIndex += 1;
      }
      if (hasAudio) {
        filters.push(
          `[0:a:0]atrim=start=${segment.start.toFixed(3)}:end=${segment.end.toFixed(3)},asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE}[a${index}]`,
        );
      }
    }

    let lastVideoLabel = plan.segments[0]!.textOverlay ? "vtext0" : "v0";
    let lastAudioLabel = "a0";
    for (let index = 1; index < plan.segments.length; index += 1) {
      const videoOutput = `vx${index}`;
      const currentVideoLabel = plan.segments[index]!.textOverlay ? `vtext${index}` : `v${index}`;
      if (transitionDuration > 0) {
        filters.push(
          `[${lastVideoLabel}][${currentVideoLabel}]xfade=transition=fade:duration=${transitionDuration}:offset=${timeline[index]!.start.toFixed(3)}[${videoOutput}]`,
        );
      } else {
        filters.push(`[${lastVideoLabel}][${currentVideoLabel}]concat=n=2:v=1:a=0[${videoOutput}]`);
      }
      lastVideoLabel = videoOutput;
      if (hasAudio) {
        const audioOutput = `ax${index}`;
        if (transitionDuration > 0) {
          filters.push(
            `[${lastAudioLabel}][a${index}]acrossfade=d=${transitionDuration}:c1=tri:c2=tri[${audioOutput}]`,
          );
        } else {
          filters.push(`[${lastAudioLabel}][a${index}]concat=n=2:v=0:a=1[${audioOutput}]`);
        }
        lastAudioLabel = audioOutput;
      }
    }

    const args = ["-y", "-i", inputName];
    if (soundTrack) args.push("-f", "wav", "-i", soundTrackName);
    for (const name of overlayNames) {
      args.push("-i", name);
    }
    args.push(
      "-filter_complex",
      filters.join(";") +
        (hasAudio && soundTrack
          ? `;[${lastAudioLabel}]volume=0.86[originalaudio];[1:a]volume=0.4[moodaudio];[originalaudio][moodaudio]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`
          : hasAudio
            ? `;[${lastAudioLabel}]volume=0.92,alimiter=limit=0.95[aout]`
            : soundTrack
              ? ";[1:a]volume=0.78[aout]"
              : ""),
      "-map",
      `[${lastVideoLabel}]`,
    );
    if (hasAudio || soundTrack) args.push("-map", "[aout]");
    else args.push("-an");
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
    );
    if (hasAudio || soundTrack) {
      args.push("-c:a", "aac", "-b:a", "160k", "-ar", String(SAMPLE_RATE));
    }
    args.push("-t", totalDuration.toFixed(3), outputName);

    const onRenderProgress = ({ progress }: { progress: number }) => {
      onProgress(10 + Math.round(Math.max(0, Math.min(1, progress)) * 88));
    };
    ffmpeg.on("progress", onRenderProgress);
    try {
      const exitCode = await ffmpeg.exec(args, -1);
      if (exitCode !== 0) {
        const detail = logText
          .split("\n")
          .filter((line) => /error|invalid|failed|unable|no such|conversion failed/i.test(line))
          .slice(-3)
          .join(" ")
          .slice(0, 360);
        console.error("[Auto video] FFmpeg render failed", { exitCode, detail });
        throw new Error(
          detail
            ? `تعذر إخراج الفيديو: ${detail}`
            : "تعذر إخراج الفيديو. تحقق من صيغة الملف وحاول مرة أخرى.",
        );
      }
    } finally {
      ffmpeg.off("progress", onRenderProgress);
    }

    const output = await ffmpeg.readFile(outputName);
    if (typeof output === "string" || output.length === 0) {
      throw new Error("محرك المونتاج لم يُخرج ملف فيديو صالحاً.");
    }
    onProgress(100);
    return output;
  } finally {
    ffmpeg.off("log", onLog);
    await Promise.all(fileNames.map((name) => ffmpeg.deleteFile(name).catch(() => undefined)));
  }
}

async function createTextOverlay(text: string, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز النصوص على الفيديو.");

  const fontSize = Math.round(height * 0.055);
  const maxWidth = width * 0.82;
  context.direction = /[\u0600-\u06ff]/.test(text) ? "rtl" : "ltr";
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, 2);
  const lineHeight = Math.round(fontSize * 1.35);
  const boxHeight = visibleLines.length * lineHeight + 44;
  const boxWidth = Math.min(width * 0.9, maxWidth + 72);
  const boxX = (width - boxWidth) / 2;
  const boxY = height * 0.12;

  context.fillStyle = "rgba(5, 12, 24, 0.78)";
  context.beginPath();
  context.roundRect(boxX, boxY, boxWidth, boxHeight, Math.round(height * 0.025));
  context.fill();
  context.fillStyle = "#67e8f9";
  context.fillRect(boxX + boxWidth * 0.22, boxY + boxHeight - 5, boxWidth * 0.56, 4);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(0, 0, 0, 0.9)";
  context.shadowBlur = 12;
  context.fillStyle = "#ffffff";
  visibleLines.forEach((value, index) => {
    context.fillText(value, width / 2, boxY + 18 + lineHeight * (index + 0.5), maxWidth);
  });
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("تعذر إنشاء ملف العنوان."));
    }, "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function renderMotionVideo(
  audio: Blob,
  stockVideo: Blob | null,
  ratio: string,
  onProgress: RenderProgress,
): Promise<Uint8Array> {
  const ffmpeg = await getFFmpeg();
  const outputName = "youssefco-motion.mp4";
  const audioName = "voiceover.mp3";
  const sourceName = stockVideo ? "stock.mp4" : "artwork.jpg";
  const fileNames = [outputName, audioName, sourceName];
  const onLog = ({ message }: { message: string }) => {
    if (/error|invalid|failed/i.test(message)) console.error("[Motion renderer] FFmpeg", message);
  };
  ffmpeg.on("log", onLog);

  try {
    onProgress(5);
    await ffmpeg.writeFile(audioName, new Uint8Array(await audio.arrayBuffer()));
    let source: Uint8Array;
    if (stockVideo) {
      source = new Uint8Array(await stockVideo.arrayBuffer());
    } else {
      const response = await fetch("/studio-cinema.jpg");
      if (!response.ok) throw new Error("تعذر تحميل صورة المشروع لإخراج الفيديو.");
      source = new Uint8Array(await response.arrayBuffer());
    }
    await ffmpeg.writeFile(sourceName, source);

    const [width, height]: [number, number] =
      ratio === "9:16" ? [720, 1280] : ratio === "1:1" ? [720, 720] : [1280, 720];
    const args = ["-y"];
    if (stockVideo) {
      args.push("-stream_loop", "-1", "-i", sourceName, "-i", audioName);
    } else {
      args.push("-loop", "1", "-framerate", "30", "-i", sourceName, "-i", audioName);
    }
    args.push("-map", "0:v:0", "-map", "1:a:0");
    const scaleAndCrop = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    args.push(
      "-vf",
      stockVideo
        ? `${scaleAndCrop},fps=30,format=yuv420p`
        : `${scaleAndCrop},zoompan=z='min(zoom+0.001,1.12)':d=1:s=${width}x${height}:fps=30,format=yuv420p`,
    );
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputName,
    );

    const onRenderProgress = ({ progress }: { progress: number }) => {
      onProgress(10 + Math.round(Math.max(0, Math.min(1, progress)) * 88));
    };
    ffmpeg.on("progress", onRenderProgress);
    try {
      const exitCode = await ffmpeg.exec(args, -1);
      if (exitCode !== 0) throw new Error("تعذر دمج التعليق الصوتي مع الفيديو.");
    } finally {
      ffmpeg.off("progress", onRenderProgress);
    }

    const output = await ffmpeg.readFile(outputName);
    if (typeof output === "string" || output.length === 0) {
      throw new Error("لم يُخرج محرك الفيديو ملف MP4 صالحاً.");
    }
    onProgress(100);
    return output;
  } finally {
    ffmpeg.off("log", onLog);
    await Promise.all(
      fileNames.map(async (name) => {
        try {
          await ffmpeg.deleteFile(name);
        } catch (error) {
          console.warn(`[Motion renderer] Could not remove temporary file ${name}`, error);
        }
      }),
    );
  }
}
