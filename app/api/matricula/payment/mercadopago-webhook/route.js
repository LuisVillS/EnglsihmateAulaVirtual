import { NextResponse } from "next/server.js";
import { requirePrivateServerEnv } from "../../../../../lib/security/env.js";
import { resolveWebhookService } from "../../../../../lib/webhooks/service.js";
import { verifyLegacyWebhookSecret, verifyMercadoPagoWebhookSignature } from "../../../../../lib/webhooks/security.js";

function buildMercadoPagoDataId(payload, searchParams) {
  return (
    searchParams.get("data.id") ||
    searchParams.get("data_id") ||
    payload?.data?.id ||
    payload?.payment_id ||
    payload?.pre_enrollment_id ||
    ""
  );
}

async function loadExistingPreEnrollment(service, preEnrollmentId) {
  if (!preEnrollmentId) return null;

  const { data, error } = await service
    .from("pre_enrollments")
    .select("id, mp_payment_id, mp_status, status, payment_submitted_at")
    .eq("id", preEnrollmentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo validar la pre-matricula.");
  }

  return data || null;
}

export async function handleMercadoPagoWebhook(request, { service = null, env = process.env } = {}) {
  try {
    const secret = requirePrivateServerEnv("MERCADOPAGO_WEBHOOK_SECRET", {
      env,
      label: "MERCADOPAGO_WEBHOOK_SECRET",
    });

    const rawBody = await request.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const { searchParams } = new URL(request.url);
    const signatureHeader = request.headers.get("x-signature") || "";
    const requestId = request.headers.get("x-request-id") || request.headers.get("request-id") || "";
    const dataId = buildMercadoPagoDataId(payload, searchParams);

    if (signatureHeader) {
      const signatureCheck = verifyMercadoPagoWebhookSignature({
        signatureHeader,
        requestId,
        dataId,
        secret,
      });
      if (!signatureCheck.valid) {
        return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
      }
    } else {
      const legacyCheck = verifyLegacyWebhookSecret({
        request,
        expectedSecret: secret,
        headerNames: ["x-mp-signature", "x-webhook-token"],
      });
      if (!legacyCheck.valid) {
        return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
      }
    }

    const preEnrollmentId = payload?.pre_enrollment_id;
    const paymentId = payload?.data?.id || payload?.payment_id || null;
    const status = payload?.status || payload?.data?.status || "unknown";

    if (!preEnrollmentId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "missing-pre-enrollment" });
    }

    const db = await resolveWebhookService(service);
    const existing = await loadExistingPreEnrollment(db, preEnrollmentId);
    if (
      existing &&
      String(existing.mp_payment_id || "") === String(paymentId || "") &&
      String(existing.mp_status || "") === String(status || "") &&
      (status !== "approved" || existing.status === "PAID_AUTO")
    ) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    await db
      .from("pre_enrollments")
      .update({
        mp_payment_id: paymentId,
        mp_status: status,
        status: status === "approved" ? "PAID_AUTO" : "PAYMENT_SUBMITTED",
        payment_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", preEnrollmentId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Webhook payload invalido." }, { status: 400 });
    }

    console.error("[Matricula] webhook error", error);
    const message = error?.message || "Webhook error";
    const status = message.includes("no esta configurada") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request) {
  return handleMercadoPagoWebhook(request);
}
