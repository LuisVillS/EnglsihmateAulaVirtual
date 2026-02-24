import { getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { resolveCourseRenewalContext } from "@/lib/payments";

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

export function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

export function getSessionBillingMonthKey(session) {
  return normalizeMonthKey(session?.cycle_month) || normalizeMonthKey(session?.session_date) || null;
}

export async function getApprovedBillingMonths(supabase, studentId) {
  const { data, error } = await supabase
    .from("payments")
    .select("billing_month")
    .eq("student_id", studentId)
    .eq("status", "approved");

  if (error) {
    const missingTable = getMissingTableName(error);
    if (!missingTable?.endsWith("payments")) {
      console.error("No se pudieron cargar meses aprobados", error);
    }
    return [];
  }

  return (data || [])
    .map((row) => normalizeMonthKey(row?.billing_month))
    .filter(Boolean);
}

export async function getStudentCalendarAccess({ supabase, userId, upcomingOnly = false } = {}) {
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, role, commission_id, commission:course_commissions (id, course_level, commission_number, start_date, end_date, start_time, end_time, status, is_active)"
    )
    .eq("id", userId)
    .maybeSingle();

  if (profile?.role !== "student" || !profile?.commission?.id) {
    return { ok: false, reason: "no-active-commission" };
  }

  const commission = profile.commission;
  const todayIso = getLimaTodayISO();
  const commissionStatus = resolveCommissionStatus(commission, todayIso);
  if (commissionStatus !== "active") {
    return { ok: false, reason: "inactive-commission" };
  }

  const { data: sessions } = await supabase
    .from("course_sessions")
    .select("id, cycle_month, session_date, starts_at, ends_at, day_label, live_link, recording_link, status")
    .eq("commission_id", commission.id)
    .order("session_date", { ascending: true });

  const approvedBillingMonths = await getApprovedBillingMonths(supabase, userId);
  const allowedMonths = new Set(approvedBillingMonths);
  if (!allowedMonths.size) {
    const renewalContext = resolveCourseRenewalContext({
      now: new Date(),
      courseStartDate: commission.start_date,
      courseEndDate: commission.end_date,
      sessions: sessions || [],
    });
    const fallbackKey = normalizeMonthKey(renewalContext?.currentBillingMonthKey);
    if (fallbackKey) allowedMonths.add(fallbackKey);
  }

  const filteredSessions = (sessions || []).filter((session) => {
    if (upcomingOnly && (session?.session_date || "").slice(0, 10) < todayIso) return false;
    if (!allowedMonths.size) return true;
    const billingKey = getSessionBillingMonthKey(session);
    if (!billingKey) return true;
    return allowedMonths.has(billingKey);
  });

  return {
    ok: true,
    commission,
    sessions: sessions || [],
    allowedMonths: Array.from(allowedMonths),
    unlockedSessions: filteredSessions,
    todayIso,
  };
}
