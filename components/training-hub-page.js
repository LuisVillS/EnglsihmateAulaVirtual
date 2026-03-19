"use client";

import Link from "next/link";
import { useState } from "react";
import FlashcardArcadeHub from "@/components/flashcard-arcade-hub";
import PracticeArena from "@/components/practice-arena";
import CompetitionSummaryCard from "@/components/competition-summary-card";
import WeeklySummaryPanel from "@/components/weekly-summary-panel";
import { LEAGUE_TIER_LABELS } from "@/lib/competition/constants";
import { PRACTICE_MODE_LABELS } from "@/lib/duolingo/practice-config";
import { FLASHCARD_GAME_MODE_LABELS } from "@/lib/flashcard-arcade/constants";

function buildTabs(language) {
  if (language === "en") {
    return [
      { id: "overview", label: "Overview" },
      { id: "exercises", label: "Exercises" },
      { id: "flashcards", label: "Flashcards" },
      { id: "this-week", label: "This Week" },
    ];
  }

  return [
    { id: "overview", label: "Resumen" },
    { id: "exercises", label: "Ejercicios" },
    { id: "flashcards", label: "Flashcards" },
    { id: "this-week", label: "Esta semana" },
  ];
}

function buildCopy(language) {
  if (language === "en") {
    return {
      heroTitle: "One training hub for exercises, flashcards, and your week.",
      heroDescription: "Train across both engines, keep your weekly quests moving, and continue from one place.",
      start: "Start",
      fallbackPractice: "Practice",
      openRecommendedDeck: "Open recommended deck",
      currentLevel: "Current level",
      lifetimeXp: "lifetime XP",
      bronze: "Bronze",
      progressToNextLevel: "Progress to next level",
      xpInLevel: "XP in level",
      xpToReachLevel: "XP to reach Level",
      quickStart: "Quick start",
      quickPractice: "Quick Practice",
      quickDescription: "Jump straight into a mixed exercise session with immediate feedback.",
      startQuickPractice: "Start quick practice",
      recovery: "Recovery",
      weaknessRecovery: "Weakness Recovery",
      weaknessDescription: "Focus on weak areas or due review items.",
      openExercises: "Open exercises",
      flashcards: "Flashcards",
      flashcardArcade: "Flashcard Arcade",
      flashcardSummary: (deck) => `${deck.totalCards} cards · ${deck.weakCards} weak cards ready to recover.`,
      flashcardDescription: "Open the flashcard tab and train with your assigned or weak-card decks.",
      openFlashcards: "Open flashcards",
      continueTraining: "Continue training",
      pickUp: "Pick up where you left off",
      recentExerciseRun: "Recent exercise run",
      noRecentPractice: "No recent practice",
      noExerciseMomentum: "Start an exercise session to build momentum.",
      recentFlashcardRun: "Recent flashcard run",
      noRecentFlashcards: "No recent flashcards",
      noFlashcardMomentum: "Open a deck and start a flashcard game mode.",
      recentActivity: "Recent activity",
      whatHappened: "What happened lately",
      noExerciseSessions: "No exercise sessions completed yet.",
      noFlashcardSessions: "No flashcard sessions completed yet.",
      thisWeek: "This week",
      weeklyPointsSummary: (standing) =>
        `${standing?.weeklyPoints || 0} weekly points · rank #${standing?.rankPosition || 0} of ${standing?.memberCount || 0}`,
    };
  }

  return {
    heroTitle: "Un solo centro de entrenamiento para ejercicios, flashcards y tu semana.",
    heroDescription: "Practica en ambos motores, avanza tus misiones semanales y retoma desde un solo lugar.",
    start: "Empezar",
    fallbackPractice: "práctica",
    openRecommendedDeck: "Abrir deck recomendado",
    currentLevel: "Nivel actual",
    lifetimeXp: "XP acumulado",
    bronze: "Bronce",
    progressToNextLevel: "Progreso al siguiente nivel",
    xpInLevel: "XP dentro del nivel",
    xpToReachLevel: "XP para llegar al nivel",
    quickStart: "Inicio rápido",
    quickPractice: "Práctica rápida",
    quickDescription: "Entra directo a una sesión mixta de ejercicios con feedback inmediato.",
    startQuickPractice: "Empezar práctica rápida",
    recovery: "Refuerzo",
    weaknessRecovery: "Recuperación de debilidades",
    weaknessDescription: "Concéntrate en puntos débiles o repaso pendiente.",
    openExercises: "Abrir ejercicios",
    flashcards: "Flashcards",
    flashcardArcade: "Arcade de flashcards",
    flashcardSummary: (deck) => `${deck.totalCards} cards · ${deck.weakCards} tarjetas débiles listas para recuperar.`,
    flashcardDescription: "Abre la pestaña de flashcards y practica con tus decks asignados o débiles.",
    openFlashcards: "Abrir flashcards",
    continueTraining: "Sigue practicando",
    pickUp: "Retoma donde te quedaste",
    recentExerciseRun: "Última sesión de ejercicios",
    noRecentPractice: "Sin práctica reciente",
    noExerciseMomentum: "Empieza una sesión de ejercicios para volver a tomar ritmo.",
    recentFlashcardRun: "Última sesión de flashcards",
    noRecentFlashcards: "Sin flashcards recientes",
    noFlashcardMomentum: "Abre un deck e inicia un modo de juego con flashcards.",
    recentActivity: "Actividad reciente",
    whatHappened: "Lo último que pasó",
    noExerciseSessions: "Todavía no has completado sesiones de ejercicios.",
    noFlashcardSessions: "Todavía no has completado sesiones de flashcards.",
    thisWeek: "Esta semana",
    weeklyPointsSummary: (standing) =>
      `${standing?.weeklyPoints || 0} puntos semanales · puesto #${standing?.rankPosition || 0} de ${standing?.memberCount || 0}`,
  };
}

