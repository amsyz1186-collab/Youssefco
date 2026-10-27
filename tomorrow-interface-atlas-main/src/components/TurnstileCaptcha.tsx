import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

type TurnstileOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": (errorCode: string | number) => boolean;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("تعذر تحميل التحقق الآمن. تحقق من الاتصال وحاول مرة أخرى."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function TurnstileCaptcha({
  siteKey,
  resetKey,
  onTokenChange,
}: {
  siteKey: string;
  resetKey: number;
  onTokenChange: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { lang } = useLang();
  const ar = lang === "ar";

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | null = null;
    onTokenChange(null);
    setError(null);

    if (!/^0x4[A-Za-z0-9_-]+$/.test(siteKey)) {
      setError(
        ar
          ? "مفتاح Cloudflare Turnstile غير صالح. تحقّق من VITE_TURNSTILE_SITE_KEY في إعدادات Vercel."
          : "The Cloudflare Turnstile site key is invalid. Check VITE_TURNSTILE_SITE_KEY in Vercel.",
      );
      return;
    }

    void loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        if (!window.turnstile) {
          throw new Error(
            ar ? "تعذر تهيئة اختبار التحقق الآمن." : "Could not initialize the CAPTCHA challenge.",
          );
        }
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenChange(token),
          "expired-callback": () => onTokenChange(null),
          "error-callback": (errorCode) => {
            onTokenChange(null);
            const code = String(errorCode);
            const message =
              code === "110100" || code === "110110" || code === "400020"
                ? ar
                  ? "مفتاح Turnstile غير صالح. تحقّق من المفتاح والنطاق المسموح في لوحة Cloudflare."
                  : "The Turnstile key is invalid. Check the key and allowed hostname in Cloudflare."
                : code === "110200" || code === "400021"
                  ? ar
                    ? "نطاق الموقع غير مسموح لمفتاح Turnstile. أضف نطاق الموقع في إعدادات Cloudflare."
                    : "This hostname is not allowed for the Turnstile key. Add it in Cloudflare settings."
                  : code.startsWith("300") || code.startsWith("600")
                    ? ar
                      ? `فشل التحقق الأمني من Cloudflare (${code}). أوقف VPN أو إضافات الحجب وجرّب شبكة أخرى.`
                      : `Cloudflare security verification failed (${code}). Disable VPN or blocking extensions, or try another network.`
                    : ar
                      ? `تعذر إكمال التحقق الأمني (${code}). أعد المحاولة أو تواصل مع الدعم.`
                      : `Security verification failed (${code}). Try again or contact support.`;
            setError(message);
            return true;
          },
        });
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : ar
                ? "تعذر تحميل التحقق الآمن."
                : "Could not load CAPTCHA.",
          );
        }
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [ar, siteKey, resetKey, onTokenChange]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
