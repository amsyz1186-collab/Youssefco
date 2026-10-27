import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Clapperboard,
  Languages,
  Plus,
  Sparkles,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { StudioIcon } from "@/components/StudioIcon";
import { pick, useLang } from "@/lib/i18n";
import { getStudioCreditCost, METERED, STUDIOS, TIER_NAMES } from "@/lib/plans";
import { STUDIO_ARTWORK } from "@/lib/studio-artwork";
import { useAuth, useProfile } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة القيادة — Youssefco" },
      { name: "description", content: "استوديوهات Youssefco الثمانية." },
    ],
  }),
  component: Dashboard,
});

const WORKSPACES: { id: string; label: string; icon: LucideIcon; studios: string[] }[] = [
  {
    id: "create",
    label: "إنشاء",
    icon: Plus,
    studios: ["auto_video", "animation", "image", "app_engine", "voice"],
  },
  { id: "collaborate", label: "تعاون", icon: Users, studios: ["templates", "vault"] },
  { id: "translate", label: "ترجمة", icon: Languages, studios: ["dubbing"] },
  {
    id: "media",
    label: "وسائط",
    icon: Video,
    studios: ["auto_video", "animation", "voice", "dubbing", "image"],
  },
] as const;

function Dashboard() {
  const { lang } = useLang();
  const { user } = useAuth();
  const {
    data: profile,
    isError: profileError,
    error: profileLoadError,
    isLoading: profileLoading,
    refetch: retryProfile,
  } = useProfile(user?.id);
  const [workspace, setWorkspace] = useState("create");
  const selected = WORKSPACES.find((item) => item.id === workspace)!;
  const studios = STUDIOS.filter((studio) => selected.studios.includes(studio.id));
  return (
    <main className="mx-auto max-w-7xl px-4 py-7 md:py-10">
      <section className="dashboard-hero glass hud-corners relative mb-7 overflow-hidden p-6 md:p-9">
        <div className="dashboard-glow dashboard-glow-blue" />
        <div className="dashboard-glow dashboard-glow-violet" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" /> مساحة الإبداع الذكية
            </div>
            <h1 className="text-3xl font-extrabold md:text-4xl">
              أهلاً بك،{" "}
              <span className="text-gradient">
                {profile?.name ||
                  (typeof user?.user_metadata["full_name"] === "string"
                    ? user.user_metadata["full_name"]
                    : null) ||
                  (typeof user?.user_metadata["name"] === "string"
                    ? user.user_metadata["name"]
                    : null) ||
                  "مبدعنا"}
              </span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              حوّل أفكارك إلى فيديوهات ومحتوى ومشاريع إبداعية من لوحة واحدة.
            </p>
          </div>
          <div className="glass min-w-40 px-5 py-3">
            <div className="text-xs text-muted-foreground">باقتك الحالية</div>
            <div className="mt-1 font-bold text-cyan-200">
              {profileLoading
                ? "جارٍ تحميل الباقة…"
                : profileError
                  ? "تعذر تحميل الباقة"
                  : TIER_NAMES[profile?.tier ?? "free"].ar}
            </div>
            {profileError && (
              <>
                <p className="mt-2 max-w-xs text-xs leading-5 text-destructive">
                  {profileLoadError instanceof Error
                    ? profileLoadError.message
                    : "تعذر الاتصال ببيانات الباقة."}
                </p>
                <button
                  type="button"
                  onClick={() => void retryProfile()}
                  className="mt-1 text-xs text-destructive underline"
                >
                  إعادة المحاولة
                </button>
              </>
            )}
            {profile && (
              <div className="mt-1 text-xs text-muted-foreground">
                {lang === "ar"
                  ? `الرصيد المتاح: ${profile.balance} نقطة`
                  : lang === "zh"
                    ? `可用余额：${profile.balance} 积分`
                    : `Available balance: ${profile.balance} credits`}
              </div>
            )}
          </div>
        </div>
        <div className="relative z-10 mt-7 flex flex-wrap gap-3">
          <Link
            to="/studio/$id"
            params={{ id: "auto_video" }}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-cyan-950/30 transition hover:brightness-110"
          >
            <Clapperboard className="h-4 w-4" /> ابدأ مشروع فيديو
          </Link>
          <Link
            to="/studio/$id"
            params={{ id: "dubbing" }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/10"
          >
            <Languages className="h-4 w-4" /> ترجمة ودبلجة
          </Link>
        </div>
      </section>

      <section className="glass mb-7 flex flex-col gap-5 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div>
          <h2 className="text-lg font-bold">مساحة العمل</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            اختر نوع المشروع لعرض الأدوات المناسبة.
          </p>
        </div>
        <nav aria-label="أنواع مساحة العمل" className="grid grid-cols-2 gap-2 sm:flex">
          {WORKSPACES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={workspace === id}
              onClick={() => setWorkspace(id)}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${workspace === id ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "border-border bg-background/60 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </section>

      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold">{selected.label} في استوديوهاتك</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            أدوات جاهزة للانتقال من الفكرة إلى التنفيذ.
          </p>
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block">
          {studios.length} استوديوهات
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {studios.map((studio) => {
          const metered = METERED.includes(studio.id);
          const hasFullCardArtwork = true;
          return (
            <Link
              key={studio.id}
              to="/studio/$id"
              params={{ id: studio.id }}
              className={`glass studio-card group relative overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:shadow-[0_18px_50px_-32px_rgba(34,211,238,.75)]${hasFullCardArtwork ? " dashboard-tool-card" : ""}`}
              style={
                hasFullCardArtwork
                  ? { backgroundImage: `url("${STUDIO_ARTWORK[studio.id]}")` }
                  : undefined
              }
            >
              {hasFullCardArtwork && (
                <span className="dashboard-tool-card-overlay" aria-hidden="true" />
              )}
              <div className="dashboard-tool-card-content">
                <div className="studio-artwork">
                  {!hasFullCardArtwork && (
                    <img src={STUDIO_ARTWORK[studio.id]} alt="" loading="lazy" />
                  )}
                  <span className="studio-artwork-icon" aria-hidden="true">
                    <StudioIcon name={studio.icon} className="h-6 w-6" />
                  </span>
                  <ArrowUpRight className="studio-artwork-arrow h-4 w-4 transition group-hover:-translate-y-1 group-hover:translate-x-1" />
                </div>
                <h3 className="mt-4 font-bold">{pick(studio, lang)}</h3>
                <p className="mt-2 min-h-14 text-sm leading-6 text-muted-foreground">
                  {pick(studio.description, lang)}
                </p>
                <div className="dashboard-tool-card-meta mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {studio.id === "auto_video"
                      ? lang === "ar"
                        ? "فيديو ومونتاج"
                        : "Video editing"
                      : studio.id === "dubbing"
                        ? lang === "ar"
                          ? "لغات وصوت"
                          : "Languages & voice"
                        : lang === "ar"
                          ? "أدوات إبداعية"
                          : "Creative tools"}
                  </span>
                  {metered && (
                    <span className="text-cyan-200">
                      {lang === "ar"
                        ? `${getStudioCreditCost(studio.id)} نقاط لكل تشغيل`
                        : lang === "zh"
                          ? `每次运行消耗 ${getStudioCreditCost(studio.id)} 积分`
                          : `${getStudioCreditCost(studio.id)} credits per run`}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
