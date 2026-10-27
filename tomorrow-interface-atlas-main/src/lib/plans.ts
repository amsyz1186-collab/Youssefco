export type Tier = "free" | "pro" | "plus" | "vip";

export const ADMIN_PHONE = import.meta.env["VITE_ADMIN_PHONE"] || "01018635526";

export function parseTier(value: string | null): Tier {
  const normalized =
    value
      ?.trim()
      .toLowerCase()
      .replace(/^youssefco[-_ ]/, "") ?? "free";
  if (
    normalized === "free" ||
    normalized === "pro" ||
    normalized === "plus" ||
    normalized === "vip"
  )
    return normalized;
  throw new Error(`اسم الباقة غير معروف في profiles.plan_name: ${value}`);
}

export const PLANS: {
  id: Exclude<Tier, "free">;
  ar: string;
  en: string;
  price: number;
  credits: number;
  perk?: string;
}[] = [
  { id: "pro", ar: "يوسفكو برو", en: "Youssefco Pro", price: 1500, credits: 13 },
  { id: "plus", ar: "يوسفكو بلس", en: "Youssefco Plus", price: 4000, credits: 22 },
  {
    id: "vip",
    ar: "يوسفكو في آي بي",
    en: "Youssefco VIP",
    price: 8000,
    credits: 30,
    perk: "priority",
  },
];

export const TIER_NAMES: Record<Tier, { ar: string; en: string }> = {
  free: { ar: "مجاني", en: "Free" },
  pro: { ar: "يوسفكو برو", en: "Pro" },
  plus: { ar: "يوسفكو بلس", en: "Plus" },
  vip: { ar: "يوسفكو في آي بي", en: "VIP" },
};

export const STUDIOS = [
  {
    id: "auto_video",
    icon: "Film",
    ar: "استوديو المونتاج الآلي",
    en: "Auto Video Studio",
    zh: "自动剪辑",
    description: {
      ar: "ارفع فيديوك لتحليله ومونتاجه محلياً مع القصّات والعناوين والموسيقى والمؤثرات، ثم نزّله MP4 جاهزاً.",
      en: "Upload a video for local AI-guided cuts, captions, music and sound effects, then download a finished MP4.",
      zh: "使用智能剪辑工具，将片段整理成完整的视频故事。",
    },
  },
  {
    id: "animation",
    icon: "Clapperboard",
    ar: "استوديو الأنيميشن والسينما",
    en: "Animation & Cinema",
    zh: "动画与电影",
    description: {
      ar: "ابتكر مشاهد سينمائية وشخصيات متحركة، وصمّم الفكرة البصرية لمشروعك.",
      en: "Create cinematic scenes and animated characters for your visual projects.",
      zh: "为视觉项目创作电影场景与动画角色。",
    },
  },
  {
    id: "voice",
    icon: "Mic",
    ar: "استوديو التعليق الصوتي",
    en: "Voice Studio",
    zh: "配音工作室",
    description: {
      ar: "اكتب نص التعليق الصوتي، واختر نبرة مناسبة لمحتوى الفيديو أو الإعلان.",
      en: "Prepare narration scripts and choose a fitting voice style for videos or ads.",
      zh: "撰写旁白脚本，并为视频或广告选择合适的语气。",
    },
  },
  {
    id: "dubbing",
    icon: "Languages",
    ar: "استوديو الدبلجة العالمية",
    en: "Global Dubbing",
    zh: "全球配音",
    description: {
      ar: "أدخل نصاً واختر لغة لترجمته وإنشاء تعليق صوتي MP3.",
      en: "Translate a script into another language and create an MP3 voice-over.",
      zh: "将脚本翻译成其他语言并生成 MP3 配音。",
    },
  },
  {
    id: "app_engine",
    icon: "Code2",
    ar: "محرك بناء المواقع والتطبيقات",
    en: "App & Web Engine",
    zh: "应用引擎",
    description: {
      ar: "صف موقعاً أو تطبيق جوال واختر HTML أو React أو Python أو Java أو C++ أو Kotlin، ثم عاين أو نزّل الكود.",
      en: "Describe a website or mobile app, choose HTML, React, Python, Java, C++, or Kotlin, then preview or download its source.",
      zh: "描述网站或移动应用，选择 HTML、React、Python、Java、C++ 或 Kotlin，然后预览或下载源代码。",
    },
  },
  {
    id: "image",
    icon: "ImageIcon",
    ar: "استوديو الصور الدقيقة",
    en: "AI Image Studio",
    zh: "图像工作室",
    description: {
      ar: "صمّم أفكاراً بصرية وصوراً إبداعية من وصفك، مع خيارات مناسبة لمشروعك.",
      en: "Explore creative image concepts from your brief with options tailored to your project.",
      zh: "根据描述探索创意图像方案，并调整为适合项目的风格。",
    },
  },
  {
    id: "vault",
    icon: "Archive",
    ar: "خزنة يوسفكو السحابية",
    en: "Cloud Vault",
    zh: "云保险库",
    description: {
      ar: "احفظ ملفات ومخرجات مشاريعك ونزّلها أو احذفها من مساحة خاصة مرتبطة بحسابك.",
      en: "Keep your project files and outputs in private storage linked to your account.",
      zh: "在与账户关联的私人空间中保存项目文件与成果。",
    },
  },
  {
    id: "templates",
    icon: "LayoutTemplate",
    ar: "متجر القوالب الذكية",
    en: "Templates Market",
    zh: "模板市场",
    description: {
      ar: "اختر قالباً جاهزاً لحملة أو منتج أو فعالية، ثم أنشئ محتوى مخصصاً له.",
      en: "Choose a ready-made campaign, product, or event template and generate tailored content.",
      zh: "选择营销、产品或活动模板，并生成定制内容。",
    },
  },
] as const;

export type StudioId = (typeof STUDIOS)[number]["id"];
export const METERED: StudioId[] = [
  "auto_video",
  "animation",
  "voice",
  "dubbing",
  "app_engine",
  "image",
  "templates",
];

export const STUDIO_CREDIT_COSTS: Partial<Record<StudioId, number>> = {
  auto_video: 2,
  animation: 2,
  voice: 2,
  app_engine: 4,
  image: 2,
  templates: 2,
};

export function getStudioCreditCostForTier(tier: Tier, studio: StudioId): number {
  return tier === "free" ? 0 : getStudioCreditCost(studio);
}

export function getStudioCreditCost(studio: StudioId): number {
  return STUDIO_CREDIT_COSTS[studio] ?? 1;
}

export function formatPrice(price: number) {
  return new Intl.NumberFormat("ar-EG").format(price);
}
