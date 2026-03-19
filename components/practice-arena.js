"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PRACTICE_MODE_LABELS, PRACTICE_MODES } from "@/lib/duolingo/practice-config";
import CompetitionSummaryCard from "@/components/competition-summary-card";

const StudentPracticeSession = dynamic(() => import("@/components/student-practice-session"), {
  ssr: false,
  loading: () => (
    <section className="student-panel px-6 py-8 text-center">
      <p className="text-sm text-muted">Preparing your practice session...</p>
    </section>
  ),
});

function formatModeLabel(mode) {
  return PRACTICE_MODE_LABELS[mode] || "Practice";
}

function formatDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function buildSessionQuery(config) {
  const params = new URLSearchParams();

  if (config?.mode) params.set("mode", config.mode);
  if (config?.size) params.set("size", String(config.size));
  if (config?.timeLimitSec) params.set("time_limit_sec", String(config.timeLimitSec));
  if (config?.sourceContext) params.set("source", config.sourceContext);
  if (config?.filters?.skill) params.set("skill", config.filters.skill);
  if (config?.filters?.cefrLevel) params.set("cefr", config.filters.cefrLevel);
  if (config?.filters?.categoryId) params.set("category_id", config.filters.categoryId);
  if (config?.filters?.theme) params.set("theme", config.filters.theme);
  if (config?.filters?.scenario) params.set("scenario", config.filters.scenario);

  const exerciseIds = Array.isArray(config?.exerciseIds) ? config.exerciseIds : [];
  for (const exerciseId of exerciseIds) {
    params.append("exercise_id", exerciseId);
  }

  return params.toString() ? `/api/session?${params.toString()}` : "/api/session";
}

function aggregateBreakdown(items = [], results = []) {
  const byType = new Map();
  const byReason = new Map();
  const resultByExerciseId = new Map(results.map((row) => [String(row?.exercise_id || ""), row]));

  for (const item of items) {
    const result = resultByExerciseId.get(String(item?.id || ""));
    const typeLabel = String(item?.type || "").replace(/_/g, " ");
    const reasonLabel = String(item?.source_reason || item?.mode || "practice").replace(/_/g, " ");
    const typeEntry = byType.get(typeLabel) || { label: typeLabel, total: 0, correct: 0 };
    const reasonEntry = byReason.get(reasonLabel) || { label: reasonLabel, total: 0, correct: 0 };

    typeEntry.total += 1;
    reasonEntry.total += 1;
    if (result?.is_correct) {
      typeEntry.correct += 1;
      reasonEntry.correct += 1;
    }

    byType.set(typeLabel, typeEntry);
    byReason.set(reasonLabel, reasonEntry);
  }

  return {
    byType: Array.from(byType.values()),
    byReason: Array.from(byReason.values()),
  };
}

