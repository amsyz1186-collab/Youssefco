import { createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const KLING_API_BASE = "https://api-singapore.klingai.com";

type JsonObject = { [key: string]: Json | undefined };
type KlingEnvelope = {
  code?: number;
  message?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    task_status_msg?: string;
    task_result?: { videos?: { url?: string }[] };
  };
};

function isJsonObject(value: Json | null): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createKlingToken(accessKey: string, secretKey: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    iss: accessKey,
    exp: now + 30 * 60,
    nbf: now - 5,
  })}`;
  const signature = createHmac("sha256", secretKey).update(body).digest("base64url");
  return `${body}.${signature}`;
}

async function klingRequest(path: string, init?: RequestInit): Promise<KlingEnvelope> {
  const accessKey = process.env["KLING_ACCESS_KEY"];
  const secretKey = process.env["KLING_SECRET_KEY"];
  if (!accessKey || !secretKey) {
    throw new Error(
      "توليد Kling غير مهيأ. أضف KLING_ACCESS_KEY وKLING_SECRET_KEY كأسرار خادمية في Vercel.",
    );
  }

  const response = await fetch(`${KLING_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${createKlingToken(accessKey, secretKey)}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(25_000),
  });
  let payload: KlingEnvelope;
  try {
    payload = (await response.json()) as KlingEnvelope;
  } catch (error) {
    throw new Error("أعاد مزود Kling استجابة غير صالحة.", { cause: error });
  }
  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    console.error("[Kling] Provider request failed", {
      status: response.status,
      code: payload.code,
    });
    throw new Error("تعذر قبول الطلب من Kling. قد استُهلكت محاولة Tier 3 عند قبول الخادم للطلب.");
  }
  return payload;
}

export const getKlingVideoQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: Record<string, never>) => input)
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_kling_video_quota");
    if (error) throw new Error(`تعذر تحميل حصة Kling: ${error.message}`);
    if (!isJsonObject(data)) throw new Error("أعادت قاعدة البيانات بيانات حصة غير صالحة.");
    const limit = data["limit"];
    const used = data["used"];
    const remaining = data["remaining"];
    const resetsAt = data["resetsAt"];
    const tier = data["tier"];
    const enabled = data["enabled"];
    if (
      typeof limit !== "number" ||
      typeof used !== "number" ||
      typeof remaining !== "number" ||
      typeof tier !== "string" ||
      typeof enabled !== "boolean" ||
      (typeof resetsAt !== "string" && resetsAt !== null)
    ) {
      throw new Error("بيانات حصة Kling غير مكتملة.");
    }
    return {
      tier,
      enabled,
      limit,
      used,
      remaining,
      resetsAt,
      configured: Boolean(process.env["KLING_ACCESS_KEY"] && process.env["KLING_SECRET_KEY"]),
    };
  });

export const startKlingVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { prompt: string; ratio: string; idempotencyKey: string }) => {
    if (
      !input ||
      typeof input.prompt !== "string" ||
      input.prompt.trim().length < 3 ||
      input.prompt.length > 2000 ||
      !["16:9", "9:16", "1:1"].includes(input.ratio) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.idempotencyKey,
      )
    ) {
      throw new Error("وصف أو إعدادات فيديو Kling غير صالحة.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const accessKey = process.env["KLING_ACCESS_KEY"];
    const secretKey = process.env["KLING_SECRET_KEY"];
    if (!accessKey || !secretKey) {
      throw new Error(
        "خيار Kling غير متاح حالياً. يجب على الإدارة ضبط مفاتيح Kling الخادمية أولاً.",
      );
    }

    const { data: reservation, error: reserveError } = await context.supabase.rpc(
      "reserve_kling_video_request",
      { _idempotency_key: data.idempotencyKey },
    );
    if (reserveError) throw new Error(`تعذر حجز حصة Kling: ${reserveError.message}`);
    if (!isJsonObject(reservation)) throw new Error("تعذر التحقق من حصة Kling.");

    if (reservation["allowed"] !== true) {
      return {
        blocked: true as const,
        reason:
          reservation["reason"] === "insufficient_credits"
            ? "credits"
            : reservation["reason"] === "paid_plan_required"
              ? "paid_required"
              : "quota",
        used: typeof reservation["used"] === "number" ? reservation["used"] : 0,
        limit: typeof reservation["limit"] === "number" ? reservation["limit"] : 0,
        resetsAt: typeof reservation["resetsAt"] === "string" ? reservation["resetsAt"] : null,
      };
    }

    const requestId = reservation["requestId"];
    const existingTaskId = reservation["providerTaskId"];
    if (typeof requestId !== "string") {
      throw new Error("أعادت قاعدة البيانات معرّف طلب Kling غير صالح.");
    }
    if (reservation["duplicate"] === true) {
      if (typeof existingTaskId === "string") {
        return { blocked: false as const, requestId, taskId: existingTaskId, duplicate: true };
      }
      throw new Error("طلب Kling السابق قيد التجهيز. لا تعِد الإرسال لتجنب استهلاك حصة إضافية.");
    }

    let taskId: string;
    try {
      const created = await klingRequest("/v1/videos/text2video", {
        method: "POST",
        body: JSON.stringify({
          model_name: "kling-v1-6",
          prompt: data.prompt.trim(),
          negative_prompt: "",
          cfg_scale: 0.5,
          mode: "std",
          aspect_ratio: data.ratio,
          duration: "5",
        }),
      });
      taskId = created.data?.task_id ?? "";
      if (!taskId) throw new Error("لم يُرجع Kling معرّف مهمة.");
    } catch (error) {
      console.error("[Kling] Could not create provider task", error);
      return {
        blocked: false as const,
        failed: true as const,
        requestId,
        message:
          error instanceof Error
            ? error.message
            : "تعذر بدء توليد فيديو Kling. استُهلكت المحاولة المقبولة.",
      };
    }

    const { error: attachError } = await context.supabase.rpc("attach_kling_video_task", {
      _request_id: requestId,
      _provider_task_id: taskId,
    });
    if (attachError) {
      console.error("[Kling] Could not attach provider task to reserved quota", attachError);
      throw new Error("بدأت مهمة Kling لكن تعذر حفظ رقمها. لا تعِد الطلب؛ تواصل مع الدعم.");
    }
    return { blocked: false as const, requestId, taskId, duplicate: false };
  });

export const pollKlingVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { requestId: string }) => {
    if (!input || !/^[0-9a-f-]{36}$/i.test(input.requestId)) {
      throw new Error("معرّف مهمة Kling غير صالح.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: taskId, error: taskError } = await context.supabase.rpc("get_kling_video_task", {
      _request_id: data.requestId,
    });
    if (taskError || !taskId) {
      throw new Error(
        `تعذر العثور على مهمة Kling الخاصة بهذا الحساب${taskError ? `: ${taskError.message}` : "."}`,
      );
    }

    const result = await klingRequest(`/v1/videos/text2video/${encodeURIComponent(taskId)}`, {
      method: "GET",
    });
    const status = result.data?.task_status;
    if (status === "succeed") {
      const videoUrl = result.data?.task_result?.videos?.[0]?.url;
      if (!videoUrl || !videoUrl.startsWith("https://")) {
        throw new Error("اكتمل Kling لكن رابط الفيديو الناتج غير صالح.");
      }
      return { status: "succeed" as const, videoUrl };
    }
    if (status === "failed") {
      console.error("[Kling] Generation task failed", {
        taskId,
        reason: result.data?.task_status_msg,
      });
      return { status: "failed" as const };
    }
    return { status: "processing" as const };
  });
