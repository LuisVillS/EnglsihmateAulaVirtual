import { NextResponse } from "next/server";
import {
  buildExpiredReservationResetPayload,
  ensureReservationStatus,
  getPreEnrollment,
  updatePreEnrollmentSelection,
} from "@/lib/pre-enrollment";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";

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

    const updated = await updatePreEnrollmentSelection({
      preEnrollmentId: preEnrollment.id,
      payload: buildExpiredReservationResetPayload(),
    });

    return NextResponse.json({ preEnrollment: updated });
  } catch (error) {
    console.error("[Matricula] reset expired error", error);
    return NextResponse.json({ error: error.message || "No se pudo reiniciar la matricula." }, { status: 400 });
  }
}
