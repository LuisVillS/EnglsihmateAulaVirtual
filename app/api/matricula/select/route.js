import { NextResponse } from "next/server";
import {
  ensureReservationStatus,
  getPreEnrollment,
  normalizePreEnrollmentInput,
  resolveCommissionForPreEnrollment,
  updatePreEnrollmentSelection,
} from "@/lib/pre-enrollment";
import { UNIFIED_COURSE_PRICE } from "@/lib/course-config";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";

export async function POST(request) {
  try {
    const userId = await resolvePreEnrollmentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const body = await request.json();
    const {
      level,
      frequency,
      courseId,
      startTime,
      modality,
      courseType,
      startMonth,
      priceTotal,
      startReservation = false,
    } = body || {};

    let preEnrollment = await ensureReservationStatus(await getPreEnrollment(userId));
    if (!preEnrollment) {
      return NextResponse.json({ error: "Proceso no iniciado." }, { status: 400 });
    }

    if (["PAYMENT_SUBMITTED", "PAID_AUTO"].includes(preEnrollment.status)) {
      return NextResponse.json(
        { error: "Tu matricula ya fue enviada y esta en revision." },
        { status: 409 }
      );
    }

    let selectedCommissionId = preEnrollment.selected_schedule_id;
    if (level && frequency && startTime) {
      if (!startMonth) {
        return NextResponse.json(
          { error: "Selecciona el mes de inicio para continuar." },
          { status: 400 }
        );
      }
      const selectedCommission = await resolveCommissionForPreEnrollment({
        level,
        frequency,
        startTime,
        startMonth,
      });
      if (!selectedCommission?.id) {
        return NextResponse.json(
          {
            error:
              "No hay comisiones disponibles para ese horario. Elige otro horario o contacta soporte.",
          },
          { status: 409 }
        );
      }
      selectedCommissionId = selectedCommission.id;
    }

    const payload = normalizePreEnrollmentInput({
      level,
      frequency,
      courseId,
      scheduleId: selectedCommissionId,
      modality,
      startTime,
      courseType,
      startMonth,
    });
    payload.step = selectedCommissionId ? "TERMS" : "COURSE_SELECTION";
    payload.status = "IN_PROGRESS";
    payload.price_total = UNIFIED_COURSE_PRICE;

    if (startReservation && selectedCommissionId) {
      payload.status = "RESERVED";
      payload.reservation_expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    }

    preEnrollment = await updatePreEnrollmentSelection({
      preEnrollmentId: preEnrollment.id,
      payload,
    });

    return NextResponse.json({ preEnrollment });
  } catch (error) {
    console.error("[Matricula] select error", error);
    return NextResponse.json({ error: error.message || "No se pudo guardar la seleccion." }, { status: 400 });
  }
}
