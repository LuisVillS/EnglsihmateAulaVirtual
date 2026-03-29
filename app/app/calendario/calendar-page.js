"use client";

import { useEffect, useMemo, useState } from "react";
import CalendarMonth from "./calendar-month";
import DayEventsPanel from "./day-events-panel";
import {
  getSessionDateKey,
  getTodayLimaDateKey,
  getTodayLimaMonthParam,
  resolveSessionStatus,
  shiftMonthParam,
} from "./calendar-utils";

function normalizeMonthParam(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return getTodayLimaMonthParam();
  return `${match[1]}-${match[2]}`;
}

function statusMessageSync(payload = {}) {
  return `Sincronizado: ${payload?.created || 0} creadas, ${payload?.updated || 0} actualizadas, ${payload?.deleted || 0} eliminadas.`;
}

function buildTimeLabel(session) {
  if (!session?.starts_at || !session?.ends_at) return "--:--";
  const start = new Date(session.starts_at);
  const end = new Date(session.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "--:--";
  const formatter = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatPracticeHours(minutes) {
  const safe = Math.max(0, Number(minutes || 0) || 0);
  if (!safe) return "0h";
  const hours = safe / 60;
  return hours >= 10 ? `${Math.round(hours)}h` : `${Math.round(hours * 10) / 10}h`;
}

function getSessionAction(session) {
  if (!session || session.locked) return null;
  const status = resolveSessionStatus(session);
  if (status === "finished" && session.recording_link) {
    return { href: session.recording_link, label: "Ver grabacion", external: true };
  }
  if (session.live_link) {
    return { href: session.live_link, label: "Ir al curso", external: true };
  }
  if (session.recording_link) {
    return { href: session.recording_link, label: "Ver grabacion", external: true };
  }
  return { href: "/app/curso", label: "Ir al curso", external: false };
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function IconHourglass() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 4h12M6 20h12" />
      <path d="M8 4c0 5 4 5 4 8s-4 3-4 8" />
      <path d="M16 4c0 5-4 5-4 8s4 3 4 8" />
    </svg>
  );
}

function IconLightbulb() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 3a7 7 0 0 0-4 12c.8.7 1.3 1.5 1.6 2.5h4.8c.3-1 .8-1.8 1.6-2.5A7 7 0 0 0 12 3Z" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v9" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

function getGoogleCalendarState({ enabled, connected, loading, syncState }) {
  if (!enabled) {
    return {
      label: "Google Calendar: Not Configured",
      tone: "muted",
      action: null,
      disabled: true,
    };
  }

  if (connected) {
    return {
      label: loading ? "Google Calendar: Syncing" : "Google Calendar: Connected",
      tone: loading || syncState?.type === "warning" ? "warning" : "success",
      action: "sync",
      disabled: loading,
    };
  }

  return {
    label: "Google Calendar: Not Connected",
    tone: "warning",
    action: "connect",
    disabled: loading,
  };
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
  upcomingAssessment = null,
  practiceMinutesThisMonth = 0,
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

  useEffect(() => {
    if (!visibleMonth) return;
    if (selectedDate?.slice(0, 7) === visibleMonth) return;
    const monthToday = todayDateKey?.slice(0, 7) === visibleMonth ? todayDateKey : null;
    const firstSessionDate = currentMonthSessions.map((session) => getSessionDateKey(session)).find(Boolean);
    setSelectedDate(monthToday || firstSessionDate || `${visibleMonth}-01`);
  }, [currentMonthSessions, selectedDate, todayDateKey, visibleMonth]);

  const sortedVisibleSessions = useMemo(
    () => [...currentMonthSessions].sort((left, right) => {
      const leftStart = new Date(left?.starts_at || left?.session_date || 0).getTime() || Number.MAX_SAFE_INTEGER;
      const rightStart = new Date(right?.starts_at || right?.session_date || 0).getTime() || Number.MAX_SAFE_INTEGER;
      return leftStart - rightStart;
    }),
    [currentMonthSessions]
  );

  const dayMetrics = useMemo(() => {
    const map = new Map();
    currentMonthSessions.forEach((session) => {
      const key = getSessionDateKey(session);
      if (!key) return;
      const current = map.get(key) || { count: 0, locked: 0 };
      current.count += 1;
      if (session?.locked) current.locked += 1;
      map.set(key, current);
    });
    return map;
  }, [currentMonthSessions]);

  const selectedSessions = useMemo(() => {
    if (!selectedDate) return [];
    return sortedVisibleSessions.filter((session) => getSessionDateKey(session) === selectedDate);
  }, [selectedDate, sortedVisibleSessions]);

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

  const nextVisibleSession = useMemo(
    () => sortedVisibleSessions.find((session) => !session?.locked && resolveSessionStatus(session) !== "finished") || sortedVisibleSessions[0] || null,
    [sortedVisibleSessions]
  );

  const unlockedCount = currentMonthSessions.filter((session) => !session?.locked).length;
  const completedVisibleCount = currentMonthSessions.filter((session) => !session?.locked && resolveSessionStatus(session) === "finished").length;
  const coveragePercent = unlockedCount ? Math.round((completedVisibleCount / unlockedCount) * 100) : 0;
  const nextSessionDateKey = getSessionDateKey(nextVisibleSession);

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

  const handleJumpToNextSession = () => {
    const targetDateKey = String(upcomingAssessment?.sessionDate || nextSessionDateKey || "").slice(0, 10);
    if (!targetDateKey) return;
    setVisibleMonth(targetDateKey.slice(0, 7));
    setSelectedDate(targetDateKey);
    document.getElementById("calendar-month-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleToday = () => {
    setVisibleMonth(defaultMonth);
    setSelectedDate(todayDateKey);
  };

  const googleState = getGoogleCalendarState({
    enabled: googleCalendarEnabled,
    connected: calendarConnection.connected,
    loading: syncState.loading,
    syncState,
  });

  const pageEyebrow = `${String(commission?.course_level || "Curso").toUpperCase()} - COMISION ${commission?.commission_number || "-"}`;
  const pageTitle = "Calendario de Clases";
  const hiddenInfo = calendarConnection.connected ? (
    <div className="mt-3 rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-white/70 px-4 py-3 text-xs text-[#6b7386]">
      <p>Conectado: {calendarConnection.email || "Cuenta de Google"}</p>
      {calendarConnection.lastSyncAt ? (
        <p>
          Ultima sincronizacion: {new Date(calendarConnection.lastSyncAt).toLocaleString("es-PE")}
        </p>
      ) : null}
      {calendarConnection.lastSyncStatus === "error" && calendarConnection.lastSyncError ? (
        <p>Error previo: {calendarConnection.lastSyncError}</p>
      ) : null}
    </div>
  ) : null;

  return (
    <main className="min-h-screen bg-[#f3f5f8] text-[#191c1d]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.28em] text-[#555e75]">{pageEyebrow}</p>
            <h1 className="mt-2 text-[2.6rem] font-semibold tracking-[-0.05em] text-[#103474] sm:text-[3.15rem]">
              {pageTitle}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {googleState.disabled ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-transparent bg-white px-5 py-3 text-sm font-semibold text-[#5f6471] shadow-[0_10px_24px_rgba(16,52,116,0.04)]">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    googleState.tone === "success"
                      ? "bg-emerald-400"
                      : googleState.tone === "warning"
                        ? "bg-amber-400"
                        : "bg-[#c5cad6]"
                  }`}
                />
                {googleState.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={googleState.action === "sync" ? handleSyncGoogleCalendar : handleConnectGoogleCalendar}
                disabled={googleState.disabled}
                className="inline-flex items-center gap-2 rounded-full border border-transparent bg-white px-5 py-3 text-sm font-semibold text-[#5f6471] shadow-[0_10px_24px_rgba(16,52,116,0.04)] transition hover:bg-[#fbfcff] disabled:cursor-not-allowed"
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    googleState.tone === "success"
                      ? "bg-emerald-400"
                      : googleState.tone === "warning"
                        ? "bg-amber-400"
                        : "bg-[#c5cad6]"
                  }`}
                />
                {googleState.label}
              </button>
            )}

            <a
              href={hasUnlockedInMonth ? `/api/calendar/ics?month=${visibleMonth}` : "#"}
              onClick={(event) => {
                if (!hasUnlockedInMonth) {
                  event.preventDefault();
                }
              }}
              className={`inline-flex items-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold shadow-[0_16px_32px_rgba(16,52,116,0.18)] transition ${
                hasUnlockedInMonth
                  ? "bg-[#103474] text-white"
                  : "cursor-not-allowed bg-[#dbe2ef] text-[#8891a3]"
              }`}
            >
              <IconDownload />
              .ics Export
            </a>
          </div>
        </header>

        {hiddenInfo}

        {syncState.message ? (
          <div
            className={`mt-4 rounded-[14px] border px-4 py-3 text-sm ${
              syncState.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : syncState.type === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {syncState.message}
          </div>
        ) : null}

        {loadError ? (
          <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {hasLockedOnlyInMonth ? (
          <div className="mt-4 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Este mes tiene clases bloqueadas hasta la renovacion.
          </div>
        ) : null}

        <section id="calendar-month-panel" className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
          <CalendarMonth
            visibleMonth={visibleMonth}
            selectedDate={selectedDate}
            todayDateKey={todayDateKey}
            dayMetrics={dayMetrics}
            loading={isLoadingMonth}
            onPrevMonth={() => setVisibleMonth((prev) => shiftMonthParam(prev, -1))}
            onNextMonth={() => setVisibleMonth((prev) => shiftMonthParam(prev, 1))}
            onToday={handleToday}
            onSelectDate={setSelectedDate}
          />

          <DayEventsPanel
            selectedDate={selectedDate}
            sessions={selectedSessions}
            commission={commission}
            loading={isLoadingMonth}
          />
        </section>

        <section className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <UpcomingExamsCard
            upcomingAssessment={upcomingAssessment}
            nextSession={nextVisibleSession}
            visibleMonthSessions={currentMonthSessions}
            onJump={handleJumpToNextSession}
          />

          <div className="grid gap-8 md:grid-cols-2">
            <MetricCard
              icon={<IconCheck />}
              value={`${coveragePercent}%`}
              label="Avance este mes"
              sublabel={`${completedVisibleCount} de ${unlockedCount || 0} clases desbloqueadas`}
            />
            <MetricCard
              icon={<IconHourglass />}
              value={formatPracticeHours(practiceMinutesThisMonth)}
              label="Tiempo de practica"
              sublabel="Tiempo real registrado este mes"
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function UpcomingExamsCard({ upcomingAssessment, nextSession, visibleMonthSessions = [], onJump }) {
  const upcomingCount = visibleMonthSessions.filter((session) => !session?.locked && resolveSessionStatus(session) !== "finished").length;
  const nextTitle = String(upcomingAssessment?.title || nextSession?.day_label || nextSession?.title || "Proxima clase").trim();
  const nextTime = nextSession ? buildTimeLabel(nextSession) : "";
  const description = upcomingAssessment
    ? `Tu siguiente evaluacion disponible aparece dentro de ${nextTitle}. Revisa la fecha y preparate con tiempo.`
    : nextSession
      ? `Tienes ${upcomingCount} clases por delante en este mes. La siguiente sesion es ${nextTitle}${nextTime ? ` a las ${nextTime}` : ""}.`
      : "No hay sesiones programadas para este mes.";

  return (
    <article className="relative overflow-hidden rounded-[24px] bg-[#103474] px-8 py-8 text-white shadow-[0_24px_60px_rgba(16,52,116,0.2)]">
      <div className="absolute -right-4 -bottom-8 h-32 w-32 rounded-full bg-white/6" />
      <div className="absolute right-6 bottom-6 h-20 w-20 rounded-[28px] border border-white/8" />
      <h2 className="text-[2rem] font-semibold tracking-[-0.04em]">Proximos Examenes</h2>
      <p className="mt-5 max-w-md text-[15px] leading-7 text-white/72">{description}</p>
      <button
        type="button"
        onClick={onJump}
        className="mt-10 inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#103474] transition hover:bg-[#f8fbff]"
      >
        Ver fechas
      </button>
    </article>
  );
}

function MetricCard({ icon, value, label, sublabel }) {
  return (
    <article className="rounded-[24px] border border-[rgba(16,52,116,0.06)] bg-white px-8 py-8 shadow-[0_12px_30px_rgba(16,52,116,0.05)]">
      <div className="flex items-center gap-3 text-[#103474]">{icon}</div>
      <p className="mt-6 text-[3rem] font-semibold tracking-[-0.06em] text-[#103474]">{value}</p>
      <p className="mt-1 text-[1.25rem] font-semibold leading-tight text-[#45516b]">{label}</p>
      <p className="mt-3 text-sm leading-6 text-[#6b7386]">{sublabel}</p>
    </article>
  );
}
