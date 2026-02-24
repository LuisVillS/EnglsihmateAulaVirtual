import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-service";

function isSignatureValid(request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;
  const signature = request.headers.get("x-mp-signature") || "";
  const token = request.headers.get("x-webhook-token") || "";
  return signature === secret || token === secret;
}

export async function POST(request) {
  try {
    if (!isSignatureValid(request)) {
      return NextResponse.json({ error: "Firma invalida." }, { status: 401 });
    }

    const payload = await request.json();
    const preEnrollmentId = payload?.pre_enrollment_id;
    const paymentId = payload?.data?.id || payload?.payment_id || null;
    const status = payload?.status || payload?.data?.status || "unknown";

    if (!preEnrollmentId) {
      return NextResponse.json({ ok: true });
    }

    const service = getServiceSupabaseClient();
    await service
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
    console.error("[Matricula] webhook error", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}
