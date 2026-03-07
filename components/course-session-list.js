"use client";

import { useMemo, useState } from "react";
import AppModal from "@/components/app-modal";
import CourseSessionFlashcardsViewer from "@/components/course-session-flashcards-viewer";
import { formatMonthKeyFromDate } from "@/lib/class-format";
import { getRemainingQuizRestarts, normalizeAttemptRow } from "@/lib/lesson-quiz";

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

function toSafeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLimaDayKey(value) {
  const date = toSafeDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  if (!map.year || !map.month || !map.day) return "";
  return `${map.year}-${map.month}-${map.day}`;
}

function formatDateTimeLima(value) {
  const date = toSafeDate(value);
  if (!date) return "-";
  const weekdayRaw = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
  }).format(date);
  const weekdayLabel = weekdayRaw ? `${weekdayRaw.charAt(0).toUpperCase()}${weekdayRaw.slice(1)}` : "";
  const dayMonthLabel = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
  })
    .format(date)
    .replace(/\./g, "");
  const timeLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${weekdayLabel} ${dayMonthLabel} a las ${timeLabel}`.trim();
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

function toVimeoEmbedUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("vimeo.com")) return null;

    const playerMatch = parsed.pathname.match(/\/video\/(\d+)/i);
    if (playerMatch?.[1]) {
      const hashParam = parsed.searchParams.get("h");
      return `https://player.vimeo.com/video/${playerMatch[1]}${hashParam ? `?h=${encodeURIComponent(hashParam)}` : ""}`;
    }

    const idMatch = parsed.pathname.match(/(?:^|\/)(\d+)(?:$|\/)/);
    if (!idMatch?.[1]) return null;
    const hashParam = parsed.searchParams.get("h");
    return `https://player.vimeo.com/video/${idMatch[1]}${hashParam ? `?h=${encodeURIComponent(hashParam)}` : ""}`;
  } catch {
    return null;
  }
}

function toYouTubeEmbedUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    let videoId = "";

    if (host.includes("youtu.be")) {
      videoId = parsed.pathname.replace(/^\/+/, "").split("/")[0] || "";
    } else if (host.includes("youtube.com")) {
      if (parsed.pathname.includes("/embed/")) {
        return raw;
      }
      if (parsed.pathname.includes("/shorts/")) {
        videoId = parsed.pathname.split("/shorts/")[1]?.split("/")[0] || "";
      } else if (parsed.pathname.includes("/watch")) {
        videoId = parsed.searchParams.get("v") || "";
      } else if (parsed.pathname.includes("/live/")) {
        videoId = parsed.pathname.split("/live/")[1]?.split("/")[0] || "";
      }
    }

    if (!videoId) return null;
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
  } catch {
    return null;
  }
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
  const baseClass = "inline-flex h-4 w-4 rounded-full border sm:h-5 sm:w-5";

  if (completed) {
    return <span className={`${baseClass} border-blue-500 bg-blue-500`} />;
  }

  if (live) {
    return <span className={`${baseClass} border-red-500 bg-red-500`} />;
  }

  return <span className={`${baseClass} border-border bg-surface-2`} />;
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

function isPrimarySlideItem(item) {
  const note = String(item?.note || "").trim().toLowerCase();
  return note === "primary_slide" || note === "template:primary_slide";
}

function isInternalSystemNote(note) {
  const safeNote = String(note || "").trim().toLowerCase();
  if (!safeNote) return false;
  if (safeNote.startsWith("template:")) return true;
  if (safeNote === "primary_slide") return true;
  if (safeNote === "extra_slide") return true;
  return false;
}

