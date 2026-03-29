"use client";

import { useEffect, useMemo, useState } from "react";
import AppModal from "@/components/app-modal";
import CourseSessionFlashcardsViewer from "@/components/course-session-flashcards-viewer";
import { formatMonthKeyFromDate } from "@/lib/class-format";
import { getFrequencyReference } from "@/lib/course-sessions";
import { getRemainingQuizRestarts, normalizeAttemptRow } from "@/lib/lesson-quiz";

const LIMA = "America/Lima";

function safeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeToMinutes(value) {
  if (!value) return null;
  const [hh, mm] = String(value).split(":").map(Number);
  return Number.isFinite(hh) && Number.isFinite(mm) ? (hh * 60) + mm : null;
}

function fallbackIso(dateValue, timeValue) {
  const minutes = timeToMinutes(timeValue);
  const [year, month, day] = String(dateValue || "").slice(0, 10).split("-").map(Number);
  if (!year || !month || !day || minutes == null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(Date.UTC(year, month - 1, day, hours + 5, mins, 0, 0)).toISOString();
}

function monthKey(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-01` : null;
}

function dayKey(value) {
  const date = safeDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: LIMA, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return map.year && map.month && map.day ? `${map.year}-${map.month}-${map.day}` : "";
}

function shortDateTime(value) {
  const date = safeDate(value);
  if (!date) return "TBD";
  const dayMonth = new Intl.DateTimeFormat("es-PE", { timeZone: LIMA, day: "2-digit", month: "short" }).format(date).replace(/\./g, "").toUpperCase();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: LIMA, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${dayMonth} • ${time}`;
}

function startDateLabel(value) {
  const date = safeDate(value);
  if (!date) return "TBD";
  const formatted = new Intl.DateTimeFormat("es-PE", { timeZone: LIMA, day: "2-digit", month: "long" }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function monthTitle(value) {
  if (!value) return { chip: "--", label: "MES" };
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return { chip: "--", label: value };
  return {
    chip: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "2-digit" }).format(date),
    label: new Intl.DateTimeFormat("es-PE", { timeZone: "UTC", month: "long", year: "numeric" }).format(date).replace(/\./g, "").toUpperCase(),
  };
}

function dayBox(value) {
  const date = safeDate(value);
  if (!date) return { day: "--", month: "---" };
  return {
    day: new Intl.DateTimeFormat("en-GB", { timeZone: LIMA, day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("es-PE", { timeZone: LIMA, month: "short" }).format(date).replace(/\./g, "").toUpperCase(),
  };
}

function isSlides(item) {
  const type = String(item?.type || "").toLowerCase();
  const url = String(item?.url || "").toLowerCase();
  return type === "slides" || url.includes("docs.google.com/presentation");
}

function isFlashcards(item) {
  return String(item?.type || "").trim().toLowerCase() === "flashcards";
}

function isExercise(item) {
  const type = String(item?.type || "").toLowerCase();
  return type === "exercise" || (type === "file" && (item?.lesson_id || item?.exercise_id));
}

function testGroups(items = []) {
  const map = new Map();
  for (const item of items) {
    const lessonId = String(item?.lesson_id || "").trim();
    const key = lessonId || String(item?.exercise_id || item?.id || "").trim();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: String(item?.title || "").trim() || "Prueba de clase",
        lessonId,
        url: lessonId ? `/app/clases/${lessonId}/prueba` : String(item?.url || "").trim() || null,
      });
    }
  }
  return Array.from(map.values());
}

function openUrl(url) {
  const safe = String(url || "").trim();
  if (safe) window.open(safe, "_blank", "noopener,noreferrer");
}

function toSlidesEmbedUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  if (raw.includes("/embed")) return raw;
  const match = raw.match(/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (!match?.[1]) return null;
  return `https://docs.google.com/presentation/d/${match[1]}/embed?start=false&loop=false&delayms=3000`;
}

function sessionAction(row) {
  if (!row) return null;
  if (row.afterEnd && row.recording_link) {
    return { href: row.recording_link, label: "Ver grabacion" };
  }
  if (row.live_link) {
    return { href: row.live_link, label: row.inLiveWindow ? "Unirse a la sesion" : "Ir a clase" };
  }
  return null;
}

function stopCardToggle(event) {
  event.stopPropagation();
}

