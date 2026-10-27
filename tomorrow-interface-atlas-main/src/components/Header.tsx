import { Link, useNavigate } from "@tanstack/react-router";
import { Coins, Globe, LogOut, Moon, Shield, Sun, UserRound, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useTheme } from "@/lib/useTheme";
import { useAuth, useProfile } from "@/lib/useAuth";
import { TIER_NAMES } from "@/lib/plans";
import { LANGUAGE_OPTIONS } from "@/lib/languages";
import { BrandMark } from "./BrandMark";
import { PaywallModal } from "./PaywallModal";

export function Header() {
  const { t, lang, setLang } = useLang();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const {
    data: profile,
    isError: profileError,
    error: profileLoadError,
    isLoading: profileLoading,
    refetch: retryProfile,
  } = useProfile(user?.id);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const languageDisplayNames = useMemo(
    () => new Intl.DisplayNames([lang], { type: "language" }),
    [lang],
  );
  const languageOptions = useMemo(
    () =>
      LANGUAGE_OPTIONS.map(({ code, name }) => ({
        code,
        name,
        label: languageDisplayNames.of(code) ?? code,
      })).sort((a, b) => a.label.localeCompare(b.label, lang)),
    [lang, languageDisplayNames],
  );
  const filteredLanguages = languageOptions
    .filter(({ code, label, name }) =>
      `${label} ${name} ${code}`
        .toLocaleLowerCase(lang)
        .includes(languageSearch.trim().toLocaleLowerCase(lang)),
    )
    .slice(0, 100);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/15 bg-white/80 p-1 shadow-sm">
            <BrandMark className="h-full w-full" />
          </span>
          <span className="font-display text-lg text-gradient">Youssefco</span>
        </Link>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={
            lang === "ar"
              ? theme === "dark"
                ? "تفعيل الوضع العادي"
                : "تفعيل الوضع الداكن"
              : lang === "zh"
                ? theme === "dark"
                  ? "切换到浅色模式"
                  : "切换到深色模式"
                : theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
          }
          title={
            lang === "ar"
              ? theme === "dark"
                ? "الوضع العادي"
                : "الوضع الداكن"
              : theme === "dark"
                ? "Light mode"
                : "Dark mode"
          }
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              aria-label={languageDisplayNames.of(lang) ?? lang}
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">{languageDisplayNames.of(lang) ?? lang}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <div className="sticky top-0 z-10 bg-popover p-2">
              <input
                type="search"
                value={languageSearch}
                onChange={(event) => setLanguageSearch(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder={t("searchLanguages")}
                aria-label={t("searchLanguages")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {filteredLanguages.map((language) => (
              <DropdownMenuItem
                key={language.code}
                onClick={() => {
                  setLang(language.code);
                  setLanguageSearch("");
                }}
              >
                {language.label === language.code ? language.name : language.label}
                <span className="ml-auto text-xs text-muted-foreground">{language.code}</span>
              </DropdownMenuItem>
            ))}
            {filteredLanguages.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {lang === "ar"
                  ? "لا توجد لغة مطابقة"
                  : lang === "zh"
                    ? "没有匹配的语言"
                    : "No languages found"}
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {user ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (profileError) void retryProfile();
              }}
              title={
                profileError
                  ? profileLoadError instanceof Error
                    ? profileLoadError.message
                    : "تعذر تحميل بيانات الباقة."
                  : undefined
              }
              className={`hidden rounded-full border px-3 py-1 text-xs sm:inline ${profileError ? "border-destructive/40 text-destructive" : "border-gold/40 text-gold"}`}
            >
              {profileLoading
                ? "جارٍ تحميل الباقة…"
                : profileError
                  ? lang === "ar"
                    ? "تعذر تحميل الباقة"
                    : "Plan unavailable"
                  : `الباقة: ${TIER_NAMES[profile?.tier ?? "free"].ar}`}
            </button>
            {profile?.isAdmin && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin">
                  <Shield className="h-4 w-4" />
                  {t("admin")}
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" aria-label={t("account")}>
              <Link to="/account">
                <UserRound className="h-4 w-4" />
                <span className="hidden sm:inline">{t("account")}</span>
              </Link>
            </Button>
            <div
              aria-live="polite"
              title={
                profileError
                  ? profileLoadError instanceof Error
                    ? profileLoadError.message
                    : lang === "ar"
                      ? "تعذر تحميل بيانات الرصيد"
                      : "Could not load the credit balance"
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-2 py-2 text-xs sm:px-3"
            >
              <Coins className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">
                {lang === "ar" ? "الرصيد" : lang === "zh" ? "余额" : "Balance"}:
              </span>
              <strong className="font-bold text-foreground">
                {profileLoading ? "…" : profileError ? "—" : profile ? profile.balance : "—"}
              </strong>
              {profile && (
                <span className="hidden sm:inline">
                  {lang === "ar" ? "نقطة" : lang === "zh" ? "积分" : "credits"}
                </span>
              )}
            </div>
            <Button
              size="sm"
              className="bg-gradient-brand text-primary-foreground glow-gold"
              aria-label={lang === "ar" ? "إضافة رصيد" : "Add credits"}
              onClick={() => setOpen(true)}
            >
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">
                {lang === "ar" ? "إضافة رصيد" : "Add credits"}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("signout")}
              onClick={async () => {
                const { error: activityError } = await supabase.rpc("log_ui_event", {
                  _event_name: "auth.sign_out",
                  _route: window.location.pathname,
                  _target: null,
                  _details: {},
                  _anonymous_session_id: null,
                });
                if (activityError) {
                  console.error("[Activity] Could not save sign-out event", activityError);
                }
                await supabase.auth.signOut();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <PaywallModal open={open} onOpenChange={setOpen} />
          </>
        ) : (
          <Button asChild size="sm" className="bg-gradient-brand text-primary-foreground">
            <Link to="/auth">{t("signin")}</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
