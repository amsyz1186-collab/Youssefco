import { useEffect, useRef, useState } from "react";
import { Cog, Orbit, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/lib/useAuth";

export function Splash() {
  const { user, ready } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (user) {
      localStorage.setItem("yc-welcome-complete", "1");
      setShow(false);
      return;
    }
    if (localStorage.getItem("yc-welcome-complete") === "1") return;
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, [ready, user]);

  if (!show) return null;

  function start() {
    localStorage.setItem("yc-welcome-complete", "1");
    setShow(false);
  }

  return (
    <div className="splash-screen fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="splash-orb splash-orb-blue" />
      <div className="splash-orb splash-orb-violet" />
      <div className="relative mb-8 flex h-40 w-40 items-center justify-center">
        <Orbit className="absolute h-40 w-40 text-cyan-300/75" strokeWidth={0.7} />
        <Cog
          className="absolute -left-2 top-4 h-12 w-12 animate-spin text-cyan-300"
          strokeWidth={1.2}
          style={{ animationDuration: "18s" }}
        />
        <Cog
          className="absolute -right-2 bottom-4 h-10 w-10 animate-spin text-violet-300"
          strokeWidth={1.2}
          style={{ animationDirection: "reverse", animationDuration: "15s" }}
        />
        <BrandMark className="relative z-10 h-24 w-24 drop-shadow-[0_0_22px_rgba(103,232,249,0.58)]" />
      </div>
      <div className="font-display text-sm tracking-[0.35em] text-cyan-100/75">YOUSSEFCO</div>
      <h1 className="mt-5 max-w-sm text-3xl font-extrabold leading-relaxed text-white">
        أهلاً بك في عالم <span className="splash-title-gradient">يوسيفكو</span>
      </h1>
      <p className="mt-3 max-w-xs text-sm leading-7 text-slate-300">
        عالم من الذكاء الاصطناعي والإبداع، بين يديك.
      </p>
      <button
        type="button"
        onClick={start}
        className="splash-cta mt-9 inline-flex items-center gap-2 rounded-full px-9 py-3.5 font-bold text-slate-950"
      >
        <Sparkles className="h-4 w-4" />
        ابدأ الآن
      </button>
    </div>
  );
}