function ModeCard({ title, description, badge, accentClass, onClick, disabled = false, actionLabel = "Start" }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[18px] border border-[rgba(16,52,116,0.1)] bg-white p-5 text-left shadow-[0_16px_32px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-[rgba(16,52,116,0.2)] hover:shadow-[0_20px_40px_rgba(15,23,42,0.08)] disabled:cursor-not-allowed disabled:opacity-60 ${accentClass}`}
    >
      <div className="relative z-10 space-y-3">
        {badge ? (
          <span className="inline-flex rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4b5563]">
            {badge}
          </span>
        ) : null}
        <div>
          <h3 className="text-[1.35rem] font-semibold text-[#0f172a]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#103474]">
          {actionLabel}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-white/40 blur-2xl transition group-hover:scale-110" />
    </button>
  );
}

export default function PracticeArena({
  initialStudent,
  initialHubData,
  initialParams,
  showHero = true,
  showCompetitionSummary = true,
  onGamificationChange,
  onCompetitionChange,
}) {
  const allowedCefrLevel = initialHubData?.allowedCefrLevel || initialStudent?.cefrLevel || "";
  const [gamification, setGamification] = useState(initialHubData?.gamification || null);
  const [competition, setCompetition] = useState(initialHubData?.competition || null);
  const [activeSession, setActiveSession] = useState(null);
  const [completionSummary, setCompletionSummary] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState("");
  const [topicFilters, setTopicFilters] = useState({
    skill: initialParams?.skill || "",
    cefrLevel: allowedCefrLevel,
    categoryId: initialParams?.categoryId || "",
    theme: "",
    scenario: initialParams?.scenario || "",
  });
  const autoStartedRef = useRef(false);

  const categories = useMemo(() => initialHubData?.categories || [], [initialHubData?.categories]);
  const scenarios = useMemo(() => initialHubData?.scenarios || [], [initialHubData?.scenarios]);
  const recommendation = initialHubData?.recommendation || null;
  const recentSession = initialHubData?.recentSession || null;

  const filteredCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (topicFilters.skill && category.skill !== topicFilters.skill) return false;
        if (topicFilters.cefrLevel && category.cefrLevel !== topicFilters.cefrLevel) return false;
        return true;
      }),
    [categories, topicFilters.cefrLevel, topicFilters.skill]
  );

  const startSession = useCallback(async (config) => {
    setLoadingSession(true);
    setError("");
    try {
      const response = await fetch(buildSessionQuery(config), {
        method: "GET",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo iniciar la practica.");
      }

      startTransition(() => {
        const nextGamification = data?.gamification || gamification;
        setGamification(nextGamification);
        if (data?.gamification) {
          onGamificationChange?.(nextGamification);
        }
        setCompletionSummary(null);
        setActiveSession({
          ...(data?.session || {}),
          request: config,
        });
      });
    } catch (sessionError) {
      setError(sessionError.message || "No se pudo iniciar la practica.");
    } finally {
      setLoadingSession(false);
    }
  }, [gamification, onGamificationChange]);

  useEffect(() => {
    if (autoStartedRef.current) return;
    const hasDirectIds = Array.isArray(initialParams?.exerciseIds) && initialParams.exerciseIds.length > 0;
    const hasMode = Boolean(initialParams?.mode);
    if (!hasDirectIds && !hasMode) return;

    autoStartedRef.current = true;
    startSession({
      mode: initialParams?.mode || PRACTICE_MODES.DIRECT,
      exerciseIds: initialParams?.exerciseIds || [],
      size: 12,
      sourceContext: "practice_route",
                  filters: {
                    skill: initialParams?.skill || "",
                    cefrLevel: allowedCefrLevel,
                    categoryId: initialParams?.categoryId || "",
                    scenario: initialParams?.scenario || "",
                  },
    });
  }, [allowedCefrLevel, initialParams, startSession]);

  if (activeSession) {
    return (
      <StudentPracticeSession
        session={activeSession}
        gamification={gamification}
        onGamificationChange={(nextGamification) => {
          setGamification(nextGamification);
          onGamificationChange?.(nextGamification);
        }}
        onExit={() => setActiveSession(null)}
        onCompleted={(summary) => {
          if (summary?.competition) {
            setCompetition(summary.competition);
            onCompetitionChange?.(summary.competition);
          }
          setCompletionSummary(summary);
          setActiveSession(null);
        }}
      />
    );
  }

  const level = Number(gamification?.level || 1) || 1;
  const xpIntoLevel = Number(gamification?.xpIntoLevel || 0) || 0;
  const xpToNextLevel = Number(gamification?.xpToNextLevel || 0) || 0;
  const progressPercent = Number(gamification?.progressPercent || 0) || 0;
  const completionBreakdown = completionSummary
    ? aggregateBreakdown(completionSummary.items, completionSummary.results)
    : null;

  return (
    <section className="space-y-6 text-foreground">
      {showHero ? (
        <header className="student-panel relative overflow-hidden px-6 py-7 sm:px-7">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_top_right,rgba(241,61,79,0.16),transparent_58%)]" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[48%] bg-[radial-gradient(circle_at_bottom_left,rgba(16,52,116,0.18),transparent_60%)]" />
          <div className="relative grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <p className="text-xs uppercase tracking-[0.34em] text-muted">Practice Arena</p>
              <h1 className="mt-2 text-3xl font-semibold text-foreground">Train with real sessions, not just drills.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                Build XP through focused practice, recover weak areas, and keep your account level moving with short server-generated sessions.
              </p>
            </div>

            <div className="student-panel-soft px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Current level</p>
                  <h2 className="mt-2 text-3xl font-semibold text-foreground">Level {level}</h2>
                  <p className="mt-1 text-sm text-muted">{Number(gamification?.lifetimeXp || 0)} lifetime XP</p>
                </div>
                <span className="rounded-full border border-[rgba(16,52,116,0.12)] bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#103474]">
                  {initialStudent?.courseLevel || "Open track"}
                </span>
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Progress to next level</span>
                  <span className="text-muted">{xpIntoLevel} XP in level</span>
                </div>
                <div className="mt-3 h-3 w-full rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-muted">{xpToNextLevel} XP to reach Level {level + 1}</p>
              </div>
            </div>
          </div>
        </header>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {completionSummary ? (
        <section className="student-panel px-6 py-6 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Session complete</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{formatModeLabel(completionSummary.mode)} finished</h2>
              <p className="mt-2 text-sm text-muted">
                Accuracy {completionSummary.accuracyPercent}% · {completionSummary.correctItems}/{completionSummary.totalItems} correct · +{completionSummary.xpEarned} XP
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="student-panel-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Accuracy</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{completionSummary.accuracyPercent}%</p>
              </div>
              <div className="student-panel-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">XP earned</p>
                <p className="mt-2 text-xl font-semibold text-foreground">+{completionSummary.xpEarned}</p>
              </div>
              <div className="student-panel-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Next move</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{formatModeLabel(completionSummary.recommendedNextMode || PRACTICE_MODES.QUICK)}</p>
              </div>
            </div>
          </div>

          {completionBreakdown ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="student-panel-soft px-4 py-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted">By exercise type</p>
                <div className="mt-4 space-y-3">
                  {completionBreakdown.byType.map((entry) => (
                    <div key={entry.label} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{entry.label}</span>
                      <span className="text-muted">{entry.correct}/{entry.total}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="student-panel-soft px-4 py-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted">By source</p>
                <div className="mt-4 space-y-3">
                  {completionBreakdown.byReason.map((entry) => (
                    <div key={entry.label} className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize text-foreground">{entry.label}</span>
                      <span className="text-muted">{entry.correct}/{entry.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => startSession(completionSummary.request)}
              disabled={loadingSession}
              className="student-button-primary px-4 py-3 text-sm"
            >
              Practice again
            </button>
            <button
              type="button"
              disabled={loadingSession}
              onClick={() =>
                startSession({
                  mode: completionSummary.recommendedNextMode || PRACTICE_MODES.QUICK,
                  size: 12,
                  sourceContext: "practice_recommendation",
                  filters: completionSummary.recommendedNextMode === PRACTICE_MODES.WEAKNESS && recommendation?.weakestSkill
                    ? { skill: recommendation.weakestSkill }
                    : {},
                })
              }
              className="student-button-secondary px-4 py-3 text-sm"
            >
              Start recommended mode
            </button>
            <button
              type="button"
              onClick={() => setCompletionSummary(null)}
              className="student-button-secondary px-4 py-3 text-sm"
            >
              Back to arena
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Recommended next</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{recommendation?.title || "Start where it feels right."}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            {recommendation?.description || "Use the mode cards below to launch a short practice session."}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Due review</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{Number(recommendation?.dueReviewCount || 0)}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Weakest skill</p>
              <p className="mt-2 text-sm font-semibold capitalize text-foreground">{recommendation?.weakestSkill || "Balanced"}</p>
            </div>
          </div>
          <div className="mt-5">
            <button
              type="button"
              disabled={loadingSession}
              onClick={() =>
                startSession({
                  mode: recommendation?.mode || PRACTICE_MODES.QUICK,
                  size: 12,
                  sourceContext: "practice_recommendation",
                })
              }
              className="student-button-primary px-4 py-3 text-sm"
            >
              {loadingSession ? "Loading..." : `Start ${formatModeLabel(recommendation?.mode || PRACTICE_MODES.QUICK)}`}
            </button>
          </div>
        </section>

        <aside className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Recent practice</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">
            {recentSession ? formatModeLabel(recentSession.mode) : "No sessions yet"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            {recentSession
              ? `Last run ${formatDate(recentSession.completedAt || recentSession.startedAt)} with ${recentSession.accuracyRate}% accuracy and +${recentSession.xpEarned} XP.`
              : "Your completed sessions will appear here after your first Practice Arena run."}
          </p>
          {recentSession ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="student-panel-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Accuracy</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{recentSession.accuracyRate}%</p>
              </div>
              <div className="student-panel-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">XP</p>
                <p className="mt-2 text-lg font-semibold text-foreground">+{recentSession.xpEarned}</p>
              </div>
              <div className="student-panel-soft px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Suggested</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{formatModeLabel(recentSession.recommendedNextMode || PRACTICE_MODES.QUICK)}</p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {showCompetitionSummary ? <CompetitionSummaryCard competition={competition} /> : null}

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Modes</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">Choose how you want to train</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ModeCard
            title="Quick Practice"
            description="Fast mixed start with 12 varied items and immediate feedback."
            badge="Fast start"
            accentClass="bg-[linear-gradient(180deg,#ffffff_0%,#f6fbff_100%)]"
            onClick={() => startSession({ mode: PRACTICE_MODES.QUICK, size: 12, sourceContext: "practice_quick", filters: {} })}
            actionLabel={loadingSession ? "Loading..." : "Launch"}
          />
          <ModeCard
            title="Weakness Recovery"
            description="Pulls from mistakes, overdue review, and your weakest recent skill."
            badge="Adaptive"
            accentClass="bg-[linear-gradient(180deg,#ffffff_0%,#fff7f8_100%)]"
            onClick={() => startSession({ mode: PRACTICE_MODES.WEAKNESS, size: 12, sourceContext: "practice_weakness", filters: { cefrLevel: allowedCefrLevel } })}
            actionLabel={loadingSession ? "Loading..." : "Recover"}
          />
          <ModeCard
            title="Mixed Review"
            description="Balanced new + review session built from the existing adaptive planner."
            badge="Core mode"
            accentClass="bg-[linear-gradient(180deg,#ffffff_0%,#f8f8ff_100%)]"
            onClick={() => startSession({ mode: PRACTICE_MODES.MIXED_REVIEW, size: 12, sourceContext: "practice_mixed", filters: { cefrLevel: allowedCefrLevel } })}
            actionLabel={loadingSession ? "Loading..." : "Start review"}
          />
          <ModeCard
            title="Timed Challenge"
            description="Short pressure round with compact item types, ready to feed ranked play later."
            badge="3 minutes"
            accentClass="bg-[linear-gradient(180deg,#ffffff_0%,#fffaf2_100%)]"
            onClick={() => startSession({ mode: PRACTICE_MODES.TIMED, size: 12, timeLimitSec: 180, sourceContext: "practice_timed", filters: { cefrLevel: allowedCefrLevel } })}
            actionLabel={loadingSession ? "Loading..." : "Beat the clock"}
          />
          {scenarios.length ? (
            <ModeCard
              title="Situational Practice"
              description="Use scenario-tagged exercises like airport, restaurant, or interview when available."
              badge="Foundation ready"
              accentClass="bg-[linear-gradient(180deg,#ffffff_0%,#f7fffb_100%)]"
              onClick={() => startSession({
                mode: PRACTICE_MODES.SCENARIO,
                size: 12,
                sourceContext: "practice_scenario",
                filters: {
                  scenario: topicFilters.scenario || scenarios[0]?.value || "",
                  cefrLevel: allowedCefrLevel,
                },
              })}
              actionLabel={loadingSession ? "Loading..." : "Start scenario"}
            />
          ) : null}
        </div>
      </section>

      <section className="student-panel px-6 py-6 sm:px-7">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Topic Drill</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">Build a filtered practice session</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Start from your assigned level, then narrow the session by skill, category, or scenario. Empty filters only show content available for your current level.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Your practice level</span>
              <div className="flex min-h-[52px] items-center rounded-[14px] border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground">
                {allowedCefrLevel || "Open track"}
              </div>
            </div>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Skill</span>
              <select
                value={topicFilters.skill}
                onChange={(event) =>
                  setTopicFilters((current) => ({
                    ...current,
                    skill: event.target.value,
                    categoryId: "",
                  }))
                }
                className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-sm text-foreground"
              >
                <option value="">Any skill</option>
                <option value="grammar">Grammar</option>
                <option value="listening">Listening</option>
                <option value="reading">Reading</option>
                <option value="vocabulary">Vocabulary</option>
              </select>
            </label>

            <label className="space-y-2 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Theme / category</span>
              <select
                value={topicFilters.categoryId}
                onChange={(event) =>
                  setTopicFilters((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
                className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-sm text-foreground"
              >
                <option value="">Any category</option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} · {category.skill} · {category.cefrLevel}
                  </option>
                ))}
              </select>
            </label>

            {scenarios.length ? (
              <label className="space-y-2 sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Scenario tag</span>
                <select
                  value={topicFilters.scenario}
                  onChange={(event) =>
                    setTopicFilters((current) => ({
                      ...current,
                      scenario: event.target.value,
                    }))
                  }
                  className="w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-sm text-foreground"
                >
                  <option value="">Any scenario</option>
                  {scenarios.map((scenario) => (
                    <option key={scenario.value} value={scenario.value}>
                      {scenario.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loadingSession}
            onClick={() =>
              startSession({
                mode: PRACTICE_MODES.TOPIC,
                size: 12,
                sourceContext: "practice_topic",
                filters: {
                  skill: topicFilters.skill,
                  cefrLevel: allowedCefrLevel,
                  categoryId: topicFilters.categoryId,
                },
              })
            }
            className="student-button-primary px-4 py-3 text-sm"
          >
            {loadingSession ? "Loading..." : "Start Topic Drill"}
          </button>
          <button
            type="button"
            disabled={loadingSession || !topicFilters.scenario}
            onClick={() =>
              startSession({
                mode: PRACTICE_MODES.SCENARIO,
                size: 12,
                sourceContext: "practice_scenario",
                filters: {
                  scenario: topicFilters.scenario,
                  skill: topicFilters.skill,
                  cefrLevel: allowedCefrLevel,
                },
              })
            }
            className="student-button-secondary px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Start scenario filter
          </button>
        </div>
      </section>
    </section>
  );
}
