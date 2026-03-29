import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { resolveCourseRenewalContext } from "@/lib/payments";
import { verifyCalendarFeedToken } from "@/lib/calendar-feed-token";

const LIMA_TIME_ZONE = "America/Lima";

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
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
      console.error("No se pudieron cargar meses aprobados para feed", error);
    }
    return [];
  }

  return (data || [])
    .map((row) => normalizeMonthKey(row?.billing_month))
    .filter(Boolean);
}

function getSessionBillingMonthKey(session) {
  return normalizeMonthKey(session?.cycle_month) || normalizeMonthKey(session?.session_date) || null;
}

function formatIcsDate(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${lookup.year}${lookup.month}${lookup.day}T${lookup.hour}${lookup.minute}${lookup.second}`;
}

function buildCalendarBody({ commission, sessions }) {
  const nowStamp = formatIcsDate(new Date());
  const events = (sessions || []).map((session) => {
    const startsAt = session.starts_at ? new Date(session.starts_at) : new Date(`${session.session_date}T00:00:00Z`);
    const endsAt = session.ends_at ? new Date(session.ends_at) : new Date(startsAt.getTime() + 60 * 60 * 1000);
    const uid = `${session.id}@englishmate`;
    const summary = `${commission.course_level} - ${session.day_label || "Clase"}`;
    const details = [session.live_link ? `Zoom/Live: ${session.live_link}` : null, session.recording_link ? `Grabacion: ${session.recording_link}` : null]
      .filter(Boolean)
      .join("\\n");
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;TZID=${LIMA_TIME_ZONE}:${formatIcsDate(startsAt)}`,
      `DTEND;TZID=${LIMA_TIME_ZONE}:${formatIcsDate(endsAt)}`,
      `SUMMARY:${summary}`,
      details ? `DESCRIPTION:${details}` : null,
      "END:VEVENT",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EnglishMate//Aula Virtual//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:EnglishMate - Comision ${commission.commission_number || ""}`.trim(),
    `X-WR-TIMEZONE:${LIMA_TIME_ZONE}`,
    ...events,
    "END:VCALENDAR",
  ].join("\n");
}

export async function GET(request) {
  if (!hasServiceRoleClient()) {
    return new Response("Configura SUPABASE_SERVICE_ROLE_KEY.", { status: 500 });
  }

  let tokenCheck;
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    tokenCheck = verifyCalendarFeedToken(token);
  } catch (error) {
    console.error("[CalendarFeed] token verification failed", error);
    return new Response("Configura CALENDAR_FEED_SECRET.", { status: 500 });
  }

  if (!tokenCheck.valid || !tokenCheck.userId) {
    return new Response("Token invalido.", { status: 401 });
  }

  const supabase = getServiceSupabaseClient();
  const userId = tokenCheck.userId;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, role, commission_id, commission:course_commissions (id, course_level, commission_number, start_date, end_date, status, is_active)"
    )
    .eq("id", userId)
    .maybeSingle();

  if (profile?.role !== "student" || !profile?.commission?.id) {
    return new Response("No active commission", { status: 400 });
  }

  const commission = profile.commission;
  const commissionStatus = resolveCommissionStatus(commission, getLimaTodayISO());
  if (commissionStatus !== "active") {
    return new Response("No active commission", { status: 400 });
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

  const todayIso = getLimaTodayISO();
  const unlockedUpcomingSessions = (sessions || []).filter((session) => {
    if ((session?.session_date || "").slice(0, 10) < todayIso) return false;
    if (!allowedMonths.size) return true;
    const billingKey = getSessionBillingMonthKey(session);
    if (!billingKey) return true;
    return allowedMonths.has(billingKey);
  });

  const body = buildCalendarBody({ commission, sessions: unlockedUpcomingSessions });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'inline; filename="englishmate-feed.ics"',
    },
  });
}
