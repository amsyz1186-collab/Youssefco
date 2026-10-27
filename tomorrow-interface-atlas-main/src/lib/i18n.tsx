import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isLanguageCode, isRtlLanguage, type LanguageCode } from "./languages";

export type Lang = LanguageCode;
const dict = {
  ar: {
    tagline: "منصة الذكاء الاصطناعي للمبدعين — نسخة 2026",
    heroTitle: "اصنع المستقبل بإبداعك مع يوسيفكو",
    heroSub: "مونتاج، أنيميشن، تعليق صوتي، دبلجة، مواقع وتطبيقات، وصور — كلها في مكان واحد.",
    start: "ابدأ النسخة التجريبية",
    dashboard: "لوحة القيادة",
    signin: "تسجيل الدخول",
    signup: "إنشاء حساب",
    signout: "خروج",
    account: "حسابي",
    accountName: "الاسم",
    accountEmail: "البريد الإلكتروني",
    accountBalance: "رصيد النقاط",
    searchLanguages: "ابحث عن لغة",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    name: "الاسم الكامل",
    google: "المتابعة بحساب جوجل",
    upgrade: "إضافة رصيد",
    admin: "الإدارة",
    remaining: "متبقي",
    run: "تشغيل",
    running: "جارٍ المعالجة...",
    plans: "اختر خطتك",
    credits: "نقطة تضاف إلى رصيدك",
    perStudio: "طلب لكل استوديو",
    egp: "ج.م",
    paywall: "رصيدك غير كافٍ لتشغيل هذا الاستوديو",
    studios: "الاستوديوهات",
    loading: "تهيئة الأنظمة",
    result: "النتيجة",
    saved: "تم الحفظ في الخزنة",
    checkEmail: "تحقق من بريدك لتأكيد الحساب",
  },
  en: {
    tagline: "The AI platform for creators — 2026 edition",
    heroTitle: "Create the future with Youssefco",
    heroSub: "Editing, animation, voice, dubbing, apps and images — all in one place.",
    start: "Start free trial",
    dashboard: "Command Deck",
    signin: "Sign in",
    signup: "Create account",
    signout: "Sign out",
    account: "My account",
    accountName: "Name",
    accountEmail: "Email",
    accountBalance: "Points balance",
    searchLanguages: "Search languages",
    email: "Email",
    password: "Password",
    name: "Full name",
    google: "Continue with Google",
    upgrade: "Add credits",
    admin: "Admin",
    remaining: "left",
    run: "Run",
    running: "Processing...",
    plans: "اختر خطتك",
    credits: "credits added to your balance",
    perStudio: "طلب لكل استوديو",
    egp: "ج.م",
    paywall: "You do not have enough credits to run this studio",
    studios: "Studios",
    loading: "Booting systems",
    result: "Result",
    saved: "Saved to vault",
    checkEmail: "Check your email to confirm your account",
  },
  zh: {
    tagline: "创作者的AI平台 — 2026版",
    heroTitle: "用 Youssefco 创造未来",
    heroSub: "剪辑、动画、配音、翻译、应用与图像，一站式完成。",
    start: "开始免费试用",
    dashboard: "控制台",
    signin: "登录",
    signup: "注册",
    signout: "退出",
    account: "我的账户",
    accountName: "姓名",
    accountEmail: "邮箱",
    accountBalance: "积分余额",
    searchLanguages: "搜索语言",
    email: "邮箱",
    password: "密码",
    name: "姓名",
    google: "使用谷歌继续",
    upgrade: "添加额度",
    admin: "管理",
    remaining: "剩余",
    run: "运行",
    running: "处理中...",
    plans: "اختر خطتك",
    credits: "积分将加入余额",
    perStudio: "طلب لكل استوديو",
    egp: "ج.م",
    paywall: "余额不足，无法运行此工作室",
    studios: "工作室",
    loading: "系统启动中",
    result: "结果",
    saved: "已保存到保险库",
    checkEmail: "请查收邮件确认账户",
  },
} as const;

export type DictKey = keyof (typeof dict)["ar"];
type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
  dir: "rtl" | "ltr";
};
const LangCtx = createContext<Ctx | null>(null);
const LANGUAGE_PREFERENCE_KEY = "yc-lang-v2";

function preferredLanguage(): Lang {
  const language = navigator.language.toLowerCase().split("-")[0];
  if (language && isLanguageCode(language)) return language;
  return "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");
  useEffect(() => {
    const saved = localStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    setLangState(isLanguageCode(saved) ? saved : preferredLanguage());
  }, []);
  const dir = isRtlLanguage(lang) ? "rtl" : "ltr";
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  const setLang = (l: Lang) => {
    localStorage.setItem(LANGUAGE_PREFERENCE_KEY, l);
    setLangState(l);
  };
  return (
    <LangCtx.Provider
      value={{
        lang,
        setLang,
        dir,
        t: (k) => (lang in dict ? dict[lang as keyof typeof dict] : dict.en)[k],
      }}
    >
      {children}
    </LangCtx.Provider>
  );
}

export function useLang() {
  const c = useContext(LangCtx);
  if (!c) throw new Error("useLang outside provider");
  return c;
}

export function pick<T extends { ar: string; en: string; zh?: string }>(o: T, lang: Lang) {
  return lang === "ar" ? o.ar : lang === "zh" && o.zh ? o.zh : o.en;
}
