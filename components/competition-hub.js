"use client";

import Link from "next/link";
import { LEAGUE_TIER_LABELS, LEAGUE_TIER_META } from "@/lib/competition/constants";

function TierBadge({ tier }) {
  const normalized = String(tier || "bronze").trim().toLowerCase();
  const meta = LEAGUE_TIER_META[normalized] || LEAGUE_TIER_META.bronze;
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${meta.badgeClass}`}>
      {LEAGUE_TIER_LABELS[normalized] || "Bronze"}
    </span>
  );
}

function QuestCard({ quest }) {
  return (
    <article className="rounded-[18px] border border-[rgba(16,52,116,0.1)] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{quest.title}</h3>
          <p className="mt-1 text-sm text-muted">{quest.description}</p>
        </div>
        <span className="rounded-full border border-[rgba(16,52,116,0.12)] bg-[#eef4ff] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#103474]">
          +{quest.rewardXp} XP
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{quest.progressCount}/{quest.targetCount}</span>
        <span className={quest.isCompleted ? "font-semibold text-success" : "text-muted"}>
          {quest.isCompleted ? "Complete" : `${quest.progressPercent}%`}
        </span>
      </div>
      <div className="mt-3 h-2.5 w-full rounded-full bg-[#eef3ff]">
        <div
          className={`h-full rounded-full ${quest.isCompleted ? "bg-success" : "bg-gradient-to-r from-primary via-primary-2 to-accent"}`}
          style={{ width: `${Math.max(0, Math.min(100, Number(quest.progressPercent || 0) || 0))}%` }}
        />
      </div>
    </article>
  );
}

function LeaderboardRow({ row, highlight = false }) {
  return (
    <div className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[16px] border px-4 py-3 ${highlight ? "border-primary/25 bg-primary/10" : "border-[rgba(16,52,116,0.08)] bg-white"}`}>
      <span className="text-sm font-semibold text-foreground">#{row.rankPosition}</span>
      <div>
        <p className="text-sm font-semibold text-foreground">{row.name}</p>
        <p className="text-xs text-muted">{Math.round(Number(row.averageAccuracy || 0) || 0)}% accuracy</p>
      </div>
      <span className="text-sm font-semibold text-foreground">{row.weeklyPoints}</span>
    </div>
  );
}

export default function CompetitionHub({
  student,
  competition,
}) {
  const level = Number(competition?.gamification?.level || 1) || 1;
  const xpIntoLevel = Number(competition?.gamification?.xpIntoLevel || 0) || 0;
  const xpToNextLevel = Number(competition?.gamification?.xpToNextLevel || 0) || 0;
  const progressPercent = Number(competition?.gamification?.progressPercent || 0) || 0;
  const quests = Array.isArray(competition?.quests) ? competition.quests : [];
  const topRows = Array.isArray(competition?.leaderboard?.top) ? competition.leaderboard.top : [];
  const nearbyRows = Array.isArray(competition?.leaderboard?.nearby) ? competition.leaderboard.nearby : [];

  return (
    <section className="space-y-6 text-foreground">
      <header className="student-panel relative overflow-hidden px-6 py-7 sm:px-7">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_top_right,rgba(241,61,79,0.16),transparent_58%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-[48%] bg-[radial-gradient(circle_at_bottom_left,rgba(16,52,116,0.18),transparent_60%)]" />
        <div className="relative grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-muted">Weekly Competition</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Local leagues, weekly quests, meaningful points.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Practice Arena and Flashcard Arcade both feed the same weekly league. Finish quests, stay out of the risk zone, and push for promotion.
            </p>
            <p className="mt-4 text-sm font-medium text-foreground">{student?.fullName || "Student"} · {competition?.week?.title || "This week"}</p>
          </div>

          <div className="student-panel-soft px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Lifetime level</p>
                <h2 className="mt-2 text-3xl font-semibold text-foreground">Level {level}</h2>
                <p className="mt-1 text-sm text-muted">{Number(competition?.gamification?.lifetimeXp || 0)} lifetime XP</p>
              </div>
              <TierBadge tier={competition?.league?.tier} />
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

      <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="student-panel px-6 py-6 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Current league</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{competition?.league?.title || "Bronze League"}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Rank #{competition?.standing?.rankPosition || 0} of {competition?.standing?.memberCount || 0} · {competition?.week?.endsInLabel || "This week"} left
              </p>
            </div>
            <TierBadge tier={competition?.league?.tier} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Weekly points</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{competition?.standing?.weeklyPoints || 0}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Practice</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{competition?.standing?.practicePoints || 0}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Flashcards</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{competition?.standing?.flashcardPoints || 0}</p>
            </div>
          </div>

          <div className="mt-5 rounded-[18px] border border-[rgba(16,52,116,0.1)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">{competition?.standing?.promotionLabel || "Weekly status"}</p>
            <p className="mt-2 text-sm leading-6 text-foreground">{competition?.standing?.promotionCopy || "Keep earning points this week."}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/app/practice" className="student-button-primary px-4 py-2.5 text-sm">
                Open Practice Arena
              </Link>
              <Link href="/app/flashcards" className="student-button-secondary px-4 py-2.5 text-sm">
                Open Flashcard Arcade
              </Link>
            </div>
          </div>
        </section>

        <aside className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Top 3</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">League leaders</h2>
          <div className="mt-5 space-y-3">
            {topRows.length ? topRows.map((row) => (
              <LeaderboardRow key={`${row.userId}-${row.rankPosition}`} row={row} highlight={row.isCurrentUser} />
            )) : (
              <div className="rounded-[18px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4 text-sm text-muted">
                Your league standings will appear as soon as the cohort fills with activity.
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Nearby rivals</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">Your local ranking view</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Focus on the competitors around you instead of a giant global ladder.
          </p>
          <div className="mt-5 space-y-3">
            {nearbyRows.map((row) => (
              <LeaderboardRow key={`${row.userId}-${row.rankPosition}`} row={row} highlight={row.isCurrentUser} />
            ))}
          </div>
        </section>

        <section className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Weekly quests</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">Short-term wins for this week</h2>
          <div className="mt-5 grid gap-3">
            {quests.length ? quests.map((quest) => (
              <QuestCard key={quest.id || quest.code} quest={quest} />
            )) : (
              <div className="rounded-[18px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4 text-sm text-muted">
                Weekly quests will appear here once the current competition week is active.
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

