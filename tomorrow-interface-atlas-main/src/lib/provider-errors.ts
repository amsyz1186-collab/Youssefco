export function shouldRetryWithFallback(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export function formatGeminiError(status: number): string {
  if (status === 401 || status === 403) {
    return "تعذر المصادقة مع Gemini. تحقق من مفتاح GEMINI_API_KEY وصلاحيته في Vercel.";
  }
  if (status === 429) return "وصلت Gemini إلى حد الاستخدام. تحقق من الحصة ثم أعد المحاولة.";
  if (status >= 500) return "خدمة Gemini غير متاحة مؤقتاً. حاول لاحقاً.";
  return `تعذر إنشاء المحتوى عبر Gemini (HTTP ${status}).`;
}
