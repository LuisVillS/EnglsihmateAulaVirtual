import { NextResponse } from "next/server";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";
import { ensureReservationStatus, getPreEnrollment } from "@/lib/pre-enrollment";
import { buildMatriculaSummary } from "@/lib/matricula-summary";

export async function GET(request) {
  try {
    const userId = await resolvePreEnrollmentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const preEnrollment = await ensureReservationStatus(await getPreEnrollment(userId));
    if (!preEnrollment) {
      return NextResponse.json({ error: "Proceso no iniciado." }, { status: 400 });
    }

    const summary = await buildMatriculaSummary(preEnrollment);

    return NextResponse.json({ preEnrollment, summary });
  } catch (error) {
    console.error("[Matricula] summary error", error);
    return NextResponse.json({ error: error.message || "No se pudo obtener el resumen." }, { status: 400 });
  }
}
