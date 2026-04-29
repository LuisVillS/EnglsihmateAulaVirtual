import { getServiceSupabaseClient } from "@/lib/supabase-service";
import { formatEnrollmentFrequencyLabel } from "@/lib/frequency-labels";
import { formatUnifiedCourseType, resolveUnifiedCoursePrice } from "@/lib/course-config";

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

export async function buildMatriculaSummary(preEnrollment, service = getServiceSupabaseClient()) {
  if (!preEnrollment) return null;

  let schedule = null;
  if (preEnrollment.selected_schedule_id) {
    const { data } = await service
      .from("course_commissions")
      .select("start_date, end_date, start_time, end_time, days_of_week, modality_key, commission_number")
      .eq("id", preEnrollment.selected_schedule_id)
      .maybeSingle();
    schedule = data || null;
  }

  return {
    level: preEnrollment.selected_level,
    frequency: formatEnrollmentFrequencyLabel(
      preEnrollment.selected_frequency || preEnrollment.modality || schedule?.modality_key || null
    ),
    start_month: preEnrollment.start_month,
    course_type: formatUnifiedCourseType(preEnrollment.selected_course_type),
    modality: preEnrollment.modality || schedule?.modality_key || null,
    price_total: resolveUnifiedCoursePrice(preEnrollment.price_total),
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
}
