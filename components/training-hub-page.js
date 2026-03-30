"use client";

import Link from "next/link";
import { useState } from "react";
import PracticeArena from "@/components/practice-arena";
import WeeklySummaryPanel from "@/components/weekly-summary-panel";
import { LEAGUE_TIER_LABELS } from "@/lib/competition/constants";
import { PRACTICE_MODE_LABELS } from "@/lib/duolingo/practice-config";
import { FLASHCARD_GAME_MODE_LABELS } from "@/lib/flashcard-arcade/constants";

const WHITE_CARD =
  "rounded-xl border border-[rgba(196,198,209,0.16)] bg-white shadow-[0_12px_32px_rgba(0,25,67,0.06)]";

function buildTabs(language) {
  if (language === "en") {
    return [
      { id: "overview", label: "Overview" },
      { id: "exercises", label: "Exercises" },
      { id: "this-week", label: "This Week" },
    ];
  }

  return [
    { id: "overview", label: "Resumen" },
    { id: "exercises", label: "Ejercicios" },
    { id: "this-week", label: "Esta semana" },
  ];
}

function buildCopy(language) {
  if (language === "en") {
    return {
      eyebrow: "Training Area",
      heroTitle: "Your Training Center",
      heroDescription: "One place to master your skills with interactive exercises and high-efficiency flashcards.",
      primaryCta: "Start Recommended Practice",
      secondaryCta: "View Deck Library",
      currentLevel: "Current level",
      totalXp: "Total XP",
      currentLeague: "Current league",
      levelProgress: "Progress to next level",
      quickPractice: "Quick Practice",
      quickDescription: "5-minute timed drills to keep your mind sharp.",
      quickAction: "Enter",
      mixedReview: "Mixed Review",
      mixedDescription: "Smart practice based on your recent errors and weak areas.",
      mixedAction: "Personalize",
      flashcardArcade: "Flashcards (SRS)",
      flashcardDescription: "Spaced repetition for long-term memory retention.",
      flashcardAction: "Practice Deck",
      flashcardLibraryAction: "Open Decks",
      advancedTools: "Advanced Tools",
      advancedWeakness: "Weakness Recovery",
      advancedChallenge: "Skill Challenges",
      featuredTag: "Recommended for today",
      featuredAction: "Start Review",
      recentTitle: "Continue Recent Activity",
      recentPractice: "Latest exercise",
      recentFlashcard: "Latest flashcard run",
      recentEmptyPractice: "Start an exercise session to build momentum.",
      recentEmptyFlashcard: "Open a deck and begin a flashcard run.",
      flashcardTitle: "Recommended Flashcards",
      weeklyEyebrow: "Weekly Performance",
      weeklyTitle: "This Week",
      positionTitle: "Your Position",
      positionAction: "View Full Leaderboard",
      missionProgress: "Progress",
      tabLabel: "Training views",
      noLeaderboard: "Leaderboard activity will appear here once the current league has active learners.",
      cardsLabel: "Cards",
      masteredLabel: "mastered",
      accuracyLabel: "accuracy",
      dueLabel: "due",
      currentUser: "Current User",
    };
  }

  return {
    eyebrow: "Area de entrenamiento",
    heroTitle: "Tu Centro de Entrenamiento",
    heroDescription: "Un solo lugar para dominar tus habilidades con ejercicios interactivos y flashcards de alta eficiencia.",
    primaryCta: "Empezar Practica Recomendada",
    secondaryCta: "Ver Biblioteca de Decks",
    currentLevel: "Nivel actual",
    totalXp: "Total XP",
    currentLeague: "Liga actual",
    levelProgress: "Progreso al siguiente nivel",
    quickPractice: "Practica Rapida",
    quickDescription: "Ejercicios de 5 minutos cronometrados para mantener la agilidad mental.",
    quickAction: "Entrar",
    mixedReview: "Repaso Mixto",
    mixedDescription: "Algoritmo inteligente basado en tus errores y debilidades recientes.",
    mixedAction: "Personalizar",
    flashcardArcade: "Flashcards (SRS)",
    flashcardDescription: "Repeticion espaciada para memorizacion a largo plazo de conceptos clave.",
    flashcardAction: "Practicar Deck",
    flashcardLibraryAction: "Abrir Decks",
    advancedTools: "Herramientas avanzadas",
    advancedWeakness: "Recuperacion de debilidades",
    advancedChallenge: "Desafios por habilidad",
    featuredTag: "Recomendado para hoy",
    featuredAction: "Iniciar Repaso",
    recentTitle: "Continuar Actividad Reciente",
    recentPractice: "Ultimo ejercicio",
    recentFlashcard: "Ultima sesion de flashcards",
    recentEmptyPractice: "Empieza una sesion de ejercicios para volver a tomar ritmo.",
    recentEmptyFlashcard: "Abre un deck e inicia un modo de flashcards.",
    flashcardTitle: "Flashcards Recomendadas",
    weeklyEyebrow: "Desempeno Semanal",
    weeklyTitle: "Esta Semana",
    positionTitle: "Tu Posicion",
    positionAction: "Ver Leaderboard Completo",
    missionProgress: "Progreso",
    tabLabel: "Vistas de entrenamiento",
    noLeaderboard: "La actividad del leaderboard aparecera aqui cuando la liga tenga participantes activos.",
    cardsLabel: "Tarjetas",
    masteredLabel: "dominado",
    accuracyLabel: "acierto",
    dueLabel: "pendientes",
    currentUser: "Usuario Actual",
  };
}