function formatDate(value, language) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "es-PE", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
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

function ActionCard({ eyebrow, title, description, href, actionLabel }) {
  return (
    <article className="rounded-[20px] border border-[rgba(16,52,116,0.1)] bg-white px-5 py-5 shadow-[0_16px_30px_rgba(15,23,42,0.05)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-muted">{eyebrow}</p>
      <h3 className="mt-3 text-xl font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      <div className="mt-5">
        <Link href={href} className="student-button-primary px-4 py-3 text-sm">
          {actionLabel}
        </Link>
      </div>
    </article>
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
  const progressPercent = Number(gamification?.progressPercent || 0) || 0;
  const quests = Array.isArray(competition?.quests) ? competition.quests : [];
  const recommendedPracticeHref = buildPracticeHref(initialParams, {
    tab: "exercises",
    mode: practice?.recommendation?.mode || "quick",
  });
  const recommendedFlashcardHref = buildPracticeHref(initialParams, {
    tab: "flashcards",
    deckKey: flashcards?.recommendedDeck?.deckKey || "",
  });

  return (
    <section className="space-y-6 text-foreground">
      <header className="student-panel relative overflow-hidden px-6 py-7 sm:px-7">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_top_right,rgba(241,61,79,0.16),transparent_58%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[48%] bg-[radial-gradient(circle_at_bottom_left,rgba(16,52,116,0.18),transparent_60%)]" />
        <div className="relative grid gap-5 lg:grid-cols-[1.12fr_0.88fr] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-muted">Let&apos;s Practice</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">{copy.heroTitle}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{copy.heroDescription}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={recommendedPracticeHref} className="student-button-primary px-4 py-3 text-sm">
                {copy.start} {PRACTICE_MODE_LABELS[practice?.recommendation?.mode] || copy.fallbackPractice}
              </Link>
              {flashcards?.recommendedDeck?.deckKey ? (
                <Link href={recommendedFlashcardHref} className="student-button-secondary px-4 py-3 text-sm">
                  {copy.openRecommendedDeck}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="student-panel-soft px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted">{copy.currentLevel}</p>
                <h2 className="mt-2 text-3xl font-semibold text-foreground">Level {level}</h2>
                <p className="mt-1 text-sm text-muted">{Number(gamification?.lifetimeXp || 0)} {copy.lifetimeXp}</p>
              </div>
              <span className="rounded-full border border-[rgba(16,52,116,0.12)] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#103474]">
                {LEAGUE_TIER_LABELS[String(competition?.league?.tier || "bronze").trim().toLowerCase()] || copy.bronze} · #{competition?.standing?.rankPosition || 0}
              </span>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{copy.progressToNextLevel}</span>
                <span className="text-muted">{Number(gamification?.xpIntoLevel || 0)} {copy.xpInLevel}</span>
              </div>
              <div className="mt-3 h-3 w-full rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-muted">{Number(gamification?.xpToNextLevel || 0)} {copy.xpToReachLevel} {level + 1}</p>
            </div>
            {quests.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {quests.slice(0, 2).map((quest) => (
                  <div key={quest.id || quest.code} className="rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{quest.title}</p>
                      <span className="text-xs font-semibold text-[#103474]">+{quest.rewardXp} XP</span>
                    </div>
                    <p className="mt-2 text-sm text-muted">{quest.progressCount}/{quest.targetCount}</p>
                    <div className="mt-3 h-2.5 w-full rounded-full bg-[#eef3ff]">
                      <div
                        className={`h-full rounded-full ${quest.isCompleted ? "bg-success" : "bg-gradient-to-r from-primary via-primary-2 to-accent"}`}
                        style={{ width: `${Math.max(0, Math.min(100, Number(quest.progressPercent || 0) || 0))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        {trainingTabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={buildPracticeHref(initialParams, { tab: tab.id })}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${active ? "border-primary/30 bg-primary/10 text-primary" : "border-[rgba(16,52,116,0.12)] bg-white text-foreground hover:border-primary/25 hover:bg-[#f8fbff]"}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "overview" ? (
        <section className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <ActionCard
              eyebrow={copy.quickStart}
              title={copy.quickPractice}
              description={copy.quickDescription}
              href={buildPracticeHref(initialParams, { tab: "exercises", mode: "quick" })}
              actionLabel={copy.startQuickPractice}
            />
            <ActionCard
              eyebrow={copy.recovery}
              title={practice?.recommendation?.title || copy.weaknessRecovery}
              description={practice?.recommendation?.description || copy.weaknessDescription}
              href={recommendedPracticeHref}
              actionLabel={copy.openExercises}
            />
            <ActionCard
              eyebrow={copy.flashcards}
              title={flashcards?.recommendedDeck?.title || copy.flashcardArcade}
              description={
                flashcards?.recommendedDeck?.deckKey
                  ? copy.flashcardSummary(flashcards.recommendedDeck)
                  : copy.flashcardDescription
              }
              href={recommendedFlashcardHref}
              actionLabel={copy.openFlashcards}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="student-panel px-6 py-6 sm:px-7">
              <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.continueTraining}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.pickUp}</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="student-panel-soft px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.recentExerciseRun}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {practice?.recentSession ? PRACTICE_MODE_LABELS[practice.recentSession.mode] || practice.recentSession.mode : copy.noRecentPractice}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {practice?.recentSession ? `+${practice.recentSession.xpEarned} XP · ${practice.recentSession.accuracyRate}%` : copy.noExerciseMomentum}
                  </p>
                  <div className="mt-4">
                    <Link href={buildPracticeHref(initialParams, { tab: "exercises" })} className="student-button-secondary px-4 py-3 text-sm">
                      {copy.openExercises}
                    </Link>
                  </div>
                </div>
                <div className="student-panel-soft px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.recentFlashcardRun}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {flashcards?.recentSession ? FLASHCARD_GAME_MODE_LABELS[flashcards.recentSession.mode] || flashcards.recentSession.mode : copy.noRecentFlashcards}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {flashcards?.recentSession ? `+${flashcards.recentSession.xpEarned} XP · ${flashcards.recentSession.accuracyRate}%` : copy.noFlashcardMomentum}
                  </p>
                  <div className="mt-4">
                    <Link href={buildPracticeHref(initialParams, { tab: "flashcards" })} className="student-button-secondary px-4 py-3 text-sm">
                      {copy.openFlashcards}
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            <aside className="student-panel px-6 py-6 sm:px-7">
              <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.recentActivity}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.whatHappened}</h2>
              <div className="mt-5 space-y-3">
                <div className="rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">{trainingTabs.find((tab) => tab.id === "exercises")?.label}</p>
                  <p className="mt-1 text-sm text-muted">
                    {practice?.recentSession
                      ? `${PRACTICE_MODE_LABELS[practice.recentSession.mode] || practice.recentSession.mode} · ${formatDate(practice.recentSession.completedAt || practice.recentSession.startedAt, language)}`
                      : copy.noExerciseSessions}
                  </p>
                </div>
                <div className="rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">{trainingTabs.find((tab) => tab.id === "flashcards")?.label}</p>
                  <p className="mt-1 text-sm text-muted">
                    {flashcards?.recentSession
                      ? `${FLASHCARD_GAME_MODE_LABELS[flashcards.recentSession.mode] || flashcards.recentSession.mode} · ${formatDate(flashcards.recentSession.completedAt || flashcards.recentSession.startedAt, language)}`
                      : copy.noFlashcardSessions}
                  </p>
                </div>
                <div className="rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">{copy.thisWeek}</p>
                  <p className="mt-1 text-sm text-muted">{copy.weeklyPointsSummary(competition?.standing)}</p>
                </div>
              </div>
            </aside>
          </div>

          <CompetitionSummaryCard competition={competition} />
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

      {activeTab === "flashcards" ? (
        <FlashcardArcadeHub
          initialStudent={student}
          initialHubData={{
            ...flashcards,
            gamification,
            competition,
          }}
          initialParams={initialParams.flashcards}
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
