"use client";

import { useMemo, useState } from "react";
import AppModal from "@/components/app-modal";
import { formatMonthKeyFromDate } from "@/lib/class-format";

function parseTimeToMinutes(value) {
  if (!value) return null;
  const [hoursRaw, minutesRaw] = String(value).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function buildFallbackIso(sessionDate, timeValue) {
  if (!sessionDate || !timeValue) return null;
  const [year, month, day] = String(sessionDate).slice(0, 10).split("-").map(Number);
  const minutes = parseTimeToMinutes(timeValue);
  if (!year || !month || !day || minutes == null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const utc = new Date(Date.UTC(year, month - 1, day, hours + 5, mins, 0, 0));
  return utc.toISOString();
}

function normalizeSessionTimes(session, commissionTimes) {
  const startsAt = session.starts_at || buildFallbackIso(session.session_date, commissionTimes.startTime);
  const endsAt = session.ends_at || buildFallbackIso(session.session_date, commissionTimes.endTime);
  return { startsAt, endsAt };
}

function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

function formatDateCaps(isoDate) {
  if (!isoDate) return "-";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "-";
  const formatted = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(date);
  return formatted.replace(/\./g, "").toUpperCase();
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return "Mes";
  const date = new Date(`${monthKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return monthKey;
  const label = date.toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function toSlidesEmbedUrl(url) {
  if (!url) return null;
  if (url.includes("/embed")) return url;
  const match = url.match(/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (!match?.[1]) return null;
  return `https://docs.google.com/presentation/d/${match[1]}/embed?start=false&loop=false&delayms=3000`;
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6A2.5 2.5 0 0 1 20.5 9.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5Z" />
    </svg>
  );
}

function ChevronIcon({ open = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 transition ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10V7a5 5 0 1 1 10 0v3" />
      <rect x="5" y="10" width="14" height="10" rx="2" />
    </svg>
  );
}

function StatusDot({ completed, live }) {
  if (completed) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-success">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }

  return (
    <span className={`inline-flex h-5 w-5 rounded-full border ${live ? "border-success bg-success/15" : "border-border bg-surface-2"}`} />
  );
}

function getGroupStatus(group, nowMs) {
  if (!Number.isFinite(group?.firstStartMs) || !Number.isFinite(group?.lastEndMs)) return "Proximo";
  if (nowMs < group.firstStartMs) return "Proximo";
  if (nowMs > group.lastEndMs) return "Finalizado";
  return "En curso";
}

function GroupStatusBadge({ status }) {
  if (status === "En curso") {
    return <span className="rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{status}</span>;
  }
  if (status === "Finalizado") {
    return <span className="rounded-full border border-success/35 bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">{status}</span>;
  }
  return <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{status}</span>;
}

function RowStatusLabel({ session }) {
  if (session.inLiveWindow) {
    return <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">En vivo</span>;
  }
  if (session.afterEnd) {
    return <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">Presente</span>;
  }
  return null;
}

function isSlidesItem(item) {
  const type = String(item?.type || "").toLowerCase();
  const url = String(item?.url || "").toLowerCase();
  return type === "slides" || url.includes("docs.google.com/presentation");
}

function isVideoItem(item) {
  const type = String(item?.type || "").toLowerCase();
  const url = String(item?.url || "").toLowerCase();
  return (
    type === "video" ||
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("vimeo.com") ||
    url.includes("loom.com")
  );
}

function isExerciseItem(item) {
  const type = String(item?.type || "").toLowerCase();
  if (type === "exercise") return true;
  if (type === "file") {
    return Boolean(String(item?.exercise_id || "").trim() || String(item?.lesson_id || "").trim());
  }
  return false;
}

function resolveExerciseItemUrl(item) {
  const lessonId = String(item?.lesson_id || "").trim();
  if (lessonId) {
    return `/app/clases/${lessonId}/prueba`;
  }
  const url = String(item?.url || "").trim();
  if (!url) return null;
  if (url === "/app/curso") return null;
  return url;
}

function buildExerciseGroupKey(item) {
  const lessonId = String(item?.lesson_id || "").trim();
  if (lessonId) return `lesson:${lessonId}`;
  const sessionId = String(item?.session_id || "").trim();
  if (sessionId) return `session:${sessionId}`;
  const exerciseId = String(item?.exercise_id || "").trim();
  if (exerciseId) return `exercise:${exerciseId}`;
  const url = String(item?.url || "").trim();
  if (url) return `url:${url}`;
  const itemId = String(item?.id || "").trim();
  if (itemId) return `item:${itemId}`;
  return `item:${String(item?.type || "").trim()}:${String(item?.title || "").trim()}:${url}`;
}

function resolveExerciseGroupTitle(items = []) {
  const titles = Array.from(
    new Set(
      (items || [])
        .map((item) => String(item?.title || "").trim())
        .filter(Boolean)
    )
  );
  if (titles.length === 1) return titles[0];
  if (titles.length > 1) return "Prueba de clase";
  return "Prueba de clase";
}

function groupExerciseItems(items = []) {
  const groups = new Map();
  for (const item of items || []) {
    const key = buildExerciseGroupKey(item);
    const current = groups.get(key) || { key, url: null, items: [] };
    const resolvedUrl = resolveExerciseItemUrl(item);
    if (!current.url && resolvedUrl) {
      current.url = resolvedUrl;
    }
    current.items.push(item);
    groups.set(key, current);
  }

  return Array.from(groups.values()).map((group) => {
    const note =
      group.items
        .map((item) => String(item?.note || "").trim())
        .find(Boolean) || null;
    const hasLinkedExercise = group.items.some(
      (item) =>
        Boolean(String(item?.lesson_id || "").trim()) ||
        Boolean(String(item?.exercise_id || "").trim())
    );

    return {
      key: group.key,
      title: resolveExerciseGroupTitle(group.items),
      url: group.url,
      count: group.items.length,
      note,
      hasLinkedExercise,
    };
  });
}

export default function CourseSessionList({
  sessions,
  itemsBySession = {},
  commissionTimes = {},
  nowIso,
  allowedMonths = [],
}) {
  const [openSessionId, setOpenSessionId] = useState(null);
  const [openCycleMap, setOpenCycleMap] = useState({});
  const [expandedSessionMap, setExpandedSessionMap] = useState({});
  const nowMs = new Date(nowIso || "1970-01-01T00:00:00.000Z").getTime();

  const allowedMonthSet = useMemo(
    () =>
      new Set(
        (allowedMonths || [])
          .map((item) => normalizeMonthKey(item))
          .filter(Boolean)
      ),
    [allowedMonths]
  );

  const hydratedSessions = useMemo(
    () =>
      (sessions || []).map((session, idx) => {
        const { startsAt, endsAt } = normalizeSessionTimes(session, commissionTimes);
        const startsAtMs = startsAt ? new Date(startsAt).getTime() : Number.NaN;
        const endsAtMs = endsAt ? new Date(endsAt).getTime() : Number.NaN;
        const beforeStart = Number.isFinite(startsAtMs) ? nowMs < startsAtMs : false;
        const inLiveWindow = Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs) ? nowMs >= startsAtMs && nowMs <= endsAtMs : false;
        const afterEnd = Number.isFinite(endsAtMs) ? nowMs > endsAtMs : false;
        const cycleMonthRaw = normalizeMonthKey(session?.cycle_month);
        const cycleKey = cycleMonthRaw || formatMonthKeyFromDate(startsAt || session.session_date);
        return {
          ...session,
          startsAt,
          endsAt,
          startsAtMs,
          endsAtMs,
          beforeStart,
          inLiveWindow,
          afterEnd,
          cycleKey,
          smallDateLabel: formatDateCaps(startsAt || session.session_date),
          title: session.day_label || `Clase ${String((session.session_in_cycle || session.session_index || idx + 1)).padStart(2, "0")}`,
        };
      }),
    [sessions, commissionTimes, nowMs]
  );

  const grouped = useMemo(() => {
    const groupedMap = new Map();
    hydratedSessions.forEach((session) => {
      const key = session.cycleKey || "sin-fecha";
      const current = groupedMap.get(key) || [];
      current.push(session);
      groupedMap.set(key, current);
    });
    return Array.from(groupedMap.entries())
      .map(([key, rows]) => {
        const sortedRows = [...rows].sort((a, b) => {
          if (Number.isFinite(a.startsAtMs) && Number.isFinite(b.startsAtMs) && a.startsAtMs !== b.startsAtMs) {
            return a.startsAtMs - b.startsAtMs;
          }
          return (a.session_index || 0) - (b.session_index || 0);
        });
        const firstStartMs = sortedRows.find((row) => Number.isFinite(row.startsAtMs))?.startsAtMs || Number.NaN;
        const lastEndMs = [...sortedRows]
          .reverse()
          .find((row) => Number.isFinite(row.endsAtMs) || Number.isFinite(row.startsAtMs));
        const normalizedLastEndMs = lastEndMs
          ? (Number.isFinite(lastEndMs.endsAtMs) ? lastEndMs.endsAtMs : lastEndMs.startsAtMs)
          : Number.NaN;
        return {
          key,
          title: formatMonthLabel(key),
          rows: sortedRows,
          firstStartMs,
          lastEndMs: normalizedLastEndMs,
        };
      })
      .sort((a, b) => {
        const aMs = Number.isFinite(a.firstStartMs) ? a.firstStartMs : Number.MAX_SAFE_INTEGER;
        const bMs = Number.isFinite(b.firstStartMs) ? b.firstStartMs : Number.MAX_SAFE_INTEGER;
        return aMs - bMs;
      });
  }, [hydratedSessions]);

  const defaultOpenCycleKey = useMemo(() => {
    if (!grouped.length) return null;
    const active = grouped.find(
      (group) =>
        Number.isFinite(group.firstStartMs) &&
        Number.isFinite(group.lastEndMs) &&
        nowMs >= group.firstStartMs &&
        nowMs <= group.lastEndMs
    );
    if (active) return active.key;
    const upcoming = grouped.find((group) => Number.isFinite(group.firstStartMs) && nowMs < group.firstStartMs);
    if (upcoming) return upcoming.key;
    return grouped[grouped.length - 1]?.key || null;
  }, [grouped, nowMs]);

  const selectedSession = hydratedSessions.find((session) => session.id === openSessionId) || null;
  const selectedItems = selectedSession ? itemsBySession[selectedSession.id] || [] : [];
  const slidesItem =
    selectedItems.find((item) => item.type === "slides" || String(item.url || "").includes("docs.google.com/presentation")) || null;
  const selectedExerciseGroups = groupExerciseItems(selectedItems.filter((item) => isExerciseItem(item)));
  const selectedResources = [
    ...selectedItems.filter((item) => !isExerciseItem(item)).map((item) => ({ ...item, resource_kind: "item" })),
    ...selectedExerciseGroups.map((group) => ({
      id: `exercise-group:${group.key}`,
      title: group.title,
      type: "prueba",
      url: group.url,
      note: group.note,
      exercise_count: group.count,
      has_linked_exercise: group.hasLinkedExercise,
      resource_kind: "exercise_group",
    })),
  ];
  const firstExerciseGroupUrl = selectedExerciseGroups[0]?.url || null;
  const primaryResourceUrl = selectedResources[0]?.url || null;
  const resolvedPrimaryUrl = slidesItem?.url || firstExerciseGroupUrl || primaryResourceUrl;
  const embedUrl = toSlidesEmbedUrl(slidesItem?.url);

  function toggleMonth(monthKey) {
    setOpenCycleMap((previous) => ({ ...previous, [monthKey]: !previous[monthKey] }));
  }

  function toggleClass(sessionId, disabled) {
    if (disabled) return;
    setExpandedSessionMap((previous) => ({ ...previous, [sessionId]: !previous[sessionId] }));
  }

  function openMaterial(sessionId, disabled) {
    if (disabled) return;
    setOpenSessionId(sessionId);
  }

  function handleCardClick(event, sessionId, disabled) {
    if (disabled) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-no-toggle='true']")) return;
    if (target.closest("a,button,input,textarea,select,label")) return;
    toggleClass(sessionId, false);
  }

  return (
    <>
      <div className="space-y-4">
        {grouped.map((group) => {
          const open = Object.prototype.hasOwnProperty.call(openCycleMap, group.key)
            ? Boolean(openCycleMap[group.key])
            : (Object.keys(openCycleMap).length === 0 && defaultOpenCycleKey === group.key);
          const status = getGroupStatus(group, nowMs);
          const monthLocked = allowedMonthSet.size > 0 && !allowedMonthSet.has(group.key);
          return (
            <section key={group.key} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <button
                type="button"
                onClick={() => toggleMonth(group.key)}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 text-left transition hover:bg-surface-2"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{group.title}</p>
                  <p className="text-xs text-muted">{group.rows.length} clases</p>
                </div>
                <div className="flex items-center gap-2">
                  {monthLocked ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                      <LockIcon />
                      Disponible al renovar
                    </span>
                  ) : null}
                  <GroupStatusBadge status={status} />
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2 text-muted">
                    <ChevronIcon open={open} />
                  </span>
                </div>
              </button>

              {open ? (
                <div className="space-y-4 p-4">
                  {group.rows.map((session, idx) => {
                    const classExpanded = Boolean(expandedSessionMap[session.id]) && !monthLocked;
                    const classItems = itemsBySession[session.id] || [];
                    const slidesItems = classItems.filter((item) => isSlidesItem(item));
                    const videoItems = classItems.filter((item) => isVideoItem(item));
                    const exerciseItems = classItems.filter((item) => isExerciseItem(item));
                    const exerciseGroups = groupExerciseItems(exerciseItems);
                    const extraPresentationItems = slidesItems.slice(1);
                    const hasDetails = Boolean(extraPresentationItems.length || videoItems.length || exerciseGroups.length);
                    const hasLiveLink = Boolean(session.live_link) && !monthLocked;
                    const hasRecordingLink = Boolean(session.recording_link) && !monthLocked;

                    return (
                      <div key={session.id} className="relative pl-8">
                        {idx < group.rows.length - 1 ? (
                          <span className="absolute left-[11px] top-8 h-[calc(100%-10px)] w-px bg-primary/25" />
                        ) : null}
                        <span className="absolute left-0 top-6 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface">
                          <StatusDot completed={session.afterEnd} live={session.inLiveWindow} />
                        </span>

                        <article
                          onClick={(event) => handleCardClick(event, session.id, monthLocked)}
                          className={`rounded-lg border border-border bg-surface-2 px-4 py-4 transition ${monthLocked ? "opacity-85" : "hover:border-primary/45 hover:bg-surface"} ${monthLocked ? "" : "cursor-pointer"}`}
                        >
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{session.smallDateLabel}</p>
                                <RowStatusLabel session={session} />
                              </div>
                              <p className="text-2xl font-semibold leading-tight text-foreground">{session.title}</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {hasLiveLink ? (
                                <a
                                  data-no-toggle="true"
                                  href={session.live_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-md border border-primary/45 bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                                >
                                  Unirse a la clase
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  data-no-toggle="true"
                                  className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary/70 disabled:cursor-not-allowed disabled:opacity-85"
                                >
                                  Unirse a la clase
                                </button>
                              )}

                              {hasRecordingLink ? (
                                <a
                                  data-no-toggle="true"
                                  href={session.recording_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                >
                                  Ver grabacion
                                </a>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => openMaterial(session.id, monthLocked)}
                                disabled={monthLocked}
                                data-no-toggle="true"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/5 text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Ver material"
                              >
                                <FolderIcon />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleClass(session.id, monthLocked)}
                                disabled={monthLocked}
                                data-no-toggle="true"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary/25 bg-primary/5 text-primary/80 transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Expandir clase"
                              >
                                <ChevronIcon open={classExpanded} />
                              </button>
                            </div>
                          </div>

                          {classExpanded ? (
                            <div className="mt-4 space-y-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
                              {extraPresentationItems.length ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Presentaciones extra</p>
                                  {extraPresentationItems.map((item) => (
                                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-surface px-3 py-2">
                                      <p className="text-sm font-semibold text-foreground">{item.title || "Presentacion"}</p>
                                      {item.url ? (
                                        <a
                                          href={item.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                        >
                                          Ver presentacion
                                        </a>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled
                                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted disabled:cursor-not-allowed"
                                        >
                                          Ver presentacion
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {videoItems.length ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Videos</p>
                                  {videoItems.map((item) => (
                                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-surface px-3 py-2">
                                      <p className="text-sm font-semibold text-foreground">{item.title || "Video"}</p>
                                      {item.url ? (
                                        <a
                                          href={item.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                        >
                                          Ver video
                                        </a>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled
                                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted disabled:cursor-not-allowed"
                                        >
                                          Ver video
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {exerciseGroups.length ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Pruebas</p>
                                  {exerciseGroups.map((group) => (
                                    <div
                                      key={group.key}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-surface px-3 py-2"
                                    >
                                      <div>
                                        <p className="text-sm font-semibold text-foreground">{group.title || "Prueba de clase"}</p>
                                        <p className="text-xs text-muted">
                                          {group.count} ejercicio{group.count === 1 ? "" : "s"}
                                        </p>
                                        {group.note ? <p className="text-xs text-muted">{group.note}</p> : null}
                                      </div>
                                      {group.url ? (
                                        <a
                                          href={group.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                        >
                                          {group.hasLinkedExercise ? "Realizar prueba" : "Abrir recurso"}
                                        </a>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled
                                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted disabled:cursor-not-allowed"
                                        >
                                          Sin enlace
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {!hasDetails ? (
                                <p className="text-sm text-muted">Aun no hay contenido extra para esta clase.</p>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <AppModal
        open={Boolean(selectedSession)}
        onClose={() => setOpenSessionId(null)}
        title={selectedSession ? selectedSession.title : "Material de clase"}
        widthClass="max-w-5xl"
      >
        <div className="space-y-4">
          {embedUrl ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface-2">
              <iframe
                title="Google Slides"
                src={embedUrl}
                className="h-[420px] w-full"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface-2 px-4 py-6 text-sm text-muted">
              No hay Google Slides embebible para esta clase.
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Recursos</p>
            {selectedResources.length ? (
              <ul className="space-y-2">
                {selectedResources.map((item) => (
                  <li key={item.id} className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted">
                      {item.resource_kind === "exercise_group"
                        ? `prueba (${item.exercise_count} ejercicio${item.exercise_count === 1 ? "" : "s"})`
                        : item.type}
                    </p>
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline-offset-2 hover:underline"
                      >
                        {item.resource_kind === "exercise_group" && item.has_linked_exercise ? "Realizar prueba" : "Abrir recurso"}
                      </a>
                    ) : (
                      <p className="text-xs text-muted">Sin URL para este recurso.</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Esta clase aun no tiene material cargado.</p>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setOpenSessionId(null)}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Cerrar
            </button>
            <a
              href={resolvedPrimaryUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                resolvedPrimaryUrl
                  ? "bg-primary text-primary-foreground hover:bg-primary-2"
                  : "pointer-events-none border border-border text-muted"
              }`}
            >
              Abrir en otra ventana
            </a>
          </div>
        </div>
      </AppModal>
    </>
  );
}
