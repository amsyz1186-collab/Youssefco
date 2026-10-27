import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type UiEventName = "ui.page_view" | "ui.click" | "ui.change" | "ui.submit";

type PendingEvent = {
  eventName: UiEventName | "auth.sign_in" | "auth.sign_out";
  route: string | null;
  target: string | null;
  details: { tag?: string; role?: string; input_type?: string };
};

function controlFor(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest(
    "a, button, input, select, textarea, summary, [role], [contenteditable='true']",
  );
}

function describeControl(control: Element) {
  const tag = control.tagName.toLowerCase();
  const inputType =
    control instanceof HTMLInputElement
      ? control.type.toLowerCase()
      : control instanceof HTMLButtonElement
        ? control.type.toLowerCase()
        : undefined;
  const role = control.getAttribute("role")?.slice(0, 32);
  return {
    tag,
    ...(role ? { role } : {}),
    ...(inputType && inputType !== "password" ? { input_type: inputType.slice(0, 32) } : {}),
  };
}

export function ActivityTracker() {
  const route = useRouterState({ select: (state) => state.location.pathname });
  const userId = useRef<string | null>(null);
  const anonymousSessionId = useRef<string | null>(null);
  const pending = useRef<PendingEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;

    try {
      const storedSessionId = sessionStorage.getItem("youssefco:activity-session");
      const sessionId = storedSessionId || crypto.randomUUID();
      if (!storedSessionId) sessionStorage.setItem("youssefco:activity-session", sessionId);
      anonymousSessionId.current = sessionId;
    } catch (error) {
      console.error("[Activity] Could not initialize the anonymous activity session", error);
    }

    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const batch = pending.current.splice(0, 20);
      if (batch.length === 0) return;
      const remaining = pending.current.length > 0;
      if (remaining) timer.current = setTimeout(flush, 0);
      for (const event of batch) {
        if (!userId.current && !anonymousSessionId.current) continue;
        void supabase
          .rpc("log_ui_event", {
            _event_name: event.eventName,
            _route: event.route,
            _target: event.target,
            _details: event.details,
            _anonymous_session_id: anonymousSessionId.current,
          })
          .then(({ error }) => {
            if (error) console.error("[Activity] Could not save activity event", error);
          });
      }
    };

    const enqueue = (event: PendingEvent) => {
      if (!userId.current && !anonymousSessionId.current) return;
      pending.current.push(event);
      if (!timer.current) timer.current = setTimeout(flush, 1000);
      if (pending.current.length >= 20) flush();
    };

    const onClick = (event: MouseEvent) => {
      const control = controlFor(event.target);
      if (!control || control.getAttribute("contenteditable") === "true") return;
      enqueue({
        eventName: "ui.click",
        route,
        target: control.tagName.toLowerCase(),
        details: describeControl(control),
      });
    };

    const onChange = (event: Event) => {
      const control = controlFor(event.target);
      if (!control || control.getAttribute("contenteditable") === "true") return;
      if (control instanceof HTMLInputElement && control.type === "password") return;
      enqueue({
        eventName: "ui.change",
        route,
        target: control.tagName.toLowerCase(),
        details: describeControl(control),
      });
    };

    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      enqueue({
        eventName: "ui.submit",
        route,
        target: "form",
        details: { tag: "form" },
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const previousUser = userId.current;
      const nextUser = session?.user.id ?? null;

      if (event === "SIGNED_OUT" && previousUser) {
        userId.current = null;
        setAuthReady(true);
        return;
      }

      userId.current = nextUser;
      setAuthReady(true);
      if (event === "SIGNED_IN" && nextUser) {
        enqueue({ eventName: "auth.sign_in", route, target: null, details: {} });
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("[Activity] Could not restore the session for activity logging", error);
        return;
      }
      userId.current = data.session?.user.id ?? null;
      setAuthReady(true);
    });

    return () => {
      active = false;
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      authListener.subscription.unsubscribe();
      flush();
    };
  }, [route]);

  useEffect(() => {
    if (!authReady) return;
    if (!userId.current && !anonymousSessionId.current) return;
    const timeout = setTimeout(() => {
      if (!userId.current && !anonymousSessionId.current) return;
      void supabase
        .rpc("log_ui_event", {
          _event_name: "ui.page_view",
          _route: route,
          _target: null,
          _details: {},
          _anonymous_session_id: anonymousSessionId.current,
        })
        .then(({ error }) => {
          if (error) console.error("[Activity] Could not save page view", error);
        });
    }, 0);
    return () => clearTimeout(timeout);
  }, [authReady, route]);

  return null;
}
