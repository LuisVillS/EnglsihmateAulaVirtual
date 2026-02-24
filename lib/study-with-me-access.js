import { getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { resolveProfileRole } from "@/lib/roles";

export const STUDY_WITH_ME_WEEKLY_LIMIT = 1;
export const STUDY_WITH_ME_SESSION_MINUTES = 30;

const LIMA_TIME_ZONE = "America/Lima";

function getLimaDateParts(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return { year, month, day };
}

function formatDateKey({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateKeyToUtcDate(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0));
}

function shiftDateKeyByDays(dateKey, days) {
  const base = dateKeyToUtcDate(dateKey);
  if (!base) return null;
  const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return formatDateKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function getLimaWeekStartKey(dateValue = new Date()) {
  const parts = getLimaDateParts(dateValue);
  if (!parts) return null;
  const middayUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
  const weekday = middayUtc.getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const monday = new Date(middayUtc.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
  return formatDateKey({
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth() + 1,
    day: monday.getUTCDate(),
  });
}

export async function getStudyWithMeAccess({ supabase, userId, now = new Date() } = {}) {
  if (!supabase || !userId) {
    return {
      canAccessPage: false,
      canBookThisWeek: false,
      reason: "missing-context",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, role, status, is_premium, commission_id, commission:course_commissions (id, start_date, end_date, status, is_active)"
    )
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile?.id) {
    if (profileError) {
      console.error("No se pudo cargar perfil para Study With Me", profileError);
    }
    return {
      canAccessPage: false,
      canBookThisWeek: false,
      reason: "profile-not-found",
    };
  }

  const effectiveRole = resolveProfileRole({ role: profile.role, status: profile.status });
  if (effectiveRole !== "student") {
    return {
      canAccessPage: false,
      canBookThisWeek: false,
      reason: "non-student",
      profile,
    };
  }

  if (!profile.is_premium) {
    return {
      canAccessPage: false,
      canBookThisWeek: false,
      reason: "not-premium",
      profile,
    };
  }

  const commission = profile?.commission || null;
  if (!commission?.id) {
    return {
      canAccessPage: false,
      canBookThisWeek: false,
      reason: "no-commission",
      profile,
      commission,
    };
  }

  const todayIso = getLimaTodayISO();
  const commissionStatus = resolveCommissionStatus(commission, todayIso);
  if (commissionStatus !== "active") {
    return {
      canAccessPage: false,
      canBookThisWeek: false,
      reason: "inactive-commission",
      profile,
      commission,
    };
  }

  const weekStartKey = getLimaWeekStartKey(now);
  return {
    canAccessPage: true,
    canBookThisWeek: true,
    reason: "allowed",
    profile,
    commission,
    thisWeekBookings: null,
    weeklyLimit: STUDY_WITH_ME_WEEKLY_LIMIT,
    weekStartKey,
    weekEndKey: weekStartKey ? shiftDateKeyByDays(weekStartKey, 6) : null,
    nextWeekStartKey: weekStartKey ? shiftDateKeyByDays(weekStartKey, 7) : null,
    degraded: false,
    manualWeeklyControl: true,
  };
}
