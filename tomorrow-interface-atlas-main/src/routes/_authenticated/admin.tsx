import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile } from "@/lib/useAuth";
import { formatPrice, parseTier, TIER_NAMES } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "لوحة الإدارة — Youssefco" },
      { name: "description", content: "إدارة المدفوعات والمستخدمين." },
    ],
  }),
  component: Admin,
});

const STATUS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
};

function tierLabel(value: string | null) {
  try {
    return TIER_NAMES[parseTier(value)].ar;
  } catch {
    return value ?? TIER_NAMES.free.ar;
  }
}

function Admin() {
  const { user } = useAuth();
  const { data: me, isLoading } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const {
    data,
    error,
    isLoading: dataLoading,
  } = useQuery({
    queryKey: ["admin"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const [transactions, users, methods, activity, feedback] = await Promise.all([
        supabase.from("transactions").select("*").order("id", { ascending: false }),
        supabase
          .from("profiles")
          .select("id,email,plan_name,balance,total_spent,full_name_ar,full_name_en,is_admin"),
        supabase.from("payment_methods").select("id,name,is_active").eq("is_active", true),
        supabase
          .from("activity_events")
          .select("id,user_id,actor_id,event_type,event_name,route,target,details,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("website_feedback")
          .select("id,user_id,category,message,status,created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (transactions.error) throw transactions.error;
      if (users.error) throw users.error;
      if (methods.error) throw methods.error;
      if (activity.error) throw activity.error;
      if (feedback.error) throw feedback.error;
      return {
        transactions: transactions.data,
        users: users.data,
        methods: methods.data,
        activity: activity.data,
        feedback: feedback.data,
      };
    },
  });

  if (isLoading) return null;
  if (!me?.isAdmin)
    return <main className="p-16 text-center text-muted-foreground">غير مصرح · Forbidden</main>;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
    void queryClient.invalidateQueries({ queryKey: ["profile"] });
  };
  const email = (id: string) => data?.users.find((u) => u.id === id)?.email ?? id.slice(0, 8);

  async function decide(id: string, approve: boolean) {
    const { error: approvalError } = await supabase.rpc("approve_transaction", {
      _transaction_id: id,
      _approve: approve,
    });
    if (approvalError) toast.error(approvalError.message);
    else toast.success(approve ? "تم اعتماد الشحن وإضافة النقاط" : "تم رفض طلب الشحن");
    refresh();
  }

  async function resolveFeedback(id: string) {
    const { error: updateError } = await supabase
      .from("website_feedback")
      .update({ status: "resolved" })
      .eq("id", id);
    if (updateError) toast.error(updateError.message);
    else toast.success("تم إغلاق البلاغ");
    refresh();
  }

  async function viewReceipt(path: string) {
    const { data: signed, error: signedError } = await supabase.storage
      .from("receipts")
      .createSignedUrl(path, 300);
    if (signedError) {
      toast.error(signedError.message);
      return;
    }
    window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
  }

  const approvedTransactions =
    data?.transactions.filter((transaction) => transaction.status === "approved") ?? [];
  const accountLabel = (id: string | null) => {
    if (!id) return "زائر";
    const account = data?.users.find((item) => item.id === id);
    return account?.full_name_ar || account?.full_name_en || account?.email || id.slice(0, 8);
  };

  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-10">
      <h1 className="font-display text-3xl text-gradient">ADMIN · لوحة الإدارة</h1>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {dataLoading && <p className="text-sm text-muted-foreground">جارٍ تحميل البيانات…</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="المستخدمين" value={data?.users.length ?? 0} />
        <Stat
          label="طلبات قيد المراجعة"
          value={data?.transactions.filter((item) => item.status === "pending").length ?? 0}
        />
        <Stat
          label="إيرادات مقبولة (ج.م)"
          value={formatPrice(approvedTransactions.reduce((sum, item) => sum + item.amount, 0))}
        />
      </div>

      <section className="glass overflow-x-auto p-6">
        <h2 className="mb-4 font-bold">طلبات الشحن</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          لا تعتمد الطلب لمجرد وجود صورة إيصال. تحقّق من وصول المبلغ في حساب الدفع قبل الموافقة؛
          الموافقة تضيف الرصيد فوراً.
        </p>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="text-start">
              <th className="p-2 text-start">المستخدم</th>
              <th className="p-2 text-start">المبلغ</th>
              <th className="p-2 text-start">النقاط</th>
              <th className="p-2 text-start">الطريقة</th>
              <th className="p-2 text-start">رقم المرسل</th>
              <th className="p-2 text-start">الحالة</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {data?.transactions.map((transaction) => (
              <tr key={transaction.id} className="border-t border-border">
                <td className="p-2">{email(transaction.user_id)}</td>
                <td className="p-2">{formatPrice(transaction.amount)} ج.م</td>
                <td className="p-2">{transaction.credits_added}</td>
                <td className="p-2">
                  {data.methods.find((method) => method.id === transaction.payment_method_id)
                    ?.name ?? "—"}
                </td>
                <td className="p-2" dir="ltr">
                  {transaction.sender_number ?? "—"}
                </td>
                <td className="p-2">{STATUS[transaction.status] ?? transaction.status}</td>
                <td className="flex gap-1 p-2">
                  {transaction.receipt_url && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="receipt"
                      onClick={() => void viewReceipt(transaction.receipt_url!)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  {transaction.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => void decide(transaction.id, true)}>
                        <Check className="h-4 w-4" />
                        قبول
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void decide(transaction.id, false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="glass overflow-x-auto p-6">
        <h2 className="mb-4 font-bold">بلاغات واقتراحات الموقع</h2>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-2 text-start">الوقت</th>
              <th className="p-2 text-start">المستخدم</th>
              <th className="p-2 text-start">النوع</th>
              <th className="p-2 text-start">التفاصيل</th>
              <th className="p-2 text-start">الحالة</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {data?.feedback.map((item) => (
              <tr key={item.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap p-2">
                  {new Date(item.created_at).toLocaleString("ar-EG")}
                </td>
                <td className="p-2">{email(item.user_id)}</td>
                <td className="p-2">
                  {item.category === "bug"
                    ? "مشكلة تقنية"
                    : item.category === "suggestion"
                      ? "اقتراح"
                      : "أخرى"}
                </td>
                <td className="max-w-xl whitespace-pre-wrap break-words p-2">{item.message}</td>
                <td className="p-2">{item.status === "resolved" ? "تم الحل" : "مفتوح"}</td>
                <td className="p-2">
                  {item.status === "open" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void resolveFeedback(item.id)}
                    >
                      إغلاق البلاغ
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {data?.feedback.length === 0 && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={6}>
                  لا توجد بلاغات بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="glass overflow-x-auto p-6">
        <h2 className="mb-4 font-bold">أرصدة المستخدمين</h2>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-2 text-start">البريد</th>
              <th className="p-2 text-start">اسم المستخدم</th>
              <th className="p-2 text-start">الباقة</th>
              <th className="p-2 text-start">الرصيد</th>
              <th className="p-2 text-start">إجمالي المستهلك</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((account) => (
              <tr key={account.id} className="border-t border-border">
                <td className="p-2">{account.email}</td>
                <td className="p-2">{account.full_name_ar || account.full_name_en || "—"}</td>
                <td className="p-2 text-gold">{tierLabel(account.plan_name)}</td>
                <td className="p-2">{account.balance} نقطة</td>
                <td className="p-2">{account.total_spent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="glass overflow-x-auto p-6">
        <h2 className="mb-2 font-bold">سجل نشاط التطبيق</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          آخر 100 حدث: التفاعلات، وطلبات الدفع واعتمادها، وتغييرات الأرصدة المسجلة من قاعدة
          البيانات.
        </p>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-2 text-start">الوقت</th>
              <th className="p-2 text-start">الحدث</th>
              <th className="p-2 text-start">الحساب</th>
              <th className="p-2 text-start">المنفّذ</th>
              <th className="p-2 text-start">الصفحة</th>
              <th className="p-2 text-start">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {data?.activity.map((event) => (
              <tr key={event.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap p-2">
                  {new Date(event.created_at).toLocaleString("ar-EG")}
                </td>
                <td className="p-2">
                  <span className="font-semibold">{event.event_name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {event.event_type}
                  </span>
                </td>
                <td className="p-2">{event.user_id ? accountLabel(event.user_id) : "زائر"}</td>
                <td className="p-2">
                  {event.actor_id
                    ? accountLabel(event.actor_id)
                    : event.user_id
                      ? "قاعدة البيانات"
                      : "زائر"}
                </td>
                <td className="max-w-48 break-all p-2" dir="ltr">
                  {event.route ?? event.target ?? "—"}
                </td>
                <td className="max-w-72 break-all p-2 font-mono text-xs">
                  {JSON.stringify(event.details)}
                </td>
              </tr>
            ))}
            {data?.activity.length === 0 && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={6}>
                  لا توجد أحداث مسجلة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass hud-corners p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl text-gradient">{value}</div>
    </div>
  );
}
