"use client";

import Link from "next/link";
import { useState } from "react";
import { PRACTICE_MODES } from "@/lib/duolingo/practice-config";

function clampPercent(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function formatNumber(value, language) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "es-PE").format(Number(value || 0) || 0);
}

function prettify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildCopy(language) {
  if (language === "en") {
    return {
      searchPlaceholder: "Search exercises, topics or lessons...",
      heroBadge: "Session of the day",
      heroTitle: "Your Recommended Practice Today",
      heroCta: "Start now",
      heroSecondary: "View syllabus",
      moduleEyebrow: "Module exercises",
      moduleTitle: "Reinforcement Activities",
      analyticsEyebrow: "Practice analytics",
      analyticsTitle: "You are one step away from completing",
      analyticsButton: "View detailed statistics",
      overallScore: "Overall score",
      streakDays: "Streak days",
      mins: "mins",
      pending: "Pending",
      noResults: "No exercises match your search yet. Try another topic or lesson term.",
    };
  }

  return {
    searchPlaceholder: "Buscar ejercicios, temas o lecciones...",
    heroBadge: "Sesion de hoy",
    heroTitle: "Tu Practica Recomendada Hoy",
    heroCta: "Comenzar ahora",
    heroSecondary: "Ver temario",
    moduleEyebrow: "Ejercicios del modulo",
    moduleTitle: "Actividades de Refuerzo",
    analyticsEyebrow: "Analitica de practica",
    analyticsTitle: "Estas a un paso de completar el nivel",
    analyticsButton: "Ver estadisticas detalladas",
    overallScore: "Puntaje global",
    streakDays: "Dias de racha",
    mins: "mins",
    pending: "Pendiente",
    noResults: "No hay ejercicios que coincidan con tu busqueda. Prueba con otro tema o leccion.",
  };
}

function buildPracticeHref({ mode = "", skill = "", categoryId = "", scenario = "" }) {
  const params = new URLSearchParams();
  params.set("tab", "exercises");
  if (mode) params.set("mode", mode);
  if (skill) params.set("skill", skill);
  if (categoryId) params.set("category_id", categoryId);
  if (scenario) params.set("scenario", scenario);
  return `/app/practice?${params.toString()}`;
}

function estimateMinutes(mode) {
  const minutes = {
    [PRACTICE_MODES.MIXED_REVIEW]: 5,
    [PRACTICE_MODES.TOPIC]: 8,
    [PRACTICE_MODES.SCENARIO]: 15,
    [PRACTICE_MODES.TIMED]: 10,
    [PRACTICE_MODES.QUICK]: 5,
    [PRACTICE_MODES.WEAKNESS]: 12,
  };
  return minutes[mode] || 8;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ScheduleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16 10 10l4 4 6-7" />
      <path d="M20 7h-5" />
      <path d="M20 7v5" />
    </svg>
  );
}

