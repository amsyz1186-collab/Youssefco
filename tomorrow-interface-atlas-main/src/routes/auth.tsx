import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TurnstileCaptcha } from "@/components/TurnstileCaptcha";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { createTermsConsentMetadata, TERMS_CONSENT_PENDING_KEY, TERMS_VERSION } from "@/lib/legal";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — Youssefco" },
      { name: "description", content: "ادخل إلى حسابك في Youssefco أو أنشئ حساباً جديداً." },
      { property: "og:title", content: "Sign in — Youssefco" },
      { property: "og:description", content: "Access your Youssefco AI studios." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const turnstileSiteKey = import.meta.env["VITE_TURNSTILE_SITE_KEY"]?.trim() ?? "";
  const validTurnstileSiteKey = /^0x4[A-Za-z0-9_-]+$/.test(turnstileSiteKey);

  const handleCaptchaTokenChange = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

  useEffect(() => {
    if (!user) return;

    let acceptedDuringOAuth = false;
    try {
      acceptedDuringOAuth = sessionStorage.getItem(TERMS_CONSENT_PENDING_KEY) === TERMS_VERSION;
      if (acceptedDuringOAuth) sessionStorage.removeItem(TERMS_CONSENT_PENDING_KEY);
    } catch (error) {
      console.error("[Auth] Could not read terms consent after OAuth", error);
    }

    if (acceptedDuringOAuth) {
      void supabase.auth
        .updateUser({ data: createTermsConsentMetadata() })
        .then(({ error }) => {
          if (error) {
            console.error("[Auth] Could not save terms consent after OAuth", error);
            toast.error(
              ar
                ? "تم تسجيل الدخول، لكن تعذر حفظ موافقتك. أعد تسجيل الدخول ووافق مرة أخرى."
                : "You are signed in, but your consent could not be saved. Sign in and accept again.",
            );
          }
        })
        .catch((error: unknown) => {
          console.error("[Auth] Could not save terms consent after OAuth", error);
          toast.error(
            ar
              ? "تم تسجيل الدخول، لكن تعذر حفظ موافقتك."
              : "You are signed in, but your consent could not be saved.",
          );
        });
    }
    void navigate({ to: "/dashboard" });
  }, [ar, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!termsAccepted) {
      toast.error(
        ar
          ? "يرجى قراءة إشعار الخصوصية والشروط والموافقة عليهما للمتابعة."
          : "Read and accept the privacy notice and terms to continue.",
      );
      return;
    }
    if (mode === "up" && (!validTurnstileSiteKey || !captchaToken)) {
      toast.error(
        !validTurnstileSiteKey
          ? ar
            ? "إنشاء الحساب غير متاح حتى ضبط مفتاح Cloudflare Turnstile صالح في إعدادات Vercel."
            : "Sign-up is unavailable until a valid Cloudflare Turnstile site key is configured in Vercel."
          : ar
            ? "أكمل اختبار التحقق قبل إنشاء الحساب."
            : "Complete the CAPTCHA challenge before signing up.",
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            ...(captchaToken ? { captchaToken } : {}),
            emailRedirectTo: new URL("/auth", window.location.origin).toString(),
            data: { full_name: name, ...createTermsConsentMetadata() },
          },
        });
        if (error) toast.error(error.message);
        else {
          const { error: activityError } = await supabase.rpc("log_ui_event", {
            _event_name: "auth.sign_up",
            _route: window.location.pathname,
            _target: null,
            _details: {},
            _anonymous_session_id: sessionStorage.getItem("youssefco:activity-session"),
          });
          if (activityError)
            console.error("[Activity] Could not save sign-up event", activityError);
          toast.success(t("checkEmail"));
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error(error.message);
        } else {
          const { error: consentError } = await supabase.auth.updateUser({
            data: createTermsConsentMetadata(),
          });
          if (consentError) {
            console.error("[Auth] Could not save terms consent", consentError);
            toast.error(
              ar
                ? "تم تسجيل الدخول، لكن تعذر حفظ موافقتك. أعد تسجيل الدخول ووافق مرة أخرى."
                : "You are signed in, but your consent could not be saved. Sign in and accept again.",
            );
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      if (mode === "up") {
        setCaptchaToken(null);
        setCaptchaResetKey((key) => key + 1);
      }
    }
  }

  async function google() {
    if (!termsAccepted) {
      toast.error(
        ar
          ? "يرجى قراءة إشعار الخصوصية والشروط والموافقة عليهما للمتابعة."
          : "Read and accept the privacy notice and terms to continue.",
      );
      return;
    }
    if (!validTurnstileSiteKey || !captchaToken) {
      toast.error(
        !validTurnstileSiteKey
          ? ar
            ? "تسجيل الدخول بحساب جوجل غير متاح حتى ضبط مفتاح Cloudflare Turnstile صالح في إعدادات Vercel."
            : "Google sign-in is unavailable until a valid Cloudflare Turnstile site key is configured in Vercel."
          : ar
            ? "أكمل اختبار التحقق قبل المتابعة بحساب جوجل."
            : "Complete the CAPTCHA challenge before continuing with Google.",
      );
      return;
    }
    setBusy(true);
    try {
      sessionStorage.setItem(TERMS_CONSENT_PENDING_KEY, TERMS_VERSION);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          ...(captchaToken ? { captchaToken } : {}),
          redirectTo: new URL("/auth", window.location.origin).toString(),
        },
      });
      if (error) {
        sessionStorage.removeItem(TERMS_CONSENT_PENDING_KEY);
        toast.error(error.message);
      }
    } catch (error) {
      sessionStorage.removeItem(TERMS_CONSENT_PENDING_KEY);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setCaptchaToken(null);
      setCaptchaResetKey((key) => key + 1);
    }
  }

  const consentCopy =
    lang === "ar"
      ? {
          summary: "أوافق على الشروط وإشعار الخصوصية.",
          details: "اقرأ ملخص الشروط والخصوصية",
          sections: [
            "نستخدم بيانات الحساب التي تقدمها لتسجيل الدخول، وإدارة ملفك ورصيدك، وحفظ مشروعاتك. لا تكتب كلمات مرور أو بيانات مالية أو معلومات شديدة الحساسية داخل أوصاف الأدوات.",
            "الخطة الأساسية لا تخصم رصيداً من المستخدم مقابل أدواتها، لكن تظل حصص مزوّدي الخدمة وحدود مكافحة الإساءة سارية وقد تتأثر الإتاحة بها.",
            "عند استخدام أدوات الذكاء الاصطناعي، يُرسل الوصف إلى Google Gemini لمعالجة النص أو الصور. يرسل استوديو المونتاج ثلاث لقطات ثابتة للتحليل فقط. يرسل استوديو الصوت النص النهائي إلى خدمة edge-tts المستضافة لمعالجة الكلام. لا يُرسل ملف الفيديو إلى خدمة فيديو خارجية.",
            "تُحفظ الملفات والمخرجات في مساحة المشروع الخاصة بحسابك، وتُنشأ روابط عامة فقط عندما تختار نشر موقع. راجع الناتج قبل استخدامه؛ فقد تكون مخرجات الذكاء الاصطناعي غير دقيقة أو غير مناسبة.",
            "لا تخصم أدوات الخطة الأساسية رصيداً. قد تخصم أدوات الباقات المدفوعة النقاط الموضحة قبل التشغيل. طلبات التحويل اليدوي لا تضيف رصيداً حتى يراجعها مسؤول.",
            "قد تعالج استضافة Vercel ومزوّدو تسجيل الدخول والذكاء الاصطناعي بيانات الاتصال اللازمة لتشغيل الخدمة وأمانها. الموافقة هنا تخص شروط التطبيق وإشعار الخصوصية، ولا تستبدل موافقات الإرسال الخاصة بكل أداة.",
          ],
        }
      : lang === "zh"
        ? {
            summary: "我同意服务条款和隐私说明。",
            details: "阅读条款与隐私摘要",
            sections: [
              "我们使用你提供的账户信息进行登录、管理个人资料和余额，并保存项目。请勿在工具描述中输入密码、支付数据或高度敏感的信息。",
              "基础方案工具不会从用户积分中扣款，但仍受服务提供商免费配额和反滥用限制影响，可能因此暂时不可用。",
              "使用 AI 工具时，你的描述会发送给 Google Gemini 处理文本或图像。剪辑分析仅发送三张静态画面。语音工作室会将最终文本发送到托管的 edge-tts 服务进行语音合成；视频文件不会发送到外部视频生成服务。",
              "文件和结果保存在账户的私人项目空间中；仅在你选择发布网站时才会生成公开链接。使用前请检查结果，AI 输出可能不准确或不合适。",
              "基础方案工具不扣除用户积分。付费方案工具会在运行前显示积分费用。人工转账在管理员审核前不会增加余额。",
              "Vercel 托管服务以及登录和 AI 服务提供商可能会处理运行和保护服务所需的连接数据。本同意适用于应用条款和隐私说明，不替代各工具单独要求的发送授权。",
            ],
          }
        : {
            summary: "I agree to the terms and privacy notice.",
            details: "Read the terms and privacy summary",
            sections: [
              "We use the account details you provide to sign you in, manage your profile and balance, and save your projects. Do not enter passwords, payment details, or highly sensitive information in tool prompts.",
              "Basic-plan tools do not deduct user credits, but provider free-tier quotas and abuse-prevention limits still apply and may temporarily affect availability.",
              "AI prompts are sent to Google Gemini for text or image processing. Video editing sends only three still frames for analysis. The voice studio sends the final text to the hosted edge-tts service for speech synthesis; video files are not sent to an external video-generation provider.",
              "Files and outputs are saved in your account's private project storage. A public link is created only when you choose to publish a website. Review generated content before use; AI output may be inaccurate or unsuitable.",
              "Basic-plan tools do not deduct user credits. Paid-plan tools show their credit cost before you run them. Manual top-ups do not add credits until reviewed by an administrator.",
              "Vercel hosting and sign-in or AI providers may process connection data needed to operate and protect the service. This consent covers the app terms and privacy notice; it does not replace the separate consent requested by individual tools.",
            ],
          };

  return (
    <main className="grid-hud flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="glass hud-corners w-full max-w-md p-8 glow-violet">
        <h1 className="mb-6 text-center font-display text-2xl text-gradient">
          {mode === "in" ? t("signin") : t("signup")}
        </h1>
        <Button
          variant="outline"
          className="w-full"
          onClick={google}
          disabled={busy || !termsAccepted}
        >
          {busy ? t("running") : t("google")}
        </Button>
        <div className="my-5 h-px bg-border" />
        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <Input
              placeholder={t("name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <Input
            type="email"
            placeholder={t("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            dir="ltr"
          />
          <Input
            type="password"
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            dir="ltr"
          />
          <div className="rounded-xl border border-border/70 bg-background/40 p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm leading-6">
              <Checkbox
                checked={termsAccepted}
                onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                className="mt-1"
              />
              <span>{consentCopy.summary}</span>
            </label>
            <details className="mt-2 text-xs leading-6 text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-primary underline underline-offset-4">
                {consentCopy.details}
              </summary>
              <ol className="mt-2 list-decimal space-y-2 ps-5">
                {consentCopy.sections.map((section) => (
                  <li key={section}>{section}</li>
                ))}
              </ol>
            </details>
          </div>
          {validTurnstileSiteKey ? (
            <TurnstileCaptcha
              siteKey={turnstileSiteKey}
              resetKey={captchaResetKey}
              onTokenChange={handleCaptchaTokenChange}
            />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              {ar
                ? "إنشاء الحساب والمتابعة بحساب جوجل متوقفان حتى تهيئة CAPTCHA. أضف مفتاح Cloudflare Turnstile العام الصحيح إلى VITE_TURNSTILE_SITE_KEY في Vercel، واضبط المفتاح السري المطابق في إعدادات Supabase Auth."
                : "Sign-up and Google sign-in are disabled until CAPTCHA is configured. Set a valid Cloudflare Turnstile site key in VITE_TURNSTILE_SITE_KEY in Vercel, and configure its matching secret in Supabase Auth."}
            </p>
          )}
          <Button
            type="submit"
            disabled={
              busy || !termsAccepted || (mode === "up" && (!validTurnstileSiteKey || !captchaToken))
            }
            className="w-full bg-gradient-brand text-primary-foreground"
          >
            {busy ? t("running") : mode === "in" ? t("signin") : t("signup")}
          </Button>
        </form>
        <button
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-gold"
          disabled={busy}
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setTermsAccepted(false);
            setCaptchaToken(null);
            setCaptchaResetKey((key) => key + 1);
          }}
        >
          {mode === "in" ? t("signup") : t("signin")}
        </button>
      </div>
    </main>
  );
}