function buildPracticeHref(_initialParams, overrides = {}) {
  const params = new URLSearchParams();
  const next = {
    tab: overrides.tab ?? "overview",
    mode: overrides.mode ?? "",
    skill: overrides.skill ?? "",
    cefr: overrides.cefrLevel ?? "",
    category_id: overrides.categoryId ?? "",
    scenario: overrides.scenario ?? "",
    deck: overrides.deckKey ?? "",
    flashcard_mode: overrides.flashcardMode ?? "",
  };

  if (next.tab && next.tab !== "overview") params.set("tab", next.tab);
  if (next.mode) params.set("mode", next.mode);
  if (next.skill) params.set("skill", next.skill);
  if (next.cefr) params.set("cefr", next.cefr);
  if (next.category_id) params.set("category_id", next.category_id);
  if (next.scenario) params.set("scenario", next.scenario);
  if (next.deck) params.set("deck", next.deck);
  if (next.flashcard_mode) params.set("flashcard_mode", next.flashcard_mode);

  return params.toString() ? `/app/practice?${params.toString()}` : "/app/practice";
}

function clampPercent(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function formatNumber(value, language) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "es-PE").format(Number(value || 0) || 0);
}

function formatActivityDate(value, language) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-PE", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function joinMeta(parts) {
  return parts.filter(Boolean).join(" - ");
}

function RingProgress({ value, label }) {
  const safeValue = clampPercent(value);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeValue / 100);

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r={radius} fill="transparent" stroke="#e7e8e9" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="transparent"
          stroke="#002a5c"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-sm font-bold text-[#002a5c]">{safeValue}%</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function ArrowForwardIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h11" />
      <path d="m11 5 5 5-5 5" />
    </svg>
  );
}

function PlayIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 5 8 5-8 5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StarsIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path d="m10 2.8 1.56 3.16 3.48.5-2.52 2.46.6 3.47L10 10.74l-3.12 1.65.6-3.47L4.96 6.46l3.48-.5z" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="14" r="7" />
      <path d="M12 14V10" />
      <path d="m12 14 3 2" />
      <path d="M9 3h6" />
    </svg>
  );
}

function PsychologyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18a6 6 0 1 1 6-6v7" />
      <path d="M15 13a2.5 2.5 0 1 1 2.5-2.5" />
      <path d="M10 8h3" />
      <path d="M10 11h4" />
      <path d="M10 14h3" />
    </svg>
  );
}

function StyleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 7 8-3 4 9-8 3z" />
      <path d="m5 11 8-3 4 9-8 3z" />
    </svg>
  );
}

function TranslateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5h8" />
      <path d="M9 5c0 4-2 7-5 9" />
      <path d="M7 9c1 2 3 4 5 5" />
      <path d="m15 14 2 5" />
      <path d="m20 14-2 5" />
      <path d="M14 18h7" />
    </svg>
  );
}

function SpellcheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7h8" />
      <path d="M9 7 6 17" />
      <path d="m12 17-3-10" />
      <path d="M7.5 12h3" />
      <path d="m16 16 2 2 4-5" />
    </svg>
  );
}

function SessionIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="9" r="3" />
      <path d="M3 19c1.6-3 3.7-4.5 6-4.5S13.4 16 15 19" />
      <path d="M16 9v6" />
      <path d="M19 12h-6" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h12v14H6z" />
      <path d="M9 8h6" />
      <path d="M9 12h2" />
      <path d="m15 14 1.5 1.5L19 13" />
      <path d="M8 20h8" />
    </svg>
  );
}

function CalendarCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}

function MedalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3h3l1 4H9z" />
      <path d="M13 3h3l-1 4h-3z" />
      <circle cx="12" cy="15" r="4" />
      <path d="m10.5 15 1 1 2-2" />
    </svg>
  );
}

function SparkleWatermark() {
  return (
    <svg viewBox="0 0 160 160" className="h-36 w-36 text-white/10" fill="currentColor" aria-hidden="true">
      <path d="M80 6 93 48l42 13-42 13-13 42-13-42-42-13 42-13z" />
      <path d="m120 74 8 26 26 8-26 8-8 26-8-26-26-8 26-8z" />
    </svg>
  );
}

