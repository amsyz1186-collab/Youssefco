import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { LangProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { Header } from "@/components/Header";
import { Splash } from "@/components/Splash";
import { ActivityTracker } from "@/components/ActivityTracker";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { ProfileBalanceRealtimeSync } from "@/lib/useAuth";
import { WebsiteFeedback } from "@/components/WebsiteFeedback";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl text-gradient">404</h1>
        <p className="mt-4 text-muted-foreground">الصفحة غير موجودة · Page not found</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const errorMessage =
    error instanceof Error && error.message
      ? error.message.slice(0, 500)
      : "تعذر تحديد تفاصيل الخطأ. راجع سجل المتصفح وحاول مرة أخرى.";
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-xl text-center" role="alert">
        <h1 className="text-xl font-semibold">حدث خطأ · Something went wrong</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          ظهرت تفاصيل الخطأ أدناه لتسهيل التشخيص:
        </p>
        <pre
          dir="ltr"
          className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background/70 p-3 text-left text-xs"
        >
          {errorMessage}
        </pre>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          إعادة المحاولة
        </button>
        <Link to="/auth" className="mt-4 block text-sm text-muted-foreground underline">
          العودة إلى تسجيل الدخول
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Youssefco — منصة الذكاء الاصطناعي للمبدعين" },
      {
        name: "description",
        content:
          "Youssefco: منصة إبداعية تجمع استوديوهات الذكاء الاصطناعي للمونتاج والأنيميشن والصوت والدبلجة والتطبيقات والصور.",
      },
      { name: "google-adsense-account", content: "ca-pub-1395742119124802" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Tajawal:wght@400;500;700;800&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const scriptId = "youssefco-adsense";
    if (document.getElementById(scriptId)) return;

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src =
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1395742119124802";
    document.head.appendChild(script);
  }, []);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      window.setTimeout(() => {
        void router.invalidate().catch((error: unknown) => {
          console.error("[Router] Could not refresh routes after an auth change", error);
        });
        if (event !== "SIGNED_OUT") {
          void queryClient.invalidateQueries().catch((error: unknown) => {
            console.error("[Auth] Could not refresh queries after an auth change", error);
          });
        }
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LangProvider>
          <ProfileBalanceRealtimeSync />
          <Splash />
          <Header />
          <Outlet />
          <WebsiteFeedback />
          <ActivityTracker />
          <Toaster position="top-center" />
        </LangProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
