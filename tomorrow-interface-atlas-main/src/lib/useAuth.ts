import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseTier, type Tier } from "./plans";

let profileBalanceRealtimeChannelId = 0;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const authEventReceived = { current: false };
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      authEventReceived.current = true;
      setUser(s?.user ?? null);
      setReady(true);
    });
    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (error && error.name !== "AuthSessionMissingError")
          console.error("[Auth] Could not restore the current session", error);
        if (!authEventReceived.current) setUser(data.user);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.name !== "AuthSessionMissingError")
          console.error("[Auth] Could not restore the current session", error);
        if (!authEventReceived.current) setUser(null);
        setReady(true);
      });
    return () => data.subscription.unsubscribe();
  }, []);
  return { user, ready };
}

export function ProfileBalanceRealtimeSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`profile-balance:${userId}:${++profileBalanceRealtimeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["profile", userId] });
        },
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[Realtime] Profile balance subscription failed", error ?? status);
        }
      });

    return () => {
      void supabase
        .removeChannel(channel)
        .then((status) => {
          if (status !== "ok")
            console.warn("[Realtime] Could not clean up profile subscription", status);
        })
        .catch((error: unknown) => {
          console.error("[Realtime] Could not clean up profile subscription", error);
        });
    };
  }, [queryClient, userId]);

  return null;
}

export function useProfile(userId?: string) {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    retry: 1,
    retryDelay: 1000,
    queryFn: async () => {
      let profileResult = await supabase
        .from("profiles")
        .select("id,email,plan_name,balance,total_spent,full_name_ar,full_name_en,avatar_url")
        .eq("id", userId!)
        .maybeSingle();
      if (profileResult.error) {
        if (profileResult.error.code === "PGRST204" || profileResult.error.code === "PGRST205") {
          throw new Error(
            "بنية قاعدة البيانات لا تطابق التطبيق بعد. طبّق ترحيلة customer_credits_schema ثم أعد المحاولة.",
          );
        }
        throw new Error(profileResult.error.message);
      }
      if (profileResult.data === null) {
        const { error: ensureError } = await supabase.rpc("ensure_customer_profile");
        if (ensureError) {
          throw new Error(
            `تعذر إنشاء ملف حسابك في Supabase: ${ensureError.message}. طبّق ترحيلة customer_profile_sync ثم أعد المحاولة.`,
          );
        }
        profileResult = await supabase
          .from("profiles")
          .select("id,email,plan_name,balance,total_spent,full_name_ar,full_name_en,avatar_url")
          .eq("id", userId!)
          .maybeSingle();
        if (profileResult.error) throw new Error(profileResult.error.message);
        if (profileResult.data === null) {
          throw new Error(
            "لم يتم إنشاء ملف الحساب في Supabase بعد. أعد المحاولة أو تواصل مع الإدارة.",
          );
        }
      }
      const p = profileResult.data;
      let isAdmin = false;
      const adminResult = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", userId!)
        .maybeSingle();
      if (adminResult.error) {
        if (
          adminResult.error.message.includes("is_admin") &&
          adminResult.error.message.includes("does not exist")
        ) {
          console.warn(
            "[Profile] profiles.is_admin is missing; apply the customer credits migration to enable admin features.",
          );
        } else {
          throw new Error(adminResult.error.message);
        }
      } else {
        isAdmin = adminResult.data?.is_admin ?? false;
      }
      if (!Number.isSafeInteger(p.balance) || p.balance < 0) {
        throw new Error("قيمة الرصيد في profiles.balance يجب أن تكون عدداً صحيحاً غير سالب.");
      }
      return {
        tier: parseTier(p.plan_name),
        name: p.full_name_ar ?? p.full_name_en ?? "",
        email: p.email,
        isAdmin,
        used: {},
        balance: p.balance,
      };
    },
  });

  return profileQuery;
}
