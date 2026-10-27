import { Buffer } from "node:buffer";

const MAX_SPEECH_BYTES = 10 * 1024 * 1024;

export async function generateSpeech(
  text: string,
  language: string,
  dialect: string,
  tone: string,
): Promise<Buffer> {
  const serviceUrl = process.env["EDGE_TTS_SERVICE_URL"];
  const serviceToken = process.env["EDGE_TTS_SERVICE_TOKEN"];
  if (!serviceUrl || !serviceToken) {
    throw new Error(
      "تحويل النص إلى صوت غير مهيأ. اضبط EDGE_TTS_SERVICE_URL وEDGE_TTS_SERVICE_TOKEN لخدمة edge-tts.",
    );
  }
  if (text.length > 5000) {
    throw new Error("النص أطول من الحد المسموح لتحويله إلى صوت (5000 حرف).");
  }

  const response = await fetch(serviceUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, language, dialect, tone }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("تعذر المصادقة مع خدمة edge-tts؛ تحقق من إعدادات الخادم.");
    }
    if (response.status === 429) {
      throw new Error("وصلت خدمة edge-tts إلى حد الطلبات. حاول بعد قليل.");
    }
    if (response.status >= 500) {
      throw new Error("خدمة edge-tts غير متاحة مؤقتاً. حاول لاحقاً.");
    }
    throw new Error(`تعذر إنشاء الصوت عبر edge-tts (HTTP ${response.status}).`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_SPEECH_BYTES) {
    throw new Error("حجم الصوت الناتج يتجاوز الحد المسموح.");
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length || audio.length > MAX_SPEECH_BYTES) {
    throw new Error("لم تُرجع خدمة edge-tts ملفاً صوتياً صالحاً.");
  }
  return audio;
}
