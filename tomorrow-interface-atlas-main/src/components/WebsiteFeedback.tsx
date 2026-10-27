import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareWarning, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";

type FeedbackMode = "review" | "report";

export function WebsiteFeedback() {
  const { lang } = useLang();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<FeedbackMode | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [category, setCategory] = useState("suggestion");
  const [busy, setBusy] = useState(false);
  const ar = lang === "ar";
  const zh = lang === "zh";
  const text = (arabic: string, english: string, chinese: string) =>
    ar ? arabic : zh ? chinese : english;
  const reviewsQuery = useQuery({
    queryKey: ["website-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_reviews")
        .select("id,display_name,rating,comment,created_at")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });
  const summaryQuery = useQuery({
    queryKey: ["website-review-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("website_review_summary");
      if (error) throw error;
      return data[0];
    },
  });
  const reviews = reviewsQuery.data ?? [];
  const averageRating = summaryQuery.data?.average_rating;

  function openForm(nextMode: FeedbackMode) {
    setMode(nextMode);
    setComment("");
    setRating(5);
    setCategory("suggestion");
    setDisplayName(
      typeof user?.user_metadata["full_name"] === "string"
        ? user.user_metadata["full_name"].slice(0, 60)
        : (user?.email?.split("@")[0] ?? ""),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !mode) return;
    setBusy(true);
    try {
      if (mode === "review") {
        const { error } = await supabase.from("website_reviews").upsert(
          {
            user_id: user.id,
            display_name: displayName.trim(),
            rating,
            comment: comment.trim(),
            is_public: true,
          },
          { onConflict: "user_id" },
        );
        if (error) throw error;
        toast.success(
          text("شكرًا لمشاركتك تقييمك!", "Thanks for sharing your review!", "感谢分享您的评价！"),
        );
        await queryClient.invalidateQueries({ queryKey: ["website-reviews"] });
        await queryClient.invalidateQueries({ queryKey: ["website-review-summary"] });
      } else {
        const { error } = await supabase.from("website_feedback").insert({
          user_id: user.id,
          category,
          message: comment.trim(),
        });
        if (error) throw error;
        toast.success(
          text(
            "تم إرسال بلاغك إلى الإدارة.",
            "Your report was sent to the admin team.",
            "您的反馈已发送给管理员。",
          ),
        );
      }
      setMode(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <footer className="border-t border-border bg-background/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <p className="font-display text-lg text-gradient">YOUSSEFCO</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {text(
                "منصة إبداعية تجمع أدوات الذكاء الاصطناعي في مكان واحد.",
                "A creative platform bringing AI tools together in one place.",
                "汇集多种 AI 创作工具的一体化平台。",
              )}
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span
                className="flex text-gold"
                aria-label={averageRating ? `${averageRating} / 5` : undefined}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    className={`h-4 w-4 ${index < Math.round(averageRating ?? 0) ? "fill-current" : ""}`}
                  />
                ))}
              </span>
              <span className="text-muted-foreground">
                {averageRating && summaryQuery.data?.review_count
                  ? `${averageRating.toFixed(1)} · ${summaryQuery.data.review_count} ${text("تقييمات", "reviews", "条评价")}`
                  : text("لا توجد تقييمات بعد", "No reviews yet", "暂无评价")}
              </span>
            </div>
            {(reviewsQuery.isError || summaryQuery.isError) && (
              <p className="mt-2 text-xs text-destructive">
                {text(
                  "تعذر تحميل التقييمات. على مالك المشروع تطبيق ترحيلة website_feedback في Supabase.",
                  "Could not load reviews. The project owner must apply the website_feedback Supabase migration.",
                  "无法加载评价。请项目所有者应用 Supabase 的 website_feedback 迁移。",
                )}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => openForm("report")}>
              <MessageSquareWarning className="h-4 w-4" />
              {text("إبلاغ الإدارة", "Report an issue", "问题反馈")}
            </Button>
            <Button type="button" variant="outline" onClick={() => openForm("review")}>
              <Star className="h-4 w-4" />
              {text("قيّم الموقع", "Rate this site", "评价网站")}
            </Button>
          </div>
        </div>
        <div className="mx-auto grid max-w-7xl gap-3 border-t border-border px-4 py-6 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review) => (
            <article key={review.id} className="glass p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold">{review.display_name}</span>
                <span
                  className="flex shrink-0 items-center gap-1 text-sm text-gold"
                  aria-label={`${review.rating} / 5`}
                >
                  <Star className="h-4 w-4 fill-current" />
                  {review.rating}/5
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                {review.comment}
              </p>
              <time
                className="mt-3 block text-xs text-muted-foreground"
                dateTime={review.created_at}
              >
                {new Date(review.created_at).toLocaleDateString(lang)}
              </time>
            </article>
          ))}
        </div>
        <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Youssefco
        </div>
      </footer>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="glass border-gold/30 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {mode === "review"
                ? text("قيّم تجربتك", "Rate your experience", "评价您的体验")
                : text("إبلاغ الإدارة", "Report to the admin team", "向管理员反馈")}
            </DialogTitle>
          </DialogHeader>
          {!user ? (
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>
                {text(
                  "سجّل الدخول لإرسال تقييم أو بلاغ، ولمنع الرسائل المجهولة.",
                  "Sign in to submit a review or report. Submissions are tied to your account.",
                  "请先登录以提交评价或反馈，提交内容将关联到您的账户。",
                )}
              </p>
              <Button asChild className="bg-gradient-brand text-primary-foreground">
                <Link to="/auth">{text("تسجيل الدخول", "Sign in", "登录")}</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(event) => void submit(event)}>
              {mode === "review" ? (
                <>
                  <label className="block space-y-2 text-sm">
                    <span>
                      {text("الاسم الظاهر للعامة", "Public display name", "公开显示名称")}
                    </span>
                    <Input
                      required
                      maxLength={60}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  </label>
                  <fieldset>
                    <legend className="mb-2 text-sm">
                      {text("تقييمك", "Your rating", "您的评分")}
                    </legend>
                    <div className="flex gap-1" dir="ltr">
                      {Array.from({ length: 5 }, (_, index) => {
                        const value = index + 1;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-label={`${value} / 5`}
                            aria-pressed={rating === value}
                            onClick={() => setRating(value)}
                            className="rounded p-1 text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            <Star className={`h-7 w-7 ${rating >= value ? "fill-current" : ""}`} />
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </>
              ) : (
                <label className="block space-y-2 text-sm">
                  <span>{text("نوع البلاغ", "Report type", "反馈类型")}</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    <option value="suggestion">{text("اقتراح", "Suggestion", "建议")}</option>
                    <option value="bug">
                      {text("مشكلة تقنية", "Technical issue", "技术问题")}
                    </option>
                    <option value="other">{text("أخرى", "Other", "其他")}</option>
                  </select>
                </label>
              )}
              <label className="block space-y-2 text-sm">
                <span>
                  {mode === "review"
                    ? text("اكتب تقييمك", "Your review", "您的评价")
                    : text("التفاصيل", "Details", "详细内容")}
                </span>
                <Textarea
                  required
                  minLength={mode === "review" ? 5 : 10}
                  maxLength={mode === "review" ? 500 : 2000}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={text("اكتب هنا…", "Write here…", "请在此输入…")}
                />
              </label>
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-gradient-brand text-primary-foreground"
              >
                <Send className="h-4 w-4" />
                {busy
                  ? text("جارٍ الإرسال…", "Sending…", "正在发送…")
                  : text("إرسال", "Submit", "提交")}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