function CardIcon({ type }) {
  const common = {
    viewBox: "0 0 24 24",
    className: "h-7 w-7",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  if (type === "style") {
    return (
      <svg {...common}>
        <path d="m7 7 8-3 4 9-8 3z" />
        <path d="m5 11 8-3 4 9-8 3z" />
      </svg>
    );
  }
  if (type === "voice") {
    return (
      <svg {...common}>
        <path d="M12 4a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z" />
        <path d="M7 11a5 5 0 0 0 10 0" />
        <path d="M12 16v4" />
        <path d="M9 20h6" />
      </svg>
    );
  }
  if (type === "note") {
    return (
      <svg {...common}>
        <path d="M8 6h11" />
        <path d="M8 10h11" />
        <path d="M8 14h7" />
        <path d="m4 18 3-1 9-9-2-2-9 9-1 3Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M6 4h12v14H6z" />
      <path d="M9 8h6" />
      <path d="M9 12h2" />
      <path d="m15 14 1.5 1.5L19 13" />
    </svg>
  );
}

function ExerciseCard({ card, copy }) {
  return (
    <Link
      href={card.href}
      className="group flex h-full flex-col gap-6 rounded-[2rem] border border-transparent bg-white p-8 transition-all hover:border-[#002a5c]/5 hover:shadow-[0px_20px_40px_rgba(0,42,92,0.06)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`rounded-2xl p-4 transition-colors ${card.iconWrapClass}`}>
          <CardIcon type={card.iconType} />
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.28em] text-slate-500">
          {card.pill}
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-bold leading-tight text-[#002a5c]">{card.title}</h3>
        <p className="text-sm leading-8 text-slate-500">{card.description}</p>
      </div>

      <div className="mt-auto space-y-4">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
          <span className="flex items-center gap-1.5">
            <ScheduleIcon />
            {card.minutes} {copy.mins}
          </span>
          <span className={card.metricClass}>{card.metricLabel}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${card.progressClass}`} style={{ width: `${card.progress}%` }} />
        </div>
      </div>
    </Link>
  );
}

function DashboardVisual() {
  return (
    <div className="group relative aspect-video w-full overflow-hidden rounded-[2rem] border-8 border-white bg-[#20292f] shadow-2xl">
      <div className="absolute inset-0 grid grid-cols-[1.1fr_0.9fr] gap-4 p-5">
        <div className="space-y-3">
          <div className="rounded-md bg-white/8 p-3">
            <div className="mb-2 h-2.5 w-24 rounded-full bg-white/15" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-12 rounded bg-white/10" />
              <div className="h-12 rounded bg-white/6" />
              <div className="h-12 rounded bg-[#2b3e6e]" />
            </div>
          </div>
          <div className="rounded-md bg-white/8 p-3">
            <div className="mb-2 h-2.5 w-28 rounded-full bg-white/15" />
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-white/8"><div className="h-2 w-[72%] rounded-full bg-[#5ac8a0]" /></div>
              <div className="h-2 rounded-full bg-white/8"><div className="h-2 w-[58%] rounded-full bg-[#6d8ed8]" /></div>
              <div className="h-2 rounded-full bg-white/8"><div className="h-2 w-[44%] rounded-full bg-[#9ba9c6]" /></div>
            </div>
          </div>
          <div className="rounded-md bg-white/8 p-3">
            <div className="mb-2 h-2.5 w-20 rounded-full bg-white/15" />
            <div className="grid grid-cols-4 gap-2">
              <div className="h-10 rounded bg-white/8" />
              <div className="h-10 rounded bg-white/12" />
              <div className="h-10 rounded bg-white/8" />
              <div className="h-10 rounded bg-white/14" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-md bg-white/8 p-3">
            <div className="mb-2 h-2.5 w-24 rounded-full bg-white/15" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-14 rounded bg-white/8" />
              <div className="h-14 rounded bg-white/12" />
            </div>
          </div>
          <div className="rounded-md bg-white/8 p-3">
            <div className="mb-2 h-2.5 w-20 rounded-full bg-white/15" />
            <div className="space-y-2">
              <div className="h-8 rounded bg-white/8" />
              <div className="h-8 rounded bg-white/10" />
              <div className="h-8 rounded bg-[#2b3e6e]" />
            </div>
          </div>
          <div className="rounded-md bg-white/8 p-3">
            <div className="mb-2 h-2.5 w-24 rounded-full bg-white/15" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-12 rounded bg-white/10" />
              <div className="h-12 rounded bg-white/6" />
              <div className="h-12 rounded bg-white/10" />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-[#002a5c]/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <span className="rounded-2xl bg-white px-8 py-4 text-sm font-bold text-[#002a5c] shadow-2xl">Expandir Grafico</span>
      </div>
    </div>
  );
}

function createCards({ language, recommendation, categories, scenarios, recentSession, gamification, copy }) {
  const categoryPrimary = categories[0] || null;
  const categorySecondary = categories[1] || categoryPrimary || null;
  const scenarioPrimary = scenarios[0] || null;
  const scoreMetric = clampPercent(recentSession?.accuracyRate || gamification?.progressPercent || 0);
  const dueReviewCount = Math.max(0, Number(recommendation?.dueReviewCount || 0) || 0);
  const practiceProgress = clampPercent(gamification?.progressPercent || 0);
  const weakestSkill = prettify(recommendation?.weakestSkill || categoryPrimary?.skill || (language === "en" ? "grammar" : "gramatica"));

  const cards = [
    {
      id: "mixed-review",
      title: `${language === "en" ? "Review" : "Repaso"}: ${weakestSkill}`,
      description: language === "en"
        ? "Clear due items and reinforce the skill that currently needs the most attention."
        : "Refuerza la habilidad que mas necesita atencion y limpia tus ejercicios pendientes.",
      pill: prettify(categoryPrimary?.skill || "vocabulary"),
      href: buildPracticeHref({ mode: PRACTICE_MODES.MIXED_REVIEW, skill: recommendation?.weakestSkill || categoryPrimary?.skill || "" }),
      minutes: estimateMinutes(PRACTICE_MODES.MIXED_REVIEW),
      metricLabel: `${clampPercent(dueReviewCount ? dueReviewCount * 12 : scoreMetric)}%`,
      progress: clampPercent(dueReviewCount ? dueReviewCount * 12 : scoreMetric),
      progressClass: "bg-[#002a5c]",
      metricClass: "",
      iconType: "style",
      iconWrapClass: "bg-blue-50 text-[#002a5c] group-hover:bg-[#002a5c] group-hover:text-white",
    },
    {
      id: "topic",
      title: `${language === "en" ? "Quiz" : "Quiz"}: ${categoryPrimary?.name || (language === "en" ? "Core Grammar" : "Gramatica Base")}`,
      description: language === "en"
        ? "Focus your practice on a specific topic and keep your module progress moving."
        : "Enfoca tu practica en un tema especifico y manten el avance de tu modulo.",
      pill: prettify(categoryPrimary?.skill || "grammar"),
      href: buildPracticeHref({ mode: PRACTICE_MODES.TOPIC, skill: categoryPrimary?.skill || recommendation?.weakestSkill || "", categoryId: categoryPrimary?.id || "" }),
      minutes: estimateMinutes(PRACTICE_MODES.TOPIC),
      metricLabel: `${clampPercent(practiceProgress * 0.4)}%`,
      progress: clampPercent(practiceProgress * 0.4),
      progressClass: "bg-[#002a5c]",
      metricClass: "",
      iconType: "quiz",
      iconWrapClass: "bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white",
    },
    {
      id: "scenario",
      title: `${language === "en" ? "Speaking Lab" : "Speaking Lab"}: ${scenarioPrimary?.label || (language === "en" ? "Introductions" : "Introducciones")}`,
      description: language === "en"
        ? "Practice in a guided context to strengthen expression and response fluency."
        : "Practica en un contexto guiado para reforzar expresion y fluidez de respuesta.",
      pill: "SPEAKING",
      href: buildPracticeHref({
        mode: scenarioPrimary ? PRACTICE_MODES.SCENARIO : PRACTICE_MODES.WEAKNESS,
        skill: categorySecondary?.skill || "speaking",
        scenario: scenarioPrimary?.value || "",
      }),
      minutes: scenarioPrimary ? estimateMinutes(PRACTICE_MODES.SCENARIO) : estimateMinutes(PRACTICE_MODES.WEAKNESS),
      metricLabel: dueReviewCount > 0 ? copy.pending : `${scoreMetric}%`,
      progress: dueReviewCount > 0 ? 0 : scoreMetric,
      progressClass: "bg-[#002a5c]",
      metricClass: "",
      iconType: "voice",
      iconWrapClass: "bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white",
    },
    {
      id: "timed",
      title: `${language === "en" ? "Writing" : "Writing"}: ${categorySecondary?.name || (language === "en" ? "Basic Bio" : "Bio Basica")}`,
      description: language === "en"
        ? "Turn your recent practice into a concise writing challenge with clear completion goals."
        : "Convierte tu practica reciente en un reto breve de escritura con metas claras de finalizacion.",
      pill: "WRITING",
      href: buildPracticeHref({ mode: PRACTICE_MODES.TIMED, skill: categorySecondary?.skill || recommendation?.weakestSkill || "" }),
      minutes: estimateMinutes(PRACTICE_MODES.TIMED),
      metricLabel: `${clampPercent(Math.max(scoreMetric, practiceProgress))}%`,
      progress: clampPercent(Math.max(scoreMetric, practiceProgress)),
      progressClass: "bg-emerald-500",
      metricClass: "text-emerald-600",
      iconType: "note",
      iconWrapClass: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
    },
    {
      id: "quick",
      title: language === "en" ? "Quick Practice" : "Practica Rapida",
      description: language === "en"
        ? "Launch a short balanced session to keep your study rhythm active."
        : "Inicia una sesion corta y equilibrada para mantener tu ritmo de estudio.",
      pill: language === "en" ? "GENERAL" : "GENERAL",
      href: buildPracticeHref({ mode: PRACTICE_MODES.QUICK, skill: recommendation?.weakestSkill || "" }),
      minutes: estimateMinutes(PRACTICE_MODES.QUICK),
      metricLabel: `${scoreMetric}%`,
      progress: scoreMetric,
      progressClass: "bg-[#002a5c]",
      metricClass: "",
      iconType: "quiz",
      iconWrapClass: "bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white",
    },
  ];

  return scenarioPrimary ? cards : cards.filter((card) => card.id !== "scenario");
}

export default function PracticeExercisesPage({ student, practiceHub, language = "es" }) {
  const copy = buildCopy(language);
  const [query, setQuery] = useState("");
  const [carouselIndex, setCarouselIndex] = useState(0);
  const recommendation = practiceHub?.recommendation || null;
  const categories = Array.isArray(practiceHub?.categories) ? practiceHub.categories : [];
  const scenarios = Array.isArray(practiceHub?.scenarios) ? practiceHub.scenarios : [];
  const recentSession = practiceHub?.recentSession || null;
  const gamification = practiceHub?.gamification || null;
  const scoreMetric = clampPercent(recentSession?.accuracyRate || practiceHub?.competition?.standing?.averageAccuracy || gamification?.progressPercent || 0);
  const streakDays = Math.max(0, Number(student?.currentStreak || 0) || 0);
  const dueReviewCount = Math.max(0, Number(recommendation?.dueReviewCount || 0) || 0);
  const weakestSkill = prettify(recommendation?.weakestSkill || categories[0]?.skill || "grammar");
  const heroHref = buildPracticeHref({ mode: recommendation?.mode || PRACTICE_MODES.MIXED_REVIEW, skill: recommendation?.weakestSkill || "" });
  const cards = createCards({
    language,
    recommendation,
    categories,
    scenarios,
    recentSession,
    gamification,
    copy,
  });
  const filteredCards = cards.filter((card) =>
    !query.trim()
      ? true
      : [card.title, card.description, card.pill].some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase()))
  );
  const maxIndex = Math.max(0, filteredCards.length - 4);
  const safeIndex = Math.min(carouselIndex, maxIndex);
  const visibleCards = filteredCards.slice(safeIndex, safeIndex + 4);
  const levelTarget = student?.courseLevel || student?.cefrLevel || "A1.1";
  const heroDescription =
    language === "en"
      ? `Review the key ${weakestSkill} concepts that need the most attention and keep moving toward your next level.`
      : `Repasa los conceptos clave de ${weakestSkill} para consolidar tu aprendizaje y mejorar tu fluidez gramatical.`;
  const analyticsText =
    language === "en"
      ? `Your recent ${weakestSkill} practice is trending at ${scoreMetric}% accuracy. Continue with today's exercises to reduce ${formatNumber(dueReviewCount, language)} pending reviews and unlock the next module.`
      : `Tus resultados en las ultimas practicas de ${weakestSkill} muestran un puntaje de ${scoreMetric}%. Continua con los ejercicios de hoy para reducir ${formatNumber(dueReviewCount, language)} pendientes y desbloquear el siguiente modulo.`;

  return (
    <section className="space-y-12 bg-[#f8f9fa] text-[#191c1d]">
      <section className="mx-auto max-w-3xl pt-4">
        <div className="group relative">
          <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-[#002a5c]/40 transition-colors group-focus-within:text-[#002a5c]">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCarouselIndex(0);
            }}
            placeholder={copy.searchPlaceholder}
            className="w-full rounded-[2rem] border-2 border-slate-100 bg-white py-5 pl-16 pr-8 text-lg font-medium text-[#002a5c] shadow-sm transition-all placeholder:text-slate-400 focus:border-[#002a5c] focus:ring-4 focus:ring-[#002a5c]/5"
          />
        </div>
      </section>

      <section className="group relative min-h-[360px] overflow-hidden rounded-[2.5rem] bg-[linear-gradient(135deg,#001943_0%,#102e62_100%)] shadow-2xl shadow-[#002a5c]/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_70%_82%,rgba(255,255,255,0.05),transparent_30%)]" />
        <div className="absolute -right-10 top-14 h-56 w-56 rounded-[3rem] border border-white/5 bg-white/5 backdrop-blur-sm" />
        <div className="absolute -bottom-16 right-10 h-80 w-80 rounded-full bg-white/5 blur-3xl transition-transform duration-1000 group-hover:scale-105" />

        <div className="relative z-10 max-w-3xl space-y-6 px-8 py-12 sm:px-12 lg:px-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-md">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-white">{copy.heroBadge}</span>
          </div>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">{copy.heroTitle}</h1>
          <p className="max-w-xl text-lg leading-relaxed text-white/80">{heroDescription}</p>
          <div className="flex flex-wrap gap-4 pt-4">
            <Link href={heroHref} className="rounded-2xl bg-white px-10 py-4 text-base font-bold text-[#002a5c] shadow-xl transition-all hover:bg-slate-100 active:scale-95">
              {copy.heroCta}
            </Link>
            <Link href="/app/curso" className="rounded-2xl border border-white/20 bg-white/10 px-10 py-4 text-base font-bold text-white backdrop-blur-md transition-all hover:bg-white/20">
              {copy.heroSecondary}
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-6 px-2">
          <div>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.28em] text-[#44464f]">{copy.moduleEyebrow}</span>
            <h2 className="text-3xl font-bold text-[#002a5c]">{copy.moduleTitle}</h2>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCarouselIndex((current) => Math.max(0, current - 1))}
              disabled={safeIndex === 0}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition-all hover:bg-white hover:shadow-md disabled:opacity-40"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              onClick={() => setCarouselIndex((current) => Math.min(maxIndex, current + 1))}
              disabled={safeIndex >= maxIndex}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition-all hover:bg-white hover:shadow-md disabled:opacity-40"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {visibleCards.map((card) => (
            <ExerciseCard key={card.id} card={card} copy={copy} />
          ))}
          {!visibleCards.length ? (
            <div className="rounded-[2rem] bg-white p-8 text-sm text-slate-500 shadow-[0px_20px_40px_rgba(0,42,92,0.04)] md:col-span-2 xl:col-span-4">
              {copy.noResults}
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-12 rounded-[3rem] border border-slate-50 bg-white p-8 shadow-[0px_24px_48px_rgba(0,42,92,0.04)] sm:p-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex-1 space-y-8">
          <div>
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-[#002a5c]">{copy.analyticsEyebrow}</span>
            <h2 className="max-w-xl text-4xl font-extrabold leading-tight tracking-tight text-[#002a5c]">
              {copy.analyticsTitle} {levelTarget}
            </h2>
          </div>

          <p className="max-w-2xl text-lg leading-relaxed text-slate-600">{analyticsText}</p>

          <div className="flex flex-wrap items-center gap-10 py-4">
            <div className="text-left">
              <p className="text-5xl font-black text-[#002a5c]">{formatNumber(scoreMetric, language)}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">{copy.overallScore}</p>
            </div>
            <div className="hidden h-16 w-px bg-slate-100 sm:block" />
            <div className="text-left">
              <p className="text-5xl font-black text-[#002a5c]">{formatNumber(streakDays, language)}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">{copy.streakDays}</p>
            </div>
          </div>

          <Link href="/app/leaderboard" className="inline-flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-8 py-4 font-bold text-[#002a5c] transition-colors hover:bg-slate-100">
            <span>{copy.analyticsButton}</span>
            <TrendUpIcon />
          </Link>
        </div>

        <div className="w-full flex-1 lg:max-w-md">
          <DashboardVisual />
        </div>
      </section>
    </section>
  );
}
