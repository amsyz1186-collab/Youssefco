import { useState } from "react";
import { Check, Crown, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";
import { ADMIN_PHONE, formatPrice, PLANS } from "@/lib/plans";
type PaymentMethod = {
  account_holder: string | null;
  id: string;
  instructions: string | null;
  name: string;
  is_active: boolean;
  provider_number: string | null;
};

type PaymentProvider = "instapay" | "fawry" | "vodafone";
const isVodafone = (method: PaymentMethod) => /vodafone|فودافون/i.test(method.name);
const isInstaPay = (method: PaymentMethod) => /instapay|انستاباي|إنستاباي/i.test(method.name);

export function PaywallModal({
  open,
  onOpenChange,
  reason,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reason?: string;
}) {
  const { t, lang } = useLang();
  const ar = lang === "ar";
  const { user } = useAuth();
  const {
    data: paymentMethods = [],
    isLoading: methodsLoading,
    error: methodsError,
  } = useQuery({
    queryKey: ["payment-methods"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id,name,is_active,provider_number,account_holder,instructions")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const [plan, setPlan] = useState<(typeof PLANS)[number] | null>(null);
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [senderNumber, setSenderNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const method = paymentMethods.find(isVodafone) ?? null;
  const instapayMethod = paymentMethods.find(isInstaPay) ?? null;
  const selectedMethod =
    provider === "vodafone" ? method : provider === "instapay" ? instapayMethod : null;
  const recipientNumber =
    selectedMethod?.provider_number ?? (provider === "vodafone" ? ADMIN_PHONE : null);

  async function submit() {
    if (!user || !plan || !selectedMethod || (provider !== "instapay" && provider !== "vodafone"))
      return;
    if (!recipientNumber) {
      toast.error(
        ar
          ? "رقم الاستلام غير مهيأ لوسيلة الدفع المختارة."
          : "The recipient number is not configured for this payment method.",
      );
      return;
    }
    if (!file) {
      toast.error(ar ? "ارفع صورة إيصال التحويل" : "Upload the transfer receipt");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(ar ? "الحد الأقصى لحجم الإيصال 5 ميجابايت." : "Receipt must be 5 MB or smaller.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) {
      toast.error(ar ? "ارفع صورة أو ملف PDF صالحاً." : "Upload a valid image or PDF.");
      return;
    }
    setBusy(true);
    let uploadedReceiptPath: string | null = null;
    try {
      uploadedReceiptPath = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(uploadedReceiptPath, file);
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("transactions").insert({
        user_id: user.id,
        payment_method_id: selectedMethod.id,
        amount: plan.price,
        credits_added: plan.credits,
        sender_number: senderNumber.trim() || null,
        receipt_url: uploadedReceiptPath,
        status: "pending",
      });
      if (error) throw error;
      uploadedReceiptPath = null;
      toast.success(
        ar
          ? "استلمنا طلبك وهو قيد المراجعة اليدوية. سنراجع وصول التحويل خلال 24 ساعة؛ صورة الإيصال وحدها لا تؤكد وصول الأموال."
          : "Your request is pending manual review. We will verify the transfer within 24 hours; a receipt image alone does not confirm that funds arrived.",
      );
      onOpenChange(false);
      setPlan(null);
      setFile(null);
      setSenderNumber("");
      setProvider(null);
    } catch (e) {
      if (uploadedReceiptPath) {
        try {
          const { error: cleanupError } = await supabase.storage
            .from("receipts")
            .remove([uploadedReceiptPath]);
          if (cleanupError) {
            console.error("Failed to remove an uncommitted receipt upload", cleanupError);
          }
        } catch (cleanupError) {
          console.error("Failed to remove an uncommitted receipt upload", cleanupError);
        }
      }
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-3xl border-gold/30">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-gradient">
            {plan ? plan.ar : "اختر باقتك"}
          </DialogTitle>
          {reason && !plan && <p className="text-sm text-muted-foreground">{reason}</p>}
        </DialogHeader>

        {!plan ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPlan(p);
                  }}
                  className={`glass hud-corners p-5 text-start transition hover:-translate-y-1 hover:glow-violet ${p.id === "vip" ? "border-gold/60 glow-gold" : ""}`}
                >
                  {p.id === "vip" && <Crown className="mb-2 h-5 w-5 text-gold" />}
                  <div className="mt-1 text-lg font-bold">{p.ar}</div>
                  <div className="mt-4 font-display text-3xl text-gradient">
                    {formatPrice(p.price)}
                    <span className="ms-1 text-sm">ج.م</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-success" />
                    {p.credits} {t("credits")}
                  </div>
                  {p.perk && (
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success" />
                      أولوية فائقة السرعة
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={provider === "instapay" ? "default" : "outline"}
                disabled={
                  !instapayMethod ||
                  !instapayMethod.provider_number ||
                  methodsLoading ||
                  !!methodsError
                }
                onClick={() => setProvider("instapay")}
              >
                InstaPay
              </Button>
              <Button
                variant={provider === "fawry" ? "default" : "outline"}
                onClick={() => setProvider("fawry")}
              >
                {ar ? "فوري" : "Fawry"}
              </Button>
              <Button
                variant={provider === "vodafone" ? "default" : "outline"}
                disabled={!method || methodsLoading || !!methodsError}
                onClick={() => setProvider("vodafone")}
              >
                {ar ? "فودافون كاش" : "Vodafone Cash"}
              </Button>
            </div>
            {methodsLoading && <p className="text-sm text-muted-foreground">{t("running")}</p>}
            {methodsError && (
              <p className="text-sm text-destructive">
                {ar
                  ? `تعذر تحميل وسيلة فودافون كاش من Supabase: ${methodsError.message}`
                  : `Could not load Vodafone Cash from Supabase: ${methodsError.message}`}
              </p>
            )}
            {!methodsLoading && !methodsError && !method && (
              <p className="text-sm text-destructive">
                {ar
                  ? "فودافون كاش غير مهيأ كوسيلة نشطة في قاعدة البيانات."
                  : "Vodafone Cash is not configured as an active payment method in Supabase."}
              </p>
            )}
            {!methodsLoading && !methodsError && !instapayMethod && (
              <p className="text-sm text-muted-foreground">
                {ar
                  ? "إنستاباي غير مهيأ بعد. فعّل ترحيل Supabase الخاص بإنستاباي لإظهار وسيلة الدفع."
                  : "InstaPay is not configured yet. Apply the Supabase InstaPay migration to enable it."}
              </p>
            )}
            {provider === "instapay" && (
              <div className="glass p-4 text-sm leading-7">
                {ar
                  ? "إنستاباي غير مهيأ حالياً في قاعدة البيانات؛ لا تحوّل الأموال حتى يظهر رقم استلام صالح."
                  : "InstaPay is not configured in the database. Do not transfer funds until a valid recipient number is shown."}
              </div>
            )}
            {provider === "fawry" && (
              <div className="glass space-y-3 p-4 text-sm leading-7">
                <p>
                  {ar
                    ? "إنشاء كود فوري غير متاح مؤقتاً: لا يوجد تكامل رسمي لفوري مرتبط بالخادم حالياً. لن نعرض رقم مستلم أو كوداً وهمياً، ولن يُخصم أو يُضاف أي رصيد."
                    : "Fawry codes are temporarily unavailable because no official Fawry server integration is connected. No receiver number or fake code will be shown and no credits will be changed."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    toast.error(
                      ar
                        ? "لا يمكن إصدار كود حقيقي قبل ربط بوابة فوري الرسمية بالخادم."
                        : "A real Fawry code requires the official server-side gateway.",
                    )
                  }
                >
                  {ar ? "إنشاء كود فوري — غير متاح مؤقتاً" : "Generate Fawry code — unavailable"}
                </Button>
              </div>
            )}
            {(provider === "vodafone" || provider === "instapay") && selectedMethod && (
              <>
                <div className="glass p-4 text-sm leading-7">
                  <p>
                    {ar
                      ? `حوّل مبلغ ${formatPrice(plan.price)} ج.م إلى ${selectedMethod.name}، ثم ارفع الإيصال للمراجعة اليدوية:`
                      : `Transfer ${formatPrice(plan.price)} EGP using ${selectedMethod.name}, then upload the receipt for manual review:`}
                  </p>
                  {recipientNumber ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="font-display text-2xl tracking-widest text-gold" dir="ltr">
                        {recipientNumber}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={ar ? "نسخ رقم الاستلام" : "Copy recipient number"}
                        onClick={() => {
                          void navigator.clipboard.writeText(recipientNumber);
                          toast.success(ar ? "تم نسخ الرقم" : "Number copied");
                        }}
                      >
                        {ar ? "نسخ" : "Copy"}
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-2 text-destructive">
                      {ar
                        ? "رقم الاستلام غير متاح. تواصل مع الدعم قبل التحويل."
                        : "The recipient number is unavailable. Contact support before transferring."}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ar
                      ? "ستُضاف النقاط خلال 24 ساعة بعد التحقق الفعلي من التحويل."
                      : "Credits will be added within 24 hours after the transfer is verified."}
                  </p>
                </div>
                <Input
                  placeholder={ar ? "رقم الهاتف الذي أرسل التحويل منه" : "Sender phone number"}
                  value={senderNumber}
                  onChange={(e) => setSenderNumber(e.target.value)}
                  dir="ltr"
                />
                <label className="glass flex cursor-pointer items-center justify-center gap-2 border-dashed p-6 text-sm text-muted-foreground hover:text-foreground">
                  <Upload className="h-4 w-4" />
                  {file ? file.name : ar ? "ارفع صورة الإيصال" : "Upload receipt screenshot"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </>
            )}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setPlan(null);
                  setProvider(null);
                  setFile(null);
                  setSenderNumber("");
                }}
              >
                {ar ? "رجوع" : "Back"}
              </Button>
              {(provider === "vodafone" || provider === "instapay") && (
                <Button
                  className="flex-1 bg-gradient-brand text-primary-foreground"
                  disabled={
                    busy ||
                    !selectedMethod ||
                    !recipientNumber ||
                    !file ||
                    methodsLoading ||
                    !!methodsError
                  }
                  onClick={submit}
                >
                  {busy ? t("running") : ar ? "إرسال للتحقق اليدوي" : "Submit for manual review"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
