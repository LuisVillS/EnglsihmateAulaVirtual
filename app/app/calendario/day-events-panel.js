"use client";

import { useMemo } from "react";
import { formatDateKeyTitle, formatTimeRange, parseDateTime, resolveSessionStatus, getSessionDateKey } from "./calendar-utils";

function getStatusMeta(status) {
  if (status === "live") {
    return {
      label: "En vivo",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (status === "finished") {
    return {
      label: "Finalizada",
      className: "border-slate-200 bg-slate-100 text-slate-600",
    };
  }
  return {
    label: "Proxima",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  };
}

function getSessionTimeMs(session) {
  const dateKey = getSessionDateKey(session);
  const startsAt = parseDateTime(session?.starts_at, dateKey);
  return startsAt?.getTime() || Number.MAX_SAFE_INTEGER;
}

function buildSessionAction(session) {
  if (session?.locked) return null;
  if (session?.live_link) return { href: session.live_link, label: "Ver clase", external: true };
  if (session?.recording_link) return { href: session.recording_link, label: "Ver grabacion", external: true };
  return { href: "/app/curso", label: "Ir al curso", external: false };
}

export default function DayEventsPanel({ selectedDate, sessions = [] }) {
  const title = useMemo(() => formatDateKeyTitle(selectedDate), [selectedDate]);
  const sortedSessions = useMemo(() => [...sessions].sort((a, b) => getSessionTimeMs(a) - getSessionTimeMs(b)), [sessions]);

  return (
    <>
      <aside className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Eventos</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-800">{title}</h2>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
            {sortedSessions.length}
          </span>
        </div>

        <div className="mt-3 space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
          {sortedSessions.length ? (
            sortedSessions.map((session) => {
              const status = resolveSessionStatus(session);
              const statusMeta = getStatusMeta(status);
              const action = buildSessionAction(session);
              const titleLabel = session?.day_label || `Clase ${session?.session_in_cycle || ""}`.trim();

              return (
                <article key={session.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <div className="flex items-start gap-2">
                    <div className="w-20 shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-center text-[11px] font-medium text-slate-700">
                      {formatTimeRange(session)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <p className="truncate text-[13px] font-medium text-slate-800">{titleLabel || "Clase"}</p>
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      {action ? (
                        <a
                          href={action.href}
                          target={action.external ? "_blank" : undefined}
                          rel={action.external ? "noopener noreferrer" : undefined}
                          className="mt-1 inline-flex rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100"
                        >
                          {action.label}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
              <p className="text-xs text-slate-500">No tienes clases este dia</p>
            </div>
          )}
        </div>
      </aside>

      <aside className="hidden rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm lg:block lg:max-h-[620px] lg:overflow-y-auto lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Eventos</p>
            <h2 className="mt-1 text-base font-semibold text-slate-800">Clases del {title}</h2>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
            Clases ({sortedSessions.length})
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {sortedSessions.length ? (
            sortedSessions.map((session) => {
              const status = resolveSessionStatus(session);
              const statusMeta = getStatusMeta(status);
              const action = buildSessionAction(session);
              const titleLabel = session?.day_label || `Clase ${session?.session_in_cycle || ""}`.trim();

              return (
                <article key={session.id} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 w-24 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-[12px] font-medium text-slate-700">
                      {formatTimeRange(session)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-800">{titleLabel || "Clase"}</p>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      {session?.locked ? (
                        <p className="mt-1.5 text-xs text-amber-700">Clase bloqueada hasta tu siguiente renovacion.</p>
                      ) : null}
                      {action ? (
                        action.external ? (
                          <a
                            href={action.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                          >
                            {action.label}
                          </a>
                        ) : (
                          <a
                            href={action.href}
                            className="mt-2 inline-flex rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                          >
                            {action.label}
                          </a>
                        )
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <div className="mx-auto mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path d="M4 6h12M6 3v3m8-3v3M5 9h10v7H5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm text-slate-500">No tienes clases este dia</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
