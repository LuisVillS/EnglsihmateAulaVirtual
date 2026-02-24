import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { resolveCourseRenewalContext } from "@/lib/payments";

const LIMA_TIME_ZONE = "America/Lima";

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
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

function parseMonthParam(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function buildMonthRange({ year, month }) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
    label: `${year}-${String(month).padStart(2, "0")}`,
  };
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
      console.error("No se pudieron cargar meses aprobados", error);
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

export async function GET(request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "role, commission_id, commission:course_commissions (id, course_level, commission_number, start_date, end_date, start_time, end_time, status, is_active)"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "student" || !profile?.commission?.id) {
    return new Response("No active commission", { status: 400 });
  }

  const commission = profile.commission;
  const status = resolveCommissionStatus(commission, getLimaTodayISO());
  if (status !== "active") {
    return new Response("No active commission", { status: 400 });
  }

  const approvedBillingMonths = await getApprovedBillingMonths(supabase, user.id);
  const allowedMonths = new Set(approvedBillingMonths);
  if (!allowedMonths.size) {
    const renewalContext = resolveCourseRenewalContext({
      now: new Date(),
      courseStartDate: commission.start_date,
      courseEndDate: commission.end_date,
      sessions: [],
    });
    const fallbackKey = normalizeMonthKey(renewalContext?.currentBillingMonthKey);
    if (fallbackKey) allowedMonths.add(fallbackKey);
  }

  const { searchParams } = new URL(request.url);
  const monthParam = parseMonthParam(searchParams.get("month"));
  const today = new Date();
  const monthRange = buildMonthRange(
    monthParam || { year: today.getFullYear(), month: today.getMonth() + 1 }
  );

  const { data: sessions } = await supabase
    .from("course_sessions")
    .select("id, cycle_month, session_date, starts_at, ends_at, day_label")
    .eq("commission_id", commission.id)
    .gte("session_date", monthRange.startIso)
    .lte("session_date", monthRange.endIso)
    .order("session_date", { ascending: true });

  const filteredSessions = (sessions || []).filter((session) => {
    if (!allowedMonths.size) return true;
    const billingKey = getSessionBillingMonthKey(session);
    if (!billingKey) return true;
    return allowedMonths.has(billingKey);
  });

  if ((sessions || []).length && !filteredSessions.length) {
    return new Response("Mes bloqueado", { status: 403 });
  }

  const nowStamp = formatIcsDate(new Date());
  const events = filteredSessions.map((session) => {
    const startsAt = session.starts_at ? new Date(session.starts_at) : new Date(`${session.session_date}T00:00:00Z`);
    const endsAt = session.ends_at ? new Date(session.ends_at) : new Date(startsAt.getTime() + 60 * 60 * 1000);
    const uid = `${session.id}@englishmate`;
    const summary = `${commission.course_level} - ${session.day_label || "Clase"}`;
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;TZID=${LIMA_TIME_ZONE}:${formatIcsDate(startsAt)}`,
      `DTEND;TZID=${LIMA_TIME_ZONE}:${formatIcsDate(endsAt)}`,
      `SUMMARY:${summary}`,
      "END:VEVENT",
    ].join("\n");
  });

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EnglishMate//Aula Virtual//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:EnglishMate - ${monthRange.label}`,
    `X-WR-TIMEZONE:${LIMA_TIME_ZONE}`,
    ...events,
    "END:VCALENDAR",
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="calendario-${monthRange.label}.ics"`,
    },
  });
}
