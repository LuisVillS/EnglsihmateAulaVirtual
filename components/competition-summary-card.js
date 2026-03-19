"use client";

import Link from "next/link";
import { LEAGUE_TIER_LABELS } from "@/lib/competition/constants";

export default function CompetitionSummaryCard({ competition }) {
  if (!competition) return null;

  const tier = String(competition?.league?.tier || "bronze").trim().toLowerCase();
  const quests = Array.isArray(competition?.quests) ? competition.quests : [];

  return (
    <section className="student-panel px-6 py-6 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Weekly competition</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{LEAGUE_TIER_LABELS[tier] || "Bronze"} League</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Rank #{competition?.standing?.rankPosition || 0} of {competition?.standing?.memberCount || 0} · {competition?.week?.endsInLabel || "This week"}
          </p>
        </div>
        <span className="rounded-full border border-[rgba(16,52,116,0.12)] bg-[#eef4ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#103474]">
          {competition?.standing?.weeklyPoints || 0} pts
        </span>
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

      {quests.length ? (
        <div className="mt-5 space-y-3">
          {quests.slice(0, 2).map((quest) => (
            <div key={quest.id || quest.code} className="rounded-[16px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{quest.title}</p>
                <span className="text-xs font-semibold text-[#103474]">+{quest.rewardXp} XP</span>
              </div>
              <p className="mt-1 text-sm text-muted">{quest.progressCount}/{quest.targetCount}</p>
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

      <div className="mt-5">
        <Link href="/app/leaderboard" className="student-button-secondary px-4 py-3 text-sm">
          Open leaderboard
        </Link>
      </div>
    </section>
  );
}
