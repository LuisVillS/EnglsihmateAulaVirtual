"use client";

import { useEffect, useMemo, useState } from "react";
import CalendarMonth from "./calendar-month";
import DayEventsPanel from "./day-events-panel";
import { getSessionDateKey, getTodayLimaDateKey, getTodayLimaMonthParam, shiftMonthParam } from "./calendar-utils";

function normalizeMonthParam(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return getTodayLimaMonthParam();
  return `${match[1]}-${match[2]}`;
}

function statusMessageSync(payload = {}) {
  return `Sincronizado: ${payload?.created || 0} creadas, ${payload?.updated || 0} actualizadas, ${payload?.deleted || 0} eliminadas.`;
}

export default function CalendarPage({
  commission,
  initialVisibleMonth,
  initialSelectedDate,
  initialSessions = [],
  googleCalendarEnabled = false,
  googleCalendarConnected = false,
  googleCalendarEmail = null,
  googleCalendarLastSyncAt = null,
  googleCalendarLastSyncStatus = null,
  googleCalendarLastSyncError = null,
}) {
  const defaultMonth = normalizeMonthParam(initialVisibleMonth || getTodayLimaMonthParam());
  const todayDateKey = initialSelectedDate || getTodayLimaDateKey();

  const [visibleMonth, setVisibleMonth] = useState(defaultMonth);
  const [selectedDate, setSelectedDate] = useState(todayDateKey);
  const [monthSessionsByKey, setMonthSessionsByKey] = useState(() => ({
    [defaultMonth]: Array.isArray(initialSessions) ? initialSessions : [],
  }));
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [syncState, setSyncState] = useState({
    loading: false,
    type: null,
    message: "",
  });
  const [calendarConnection, setCalendarConnection] = useState({
    connected: googleCalendarConnected,
    email: googleCalendarEmail,
    lastSyncAt: googleCalendarLastSyncAt,
    lastSyncStatus: googleCalendarLastSyncStatus,
    lastSyncError: googleCalendarLastSyncError,
  });

  useEffect(() => {
    let isCancelled = false;
    if (monthSessionsByKey[visibleMonth]) return undefined;

    const load = async () => {
      setIsLoadingMonth(true);
      setLoadError("");
      try {
        const response = await fetch(`/api/calendar/month?month=${visibleMonth}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo cargar el calendario.");
        }
        if (isCancelled) return;
        setMonthSessionsByKey((prev) => ({
          ...prev,
          [visibleMonth]: Array.isArray(payload?.sessions) ? payload.sessions : [],
        }));
      } catch (error) {
        if (!isCancelled) {
          setLoadError(String(error?.message || "No se pudo cargar el calendario."));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingMonth(false);
        }
      }
    };

    load();

    return () => {
      isCancelled = true;
    };
  }, [visibleMonth, monthSessionsByKey]);

  const currentMonthSessions = useMemo(
    () => monthSessionsByKey[visibleMonth] || [],
    [monthSessionsByKey, visibleMonth]
  );

  const dayMetrics = useMemo(() => {
    const map = new Map();
    currentMonthSessions.forEach((session) => {
      const key = getSessionDateKey(session);
      if (!key) return;
      const current = map.get(key) || { count: 0 };
      current.count += 1;
      map.set(key, current);
    });
    return map;
  }, [currentMonthSessions]);

  const selectedSessions = useMemo(() => {
    if (!selectedDate) return [];
    const selectedMonth = selectedDate.slice(0, 7);
    const source = monthSessionsByKey[selectedMonth] || [];
    return source.filter((session) => getSessionDateKey(session) === selectedDate);
  }, [monthSessionsByKey, selectedDate]);

  const hasUnlockedInMonth = useMemo(
    () => currentMonthSessions.some((session) => !session?.locked),
    [currentMonthSessions]
  );

  const hasUnlockedInAnyMonth = useMemo(
    () => Object.values(monthSessionsByKey).some((sessions) => (sessions || []).some((session) => !session?.locked)),
    [monthSessionsByKey]
  );

  const hasLockedOnlyInMonth = useMemo(
    () => currentMonthSessions.length > 0 && currentMonthSessions.every((session) => session?.locked),
    [currentMonthSessions]
  );

  const handleConnectGoogleCalendar = () => {
    if (!googleCalendarEnabled || !hasUnlockedInAnyMonth) return;
    window.location.href = "/api/calendar/google/connect?returnTo=%2Fapp%2Fcalendario";
  };

  const handleSyncGoogleCalendar = async () => {
    if (!googleCalendarEnabled || !calendarConnection.connected || syncState.loading || !hasUnlockedInAnyMonth) return;

    setSyncState({ loading: true, type: null, message: "" });
    try {
      const response = await fetch("/api/calendar/google/sync", { method: "POST" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok && response.status !== 207) {
        setSyncState({
          loading: false,
          type: "error",
          message: payload?.error || "No se pudo sincronizar.",
        });
        return;
      }

      const hasWarning = Boolean(payload?.warning) || response.status === 207;
      const summary = statusMessageSync(payload);
      const message = hasWarning ? `${summary} ${payload?.warning || ""}`.trim() : summary;
      const nowIso = new Date().toISOString();
      setCalendarConnection((prev) => ({
        ...prev,
        lastSyncAt: nowIso,
        lastSyncStatus: hasWarning ? "error" : "ok",
        lastSyncError: hasWarning ? payload?.warning || null : null,
      }));
      setSyncState({
        loading: false,
        type: hasWarning ? "warning" : "success",
        message,
      });
    } catch (_error) {
      setSyncState({
        loading: false,
        type: "error",
        message: "No se pudo sincronizar.",
      });
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/95 p-4 text-slate-800 shadow-sm md:p-5">
      <header className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Calendario</h2>
            <p className="mt-1 text-xs text-slate-500 md:text-sm">
              {commission?.course_level || "Curso"} - Comision #{commission?.commission_number || "-"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasUnlockedInMonth ? (
              <a
                href={`/api/calendar/ics?month=${visibleMonth}`}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Exportar .ics
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-400"
              >
                Exportar .ics
              </button>
            )}

            {!googleCalendarEnabled ? (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                Google Calendar no configurado
              </span>
            ) : calendarConnection.connected ? (
              <>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                  Google conectado
                </span>
                <button
                  type="button"
                  onClick={handleSyncGoogleCalendar}
                  disabled={syncState.loading || !hasUnlockedInAnyMonth}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {syncState.loading ? "Sincronizando..." : "Sincronizar"}
                </button>
              </>
            ) : (
              <>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                  Google desconectado
                </span>
                <button
                  type="button"
                  onClick={handleConnectGoogleCalendar}
                  disabled={!hasUnlockedInAnyMonth}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Conectar
                </button>
              </>
            )}
          </div>
        </div>

        {calendarConnection.connected ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <p>Conectado: {calendarConnection.email || "Google Account"}</p>
            {calendarConnection.lastSyncAt ? (
              <p>Ultima sincronizacion: {new Date(calendarConnection.lastSyncAt).toLocaleString("es-PE")}</p>
            ) : null}
            {calendarConnection.lastSyncStatus === "error" && calendarConnection.lastSyncError ? (
              <p>Error previo: {calendarConnection.lastSyncError}</p>
            ) : null}
          </div>
        ) : null}

        {syncState.message ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
              syncState.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : syncState.type === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {syncState.message}
          </div>
        ) : null}

        {loadError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {hasLockedOnlyInMonth ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Este mes tiene clases bloqueadas hasta la renovacion.
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="order-2 lg:order-1">
          <CalendarMonth
            visibleMonth={visibleMonth}
            selectedDate={selectedDate}
            todayDateKey={todayDateKey}
            dayMetrics={dayMetrics}
            loading={isLoadingMonth}
            onPrevMonth={() => setVisibleMonth((prev) => shiftMonthParam(prev, -1))}
            onNextMonth={() => setVisibleMonth((prev) => shiftMonthParam(prev, 1))}
            onSelectDate={setSelectedDate}
          />
        </div>
        <div className="order-1 lg:order-2">
          <DayEventsPanel selectedDate={selectedDate} sessions={selectedSessions} />
        </div>
      </div>
    </div>
  );
}
