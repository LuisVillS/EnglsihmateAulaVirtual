"use client";

import { useMemo } from "react";
import { formatTimeRange, getSessionDateKey, resolveSessionStatus } from "./calendar-utils";

function sortSessionsByStatus(sessions = []) {
  const order = { live: 0, upcoming: 1, finished: 2 };
  return [...sessions].sort((left, right) => {
    const leftStatus = order[resolveSessionStatus(left)] ?? 3;
    const rightStatus = order[resolveSessionStatus(right)] ?? 3;
    if (leftStatus !== rightStatus) return leftStatus - rightStatus;

    const leftTime = new Date(left?.starts_at || left?.session_date || 0).getTime() || Number.MAX_SAFE_INTEGER;
    const rightTime = new Date(right?.starts_at || right?.session_date || 0).getTime() || Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
}

function buildSessionAction(session) {
  if (!session) return null;
  if (session.locked) return { href: null, label: "Bloqueado", external: false, disabled: true };
  return { href: `/app/curso?session=${session.id}`, label: "Ir al curso", external: false };
}

function formatAgendaDate(dateKey) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "Selecciona un dia";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0));
  const label = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "long",
  }).format(date);
  return label.slice(0, 1).toUpperCase() + label.slice(1);
}

function LightbulbIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 3a7 7 0 0 0-4 12c.8.7 1.3 1.5 1.6 2.5h4.8c.3-1 .8-1.8 1.6-2.5A7 7 0 0 0 12 3Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 10h10" strokeLinecap="round" />
      <path d="m10 6 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AgendaCard({ badge, title, time, action, featured = false, muted = false, subtitle = null, children = null, onActionClick }) {
  return (
    <article
      className={`rounded-[24px] border px-6 py-6 shadow-[0_12px_32px_rgba(16,52,116,0.06)] ${
        muted
          ? "border-[rgba(16,52,116,0.04)] bg-white"
          : "border-[rgba(16,52,116,0.06)] bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            featured ? "bg-[#103474] text-white" : "bg-[#eef1f6] text-[#515763]"
          }`}
        >
          {badge}
        </span>
        <span className="text-sm font-medium text-[#6b7386]">{time}</span>
      </div>

      <h3 className="mt-5 text-[1.7rem] font-semibold leading-tight tracking-[-0.03em] text-[#103474]">
        {title}
      </h3>

      {subtitle ? <p className="mt-2 text-sm leading-6 text-[#6b7386]">{subtitle}</p> : null}
      {children ? <div className="mt-4">{children}</div> : null}

      {action ? (
        action.href ? (
          <a
            href={action.href}
            target={action.external ? "_blank" : undefined}
            rel={action.external ? "noopener noreferrer" : undefined}
            onClick={onActionClick}
            className={`mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[16px] px-5 py-3 text-sm font-semibold transition ${
              muted
                ? "bg-[#eef1f6] text-[#515763]"
                : "bg-[#103474] text-white shadow-[0_10px_22px_rgba(16,52,116,0.14)]"
            }`}
          >
            {action.label}
            <ArrowIcon />
          </a>
        ) : (
          <button
            type="button"
            disabled
            className={`mt-6 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-[16px] px-5 py-3 text-sm font-semibold ${
              muted ? "bg-[#eef1f6] text-[#7a8192]" : "bg-[#dbe2ef] text-[#7a8192]"
            }`}
          >
            {action.label}
          </button>
        )
      ) : null}
    </article>
  );
}

export default function DayEventsPanel({ selectedDate, sessions = [], commission, loading = false }) {
  const title = useMemo(() => formatAgendaDate(selectedDate), [selectedDate]);
  const sortedSessions = useMemo(() => sortSessionsByStatus(sessions), [sessions]);
  const primarySession = sortedSessions[0] || null;
  const secondarySession = sortedSessions[1] || null;
  const primaryAction = buildSessionAction(primarySession);
  const secondaryAction = buildSessionAction(secondarySession);
  const selectedDayKey = getSessionDateKey(primarySession) || selectedDate;

  const studyNote = useMemo(() => {
    if (primarySession?.locked) {
      return "Esta clase pertenece a un mes aun bloqueado. Renueva para desbloquearla.";
    }
    if (primarySession && secondarySession) {
      return `Repasa ${primarySession.day_label || "la clase principal"} antes de continuar con ${secondarySession.day_label || "la sesion complementaria"}.`;
    }
    if (primarySession) {
      return `Revisa ${primarySession.day_label || "esta clase"} antes de entrar a la sesion.`;
    }
    return "Selecciona un dia con clases para ver los detalles del dia.";
  }, [primarySession, secondarySession]);

  return (
    <aside className="space-y-5">
      <div className="rounded-[24px] bg-[#f1f3f7] px-6 py-6 shadow-[0_10px_24px_rgba(16,52,116,0.04)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#555e75]">Agenda del dia</p>
        <h2 className="mt-2 text-[1.8rem] font-semibold tracking-[-0.04em] text-[#103474]">{title}</h2>
        <p className="mt-2 text-sm text-[#6b7386]">{selectedDayKey ? `Clases del ${title}` : "Selecciona un dia del calendario"}</p>
        {loading ? <p className="mt-3 text-xs text-[#6b7386]">Cargando agenda...</p> : null}
      </div>

      {primarySession ? (
        <AgendaCard
          featured
          badge={primarySession.locked ? "CLASE BLOQUEADA" : resolveSessionStatus(primarySession) === "finished" ? "CLASE COMPLETADA" : "PROXIMA CLASE"}
          title={primarySession.day_label || "Clase"}
          time={formatTimeRange(primarySession)}
          action={primaryAction}
          subtitle={
            primarySession.locked
              ? "Este mes aun no esta habilitado."
              : primarySession.recording_link && resolveSessionStatus(primarySession) === "finished"
                ? "La clase ya termino. Puedes abrir la grabacion."
                : "Accede al curso desde el enlace de esta clase."
          }
        >
          <p className="text-sm font-medium text-[#6b7386]">Comision {commission?.commission_number || "-"}</p>
        </AgendaCard>
      ) : (
        <AgendaCard
          featured
          badge="PROXIMA CLASE"
          title="Sin clases programadas"
          time="--:--"
          action={null}
          subtitle="No hay eventos para la fecha seleccionada."
        />
      )}

      <AgendaCard
        badge={secondarySession ? "SESION DE LABORATORIO" : "CLASE COMPLEMENTARIA"}
        title={secondarySession?.day_label || "Sin segundo evento"}
        time={secondarySession ? formatTimeRange(secondarySession) : "--:--"}
        action={secondaryAction}
        muted={!secondarySession}
        subtitle={secondarySession?.day_label || "No hay una segunda clase para este dia."}
      />

      <article className="rounded-[24px] bg-[#ffd9c6] px-6 py-6 text-[#321200] shadow-[0_10px_24px_rgba(16,52,116,0.04)]">
        <div className="flex items-start gap-4">
          <span className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#321200] text-[#ffd9c6]">
            <LightbulbIcon />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#321200]/90">Nota de estudio</p>
            <p className="mt-2 text-sm leading-7 text-[#321200]/80">{studyNote}</p>
          </div>
        </div>
      </article>
    </aside>
  );
}
