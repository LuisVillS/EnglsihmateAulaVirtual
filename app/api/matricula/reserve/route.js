import { NextResponse } from "next/server";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";
import { ensureReservationStatus, getPreEnrollment, reservePreEnrollment } from "@/lib/pre-enrollment";

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

    if (["PAYMENT_SUBMITTED", "PAID_AUTO"].includes(preEnrollment.status)) {
      return NextResponse.json(
        { error: "Tu matricula ya fue enviada y esta en revision." },
        { status: 409 }
      );
    }

    if (!preEnrollment.selected_schedule_id) {
      return NextResponse.json({ error: "Debes seleccionar un horario." }, { status: 400 });
    }

    if (preEnrollment.status === "RESERVED" && preEnrollment.reservation_expires_at) {
      return NextResponse.json({ preEnrollment });
    }

    const updated = await reservePreEnrollment(preEnrollment.id);
    return NextResponse.json({ preEnrollment: updated });
  } catch (error) {
    console.error("[Matricula] reserve error", error);
    return NextResponse.json({ error: error.message || "No se pudo reservar." }, { status: 400 });
  }
}