function ResourceRow({ item, sessionId, onOpenFlashcards, onOpenMaterial }) {
  const baseClass = "flex w-full items-center gap-3 rounded-[14px] border border-[rgba(16,52,116,0.08)] px-3 py-3 text-left transition hover:bg-[#f8fbff]";
  const label = item.title || "Recurso";

  if (isFlashcards(item)) {
    return (
      <button type="button" onClick={() => onOpenFlashcards(sessionId)} className={baseClass}>
        <FolderIcon />
        <span className="truncate text-[16px] font-medium text-[#1f2432]">{label}</span>
      </button>
    );
  }

  if (isSlides(item) && item.url) {
    return (
      <button type="button" onClick={() => onOpenMaterial(item)} className={baseClass}>
        <DocumentIcon />
        <span className="truncate text-[16px] font-medium text-[#1f2432]">{label}</span>
      </button>
    );
  }

  if (item.url) {
    return (
      <button type="button" onClick={() => openUrl(item.url)} className={baseClass}>
        <DocumentIcon />
        <span className="truncate text-[16px] font-medium text-[#1f2432]">{label}</span>
      </button>
    );
  }

  return (
    <div className={baseClass}>
      <DocumentIcon />
      <span className="truncate text-[16px] font-medium text-[#1f2432]">{label}</span>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.8 15 12l-5 3.2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#103474]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3.5h6l4 4V20a.5.5 0 0 1-.5.5h-9A2.5 2.5 0 0 1 5 18V6a2.5 2.5 0 0 1 2-2.5Z" />
      <path d="M13 3.5V8h4" />
      <path d="M8.5 12H15M8.5 15.5H15M8.5 19H13" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#103474]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6A2.5 2.5 0 0 1 20.5 9.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5Z" />
    </svg>
  );
}

function MedalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="10" r="4.5" />
      <path d="M9.5 14.5 8 21l4-2 4 2-1.5-6.5" />
      <path d="M10.5 10.5 12 9l1.5 1.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 9h16" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M10 17h4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v10" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function ScheduleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#103474]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function LanguageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#103474]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h8M8 4v2c0 4-2 7-4 8" />
      <path d="m6 12 2 2 2 2" />
      <path d="M14 18 18 6l4 12" />
      <path d="M15.3 14h5.4" />
    </svg>
  );
}

function SchoolIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#103474]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m3 9 9-5 9 5-9 5-9-5Z" />
      <path d="M7 11.5V16l5 3 5-3v-4.5" />
    </svg>
  );
}

function EventIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#103474]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 9h16" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#103474]" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.8-2.5 2.1-2.5 4.2" />
      <path d="M12 17v1.5" />
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