function DashboardToolCard({ title, description, href, actionLabel, icon }) {
  return (
    <article className="rounded-xl bg-white p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#002a5c]">
        {icon}
      </div>
      <h3 className="mt-4 text-[1.9rem] font-bold leading-tight tracking-[-0.03em] text-[#002a5c] sm:text-[1.55rem]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#555e75]">{description}</p>
      <div className="mt-4">
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-[#002a5c]">
          <span>{actionLabel}</span>
          <ArrowForwardIcon className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function AdvancedToolsCard({ copy, primaryHref, secondaryHref }) {
  return (
    <article className="flex flex-col justify-center rounded-xl border border-dashed border-[#c4c6d1] bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#44464f]">{copy.advancedTools}</p>
      <div className="mt-5 space-y-3">
        <Link href={primaryHref} className="flex items-center justify-between text-sm font-semibold text-[#002a5c]">
          <span>{copy.advancedWeakness}</span>
          <ArrowForwardIcon className="h-4 w-4" />
        </Link>
        <Link href={secondaryHref} className="flex items-center justify-between text-sm font-semibold text-[#002a5c]">
          <span>{copy.advancedChallenge}</span>
          <ArrowForwardIcon className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function MissionCard({ item, copy, icon }) {
  const progress = clampPercent(item?.progressPercent);

  return (
    <article className="flex flex-col justify-between rounded-xl bg-white p-6">
      <div className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#002a5c] shadow-sm">
          {icon}
        </div>
        <div>
          <h3 className="text-xl font-bold text-[#002a5c]">{item?.title || copy.missionProgress}</h3>
          <p className="mt-2 text-sm leading-6 text-[#555e75]">{item?.description || ""}</p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-[#002a5c]">
          <span>{copy.missionProgress}</span>
          <span>
            {Number(item?.progressCount || 0)}/{Number(item?.targetCount || 0)}
          </span>
        </div>
        <div className="rounded-full bg-white p-0.5">
          <div
            className={`h-2 rounded-full ${item?.isCompleted ? "bg-success" : "bg-[#002a5c]"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </article>
  );
}

function LeaderboardCard({ competition, student, copy, language }) {
  const topRows = Array.isArray(competition?.leaderboard?.top) ? competition.leaderboard.top : [];
  const nearbyRows = Array.isArray(competition?.leaderboard?.nearby) ? competition.leaderboard.nearby : [];
  const leagueTier = String(competition?.league?.tier || "bronze").trim().toLowerCase();
  const leagueLabel = LEAGUE_TIER_LABELS[leagueTier] || (language === "en" ? "Bronze" : "Bronce");
  const currentUserRow =
    topRows.find((row) => row?.isCurrentUser) ||
    nearbyRows.find((row) => row?.isCurrentUser) ||
    {
      rankPosition: competition?.standing?.rankPosition || 0,
      name: student?.fullName || "You",
      weeklyPoints: competition?.standing?.weeklyPoints || 0,
      averageAccuracy: competition?.standing?.averageAccuracy || 0,
      isCurrentUser: true,
    };
  const previewRows = (topRows.length ? topRows : nearbyRows).filter((row) => !row?.isCurrentUser).slice(0, 2);

  return (
    <article className={`${WHITE_CARD} space-y-6 p-6`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-bold text-[#002a5c]">{copy.positionTitle}</h3>
        <span className="rounded-full bg-[#d9e2fe] px-2.5 py-1 text-xs font-bold text-[#002a5c]">
          {language === "en" ? `${leagueLabel} League` : `Liga ${leagueLabel}`}
        </span>
      </div>

      <div className="space-y-3">
        {previewRows.length ? (
          previewRows.map((row) => (
            <div key={`${row.userId || row.name}-${row.rankPosition}`} className="flex items-center gap-3 p-2 opacity-50">
              <span className="w-4 text-sm font-bold text-[#191c1d]">{row.rankPosition}</span>
              <div className="h-8 w-8 rounded-full bg-slate-200" />
              <span className="text-sm font-medium text-[#191c1d]">{row.name}</span>
              <span className="ml-auto text-xs font-bold text-[#191c1d]">{formatNumber(row.weeklyPoints || 0, language)} XP</span>
            </div>
          ))
        ) : (
          <div className="rounded-lg bg-[#f3f4f5] px-4 py-4 text-sm text-[#555e75]">{copy.noLeaderboard}</div>
        )}

        <div className="flex items-center gap-3 rounded-lg border border-[rgba(0,42,92,0.1)] bg-[rgba(217,226,255,0.3)] p-3">
          <span className="w-4 text-sm font-black text-[#191c1d]">{currentUserRow.rankPosition}</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#002a5c] text-[10px] font-bold text-white">
            {language === "en" ? "YOU" : "TU"}
          </div>
          <span className="text-sm font-bold text-[#002a5c]">{copy.currentUser}</span>
          <span className="ml-auto text-xs font-black text-[#002a5c]">{formatNumber(currentUserRow.weeklyPoints || 0, language)} XP</span>
        </div>
      </div>

      <div className="pt-1">
        <Link href="/app/leaderboard" className="block text-center text-sm font-bold text-[#002a5c]">
          {copy.positionAction}
        </Link>
      </div>
    </article>
  );
}

function RecentActivityRow({ icon, title, subtitle, href, tone = "primary" }) {
  return (
    <Link href={href} className={`${WHITE_CARD} grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-4 transition hover:-translate-y-0.5`}>
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-lg ${
          tone === "secondary" ? "bg-[#d9e2fe] text-[#555e75]" : "bg-[#d9e2ff] text-[#002a5c]"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="font-bold text-[#002a5c]">{title}</p>
        <p className="text-[11px] font-bold uppercase tracking-tight text-[#555e75]">{subtitle}</p>
      </div>
      <span className="text-[#002a5c]">
        <PlayIcon />
      </span>
    </Link>
  );
}

function SecondaryNav({ tabs, activeTab, initialParams, copy }) {
  return (
    <div className={`${WHITE_CARD} px-4 py-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#555e75]">{copy.tabLabel}</p>
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={buildPracticeHref(initialParams, { tab: tab.id })}
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  active ? "bg-[#002a5c] text-white" : "bg-[#eef4ff] text-[#002a5c] hover:bg-[#e1ebff]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TrainingHubPage({ student, hubData, initialParams, language = "es" }) {
  const copy = buildCopy(language);
  const trainingTabs = buildTabs(language);
  const activeTab = initialParams?.tab || "overview";
  const [gamification, setGamification] = useState(hubData?.gamification || null);
  const [competition, setCompetition] = useState(hubData?.competition || null);
  const practice = hubData?.practice || {};
  const flashcards = hubData?.flashcards || {};
  const level = Number(gamification?.level || 1) || 1;
  const progressPercent = clampPercent(gamification?.progressPercent || 0);
  const recommendedDeck = flashcards?.recommendedDeck || null;
  const recentPractice = practice?.recentSession || null;
  const recentFlashcards = flashcards?.recentSession || null;
  const weakestSkill = String(practice?.recommendation?.weakestSkill || "").trim().toLowerCase();
  const levelLabel = student?.cefrLevel ? `${student.cefrLevel}` : "";

  const recommendedPracticeHref = "/app/practice/exercises";
  const recommendedFlashcardHref = recommendedDeck?.deckKey
    ? `/app/practice/decks?deck=${encodeURIComponent(recommendedDeck.deckKey)}`
    : "/app/practice/decks";
  const flashcardLibraryHref = "/app/practice/decks";
  const currentLeagueName =
    LEAGUE_TIER_LABELS[String(competition?.league?.tier || "bronze").trim().toLowerCase()] ||
    (language === "en" ? "Bronze" : "Bronce");
  const currentLeaguePosition = Number(competition?.league?.cohortNumber || competition?.standing?.rankPosition || 0) || 0;
  const recommendedSkillLabel = weakestSkill
    ? weakestSkill.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
    : language === "en"
      ? "Vocabulary"
      : "Vocabulario";
  const missionItems = (
    (Array.isArray(competition?.quests) ? competition.quests : []).slice(0, 2).map((quest, index) => ({
      ...quest,
      sortOrder: index + 1,
    })) || []
  )
    .concat(
      Array.from({ length: Math.max(0, 2 - (Array.isArray(competition?.quests) ? competition.quests.slice(0, 2).length : 0)) }, (_, index) => ({
        id: `fallback-mission-${index + 1}`,
        sortOrder: (Array.isArray(competition?.quests) ? competition.quests.slice(0, 2).length : 0) + index + 1,
        title: index === 0 ? "Constancia" : "Acumulador de XP",
        description: index === 0 ? "Completar 5 sesiones de practica esta semana." : "Ganar 500 XP en ejercicios de gramatica.",
        progressCount: index === 0 ? Number(competition?.standing?.completedSessions || 0) : Number(competition?.standing?.weeklyPoints || 0),
        targetCount: index === 0 ? 5 : 500,
        progressPercent: index === 0 ? clampPercent((Number(competition?.standing?.completedSessions || 0) / 5) * 100) : clampPercent((Number(competition?.standing?.weeklyPoints || 0) / 500) * 100),
        rewardXp: index === 0 ? 80 : 120,
        isCompleted: false,
      }))
    )
    .slice(0, 2);

  const recentPracticeSubtitle = recentPractice
    ? joinMeta([
        copy.recentPractice,
        `${Number(recentPractice.accuracyRate || 0) || 0}% ${copy.accuracyLabel}`,
        recentPractice.completedAt || recentPractice.startedAt
          ? formatActivityDate(recentPractice.completedAt || recentPractice.startedAt, language)
          : "",
      ])
    : copy.recentEmptyPractice;

  const recentFlashcardSubtitle = recentFlashcards
    ? joinMeta([
        "Flashcards",
        language === "en" ? "Continue where you left off" : "Continuar donde lo dejaste",
      ])
    : copy.recentEmptyFlashcard;

  return (
    <section className="space-y-10 text-foreground">
      {activeTab !== "overview" ? (
        <SecondaryNav tabs={trainingTabs} activeTab={activeTab} initialParams={initialParams} copy={copy} />
      ) : null}

      {activeTab === "overview" ? (
        <section className="space-y-14">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.78fr] lg:items-center">
            <div className="max-w-2xl space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#103474]">{copy.eyebrow}</p>
                <h1 className="max-w-xl text-[clamp(3.6rem,5vw,4.9rem)] font-semibold leading-[0.94] tracking-[-0.05em] text-[#002a5c]">
                  {copy.heroTitle}
                </h1>
                <p className="max-w-xl text-[1.06rem] leading-8 text-[#44464f]">{copy.heroDescription}</p>
              </div>

              <div className="flex flex-wrap gap-4">
                <Link
                  href={recommendedPracticeHref}
                  className="rounded-xl bg-gradient-to-r from-[#002a5c] to-[#102e62] px-8 py-4 text-lg font-bold text-white shadow-lg"
                >
                  {copy.primaryCta}
                </Link>
                <Link href={flashcardLibraryHref} className="rounded-xl bg-[#e7e8e9] px-8 py-4 text-lg font-bold text-[#191c1d]">
                  {copy.secondaryCta}
                </Link>
              </div>
            </div>

            <article className={`${WHITE_CARD} relative overflow-hidden p-8`}>
              <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#d9e2ff]/30 blur-3xl" />
              <div className="relative">
                <div className="mb-8 flex items-center justify-between gap-6">
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#44464f]">{copy.currentLevel}</p>
                    <h2 className="text-3xl font-black text-[#002a5c]">
                      Nivel {level} {levelLabel ? <span className="text-lg font-medium text-[#555e75]">({levelLabel})</span> : null}
                    </h2>
                  </div>
                  <RingProgress value={progressPercent} label={copy.levelProgress} />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#44464f]">{copy.totalXp}</p>
                    <p className="text-xl font-bold text-[#002a5c]">{formatNumber(gamification?.lifetimeXp || 0, language)} XP</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#44464f]">{copy.currentLeague}</p>
                    <div className="flex items-center gap-2 text-[#002a5c]">
                      <StarsIcon className="h-5 w-5 text-[#bdc6e1]" />
                      <p className="text-xl font-bold">
                        {currentLeagueName} <span className="text-sm font-medium text-[#555e75]">#{currentLeaguePosition}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_1.42fr]">
            <article className="relative flex h-full flex-col justify-between overflow-hidden rounded-xl bg-[#002a5c] p-8 text-white">
              <div className="absolute bottom-0 right-0">
                <SparkleWatermark />
              </div>
              <div className="relative z-10 space-y-6">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  {copy.featuredTag}
                </span>
                <div className="space-y-2">
                  <h2 className="text-[2.1rem] font-bold leading-tight tracking-[-0.03em]">
                    {practice?.recommendation?.title || "Practica de Repaso Mixto"}
                  </h2>
                  <p className="max-w-md leading-8 text-[#d9e2ff]">
                    {practice?.recommendation?.description ||
                      (language === "en"
                        ? "You have due review items that need attention today to avoid forgetting them."
                        : "Tienes items de vocabulario que necesitan revision hoy para evitar el olvido.")}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium text-white">
                  <div className="flex items-center gap-1.5">
                    <TranslateIcon />
                    <span>{recommendedSkillLabel}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <SpellcheckIcon />
                    <span>{practice?.recommendation?.mode === "mixed_review" ? copy.mixedReview : "Gramatica"}</span>
                  </div>
                </div>
              </div>
              <div className="relative z-10 mt-8">
                <Link href={recommendedPracticeHref} className="inline-flex w-full items-center justify-center rounded-xl bg-white px-6 py-4 text-lg font-bold text-[#002a5c]">
                  {copy.featuredAction}
                </Link>
              </div>
            </article>

            <div className="grid gap-6 sm:grid-cols-2">
              <DashboardToolCard
                icon={<TimerIcon />}
                title={copy.quickPractice}
                description={copy.quickDescription}
                href={buildPracticeHref(initialParams, { tab: "exercises", mode: "quick" })}
                actionLabel={copy.quickAction}
              />
              <DashboardToolCard
                icon={<PsychologyIcon />}
                title={copy.mixedReview}
                description={copy.mixedDescription}
                href={buildPracticeHref(initialParams, {
                  tab: "exercises",
                  mode: "mixed_review",
                  skill: weakestSkill,
                })}
                actionLabel={copy.mixedAction}
              />
              <DashboardToolCard
                icon={<StyleIcon />}
                title={copy.flashcardArcade}
                description={copy.flashcardDescription}
                href={recommendedFlashcardHref}
                actionLabel={copy.flashcardLibraryAction}
              />
              <AdvancedToolsCard
                copy={copy}
                primaryHref={buildPracticeHref(initialParams, {
                  tab: "exercises",
                  mode: practice?.recommendation?.mode || "weakness",
                  skill: weakestSkill,
                })}
                secondaryHref={buildPracticeHref(initialParams, {
                  tab: "exercises",
                  mode: "quick",
                  skill: weakestSkill,
                })}
              />
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_0.7fr]">
            <section className="space-y-6">
              <h2 className="text-[2rem] font-bold tracking-[-0.04em] text-[#002a5c]">{copy.recentTitle}</h2>
              <div className="space-y-4">
                <RecentActivityRow
                  icon={<SessionIcon />}
                  title={recentPractice ? PRACTICE_MODE_LABELS[recentPractice.mode] || "Pronunciacion de Vocales" : "Pronunciacion de Vocales"}
                  subtitle={recentPracticeSubtitle}
                  href={buildPracticeHref(initialParams, { tab: "exercises", mode: recentPractice?.mode || "quick" })}
                  tone="primary"
                />
                <RecentActivityRow
                  icon={<QuizIcon />}
                  title={
                    recentFlashcards
                      ? recentFlashcards.deckTitle || FLASHCARD_GAME_MODE_LABELS[recentFlashcards.mode] || "Verbos Irregulares"
                      : "Verbos Irregulares"
                  }
                  subtitle={recentFlashcardSubtitle}
                  href={recommendedFlashcardHref}
                  tone="secondary"
                />
              </div>
            </section>

            <section className="space-y-6">
              <h2 className="text-[2rem] font-bold tracking-[-0.04em] text-[#002a5c]">{copy.flashcardTitle}</h2>
              <article className={`${WHITE_CARD} overflow-hidden`}>
                <div className="relative h-32 bg-slate-200">
                  {recommendedDeck?.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recommendedDeck.coverImageUrl}
                      alt={recommendedDeck?.title || copy.flashcardTitle}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-[linear-gradient(135deg,#8ea7c9_0%,#d7dee8_100%)]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#002a5c]/80 to-transparent" />
                  <div className="absolute bottom-4 left-4 text-white">
                    <span className="rounded-full bg-[#002a5c]/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] backdrop-blur-md">
                      Nivel {String(recommendedDeck?.cefrLevel || student?.cefrLevel || "A2")}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 p-6">
                  <h3 className="text-[1.9rem] font-bold leading-tight tracking-[-0.03em] text-[#002a5c]">
                    {recommendedDeck?.title || copy.flashcardArcade}
                  </h3>
                  <div className="flex items-center justify-between text-sm font-medium text-[#555e75]">
                    <span>{formatNumber(recommendedDeck?.totalCards || 0, language)} {copy.cardsLabel.toLowerCase()}</span>
                    <span>{formatNumber(recommendedDeck?.completionPercent || 0, language)}% {copy.masteredLabel}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#e7e8e9]">
                    <div
                      className="h-full rounded-full bg-[#002a5c]"
                      style={{ width: `${clampPercent(recommendedDeck?.completionPercent || 0)}%` }}
                    />
                  </div>
                  <Link href={recommendedFlashcardHref} className="flex w-full items-center justify-center rounded-xl bg-[#002a5c] px-6 py-3 text-lg font-bold text-white">
                    {copy.flashcardAction}
                  </Link>
                </div>
              </article>
            </section>
          </div>

          <section className="space-y-8">
            <div className="flex items-end justify-between border-b border-[rgba(196,198,209,0.2)] pb-4">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#44464f]">{copy.weeklyEyebrow}</p>
                <h2 className="text-[2.2rem] font-bold tracking-[-0.04em] text-[#002a5c]">{copy.weeklyTitle}</h2>
              </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_1fr_0.95fr]">
              <MissionCard item={missionItems[0]} copy={copy} icon={<CalendarCheckIcon />} />
              <MissionCard item={missionItems[1]} copy={copy} icon={<MedalIcon />} />
              <LeaderboardCard competition={competition} student={student} copy={copy} language={language} />
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "exercises" ? (
        <PracticeArena
          initialStudent={student}
          initialHubData={{
            ...practice,
            gamification,
            competition,
          }}
          initialParams={initialParams}
          showHero={false}
          showCompetitionSummary={false}
          onGamificationChange={setGamification}
          onCompetitionChange={setCompetition}
        />
      ) : null}

      {activeTab === "this-week" ? <WeeklySummaryPanel competition={competition} language={language} /> : null}
    </section>
  );
}
