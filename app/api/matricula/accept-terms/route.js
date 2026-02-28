import { NextResponse } from "next/server";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";
import { ensureReservationStatus, getPreEnrollment, updatePreEnrollmentSelection } from "@/lib/pre-enrollment";
import { buildMatriculaSummary } from "@/lib/matricula-summary";

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

    const updated = await updatePreEnrollmentSelection({
      preEnrollmentId: preEnrollment.id,
      payload: {
        terms_accepted_at: new Date().toISOString(),
        step: "PRECONFIRMATION",
        status: preEnrollment.status === "RESERVED" ? "RESERVED" : "IN_PROGRESS",
      },
    });

    const summary = await buildMatriculaSummary(updated);

    return NextResponse.json({ preEnrollment: updated, summary });
  } catch (error) {
    console.error("[Matricula] terms error", error);
    return NextResponse.json({ error: error.message || "No se pudo aceptar terminos." }, { status: 400 });
  }
}
