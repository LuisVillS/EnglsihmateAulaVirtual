import { NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { resolvePreEnrollmentUserId } from "@/lib/pre-enrollment-session";
import { ensureReservationStatus, getPreEnrollment } from "@/lib/pre-enrollment";

function formatDays(days) {
  if (!Array.isArray(days)) return "";
  const map = {
    1: "Lunes",
    2: "Martes",
    3: "Miercoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sabado",
    7: "Domingo",
  };
  return days.map((day) => map[day] || day).join(", ");
}

export async function GET(request) {
  try {
    const userId = await resolvePreEnrollmentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sesion invalida." }, { status: 401 });
    }

    const service = getServiceSupabaseClient();
    const preEnrollment = await ensureReservationStatus(await getPreEnrollment(userId));
    if (!preEnrollment) {
      return NextResponse.json({ error: "Proceso no iniciado." }, { status: 400 });
    }

    let schedule = null;
    if (preEnrollment.selected_schedule_id) {
      const { data } = await service
        .from("course_commissions")
        .select("start_date, end_date, start_time, end_time, days_of_week, modality_key, commission_number")
        .eq("id", preEnrollment.selected_schedule_id)
        .maybeSingle();
      schedule = data || null;
    }

    const summary = {
      level: preEnrollment.selected_level,
      frequency: preEnrollment.selected_frequency,
      start_month: preEnrollment.start_month,
      course_type: preEnrollment.selected_course_type,
      modality: preEnrollment.modality || schedule?.modality_key || null,
      price_total: preEnrollment.price_total,
      reservation_expires_at: preEnrollment.reservation_expires_at,
      schedule: schedule
        ? {
            commission_number: schedule.commission_number,
            start_date: schedule.start_date,
            end_date: schedule.end_date,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            days_of_week: formatDays(schedule.days_of_week),
          }
        : null,
    };

    return NextResponse.json({ preEnrollment, summary });
  } catch (error) {
    console.error("[Matricula] summary error", error);
    return NextResponse.json({ error: error.message || "No se pudo obtener el resumen." }, { status: 400 });
  }
}
