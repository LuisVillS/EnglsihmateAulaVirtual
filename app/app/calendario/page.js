import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { resolveCourseRenewalContext } from "@/lib/payments";
import { hasServiceRoleClient, getServiceSupabaseClient } from "@/lib/supabase-service";
import { hasGoogleCalendarOAuthConfig } from "@/lib/google-calendar-oauth";
import { extractLessonIdFromQuizUrl } from "@/lib/lesson-quiz-assignments";
import CalendarPage from "./calendar-page";

export const metadata = {
  title: "Calendario academico | Aula Virtual",
};

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function parseMonthParam(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month, monthParam: `${match[1]}-${match[2]}` };
}

function buildMonthRange({ year, month }) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

function getSessionBillingMonthKey(session) {
  return normalizeMonthKey(session?.cycle_month) || normalizeMonthKey(session?.session_date) || null;
}

async function getApprovedBillingMonths(supabase, studentId) {
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

async function fetchSessionsByMonth({ supabase, commissionId, startIso, endIso }) {
  const sessionColumns = [
    "id",
    "cycle_month",
    "session_in_cycle",
    "session_date",
    "starts_at",
    "ends_at",
    "day_label",
    "live_link",
    "recording_link",
    "status",
  ];

  let selectedColumns = [...sessionColumns];
  let sessionsResult = null;

  for (let attempt = 0; attempt < sessionColumns.length; attempt += 1) {
    const result = await supabase
      .from("course_sessions")
      .select(selectedColumns.join(","))
      .eq("commission_id", commissionId)
      .gte("session_date", startIso)
      .lte("session_date", endIso)
      .order("session_date", { ascending: true });

    sessionsResult = result;
    if (!result.error) break;

    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !selectedColumns.includes(missingColumn)) break;
    selectedColumns = selectedColumns.filter((column) => column !== missingColumn);
  }

  const sessionsError = sessionsResult?.error || null;
  if (!sessionsError) return sessionsResult?.data || [];

  const missingTable = getMissingTableName(sessionsError);
  if (missingTable?.endsWith("course_sessions")) {
    return [];
  }

  console.error("No se pudieron cargar sesiones", sessionsError);
  return [];
}

function hasAssessmentItem(item) {
  const type = String(item?.type || "").trim().toLowerCase();
  if (type === "exercise") return true;
  if (String(item?.exercise_id || "").trim()) return true;
  return Boolean(extractLessonIdFromQuizUrl(item?.url));
}

