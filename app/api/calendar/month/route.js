import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { resolveCourseRenewalContext } from "@/lib/payments";

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

  throw sessionsError;
}

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "role, commission_id, commission:course_commissions (id, course_level, commission_number, start_date, end_date, status, is_active)"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "student" || !profile?.commission?.id) {
      return Response.json({ error: "No active commission" }, { status: 400 });
    }

    const commission = profile.commission;
    const commissionStatus = resolveCommissionStatus(commission, getLimaTodayISO());
    if (commissionStatus !== "active") {
      return Response.json({ error: "No active commission" }, { status: 400 });
    }

    const url = new URL(request.url);
    const today = new Date();
    const fallbackMonth = {
      year: today.getUTCFullYear(),
      month: today.getUTCMonth() + 1,
      monthParam: `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`,
    };
    const parsedMonth = parseMonthParam(url.searchParams.get("month")) || parseMonthParam(getLimaTodayISO().slice(0, 7)) || fallbackMonth;
    const monthRange = buildMonthRange(parsedMonth);

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

    const mappedSessions = (sessions || []).map((session) => {
      const billingKey = getSessionBillingMonthKey(session);
      const isLocked = billingKey && allowedMonths.size ? !allowedMonths.has(billingKey) : false;
      return {
        ...session,
        locked: isLocked,
      };
    });

    return Response.json({
      month: parsedMonth.monthParam,
      sessions: mappedSessions,
      hasUnlockedSessions: mappedSessions.some((session) => !session.locked),
      hasLockedSessions: mappedSessions.some((session) => session.locked),
    });
  } catch (error) {
    console.error("No se pudo cargar calendario mensual", error);
    return Response.json({ error: "No se pudo cargar el calendario." }, { status: 500 });
  }
}
