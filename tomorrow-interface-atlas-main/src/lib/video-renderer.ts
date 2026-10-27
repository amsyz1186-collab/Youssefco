import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type { AutoVideoEditPlan } from "@/lib/auto-video-edit";

type RenderOptions = {
  mood: string;
  platform: string;
  includeMusic: boolean;
  includeEffects: boolean;
};

type RenderProgress = (progress: number) => void;

const CORE_BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
const SAMPLE_RATE = 24_000;
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
  const timeline = plan.segments.reduce<Array<{ start: number; end: number }>>((items, segment) => {
    const previous = items[items.length - 1];
    const outputStart = previous?.end ?? 0;
    return [...items, { start: outputStart, end: outputStart + segment.end - segment.start }];
  }, []);
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

    const filters: string[] = [];
    let captionInputIndex = 1;
    for (const [index, segment] of plan.segments.entries()) {
      filters.push(
        `[0:v:0]trim=start=${segment.start.toFixed(3)}:end=${segment.end.toFixed(3)},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p[v${index}]`,
      );
      if (hasAudio) {
        filters.push(
          `[0:a:0]atrim=start=${segment.start.toFixed(3)}:end=${segment.end.toFixed(3)},asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE}[a${index}]`,
        );
      }
    }
    const concatInputs = plan.segments
      .map((_, index) => (hasAudio ? `[v${index}][a${index}]` : `[v${index}]`))
      .join("");
    filters.push(
      `${concatInputs}concat=n=${plan.segments.length}:v=1:a=${hasAudio ? 1 : 0}[vcat]${hasAudio ? "[acat]" : ""}`,
    );

    let lastVideoLabel = "vcat";
    for (const [index, segment] of plan.segments.entries()) {
      if (!segment.caption) continue;
      const captionName = `caption-${index}.png`;
      fileNames.push(captionName);
      await ffmpeg.writeFile(
        captionName,
        await createCaptionOverlay(segment.caption, width, height),
      );
      const outputLabel = `captioned${index}`;
      filters.push(
        `[${lastVideoLabel}][${captionInputIndex}:v]overlay=0:0:enable='between(t,${timeline[index]!.start.toFixed(3)},${timeline[index]!.end.toFixed(3)})'[${outputLabel}]`,
      );
      captionInputIndex += 1;
      lastVideoLabel = outputLabel;
    }

    const soundTrack = createMoodTrack(totalDuration, options.mood, plan, timeline, options);
    const soundTrackName = "mood-track.wav";
    if (soundTrack) {
      fileNames.push(soundTrackName);
      await ffmpeg.writeFile(soundTrackName, soundTrack);
    }

    const args = ["-y", "-i", inputName];
    for (const name of fileNames.filter((name) => name.startsWith("caption-"))) {
      args.push("-i", name);
    }
    if (soundTrack) args.push("-f", "wav", "-i", soundTrackName);
    const soundTrackInputIndex = captionInputIndex;
    args.push(
      "-filter_complex",
      filters.join(";") +
        (hasAudio && soundTrack
          ? `;[acat]volume=0.9[originalaudio];[${soundTrackInputIndex}:a]volume=0.22[moodaudio];[originalaudio][moodaudio]amix=inputs=2:duration=first:normalize=0[aout]`
          : hasAudio
            ? ";[acat]volume=1[aout]"
            : soundTrack
              ? `;[${soundTrackInputIndex}:a]volume=0.22[aout]`
              : ""),
      "-map",
      `[${lastVideoLabel}]`,
    );
    if (hasAudio || soundTrack) args.push("-map", "[aout]");
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
      if (exitCode !== 0) throw new Error("تعذر إخراج الفيديو. تحقق من صيغة الملف وحاول مرة أخرى.");
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

async function createCaptionOverlay(text: string, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز العناوين على الفيديو.");

  const lines = wrapCaption(text, 42);
  const lineHeight = Math.round(height * 0.055);
  const fontSize = Math.round(height * 0.045);
  const boxHeight = lines.length * lineHeight + 32;
  const boxY = height - boxHeight - Math.round(height * 0.08);
  context.fillStyle = "rgba(5, 10, 20, 0.78)";
  context.beginPath();
  context.roundRect(width * 0.07, boxY, width * 0.86, boxHeight, 18);
  context.fill();
  context.direction = /[\u0600-\u06ff]/.test(text) ? "rtl" : "ltr";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  context.fillStyle = "#ffffff";
  lines.forEach((line, index) => {
    context.fillText(line, width / 2, boxY + 16 + lineHeight * (index + 0.5), width * 0.8);
  });
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("تعذر إنشاء صورة العنوان."));
    }, "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function wrapCaption(text: string, maxLength: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && `${current} ${word}`.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function createMoodTrack(
  duration: number,
  mood: string,
  plan: AutoVideoEditPlan,
  timeline: Array<{ start: number; end: number }>,
  options: RenderOptions,
) {
  if (!options.includeMusic && !options.includeEffects) return null;
  const sampleCount = Math.ceil(duration * SAMPLE_RATE);
  const samples = new Float32Array(sampleCount);
  const notesByMood: Record<string, number[]> = {
    Comedy: [261.63, 329.63, 392, 329.63],
    Action: [110, 164.81, 220, 164.81],
    Drama: [146.83, 174.61, 220, 174.61],
    Mix: [196, 246.94, 293.66, 246.94],
  };
  const notes = notesByMood[mood] ?? notesByMood["Mix"]!;

  if (options.includeMusic) {
    const beatSeconds = mood === "Action" ? 0.32 : mood === "Comedy" ? 0.42 : 0.72;
    for (let index = 0; index < sampleCount; index += 1) {
      const time = index / SAMPLE_RATE;
      const beat = Math.floor(time / beatSeconds);
      const withinBeat = (time % beatSeconds) / beatSeconds;
      const envelope = Math.min(1, withinBeat * 9) * Math.pow(1 - withinBeat, 2);
      const frequency = notes[beat % notes.length]!;
      samples[index] =
        samples[index]! +
        (Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE) * 0.55 +
          Math.sin((2 * Math.PI * frequency * 2 * index) / SAMPLE_RATE) * 0.12) *
          envelope *
          0.12;
    }
  }

  if (options.includeEffects) {
    for (const [index, segment] of plan.segments.entries()) {
      const effect = segment.sound;
      if (effect === "none" || index === 0) continue;
      const start = Math.floor(timeline[index]!.start * SAMPLE_RATE);
      const length = Math.min(Math.floor(SAMPLE_RATE * 0.34), sampleCount - start);
      for (let offset = 0; offset < length; offset += 1) {
        const position = start + offset;
        const progress = offset / SAMPLE_RATE;
        const fade = Math.exp(-progress * 12);
        const noise = Math.sin(position * 12.9898) * Math.cos(position * 4.1414);
        const frequency = effect === "pop" ? 850 : effect === "impact" ? 72 : 260 + 900 * progress;
        const tone = Math.sin(2 * Math.PI * frequency * progress);
        samples[position]! +=
          effect === "whoosh"
            ? noise * fade * 0.16
            : tone * fade * (effect === "impact" ? 0.34 : 0.18);
      }
    }
  }

  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0.92 ? 0.92 / peak : 1;
  const wav = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(wav);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]! * gain));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Uint8Array(wav);
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