function getVisibleNote(note) {
  const safeNote = String(note || "").trim();
  if (!safeNote) return null;
  if (isInternalSystemNote(safeNote)) return null;
  return safeNote;
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

function isExternalLinkItem(item) {
  return String(item?.type || "").trim().toLowerCase() === "link";
}

function isExerciseItem(item) {
  const type = String(item?.type || "").toLowerCase();
  if (type === "exercise") return true;
  if (type === "file") {
    return Boolean(String(item?.exercise_id || "").trim() || String(item?.lesson_id || "").trim());
  }
  return false;
}

function isFlashcardsItem(item) {
  const type = String(item?.type || "").trim().toLowerCase();
  return type === "flashcards";
}

function formatResourceTypeLabel(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "link") return "enlace";
  if (normalized === "file") return "archivo";
  if (normalized === "note") return "nota";
  if (normalized === "recording") return "grabacion";
  if (normalized === "live_link") return "clase en vivo";
  if (normalized === "video") return "video";
  if (normalized === "slides") return "presentacion";
  if (normalized === "flashcards") return "flashcards";
  if (!normalized) return "recurso";
  return normalized;
}

function getResourceActionLabel(item) {
  if (isSlidesItem(item)) return "Ver presentacion";
  if (isVideoItem(item)) return "Ver video";
  if (isFlashcardsItem(item)) return "Abrir flashcards";
  const type = String(item?.type || "").trim().toLowerCase();
  if (type === "file") return "Abrir archivo";
  if (type === "link") return "Abrir enlace";
  return "Abrir recurso";
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
        .map((item) => getVisibleNote(item?.note))
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
      lessonId:
        group.items
          .map((item) => String(item?.lesson_id || "").trim())
          .find(Boolean) || "",
      note,
      hasLinkedExercise,
    };
  });
}