async function loadUpcomingAssessment(supabase, commissionId, todayIso, allowedMonths = new Set()) {
  const { data: futureSessions, error: futureSessionsError } = await supabase
    .from("course_sessions")
    .select("id, cycle_month, session_in_cycle, session_date, starts_at, ends_at, day_label, live_link, recording_link")
    .eq("commission_id", commissionId)
    .gte("session_date", todayIso)
    .order("session_date", { ascending: true })
    .limit(24);

  if (futureSessionsError) {
    const missingTable = getMissingTableName(futureSessionsError);
    if (!missingTable?.endsWith("course_sessions")) {
      console.error("No se pudieron cargar sesiones futuras para examenes", futureSessionsError);
    }
    return null;
  }

  const unlockedSessions = (futureSessions || []).filter((session) => {
    if (!allowedMonths.size) return true;
    const billingKey = getSessionBillingMonthKey(session);
    if (!billingKey) return true;
    return allowedMonths.has(billingKey);
  });

  const sessionIds = unlockedSessions.map((session) => session.id).filter(Boolean);
  if (!sessionIds.length) return null;

  const { data: itemRows, error: itemsError } = await supabase
    .from("session_items")
    .select("id, session_id, type, title, url, exercise_id")
    .in("session_id", sessionIds);

  if (itemsError) {
    const missingTable = getMissingTableName(itemsError);
    if (!missingTable?.endsWith("session_items")) {
      console.error("No se pudieron cargar items para examenes", itemsError);
    }
    return null;
  }

  const itemMap = (itemRows || []).reduce((acc, item) => {
    const key = String(item?.session_id || "").trim();
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const sessionWithAssessment = unlockedSessions.find((session) => {
    const items = itemMap[String(session.id || "").trim()] || [];
    return items.some((item) => hasAssessmentItem(item));
  });

  if (!sessionWithAssessment) return null;

  return {
    id: sessionWithAssessment.id,
    title: String(sessionWithAssessment.day_label || `Clase ${sessionWithAssessment.session_in_cycle || ""}`).trim() || "Evaluacion proxima",
    sessionDate: sessionWithAssessment.session_date || null,
    href: "/app/curso",
  };
}

async function loadPracticeMinutesThisMonth(supabase, userId, { startIso, endIso }) {
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("time_spent_sec, completed_at")
    .eq("user_id", userId)
    .gte("completed_at", `${startIso}T00:00:00.000Z`)
    .lte("completed_at", `${endIso}T23:59:59.999Z`);

  if (error) {
    const missingTable = getMissingTableName(error);
    if (!missingTable?.endsWith("practice_sessions")) {
      console.error("No se pudo cargar tiempo de practica", error);
    }
    return 0;
  }

  const totalSeconds = (data || []).reduce((sum, row) => sum + Math.max(0, Number(row?.time_spent_sec || 0) || 0), 0);
  return Math.round(totalSeconds / 60);
}

export default async function CalendarRoute() {
  await autoDeactivateExpiredCommissions();
  const { supabase, user, role } = await getRequestUserContext();

  if (!user) redirect("/login");
  if (role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "commission_id, commission:course_commissions (id, course_level, commission_number, start_date, end_date, start_time, end_time, days_of_week, status, is_active)"
    )
    .eq("id", user.id)
    .maybeSingle();

  const commission = profile?.commission || null;
  const todayIso = getLimaTodayISO();
  const commissionStatus = commission ? resolveCommissionStatus(commission, todayIso) : "inactive";
  if (!commission?.id || commissionStatus !== "active") {
    return (
      <section className="student-panel px-5 py-5 text-foreground sm:px-6">
        <h2 className="text-2xl font-semibold">Calendario academico</h2>
        <p className="mt-2 text-sm text-muted">No tienes un curso activo aun.</p>
      </section>
    );
  }

  let googleCalendarEnabled = hasGoogleCalendarOAuthConfig() && hasServiceRoleClient();
  let googleCalendarConnected = false;
  let googleCalendarEmail = null;
  let googleCalendarLastSyncAt = null;
  let googleCalendarLastSyncStatus = null;
  let googleCalendarLastSyncError = null;
  if (googleCalendarEnabled) {
    const service = getServiceSupabaseClient();
    const { data: connection, error: connectionError } = await service
      .from("google_calendar_connections")
      .select("user_id, google_user_email, last_sync_at, last_sync_status, last_sync_error")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connectionError) {
      const missingTable = getMissingTableName(connectionError);
      if (!missingTable?.endsWith("google_calendar_connections")) {
        console.error("No se pudo cargar estado de Google Calendar", connectionError);
      }
      googleCalendarEnabled = false;
    } else if (connection?.user_id) {
      googleCalendarConnected = true;
      googleCalendarEmail = connection.google_user_email || null;
      googleCalendarLastSyncAt = connection.last_sync_at || null;
      googleCalendarLastSyncStatus = connection.last_sync_status || null;
      googleCalendarLastSyncError = connection.last_sync_error || null;
    }
  }

  const now = new Date();
  const fallbackMonth = {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    monthParam: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
  };
  const initialMonth = parseMonthParam(todayIso.slice(0, 7)) || fallbackMonth;
  const monthRange = buildMonthRange(initialMonth);
  const sessions = await fetchSessionsByMonth({
    supabase,
    commissionId: commission.id,
    startIso: monthRange.startIso,
    endIso: monthRange.endIso,
  });

  const approvedBillingMonths = await getApprovedBillingMonths(supabase, user.id);
  const allowedMonths = new Set(approvedBillingMonths);
  if (!allowedMonths.size) {
    const renewalContext = resolveCourseRenewalContext({
      now: new Date(),
      courseStartDate: commission.start_date,
      courseEndDate: commission.end_date,
      sessions,
    });
    const fallbackKey = normalizeMonthKey(renewalContext?.currentBillingMonthKey);
    if (fallbackKey) allowedMonths.add(fallbackKey);
  }

  const initialSessions = (sessions || []).map((session) => {
    const billingKey = getSessionBillingMonthKey(session);
    const isLocked = billingKey && allowedMonths.size ? !allowedMonths.has(billingKey) : false;
    return {
      ...session,
      locked: isLocked,
    };
  });

  const upcomingAssessment = await loadUpcomingAssessment(supabase, commission.id, todayIso, allowedMonths);
  const practiceMinutesThisMonth = await loadPracticeMinutesThisMonth(supabase, user.id, monthRange);

  return (
    <section className="space-y-6 text-foreground">
      <CalendarPage
        commission={commission}
        initialVisibleMonth={initialMonth.monthParam}
        initialSelectedDate={todayIso}
        initialSessions={initialSessions}
        googleCalendarEnabled={googleCalendarEnabled}
        googleCalendarConnected={googleCalendarConnected}
        googleCalendarEmail={googleCalendarEmail}
        googleCalendarLastSyncAt={googleCalendarLastSyncAt}
        googleCalendarLastSyncStatus={googleCalendarLastSyncStatus}
        googleCalendarLastSyncError={googleCalendarLastSyncError}
        upcomingAssessment={upcomingAssessment}
        practiceMinutesThisMonth={practiceMinutesThisMonth}
      />
    </section>
  );
}
