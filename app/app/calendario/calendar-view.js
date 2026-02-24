"use client";

import { useMemo, useState } from "react";

const WEEK_DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const LIMA_TIME_ZONE = "America/Lima";

function getLimaDateParts(value) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  if (!lookup.year || !lookup.month || !lookup.day) return null;
  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    dateKey: `${lookup.year}-${lookup.month}-${lookup.day}`,
    monthKey: `${lookup.year}-${lookup.month}-01`,
    monthParam: `${lookup.year}-${lookup.month}`,
  };
}

function toDateKey(value) {
  const parts = getLimaDateParts(value);
  return parts?.dateKey || null;
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: LIMA_TIME_ZONE }).format(date);
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", timeZone: LIMA_TIME_ZONE }).format(date);
}

function toGoogleCalendarUtc(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildGoogleCalendarUrl({ title, startUtc, endUtc, details }) {
  if (!startUtc || !endUtc) return null;
  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", title || "Clase");
  params.set("dates", `${startUtc}/${endUtc}`);
  if (details) params.set("details", details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildSessionCalendarLink(session, commission) {
  const startUtc = toGoogleCalendarUtc(session?.starts_at);
  const endUtc = toGoogleCalendarUtc(session?.ends_at) || (startUtc ? startUtc : null);
  if (!startUtc || !endUtc) return null;

  const titleParts = [commission?.course_level, `Comision #${commission?.commission_number}`, session?.day_label || "Clase"]
    .filter(Boolean);
  const title = titleParts.join(" - ");

  const detailsLines = [];
  if (session?.live_link) detailsLines.push(`Zoom/Live: ${session.live_link}`);
  if (session?.recording_link) detailsLines.push(`Grabacion: ${session.recording_link}`);
  const details = detailsLines.join("\n");

  return buildGoogleCalendarUrl({ title, startUtc, endUtc, details });
}

function getMonthParam(date) {
  return getLimaDateParts(date)?.monthParam || null;
}

function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

function getSessionBillingMonthKey(session) {
  const byCycle = normalizeMonthKey(session?.cycle_month);
  if (byCycle) return byCycle;
  return getLimaDateParts(session?.starts_at || session?.session_date)?.monthKey || null;
}

function getSessionCalendarMonthKey(session) {
  return getLimaDateParts(session?.starts_at || session?.session_date)?.monthKey || null;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10V7a5 5 0 1 1 10 0v3" />
      <rect x="5" y="10" width="14" height="10" rx="2" />
    </svg>
  );
}

export default function CalendarView({
  commission,
  sessions = [],
  allowedMonths = [],
  googleCalendarEnabled = false,
  googleCalendarConnected = false,
  googleCalendarEmail = null,
  googleCalendarLastSyncAt = null,
  googleCalendarLastSyncStatus = null,
  googleCalendarLastSyncError = null,
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState(null);
  const [syncState, setSyncState] = useState({
    loading: false,
    type: null,
    message: "",
  });

  const allowedMonthsSet = useMemo(() => new Set((allowedMonths || []).map(normalizeMonthKey).filter(Boolean)), [allowedMonths]);

  const sessionsByDate = useMemo(() => {
    const map = new Map();
    sessions.forEach((session) => {
      const key = toDateKey(session.session_date || session.starts_at);
      if (!key) return;
      const list = map.get(key) || [];
      list.push(session);
      map.set(key, list);
    });
    return map;
  }, [sessions]);

  const monthStats = useMemo(() => {
    const statsByMonthKey = new Map();
    sessions.forEach((session) => {
      const monthKey = getSessionCalendarMonthKey(session);
      if (!monthKey) return;
      const billingKey = getSessionBillingMonthKey(session);
      const isLocked = billingKey && allowedMonthsSet.size ? !allowedMonthsSet.has(billingKey) : false;
      const current = statsByMonthKey.get(monthKey) || { unlocked: 0, locked: 0 };
      if (isLocked) current.locked += 1;
      else current.unlocked += 1;
      statsByMonthKey.set(monthKey, current);
    });
    return statsByMonthKey;
  }, [sessions, allowedMonthsSet]);

  const monthInfo = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekday = firstDay.getDay(); // 0 Sunday
    const offset = (weekday + 6) % 7;
    const slots = [];
    for (let i = 0; i < offset; i += 1) slots.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      slots.push(new Date(year, month, day));
    }
    return { slots, year, month };
  }, [cursor]);

  const selectedSessions = selectedKey ? sessionsByDate.get(selectedKey) || [] : [];
  const monthParam = getMonthParam(cursor);
  const cursorMonthKey = getLimaDateParts(cursor)?.monthKey || null;
  const currentStats = cursorMonthKey ? monthStats.get(cursorMonthKey) : null;
  const hasUnlockedInMonth = Boolean(currentStats?.unlocked);
  const hasLockedInMonth = Boolean(currentStats?.locked);
  const icsHref = monthParam ? `/api/calendar/ics?month=${monthParam}` : "/api/calendar/ics";
  const hasUnlockedInAnyMonth = useMemo(
    () => sessions.some((session) => {
      const billingKey = getSessionBillingMonthKey(session);
      if (!billingKey || !allowedMonthsSet.size) return true;
      return allowedMonthsSet.has(billingKey);
    }),
    [sessions, allowedMonthsSet]
  );

  const handleConnectGoogleCalendar = () => {
    if (!googleCalendarEnabled || !hasUnlockedInAnyMonth) return;
    window.location.href = "/api/calendar/google/connect?returnTo=%2Fapp%2Fcalendario";
  };

  const handleSyncGoogleCalendar = async () => {
    if (!googleCalendarEnabled || !googleCalendarConnected || syncState.loading || !hasUnlockedInAnyMonth) return;
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
      const summary = `Sincronizado: ${payload?.created || 0} creadas, ${payload?.updated || 0} actualizadas, ${payload?.deleted || 0} eliminadas.`;
      setSyncState({
        loading: false,
        type: hasWarning ? "warning" : "success",
        message: hasWarning ? `${summary} ${payload?.warning || ""}`.trim() : summary,
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
    <div className="space-y-6">
      <header className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Calendario academico</p>
            <h1 className="mt-2 text-3xl font-semibold">{formatMonthLabel(cursor)}</h1>
            <p className="text-sm text-muted">
              {commission.course_level} - Comision #{commission.commission_number}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Mes anterior
            </button>
            <button
              type="button"
              onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Mes siguiente
            </button>
            {hasUnlockedInMonth ? (
              <a
                href={icsHref}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
              >
                Exportar calendario
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="rounded-full bg-surface-2 px-4 py-2 text-xs font-semibold text-muted disabled:cursor-not-allowed"
              >
                Exportar calendario
              </button>
            )}
            {!googleCalendarConnected ? (
              <button
                type="button"
                onClick={handleConnectGoogleCalendar}
                disabled={!hasUnlockedInAnyMonth || !googleCalendarEnabled}
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-muted"
              >
                {googleCalendarEnabled ? "Conectar Google Calendar" : "Google Calendar no configurado"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSyncGoogleCalendar}
                disabled={!hasUnlockedInAnyMonth || syncState.loading}
                className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-muted"
              >
                {syncState.loading ? "Sincronizando..." : "Sincronizar Google Calendar"}
              </button>
            )}
          </div>
        </div>
        {googleCalendarConnected ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-xs text-muted">
            <p>
              Conectado: {googleCalendarEmail || "Google Account"}
            </p>
            {googleCalendarLastSyncAt ? (
              <p>
                Ultima sincronizacion: {new Date(googleCalendarLastSyncAt).toLocaleString("es-PE")}
              </p>
            ) : null}
            {googleCalendarLastSyncStatus === "error" && googleCalendarLastSyncError ? (
              <p>Error previo: {googleCalendarLastSyncError}</p>
            ) : null}
          </div>
        ) : null}
        {syncState.message ? (
          <div
            className={`mt-4 rounded-2xl border p-4 text-sm ${
              syncState.type === "error"
                ? "border-border bg-surface-2 text-muted"
                : syncState.type === "warning"
                  ? "border-border bg-surface-2 text-muted"
                  : "border-primary/40 bg-primary/10 text-primary"
            }`}
          >
            {syncState.message}
          </div>
        ) : null}
        {hasLockedInMonth && !hasUnlockedInMonth ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm text-muted">
            Este mes esta bloqueado hasta que renueves tu matricula.
          </div>
        ) : null}
      </header>

      <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="grid grid-cols-7 gap-2 text-xs uppercase tracking-[0.25em] text-muted">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="text-center">
              {day}
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-7 gap-2">
          {monthInfo.slots.map((date, idx) => {
            if (!date) {
              return <div key={`empty-${idx}`} className="h-20 rounded-2xl border border-transparent" />;
            }
            const key = toDateKey(date);
            const daySessions = sessionsByDate.get(key) || [];
            const unlockedCount = daySessions.filter((session) => {
              const billingKey = getSessionBillingMonthKey(session);
              if (!billingKey || !allowedMonthsSet.size) return true;
              return allowedMonthsSet.has(billingKey);
            }).length;
            const lockedCount = daySessions.length - unlockedCount;
            const hasSessions = daySessions.length > 0;
            const isSelected = selectedKey === key;
            const isLockedDay = hasSessions && lockedCount > 0 && unlockedCount === 0;
            return (
              <button
                type="button"
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`flex h-20 flex-col items-start justify-between rounded-2xl border px-3 py-2 text-left text-sm transition ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary"
                    : hasSessions
                      ? isLockedDay
                        ? "border-border bg-surface-2 text-muted"
                        : "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border bg-surface-2 text-muted"
                }`}
              >
                <span className="text-sm font-semibold">{date.getDate()}</span>
                {hasSessions ? (
                  isLockedDay ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted">
                      <LockIcon /> {lockedCount} bloqueadas
                    </span>
                  ) : (
                    <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {unlockedCount} clases
                    </span>
                  )
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted">Libre</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Detalle del dia</p>
            <h2 className="mt-2 text-xl font-semibold">
              {selectedKey || "Selecciona un dia"}
            </h2>
          </div>
          <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted">
            {selectedSessions.length} clases
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {selectedSessions.map((session) => {
            const billingKey = getSessionBillingMonthKey(session);
            const isLocked = billingKey && allowedMonthsSet.size ? !allowedMonthsSet.has(billingKey) : false;
            const calendarLink = !isLocked ? buildSessionCalendarLink(session, commission) : null;
            return (
              <div key={session.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{session.day_label || "Clase"}</p>
                    <p className="text-xs text-muted">
                      {formatTime(session.starts_at)} - {formatTime(session.ends_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isLocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-muted">
                        <LockIcon /> Bloqueado
                      </span>
                    ) : null}
                    <span className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-wide text-muted">
                      {session.status || "scheduled"}
                    </span>
                    {calendarLink ? (
                      <a
                        href={calendarLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                      >
                        Agregar a Google Calendar
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-muted disabled:cursor-not-allowed"
                      >
                        Agregar a Google Calendar
                      </button>
                    )}
                  </div>
                </div>
                {isLocked ? (
                  <p className="mt-3 text-xs text-muted">
                    Esta clase pertenece a un mes aun no habilitado. Renueva para desbloquearla.
                  </p>
                ) : null}
              </div>
            );
          })}
          {!selectedSessions.length ? (
            <p className="text-sm text-muted">No hay clases programadas para este dia.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