export default function CourseSessionList({
  sessions,
  itemsBySession = {},
  quizAttemptsByLesson = {},
  commissionTimes = {},
  nowIso,
  allowedMonths = [],
}) {
  const [openSessionId, setOpenSessionId] = useState(null);
  const [viewerType, setViewerType] = useState("slide");
  const [openMaterialItemId, setOpenMaterialItemId] = useState(null);
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
    () => {
      const todayLimaKey = getLimaDayKey(new Date(nowMs));
      return (sessions || []).map((session, idx) => {
        const { startsAt, endsAt } = normalizeSessionTimes(session, commissionTimes);
        const startsAtMs = startsAt ? new Date(startsAt).getTime() : Number.NaN;
        const endsAtMs = endsAt ? new Date(endsAt).getTime() : Number.NaN;
        const beforeStart = Number.isFinite(startsAtMs) ? nowMs < startsAtMs : false;
        const inLiveWindow = Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs) ? nowMs >= startsAtMs && nowMs <= endsAtMs : false;
        const afterEnd = Number.isFinite(endsAtMs) ? nowMs > endsAtMs : false;
        const classLimaDayKey = getLimaDayKey(startsAt || session.session_date);
        const isClassDay = Boolean(classLimaDayKey) && classLimaDayKey === todayLimaKey;
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
          isClassDay,
          nextClassDateTimeLabel: formatDateTimeLima(startsAt || session.session_date),
          cycleKey,
          smallDateLabel: formatDateCaps(startsAt || session.session_date),
          title: session.day_label || `Clase ${String((session.session_in_cycle || session.session_index || idx + 1)).padStart(2, "0")}`,
        };
      });
    },
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
  const selectedSlidesItems = selectedItems.filter((item) => isSlidesItem(item));
  const primarySlides = selectedSlidesItems.filter((item) => isPrimarySlideItem(item));
  const slidesItem =
    primarySlides[0] ||
    selectedSlidesItems[0] ||
    null;
  const selectedSlideUrl = String(slidesItem?.url || "").trim();
  const selectedPresentationTitle = String(slidesItem?.title || "").trim() || "Presentacion de clase";
  const selectedClassTitle = String(selectedSession?.title || "").trim() || "Slide de la clase";
  const selectedRecordingLink = String(selectedSession?.recording_link || "").trim();
  const selectedRecordingPasscode = String(selectedSession?.recording_passcode || "").trim();
  const selectedFlashcardsItem = selectedItems.find((item) => isFlashcardsItem(item)) || null;
  const selectedMaterialItem =
    selectedItems.find((item) => String(item?.id || "").trim() === String(openMaterialItemId || "").trim()) || null;
  const selectedFlashcards = Array.isArray(selectedFlashcardsItem?.flashcards) ? selectedFlashcardsItem.flashcards : [];
  const embedUrl = toSlidesEmbedUrl(selectedSlideUrl);
  const recordingEmbedUrl = toVimeoEmbedUrl(selectedRecordingLink);
  const selectedMaterialUrl = String(selectedMaterialItem?.url || "").trim();
  const selectedMaterialTitle = String(selectedMaterialItem?.title || "").trim() || "Material de clase";
  const selectedMaterialType = String(selectedMaterialItem?.type || "").trim().toLowerCase();
  const selectedMaterialIsSlides = isSlidesItem(selectedMaterialItem);
  const selectedMaterialIsVideo = isVideoItem(selectedMaterialItem);
  const selectedMaterialEmbedUrl = selectedMaterialIsSlides
    ? toSlidesEmbedUrl(selectedMaterialUrl)
    : selectedMaterialIsVideo
      ? (toYouTubeEmbedUrl(selectedMaterialUrl) || toVimeoEmbedUrl(selectedMaterialUrl))
      : selectedMaterialUrl || null;

  function toggleMonth(monthKey) {
    setOpenCycleMap((previous) => ({ ...previous, [monthKey]: !previous[monthKey] }));
  }

  function toggleClass(sessionId, disabled) {
    if (disabled) return;
    setExpandedSessionMap((previous) => ({ ...previous, [sessionId]: !previous[sessionId] }));
  }

  function openSlide(sessionId, disabled) {
    if (disabled) return;
    setViewerType("slide");
    setOpenMaterialItemId(null);
    setOpenSessionId(sessionId);
  }

  function openRecording(sessionId, disabled) {
    if (disabled) return;
    setViewerType("recording");
    setOpenMaterialItemId(null);
    setOpenSessionId(sessionId);
  }

  function openFlashcards(sessionId, disabled) {
    if (disabled) return;
    setViewerType("flashcards");
    setOpenMaterialItemId(null);
    setOpenSessionId(sessionId);
  }

  function openMaterial(sessionId, itemId, disabled) {
    if (disabled) return;
    setViewerType("material");
    setOpenMaterialItemId(String(itemId || "").trim() || null);
    setOpenSessionId(sessionId);
  }

  function closeViewer() {
    setOpenSessionId(null);
    setOpenMaterialItemId(null);
    setViewerType("slide");
  }

  function openInAnotherWindow(url) {
    const safeUrl = String(url || "").trim();
    if (!safeUrl) return;
    window.open(safeUrl, "_blank", "noopener,noreferrer");
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
                    const exerciseItems = classItems.filter((item) => isExerciseItem(item));
                    const exerciseGroups = groupExerciseItems(exerciseItems);
                    const primarySlideItem =
                      slidesItems.find((item) => isPrimarySlideItem(item)) || slidesItems[0] || null;
                    const classMaterialItems = classItems.filter(
                      (item) => !isExerciseItem(item) && item.id !== primarySlideItem?.id
                    );
                    const hasDetails = Boolean(
                      classMaterialItems.length ||
                        exerciseGroups.length
                    );
                    const hasRecordingLink = Boolean(session.recording_link);
                    const canOpenRecording = hasRecordingLink && !monthLocked;
                    const hasLiveLink = Boolean(session.live_link) && !monthLocked && !hasRecordingLink;
                    const showJoinClass = hasLiveLink && Boolean(session.isClassDay);
                    const showNextClassInfo = !session.isClassDay && session.beforeStart;
                    const nextClassLabel = session.nextClassDateTimeLabel || session.smallDateLabel || "-";

                    return (
                      <div key={session.id} className="relative pl-8">
                        {idx < group.rows.length - 1 ? (
                          <span className="absolute left-[9px] top-7 h-[calc(100%-8px)] w-px bg-primary/25 sm:left-[11px] sm:top-8 sm:h-[calc(100%-10px)]" />
                        ) : null}
                        <span className="absolute left-0 top-6 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface sm:h-6 sm:w-6">
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
                              {hasRecordingLink ? (
                                canOpenRecording ? (
                                  <button
                                    type="button"
                                    onClick={() => openRecording(session.id, monthLocked)}
                                    data-no-toggle="true"
                                    className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                  >
                                    Ver grabación
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled
                                    data-no-toggle="true"
                                    className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary/70 disabled:cursor-not-allowed disabled:opacity-85"
                                  >
                                    Ver grabación
                                  </button>
                                )
                              ) : showJoinClass ? (
                                <a
                                  data-no-toggle="true"
                                  href={session.live_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-md border border-primary/45 bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                                >
                                  Unirse a la clase
                                </a>
                              ) : showNextClassInfo ? (
                                <button
                                  type="button"
                                  disabled
                                  data-no-toggle="true"
                                  className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary/70 disabled:cursor-not-allowed disabled:opacity-85"
                                >
                                  Proxima clase {nextClassLabel}
                                </button>
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

                              <button
                                type="button"
                                onClick={() => openSlide(session.id, monthLocked)}
                                disabled={monthLocked}
                                data-no-toggle="true"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/5 text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label="Ver slide"
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
                              {classMaterialItems.length ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                                    Material de clase
                                  </p>
                                  {classMaterialItems.map((item) => (
                                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-surface px-3 py-2">
                                      <div>
                                        <p className="text-sm font-semibold text-foreground">{item.title || "Recurso"}</p>
                                        <p className="text-xs uppercase tracking-wide text-muted">
                                          {formatResourceTypeLabel(item.type)}
                                        </p>
                                        {getVisibleNote(item.note) ? (
                                          <p className="text-xs text-muted">{getVisibleNote(item.note)}</p>
                                        ) : null}
                                      </div>
                                      {isFlashcardsItem(item) ? (
                                        <button
                                          type="button"
                                          onClick={() => openFlashcards(session.id, monthLocked)}
                                          className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                        >
                                          {getResourceActionLabel(item)}
                                        </button>
                                      ) : isExternalLinkItem(item) ? (
                                        <a
                                          href={item.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                        >
                                          {getResourceActionLabel(item)}
                                        </a>
                                      ) : item.url ? (
                                        <button
                                          type="button"
                                          onClick={() => openMaterial(session.id, item.id, monthLocked)}
                                          className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                        >
                                          {getResourceActionLabel(item)}
                                        </button>
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

                              {exerciseGroups.length ? (
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Test de clase</p>
                                  {exerciseGroups.map((group) => (
                                    (() => {
                                      const lessonId = String(group.lessonId || "").trim();
                                      const rawAttempt = lessonId ? quizAttemptsByLesson[lessonId] || null : null;
                                      const normalizedAttempt = rawAttempt
                                        ? normalizeAttemptRow(rawAttempt, rawAttempt?.total_exercises ?? 0)
                                        : null;
                                      const isCompleted =
                                        String(normalizedAttempt?.attempt_status || "").trim().toLowerCase() === "completed";
                                      const scoreValue =
                                        normalizedAttempt?.score_percent != null
                                          ? Math.round(Number(normalizedAttempt.score_percent))
                                          : null;
                                      const canRetry = isCompleted && getRemainingQuizRestarts(normalizedAttempt) > 0;
                                      const resultsUrl = lessonId ? `/app/clases/${lessonId}/prueba/resultados` : null;
                                      const retryUrl = lessonId ? `/app/clases/${lessonId}/prueba` : null;

                                      return (
                                        <div
                                          key={group.key}
                                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/15 bg-surface px-3 py-2"
                                        >
                                          <div>
                                            <p className="text-sm font-semibold text-foreground">{group.title || "Test de clase"}</p>
                                            {group.note ? <p className="text-xs text-muted">{group.note}</p> : null}
                                          </div>

                                          {group.hasLinkedExercise ? (
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                              {isCompleted && resultsUrl ? (
                                                <a
                                                  href={resultsUrl}
                                                  className="rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success transition hover:bg-success/20"
                                                >
                                                  {`Ver resultados${scoreValue != null ? ` [${scoreValue}%]` : ""}`}
                                                </a>
                                              ) : null}

                                              {canRetry && retryUrl ? (
                                                <a
                                                  href={retryUrl}
                                                  className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                                >
                                                  Intentar de nuevo
                                                </a>
                                              ) : null}

                                              {!isCompleted && group.url ? (
                                                <a
                                                  href={group.url}
                                                  className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                                >
                                                  Realizar test
                                                </a>
                                              ) : null}

                                              {!group.url && !resultsUrl ? (
                                                <button
                                                  type="button"
                                                  disabled
                                                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted disabled:cursor-not-allowed"
                                                >
                                                  Sin enlace
                                                </button>
                                              ) : null}
                                            </div>
                                          ) : group.url ? (
                                            <a
                                              href={group.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
                                            >
                                              Abrir recurso
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
                                      );
                                    })()
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
        onClose={closeViewer}
        title={
          viewerType === "recording"
            ? "Grabacion de clase"
            : viewerType === "material"
              ? "Material de clase"
            : viewerType === "flashcards"
              ? "Flashcards"
              : "Slide de la clase"
        }
        widthClass="max-w-6xl"
      >
        {viewerType === "slide" ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-lg font-semibold text-foreground">{selectedPresentationTitle}</p>
              <p className="text-sm text-muted">{selectedClassTitle || "Slide de la clase"}</p>
            </div>
            {embedUrl ? (
              <div className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-surface-2">
                <iframe
                  title="Slide principal"
                  src={embedUrl}
                  className="absolute inset-0 h-full w-full"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface-2 px-4 py-6 text-sm text-muted">
                Slide principal no disponible aún.
              </div>
            )}
            <div className="flex justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={() => openInAnotherWindow(selectedSlideUrl)}
                disabled={!selectedSlideUrl}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ver slide en otra ventana
              </button>
            </div>
          </div>
        ) : viewerType === "recording" ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-lg font-semibold text-foreground">{selectedClassTitle}</p>
            </div>
            {selectedRecordingLink ? (
              recordingEmbedUrl ? (
                <div className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-surface-2">
                  <iframe
                    title="Grabación Vimeo"
                    src={recordingEmbedUrl}
                    className="absolute inset-0 h-full w-full"
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-surface-2 px-4 py-4 text-sm text-muted">
                  No se puede embeber esta grabación en el aula.
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface-2 px-4 py-6 text-sm text-muted">
                Grabación no disponible aún.
              </div>
            )}
            {selectedRecordingLink ? (
              <p className="text-sm font-medium text-foreground">Contraseña: {selectedRecordingPasscode || "-"}</p>
            ) : null}
            <div className="flex justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={() => openInAnotherWindow(selectedRecordingLink)}
                disabled={!selectedRecordingLink}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ver grabación en otra ventana
              </button>
            </div>
          </div>
        ) : viewerType === "material" ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-lg font-semibold text-foreground">{selectedMaterialTitle}</p>
              <p className="text-sm text-muted">{selectedClassTitle || "Material de la clase"}</p>
            </div>
            {selectedMaterialEmbedUrl ? (
              <div className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-surface-2">
                <iframe
                  title={selectedMaterialTitle}
                  src={selectedMaterialEmbedUrl}
                  className="absolute inset-0 h-full w-full"
                  allow={selectedMaterialIsVideo ? "autoplay; fullscreen; picture-in-picture; encrypted-media" : undefined}
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-surface-2 px-4 py-6 text-sm text-muted">
                {selectedMaterialType === "video"
                  ? "Este video no se puede mostrar dentro del aula."
                  : "Este material no se puede previsualizar dentro del aula."}
              </div>
            )}
            {getVisibleNote(selectedMaterialItem?.note) ? (
              <p className="text-sm text-muted">{getVisibleNote(selectedMaterialItem?.note)}</p>
            ) : null}
            <div className="flex justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={() => openInAnotherWindow(selectedMaterialUrl)}
                disabled={!selectedMaterialUrl}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Abrir en otra ventana
              </button>
            </div>
          </div>
        ) : (
          <CourseSessionFlashcardsViewer
            key={`${String(selectedSession?.id || "session")}:${String(selectedFlashcardsItem?.id || "flashcards")}`}
            title={String(selectedFlashcardsItem?.title || "").trim() || "Flashcards"}
            sessionTitle={selectedClassTitle}
            flashcards={selectedFlashcards}
          />
        )}
      </AppModal>
    </>
  );
}
