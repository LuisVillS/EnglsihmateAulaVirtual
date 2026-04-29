import { NextResponse } from "next/server";
import { UNIFIED_COURSE_PRICE, normalizeUnifiedCourseType } from "@/lib/course-config";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";
import { ensureReservationStatus, getPreEnrollment } from "@/lib/pre-enrollment";

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

    const selectedType = normalizeUnifiedCourseType(preEnrollment.selected_course_type);
    const checkoutUrl =
      process.env.MERCADOPAGO_COURSE_LINK ||
      process.env.MERCADOPAGO_PREMIUM_LINK ||
      process.env.MERCADOPAGO_REGULAR_LINK ||
      "";
    if (!checkoutUrl) {
      return NextResponse.json(
        { error: "Configura MERCADOPAGO_COURSE_LINK con el enlace de cobro del curso a S/ 179." },
        { status: 500 }
      );
    }

    const service = getServiceSupabaseClient();
    const previousMeta =
      preEnrollment?.payment_proof_meta && typeof preEnrollment.payment_proof_meta === "object"
        ? preEnrollment.payment_proof_meta
        : {};
    const amount = UNIFIED_COURSE_PRICE;

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
