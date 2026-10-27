import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Coins, Mail, UserRound } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useAuth, useProfile } from "@/lib/useAuth";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "حسابي — Youssefco" },
      { name: "description", content: "بيانات حسابك ورصيد نقاطك في Youssefco." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { t, lang, dir } = useLang();
  const { user } = useAuth();
  const { data: profile, isError, error, isLoading, refetch } = useProfile(user?.id);
  const metadataName =
    typeof user?.user_metadata["full_name"] === "string"
      ? user.user_metadata["full_name"]
      : typeof user?.user_metadata["name"] === "string"
        ? user.user_metadata["name"]
        : "";
  const name = profile?.name || metadataName || "—";
  const balanceLabel = lang === "ar" ? "نقطة" : lang === "zh" ? "积分" : "credits";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <Link
        to="/dashboard"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowRight className={`h-4 w-4 ${dir === "ltr" ? "rotate-180" : ""}`} />
        {t("dashboard")}
      </Link>
      <section className="glass hud-corners overflow-hidden p-6 md:p-9">
        <div className="mb-7 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <UserRound className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-gradient">{t("account")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{name}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <AccountDetail
            icon={<UserRound className="h-5 w-5" />}
            label={t("accountName")}
            value={isLoading ? "…" : name}
          />
          <AccountDetail
            icon={<Mail className="h-5 w-5" />}
            label={t("accountEmail")}
            value={profile?.email || user?.email || "—"}
            dir="ltr"
          />
          <AccountDetail
            icon={<Coins className="h-5 w-5" />}
            label={t("accountBalance")}
            value={
              isLoading
                ? "…"
                : isError
                  ? lang === "ar"
                    ? "تعذر التحميل"
                    : lang === "zh"
                      ? "无法加载"
                      : "Unavailable"
                  : profile
                    ? `${profile.balance} ${balanceLabel}`
                    : "—"
            }
          />
        </div>
        {isError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "تعذر تحميل رصيد الحساب من Supabase."}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 text-sm font-semibold text-destructive underline"
            >
              {lang === "ar" ? "إعادة المحاولة" : lang === "zh" ? "重试" : "Try again"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function AccountDetail({
  icon,
  label,
  value,
  dir,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-3 break-words text-base font-semibold" dir={dir}>
        {value}
      </p>
    </div>
  );
}
