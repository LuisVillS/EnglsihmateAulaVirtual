import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";
import { ensureReservationStatus, getPreEnrollment } from "@/lib/pre-enrollment";

const FALLBACK_REGULAR_LINK = "https://mpago.la/2dTDU2C";
const FALLBACK_PREMIUM_LINK = "https://mpago.la/1zXnakz";

export async function POST(request) {
  try {
    const userId = await resolvePreEnrollmentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const preEnrollment = await ensureReservationStatus(await getPreEnrollment(userId));
    if (!preEnrollment) {
      return NextResponse.json({ error: "Proceso no iniciado." }, { status: 400 });
    }

    const selectedType = preEnrollment.selected_course_type === "PREMIUM" ? "PREMIUM" : "REGULAR";
    const checkoutUrl =
      selectedType === "PREMIUM"
        ? process.env.MERCADOPAGO_PREMIUM_LINK || FALLBACK_PREMIUM_LINK
        : process.env.MERCADOPAGO_REGULAR_LINK || FALLBACK_REGULAR_LINK;

    const service = getServiceSupabaseClient();
    const previousMeta =
      preEnrollment?.payment_proof_meta && typeof preEnrollment.payment_proof_meta === "object"
        ? preEnrollment.payment_proof_meta
        : {};
    const amount = selectedType === "PREMIUM" ? 139 : 99;

    const { data: updated } = await service
      .from("pre_enrollments")
      .update({
        payment_method: "MERCADOPAGO",
        mp_status: "LINK_SHARED",
        price_total: amount,
        payment_proof_meta: {
          ...previousMeta,
          method: "MERCADOPAGO",
          checkout_url: checkoutUrl,
          selected_type: selectedType,
        },
        status: preEnrollment.status === "RESERVED" ? "RESERVED" : "IN_PROGRESS",
        step: "PAYMENT",
        updated_at: new Date().toISOString(),
      })
      .eq("id", preEnrollment.id)
      .select("*")
      .maybeSingle();

    return NextResponse.json({
      checkoutUrl,
      amount,
      courseType: selectedType,
      preEnrollment: updated || preEnrollment,
    });
  } catch (error) {
    console.error("[Matricula] mercadopago create error", error);
    return NextResponse.json({ error: error.message || "No se pudo iniciar el pago." }, { status: 400 });
  }
}
