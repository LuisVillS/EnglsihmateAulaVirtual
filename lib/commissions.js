import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

export const LIMA_TIME_ZONE = "America/Lima";
const AUTO_DEACTIVATE_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_DEACTIVATE_STATE_KEY = "__englishmateAutoDeactivateCommissionsState";

function getAutoDeactivateState() {
  if (!globalThis[AUTO_DEACTIVATE_STATE_KEY]) {
    globalThis[AUTO_DEACTIVATE_STATE_KEY] = {
      lastRunAt: 0,
      lastTodayIso: "",
      inFlight: null,
      lastResult: null,
    };
  }
  return globalThis[AUTO_DEACTIVATE_STATE_KEY];
}

export function getLimaTodayISO() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

export function normalizeCommissionStatus(row) {
  const raw = String(row?.status || "").trim().toLowerCase();
  if (raw === "active" || raw === "inactive" || raw === "archived") return raw;
  if (typeof row?.is_active === "boolean") {
    return row.is_active ? "active" : "inactive";
  }
  return "active";
}

export function resolveCommissionStatus(row, todayIso = getLimaTodayISO()) {
  if (!row) return "inactive";
  const status = normalizeCommissionStatus(row);
  if (status === "archived") return "archived";
  const endDate = row?.end_date ? String(row.end_date).slice(0, 10) : null;
  if (endDate && endDate < todayIso) return "inactive";
  return status;
}

export function isCommissionActive(row, todayIso = getLimaTodayISO()) {
  return resolveCommissionStatus(row, todayIso) === "active";
}

export async function autoDeactivateExpiredCommissions({ client, todayIso } = {}) {
  const service = client || (hasServiceRoleClient() ? getServiceSupabaseClient() : null);
  if (!service) {
    return { skipped: true };
  }
  const today = todayIso || getLimaTodayISO();
  const state = getAutoDeactivateState();
  const now = Date.now();

  if (state.inFlight) {
    return state.inFlight;
  }

  if (
    state.lastTodayIso === today &&
    now - state.lastRunAt < AUTO_DEACTIVATE_INTERVAL_MS
  ) {
    return state.lastResult || { skipped: true, throttled: true };
  }

  state.inFlight = (async () => {
    const { error: statusError } = await service
      .from("course_commissions")
      .update({ status: "inactive", is_active: false })
      .lt("end_date", today)
      .eq("status", "active");

    if (!statusError) {
      return { updated: true };
    }

    const message = String(statusError.message || "").toLowerCase();
    const missingStatus = message.includes("status") || message.includes("column");
    if (!missingStatus) {
      return { error: statusError };
    }

    const { error: fallbackError } = await service
      .from("course_commissions")
      .update({ is_active: false })
      .lt("end_date", today)
      .eq("is_active", true);

    if (fallbackError) {
      return { error: fallbackError };
    }

    return { updated: true, usedFallback: true };
  })();

  try {
    const result = await state.inFlight;
    state.lastRunAt = now;
    state.lastTodayIso = today;
    state.lastResult = result;
    return result;
  } finally {
    state.inFlight = null;
  }
}
