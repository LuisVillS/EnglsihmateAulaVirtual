import Link from "next/link";
import { LEAGUE_TIER_LABELS } from "@/lib/competition/constants";

function buildCopy(language) {
  if (language === "en") {
    return {
      accuracy: "accuracy",
      complete: "Complete",
      thisWeek: "This week",
      bronzeLeague: "Bronze League",
      topPreview: "Top 3 preview",
      leagueLeaders: "League leaders",
      topPreviewEmpty: "Leaderboard previews will appear as soon as this league gets activity.",
      nearbyRivals: "Nearby rivals",
      localRace: "Your local race",
      nearbyEmpty: "Nearby rankings will appear here once league standings settle.",
      weeklyQuests: "Weekly quests",
      shortTermWins: "Short-term wins",
      questEmpty: "Weekly quests will appear here once the current competition week is active.",
      openFullLeaderboard: "Open full leaderboard",
      weeklyPoints: "Weekly points",
      practice: "Practice",
      flashcards: "Flashcards",
      status: "Status",
      pending: "Pending",
      weeklyStatus: "Weekly status",
      keepEarning: "Keep earning points this week.",
      weeklySummary: (competition) =>
        `Rank #${competition?.standing?.rankPosition || 0} of ${competition?.standing?.memberCount || 0} · ${competition?.week?.endsInLabel || "This week"}`,
      points: (competition) => `${competition?.standing?.weeklyPoints || 0} pts`,
    };
  }

  return {
    accuracy: "acierto",
    complete: "Completa",
    thisWeek: "Esta semana",
    bronzeLeague: "Liga Bronce",
    topPreview: "Vista previa del top 3",
    leagueLeaders: "Líderes de la liga",
    topPreviewEmpty: "La vista previa aparecerá cuando esta liga tenga actividad.",
    nearbyRivals: "Rivales cercanos",
    localRace: "Tu carrera local",
    nearbyEmpty: "Los puestos cercanos aparecerán cuando el ranking se estabilice.",
    weeklyQuests: "Misiones semanales",
    shortTermWins: "Victorias cortas",
    questEmpty: "Las misiones semanales aparecerán cuando la semana actual esté activa.",
    openFullLeaderboard: "Abrir ranking completo",
    weeklyPoints: "Puntos semanales",
    practice: "Práctica",
    flashcards: "Flashcards",
    status: "Estado",
    pending: "Pendiente",
    weeklyStatus: "Estado semanal",
    keepEarning: "Sigue sumando puntos esta semana.",
    weeklySummary: (competition) =>
      `Puesto #${competition?.standing?.rankPosition || 0} de ${competition?.standing?.memberCount || 0} · ${competition?.week?.endsInLabel || "Esta semana"}`,
    points: (competition) => `${competition?.standing?.weeklyPoints || 0} pts`,
  };
}

function LeaderboardRow({ row, highlight = false, accuracyLabel }) {
  return (
    <div className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[16px] border px-4 py-3 ${highlight ? "border-primary/25 bg-primary/10" : "border-[rgba(16,52,116,0.08)] bg-white"}`}>
      <span className="text-sm font-semibold text-foreground">#{row.rankPosition}</span>
      <div>
        <p className="text-sm font-semibold text-foreground">{row.name}</p>
        <p className="text-xs text-muted">{Math.round(Number(row.averageAccuracy || 0) || 0)}% {accuracyLabel}</p>
      </div>
      <span className="text-sm font-semibold text-foreground">{row.weeklyPoints}</span>
    </div>
  );
}

function QuestCard({ quest, copy }) {
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
          {quest.isCompleted ? copy.complete : `${quest.progressPercent}%`}
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

export default function WeeklySummaryPanel({ competition, language = "es" }) {
  const copy = buildCopy(language);
  const quests = Array.isArray(competition?.quests) ? competition.quests : [];
  const topRows = Array.isArray(competition?.leaderboard?.top) ? competition.leaderboard.top : [];
  const nearbyRows = Array.isArray(competition?.leaderboard?.nearby) ? competition.leaderboard.nearby : [];
  const tier = String(competition?.league?.tier || "bronze").trim().toLowerCase();

  return (
    <section className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="student-panel px-6 py-6 sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.thisWeek}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{LEAGUE_TIER_LABELS[tier] || copy.bronzeLeague}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{copy.weeklySummary(competition)}</p>
            </div>
            <span className="rounded-full border border-[rgba(16,52,116,0.12)] bg-[#eef4ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#103474]">
              {copy.points(competition)}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.weeklyPoints}</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{competition?.standing?.weeklyPoints || 0}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.practice}</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{competition?.standing?.practicePoints || 0}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.flashcards}</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{competition?.standing?.flashcardPoints || 0}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.status}</p>
              <p className="mt-2 text-sm font-semibold text-foreground">{competition?.standing?.promotionLabel || copy.pending}</p>
            </div>
          </div>

          <div className="mt-5 rounded-[18px] border border-[rgba(16,52,116,0.1)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] px-4 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">{competition?.standing?.promotionLabel || copy.weeklyStatus}</p>
            <p className="mt-2 text-sm leading-6 text-foreground">{competition?.standing?.promotionCopy || copy.keepEarning}</p>
          </div>
        </section>

        <aside className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.topPreview}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.leagueLeaders}</h2>
          <div className="mt-5 space-y-3">
            {topRows.length ? topRows.map((row) => (
              <LeaderboardRow key={`${row.userId}-${row.rankPosition}`} row={row} highlight={row.isCurrentUser} accuracyLabel={copy.accuracy} />
            )) : (
              <div className="rounded-[18px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4 text-sm text-muted">
                {copy.topPreviewEmpty}
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.nearbyRivals}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.localRace}</h2>
          <div className="mt-5 space-y-3">
            {nearbyRows.length ? nearbyRows.map((row) => (
              <LeaderboardRow key={`${row.userId}-${row.rankPosition}`} row={row} highlight={row.isCurrentUser} accuracyLabel={copy.accuracy} />
            )) : (
              <div className="rounded-[18px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4 text-sm text-muted">
                {copy.nearbyEmpty}
              </div>
            )}
          </div>
        </section>

        <section className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.weeklyQuests}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.shortTermWins}</h2>
          <div className="mt-5 grid gap-3">
            {quests.length ? quests.map((quest) => (
              <QuestCard key={quest.id || quest.code} quest={quest} copy={copy} />
            )) : (
              <div className="rounded-[18px] border border-[rgba(16,52,116,0.08)] bg-white px-4 py-4 text-sm text-muted">
                {copy.questEmpty}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="flex justify-end">
        <Link href="/app/leaderboard" className="student-button-primary px-4 py-3 text-sm">
          {copy.openFullLeaderboard}
        </Link>
      </div>
    </section>
  );
}