function ChevronIcon({ open = false }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function CourseBody({
  commission,
  firstSessionDate,
  sessions,
  itemsBySession = {},
  quizAttemptsByLesson = {},
  metrics,
  gradeSummary,
  nowIso,
  allowedMonths = [],
  initialFocusSessionId = null,
}) {
  const [expanded, setExpanded] = useState({});
  const [showOnlyUnlocked, setShowOnlyUnlocked] = useState(false);
  const [flashcardSessionId, setFlashcardSessionId] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const nowMs = new Date(nowIso || "1970-01-01T00:00:00.000Z").getTime();
  const today = dayKey(new Date(nowMs));
  const allowed = useMemo(() => new Set((allowedMonths || []).map((value) => monthKey(value)).filter(Boolean)), [allowedMonths]);

  const hydrated = useMemo(() => (sessions || []).map((session, index) => {
    const startsAt = session.starts_at || fallbackIso(session.session_date, commission?.start_time);
    const endsAt = session.ends_at || fallbackIso(session.session_date, commission?.end_time);
    const startMs = safeDate(startsAt)?.getTime() ?? Number.NaN;
    const endMs = safeDate(endsAt)?.getTime() ?? Number.NaN;
    const cycleKey = monthKey(session?.cycle_month) || formatMonthKeyFromDate(startsAt || session.session_date);
    const locked = allowed.size > 0 && !allowed.has(cycleKey);
    const items = itemsBySession[session.id] || [];
    const slide = items.find((item) => isSlides(item)) || null;
    const exercises = testGroups(items.filter((item) => isExercise(item)));
    const primaryExercise = exercises[0] || null;
    const attempt = primaryExercise?.lessonId ? normalizeAttemptRow(quizAttemptsByLesson[primaryExercise.lessonId] || null, 0) : null;
    const scoreValue = attempt?.score_percent != null ? Math.round(Number(attempt.score_percent)) : null;
    const resultsUrl = primaryExercise?.lessonId ? `/app/clases/${primaryExercise.lessonId}/prueba/resultados` : null;
    const retryUrl = primaryExercise?.lessonId ? `/app/clases/${primaryExercise.lessonId}/prueba` : null;
    const flashcardItem = items.find((item) => isFlashcards(item)) || null;
    const itemsNoTests = items.filter((item) => !isExercise(item));
    return {
      ...session,
      startsAt,
      endsAt,
      cycleKey,
      locked,
      inLiveWindow: Number.isFinite(startMs) && Number.isFinite(endMs) && nowMs >= startMs && nowMs <= endMs,
      afterEnd: Number.isFinite(endMs) && nowMs > endMs,
      beforeStart: Number.isFinite(startMs) && nowMs < startMs,
      isClassDay: dayKey(startsAt || session.session_date) === today,
      title: String(slide?.title || session.day_label || `Clase ${String(session.session_in_cycle || session.session_index || index + 1).padStart(2, "0")}`).trim(),
      classLabel: `Clase ${String(session.session_in_cycle || session.session_index || index + 1).padStart(2, "0")}`,
      scoreValue,
      resultsUrl,
      retryUrl,
      canRetry: Boolean(attempt && String(attempt.attempt_status || "").toLowerCase() === "completed" && getRemainingQuizRestarts(attempt) > 0),
      primaryTest: primaryExercise,
      primarySlide: slide,
      flashcardItem,
      resources: itemsNoTests,
      dateBox: dayBox(startsAt || session.session_date),
    };
  }), [allowed, commission?.end_time, commission?.start_time, itemsBySession, nowMs, quizAttemptsByLesson, sessions, today]);

  const featured = useMemo(() => hydrated.find((row) => !row.locked && row.inLiveWindow) || hydrated.find((row) => !row.locked && !row.afterEnd) || hydrated.at(-1) || null, [hydrated]);
  const latestCompleted = useMemo(() => [...hydrated].reverse().find((row) => !row.locked && row.afterEnd) || null, [hydrated]);
  const groups = useMemo(() => {
    const map = new Map();
    hydrated.forEach((row) => {
      const current = map.get(row.cycleKey) || [];
      current.push(row);
      map.set(row.cycleKey, current);
    });
    return Array.from(map.entries()).map(([key, rows]) => ({ key, rows, locked: rows.every((row) => row.locked), first: rows[0] })).sort((a, b) => (safeDate(a.first?.startsAt)?.getTime() || 0) - (safeDate(b.first?.startsAt)?.getTime() || 0));
  }, [hydrated]);

  const visibleGroups = showOnlyUnlocked ? groups.filter((group) => !group.locked) : groups;
  const frequency = getFrequencyReference(commission?.modality_key)?.classDays?.length;
  const cycleYear = String(firstSessionDate || commission?.start_date || "").slice(0, 4) || "----";
  const heroTitle = `${String(commission?.course_level || "Curso").toUpperCase()} (${cycleYear} - CICLO ${commission?.commission_number || 1})`;
  const progressPercent = Number(metrics?.progress || 0);
  const remaining = Math.max(0, Number(metrics?.total || 0) - Number(metrics?.completed || 0));
  const gradeTen = gradeSummary?.finalGrade != null ? (Math.round(Number(gradeSummary.finalGrade)) / 10).toFixed(1) : "--";
  const certificateReady = progressPercent >= 80;
  const heroTarget = featured?.inLiveWindow && featured?.live_link
    ? { type: "link", href: featured.live_link }
    : latestCompleted?.recording_link
      ? { type: "link", href: latestCompleted.recording_link }
      : latestCompleted?.primarySlide?.url
        ? { type: "link", href: latestCompleted.primarySlide.url }
        : latestCompleted?.primaryTest?.url
          ? { type: "link", href: latestCompleted.primaryTest.url }
          : { type: "scroll", id: featured ? `session-${featured.id}` : "course-timeline" };

  const flashcardSession = hydrated.find((row) => row.id === flashcardSessionId) || null;
  const flashcards = Array.isArray(flashcardSession?.flashcardItem?.flashcards) ? flashcardSession.flashcardItem.flashcards : [];
  const selectedMaterialUrl = String(selectedMaterial?.url || "").trim();
  const selectedMaterialTitle = String(selectedMaterial?.title || "").trim() || "Presentacion de clase";
  const selectedMaterialEmbedUrl = toSlidesEmbedUrl(selectedMaterialUrl);

  useEffect(() => {
    const sessionId = String(initialFocusSessionId || "").trim();
    if (!sessionId) return undefined;

    let firstTimer = null;
    let secondTimer = null;
    const focusTarget = () => {
      const element = document.getElementById(`session-${sessionId}`);
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `/app/curso#session-${sessionId}`);
    };

    firstTimer = window.setTimeout(focusTarget, 80);
    secondTimer = window.setTimeout(focusTarget, 360);

    return () => {
      if (firstTimer) window.clearTimeout(firstTimer);
      if (secondTimer) window.clearTimeout(secondTimer);
    };
  }, [initialFocusSessionId]);

  return (
    <>
      <section className="space-y-12 rounded-[32px] bg-[#f3f5f8] px-5 py-8 text-foreground sm:px-8 lg:px-10">
        <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="inline-flex rounded-full bg-[#dfe8ff] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#103474]">Ciclo Academico Actual</span>
            <h1 className="mt-5 text-[2.35rem] font-semibold tracking-[-0.04em] text-[#103474] sm:text-[3rem]">{heroTitle}</h1>
            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-[15px] text-[#6f7789]">
              <span className="inline-flex items-center gap-2"><ScheduleIcon />Frecuencia: <span className="font-medium text-[#1f2432]">{frequency ? `${frequency} clases/sem` : "Horario por confirmar"}</span></span>
              <span className="inline-flex items-center gap-2"><LanguageIcon />Idioma: <span className="font-medium text-[#1f2432]">English</span></span>
              <span className="inline-flex items-center gap-2"><SchoolIcon />Nivel: <span className="font-medium text-[#1f2432]">{commission?.commission_number ? `Comision ${commission.commission_number}` : "Ruta activa"}</span></span>
              <span className="inline-flex items-center gap-2"><EventIcon />Fecha Inicio: <span className="font-medium text-[#1f2432]">{startDateLabel(firstSessionDate || commission?.start_date)}</span></span>
            </div>
          </div>
          {heroTarget.type === "link" ? (
            <a href={heroTarget.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[68px] w-full items-center justify-center gap-3 rounded-[18px] bg-[#103474] px-7 py-4 text-base font-semibold text-white shadow-[0_18px_44px_rgba(16,52,116,0.24)] lg:w-auto"><PlayIcon />Continuar ultima clase</a>
          ) : (
            <button type="button" onClick={() => document.getElementById(heroTarget.id)?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex min-h-[68px] w-full items-center justify-center gap-3 rounded-[18px] bg-[#103474] px-7 py-4 text-base font-semibold text-white shadow-[0_18px_44px_rgba(16,52,116,0.24)] lg:w-auto"><PlayIcon />Continuar ultima clase</button>
          )}
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-[22px] border border-[rgba(16,52,116,0.08)] bg-white px-6 py-6 shadow-[0_12px_28px_rgba(16,52,116,0.06)]">
            <div className="flex items-center justify-between"><span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#535866]">Progreso actual</span><span className="text-[38px] font-semibold text-[#103474]">{progressPercent}%</span></div>
            <div className="mt-5 h-4 w-full overflow-hidden rounded-full bg-[#d9e3ff]"><div className="h-full rounded-full bg-[#103474]" style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} /></div>
            <p className="mt-4 text-[15px] leading-7 text-[#535866]">{remaining > 0 ? `Faltan ${remaining} clases para completar el nivel ${commission?.course_level || "actual"}.` : "Has completado todas las clases disponibles de este nivel."}</p>
          </article>
          <article className="rounded-[22px] border border-[rgba(16,52,116,0.08)] bg-white px-6 py-6 shadow-[0_12px_28px_rgba(16,52,116,0.06)]">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#535866]">Promedio notas</span>
            <div className="mt-3 flex items-end gap-2"><span className="text-[38px] font-semibold text-[#103474]">{gradeTen}</span><span className="pb-1 text-[18px] text-[#9aa2b4]">/ 10</span></div>
            <div className="mt-6 inline-flex items-center gap-2 rounded-[12px] bg-[#dfe8ff] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c6780]">{gradeSummary?.assignedQuizCount ? `${gradeSummary.completedQuizCount}/${gradeSummary.assignedQuizCount} pruebas completadas` : "Sin pruebas calificadas"}</div>
          </article>
          <article className="flex items-center gap-5 rounded-[22px] border-2 border-dashed border-[rgba(16,52,116,0.12)] bg-[#f6f7f9] px-6 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e2e5ea] text-2xl text-[#8a90a0]"><MedalIcon /></div>
            <div><p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#535866]">Certificado</p><p className="mt-1 text-[15px] font-medium italic text-[#535866]">{certificateReady ? "Requisito cumplido" : "No disponible aun"}</p><p className="mt-1 text-[12px] text-[#98a0b2]">{certificateReady ? "Completaste el 80% del curso." : "Completa el 80% del curso"}</p></div>
          </article>
        </section>

        <section id="course-timeline" className="space-y-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div><h2 className="text-[2.15rem] font-semibold tracking-[-0.04em] text-[#103474]">Cronograma de Clases</h2><p className="mt-1 text-[15px] font-medium text-[#6f7789]">Sigue tu ruta de aprendizaje semana a semana</p></div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShowOnlyUnlocked((value) => !value)} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition ${showOnlyUnlocked ? "bg-[#dfe8ff] text-[#103474]" : "bg-white text-[#103474]"}`}><FilterIcon />Filtrar</button>
              <a href="/api/calendar/ics" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#103474]" aria-label="Descargar calendario"><DownloadIcon /></a>
            </div>
          </div>

          <div className="space-y-14">
            {visibleGroups.map((group) => {
              const heading = monthTitle(group.key);
              return (
                <section key={group.key} className="relative">
                  <div className="flex items-center gap-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl font-semibold ${group.locked ? "bg-[#edf0f6] text-[#6d7587]" : "bg-[#dfe8ff] text-[#103474]"}`}>{heading.chip}</span><h3 className={`text-2xl font-semibold tracking-[0.12em] ${group.locked ? "text-[#656d80]" : "text-[#103474]"}`}>{heading.label}</h3><div className="h-px flex-1 bg-[rgba(16,52,116,0.18)]" /></div>
                  <div className={`relative ml-6 mt-8 border-l-2 border-dashed ${group.locked ? "border-[rgba(16,52,116,0.12)]" : "border-[rgba(16,52,116,0.18)]"} pl-10`}>
                    {group.locked ? (
                      <div className="rounded-[22px] border border-dashed border-[rgba(16,52,116,0.16)] bg-[#f4f5f8] px-6 py-10 text-center text-[#667089]">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl text-[#7a8293]"><CalendarIcon /></div>
                        <p className="mx-auto mt-5 max-w-3xl text-[15px] leading-7">{`${group.rows.length} clases programadas para este mes. El cronograma se habilitara al completar el modulo anterior.`}</p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {group.rows.map((row) => {
                          const featuredRow = row.id === featured?.id;
                          const open = Object.prototype.hasOwnProperty.call(expanded, row.id)
                            ? Boolean(expanded[row.id])
                            : featuredRow || String(initialFocusSessionId || "").trim() === String(row.id || "").trim();
                          const rowAction = sessionAction(row);
                          const toggleCard = () => setExpanded((current) => ({ ...current, [row.id]: !open }));
                          return (
                            <div key={row.id} className="relative">
                              <span className={`absolute -left-[51px] top-7 h-5 w-5 rounded-full border-4 border-[#f3f5f8] ${featuredRow ? "bg-[#103474] ring-4 ring-[#dfe8ff]" : row.afterEnd ? "bg-[#34c37b] ring-4 ring-[#e7f8ef]" : "bg-[#d2d8e4] ring-4 ring-[#eef1f6]"}`} />
                              {featuredRow ? (
                                <article id={`session-${row.id}`} role="button" tabIndex={0} onClick={toggleCard} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleCard(); } }} className="overflow-hidden rounded-[24px] border-2 border-[#103474] bg-white shadow-[0_28px_70px_rgba(16,52,116,0.18)] ring-4 ring-[#dfe8ff] transition hover:shadow-[0_32px_78px_rgba(16,52,116,0.2)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#dfe8ff]">
                                  <div className="flex flex-col gap-5 bg-[#f8fbff] px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="flex items-center gap-5"><div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-[14px] bg-white text-[#103474] shadow-sm"><span className="text-lg font-semibold leading-none">{row.dateBox.day}</span><span className="mt-1 text-[15px] font-semibold leading-none">{row.dateBox.month}</span></div><div><div className="flex flex-wrap items-center gap-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#103474]">{row.classLabel}</p><span className="rounded-full bg-[#103474] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">{row.inLiveWindow ? "En vivo" : "Clase activa"}</span></div><h4 className="mt-2 text-[20px] font-semibold leading-tight text-[#103474] sm:text-[22px]">{row.title}</h4></div></div>
                                    <div className="flex items-center gap-3">{rowAction ? <a href={rowAction.href} target="_blank" rel="noopener noreferrer" onClick={stopCardToggle} className="inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-[#103474] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(16,52,116,0.25)]"><PlayIcon />{rowAction.label}</a> : null}<button type="button" onClick={(event) => { stopCardToggle(event); toggleCard(); }} className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[rgba(16,52,116,0.18)] bg-white text-[#103474]"><ChevronIcon open={open} /></button></div>
                                  </div>
                                  {open ? <div onClick={stopCardToggle} className="grid gap-8 border-t border-[rgba(16,52,116,0.08)] bg-[#fcfdff] px-6 py-8 lg:grid-cols-2"><div><h5 className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-[0.1em] text-[#103474]"><FolderIcon />Material de clase</h5><div className="mt-6 space-y-3">{row.resources.length ? row.resources.map((item) => <ResourceRow key={item.id} item={item} sessionId={row.id} onOpenFlashcards={setFlashcardSessionId} onOpenMaterial={setSelectedMaterial} />) : <div className="rounded-[16px] border border-dashed border-[rgba(16,52,116,0.14)] bg-white px-4 py-5 text-sm text-[#667089]">Material pendiente de carga para esta clase.</div>}</div></div><div><h5 className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-[0.1em] text-[#103474]"><QuizIcon />Evaluacion</h5><div className="mt-6 rounded-[20px] border border-[rgba(16,52,116,0.08)] bg-[#f8fafc] p-6">{row.primaryTest ? <><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#667089]">Test</p><h6 className="mt-2 text-[19px] font-semibold leading-tight text-[#103474]">{row.primaryTest.title}</h6><div className="mt-6 flex flex-col gap-4 rounded-[14px] border border-[rgba(16,52,116,0.08)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#667089]">Tu resultado</p><p className="mt-2 text-xl font-semibold text-[#103474]">{row.scoreValue != null ? (row.scoreValue / 10).toFixed(1) : "—"}<span className="ml-2 text-sm font-normal text-[#667089]">/ 10</span></p></div>{row.resultsUrl ? <a href={row.resultsUrl} onClick={stopCardToggle} className="inline-flex min-h-11 items-center justify-center rounded-[12px] bg-[#103474] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white">Ver resultado</a> : row.primaryTest.url ? <a href={row.canRetry ? row.retryUrl : row.primaryTest.url} onClick={stopCardToggle} className="inline-flex min-h-11 items-center justify-center rounded-[12px] bg-[#103474] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white">{row.canRetry ? "Intentar test" : "Iniciar test"}</a> : <button type="button" disabled className="inline-flex min-h-11 items-center justify-center rounded-[12px] bg-[#dfe3eb] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#7c8498]">Sin acceso</button>}</div></> : <div className="rounded-[14px] border border-dashed border-[rgba(16,52,116,0.14)] bg-white px-4 py-5 text-sm text-[#667089]">Aun no hay una evaluacion asignada para esta clase.</div>}</div></div></div> : null}
                                </article>
                              ) : (
                                <article id={`session-${row.id}`} role="button" tabIndex={0} onClick={toggleCard} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleCard(); } }} className={`rounded-[20px] border px-6 py-6 transition hover:shadow-[0_12px_28px_rgba(16,52,116,0.08)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#dfe8ff] ${row.afterEnd ? "border-[rgba(16,52,116,0.08)] bg-white shadow-[0_8px_24px_rgba(16,52,116,0.06)]" : "border-[rgba(16,52,116,0.08)] bg-[#fbfcfe]"}`}>
                                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#535866]">{shortDateTime(row.startsAt || row.session_date)}</span><span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${row.afterEnd ? "bg-[#ddf7e8] text-[#11894f]" : "bg-[#e7ebf2] text-[#667089]"}`}>{row.afterEnd ? "Completado" : "Proxima"}</span></div><h4 className="mt-4 text-[20px] font-semibold leading-tight text-[#103474]">{row.title}</h4></div><div className="flex flex-wrap items-center justify-end gap-3 lg:flex-nowrap">{row.afterEnd ? <div className="flex flex-col items-end gap-1"><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#535866]">Nota Test</span><span className="text-[22px] font-semibold text-[#103474]">{row.scoreValue != null ? (row.scoreValue / 10).toFixed(1) : "--"}</span></div> : <span className="inline-flex items-center gap-2 rounded-full bg-[#eef2f8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#535866]">{new Intl.DateTimeFormat("en-GB", { timeZone: LIMA, hour: "2-digit", minute: "2-digit", hour12: false }).format(safeDate(row.startsAt || row.session_date) || new Date())}</span>}{rowAction ? <a href={rowAction.href} target="_blank" rel="noopener noreferrer" onClick={stopCardToggle} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] px-4 py-2 text-sm font-semibold ${row.afterEnd ? "border border-[rgba(16,52,116,0.12)] bg-white text-[#103474]" : "bg-[#103474] text-white shadow-[0_10px_22px_rgba(16,52,116,0.18)]"}`}><PlayIcon />{rowAction.label}</a> : !row.afterEnd ? <span className="rounded-[12px] bg-[#e7ebf1] px-5 py-2 text-sm font-semibold text-[#6b7386]">Proximamente</span> : null}<button type="button" onClick={(event) => { stopCardToggle(event); toggleCard(); }} className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-[#103474]"><ChevronIcon open={open} /></button></div></div>
                                  {open ? <div onClick={stopCardToggle} className="mt-5 rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4"><div className="flex flex-wrap gap-3">{row.recording_link ? <button type="button" onClick={(event) => { stopCardToggle(event); openUrl(row.recording_link); }} className="rounded-[12px] border border-[rgba(16,52,116,0.12)] px-4 py-2 text-sm font-semibold text-[#103474]">Ver grabacion</button> : null}{row.primarySlide?.url ? <button type="button" onClick={(event) => { stopCardToggle(event); setSelectedMaterial(row.primarySlide); }} className="rounded-[12px] border border-[rgba(16,52,116,0.12)] px-4 py-2 text-sm font-semibold text-[#103474]">Ver material</button> : null}{row.primaryTest?.url ? <a href={row.primaryTest.url} onClick={stopCardToggle} className="rounded-[12px] border border-[rgba(16,52,116,0.12)] px-4 py-2 text-sm font-semibold text-[#103474]">Ir al test</a> : null}{!row.recording_link && !row.primarySlide?.url && !row.primaryTest?.url ? <p className="text-sm text-[#667089]">Sin detalles adicionales para esta clase.</p> : null}</div></div> : null}
                                </article>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </section>

      <AppModal open={Boolean(flashcardSession)} onClose={() => setFlashcardSessionId(null)} title="Flashcards" widthClass="max-w-6xl">
        <CourseSessionFlashcardsViewer title="Flashcards" sessionTitle={flashcardSession?.title || "Clase"} sessionId={String(flashcardSession?.id || "")} flashcards={flashcards} />
      </AppModal>

      <AppModal open={Boolean(selectedMaterial)} onClose={() => setSelectedMaterial(null)} title={selectedMaterialTitle} widthClass="max-w-6xl">
        <div className="space-y-4">
          {selectedMaterialEmbedUrl ? (
            <div className="overflow-hidden rounded-[22px] border border-[rgba(16,52,116,0.1)] bg-white shadow-[0_18px_44px_rgba(16,52,116,0.08)]">
              <div className="aspect-[16/9] w-full bg-[#eef3ff]">
                <iframe src={selectedMaterialEmbedUrl} title={selectedMaterialTitle} className="h-full w-full border-0" allowFullScreen />
              </div>
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-[rgba(16,52,116,0.16)] bg-white px-6 py-12 text-center text-[#667089]">
              La presentacion no esta disponible para vista previa.
            </div>
          )}
        </div>
      </AppModal>
    </>
  );
}


