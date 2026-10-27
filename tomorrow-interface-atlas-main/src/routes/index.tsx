import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Cpu, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudioIcon } from "@/components/StudioIcon";
import { pick, useLang } from "@/lib/i18n";
import { formatPrice, PLANS, STUDIOS } from "@/lib/plans";
import { STUDIO_ARTWORK } from "@/lib/studio-artwork";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Youssefco — منصة الذكاء الاصطناعي للمبدعين" },
      {
        name: "description",
        content:
          "مونتاج آلي، أنيميشن، تعليق صوتي، دبلجة عالمية، بناء تطبيقات وصور بالذكاء الاصطناعي في منصة واحدة.",
      },
      { property: "og:title", content: "Youssefco — AI Studios 2026" },
      {
        property: "og:description",
        content: "Eight AI creative studios in one futuristic platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const copy =
    lang === "ar"
      ? {
          eyebrow: "منصتك الإبداعية للجيل القادم",
          explore: "اكتشف الاستوديوهات",
          modules: "استوديوهات ذكية",
          languages: "لغات للواجهة",
          workspace: "مساحة إبداعية واحدة",
          preview: "مساحة إبداعية",
          previewLabel: "من الفكرة إلى الإنجاز",
          studios: "استكشف استوديوهات يوسيفكو",
          studiosSub: "كل الأدوات الإبداعية التي تحتاجها، في مكان واحد.",
        }
      : lang === "zh"
        ? {
            eyebrow: "面向新一代的创意平台",
            explore: "探索工作室",
            modules: "个智能工作室",
            languages: "种界面语言",
            workspace: "个创意空间",
            preview: "创意空间",
            previewLabel: "从灵感到成品",
            studios: "探索 Youssefco 工作室",
            studiosSub: "创作所需的工具，汇聚一处。",
          }
        : {
            eyebrow: "Your creative platform for what’s next",
            explore: "Explore the studios",
            modules: "AI studios",
            languages: "interface languages",
            workspace: "creative workspace",
            preview: "CREATIVE SPACE",
            previewLabel: "From first spark to final frame",
            studios: "Explore Youssefco Studios",
            studiosSub: "Everything you need to turn an idea into something real.",
          };
  return (
    <main className="relative overflow-hidden">
      <section className="landing-hero grid-hud relative mx-auto max-w-7xl px-4 py-12 md:py-16 lg:py-20">
        <div className="landing-hero-copy">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-background/60 px-4 py-2 text-xs font-semibold text-gold backdrop-blur">
            <Cpu className="h-3.5 w-3.5" /> {copy.eyebrow}
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.2] md:text-6xl xl:text-7xl">
            <span className="text-gradient">{t("heroTitle")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground md:text-lg">
            {t("heroSub")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-gradient-brand px-7 text-primary-foreground glow-gold"
            >
              <Link to={user ? "/dashboard" : "/auth"}>
                <Sparkles className="h-4 w-4" />
                {user ? t("dashboard") : t("start")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-background/50">
              <a href="#studios">
                <WandSparkles className="h-4 w-4" />
                {copy.explore}
              </a>
            </Button>
          </div>
          <div className="landing-stats mt-10 grid max-w-xl grid-cols-3 gap-3">
            <div>
              <strong>08</strong>
              <span>{copy.modules}</span>
            </div>
            <div>
              <strong>03</strong>
              <span>{copy.languages}</span>
            </div>
            <div>
              <strong>01</strong>
              <span>{copy.workspace}</span>
            </div>
          </div>
        </div>
        <div className="landing-visual" aria-label={copy.preview}>
          <div className="landing-orbit landing-orbit-outer" aria-hidden="true" />
          <div className="landing-orbit landing-orbit-inner" aria-hidden="true" />
          <div className="landing-art-main">
            <img src={STUDIO_ARTWORK.animation} alt="" fetchPriority="high" />
          </div>
          <div className="landing-float-card landing-float-top">
            <span className="landing-float-icon">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>
              <strong>{copy.preview}</strong>
              <small>{copy.previewLabel}</small>
            </span>
          </div>
          <div className="landing-float-card landing-float-bottom">
            <span className="landing-status-dot" />
            <span>
              {lang === "ar" ? "جاهز للإبداع" : lang === "zh" ? "准备创作" : "Ready to create"}
            </span>
            <span className="font-display text-xs text-cyan-200">08 / 08</span>
          </div>
        </div>
      </section>

      <section id="studios" className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-20">
        <div className="landing-section-heading mb-8">
          <div>
            <div className="font-display text-[10px] tracking-[0.22em] text-gold">01 / STUDIOS</div>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">{copy.studios}</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">{copy.studiosSub}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STUDIOS.map((s, i) => (
            <Link
              key={s.id}
              to={user ? "/studio/$id" : "/auth"}
              params={{ id: s.id }}
              className="glass studio-card group relative overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 hover:shadow-[0_18px_50px_-32px_rgba(34,211,238,.75)]"
            >
              <div className="studio-artwork">
                <img src={STUDIO_ARTWORK[s.id]} alt="" loading="lazy" />
                <span className="studio-artwork-icon" aria-hidden="true">
                  <StudioIcon name={s.icon} className="h-6 w-6" />
                </span>
              </div>
              <div className="font-display text-[10px] text-muted-foreground">
                {lang === "ar" ? `الاستوديو 0${i + 1}` : `MODULE 0${i + 1}`}
              </div>
              <h3 className="mt-1 text-lg font-bold">{pick(s, lang)}</h3>
              <p className="mt-2 min-h-14 text-sm leading-6 text-muted-foreground">
                {pick(s.description, lang)}
              </p>
              <ArrowLeft className="mt-4 h-4 w-4 text-gold transition group-hover:-translate-x-1 ltr:rotate-180" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-28">
        <div className="mb-8 text-center">
          <div className="font-display text-[10px] tracking-[0.22em] text-gold">02 / PLANS</div>
          <h2 className="mt-2 font-display text-2xl text-gradient">{t("plans")}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`glass p-6 text-center ${p.id === "vip" ? "glow-gold border-gold/60" : ""}`}
            >
              <div className="text-lg font-bold">{p.ar}</div>
              <div className="mt-3 font-display text-4xl text-gradient">{formatPrice(p.price)}</div>
              <div className="text-sm text-muted-foreground">{t("egp")}</div>
              <div className="mt-4 text-sm">
                {p.credits} {t("credits")}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
