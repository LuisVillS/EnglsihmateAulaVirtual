import Link from "next/link";
import { LEAGUE_TIER_LABELS, LEAGUE_TIER_META } from "@/lib/competition/constants";

function buildViews(language) {
  if (language === "en") {
    return [
      { id: "weekly", label: "Weekly XP" },
      { id: "practice", label: "Practice XP" },
      { id: "flashcards", label: "Flashcard XP" },
    ];
  }

  return [
    { id: "weekly", label: "XP semanal" },
    { id: "practice", label: "XP de práctica" },
    { id: "flashcards", label: "XP de flashcards" },
  ];
}

function buildCopy(language) {
  if (language === "en") {
    return {
      accuracy: "accuracy",
      heroTitle: "League standings and weekly movement.",
      heroDescription: "Compare your weekly performance, track the promotion zone, and see who is directly around you.",
      studentFallback: "Student",
      thisWeek: "This week",
      currentLeague: "Current league",
      bronze: "Bronze",
      rankOf: (standing) => `Rank #${standing?.rankPosition || 0} of ${standing?.memberCount || 0}`,
      pending: "Pending",
      weekly: "Weekly",
      practice: "Practice",
      flashcards: "Flashcards",
      keepEarning: "Keep earning points this week.",
      top3: "Top 3",
      leagueLeaders: "League leaders",
      promotionZone: "Promotion zone",
      weeklyStatus: "Weekly status",
      promotionSlots: "Promotion slots",
      demotionSlots: "Demotion slots",
      backToPractice: "Back to Let's Practice",
      nearbyRivals: "Nearby rivals",
      localRanking: "Your local ranking view",
      fullStandings: "Full standings",
      currentLeagueTable: "Current league table",
      weeklyQuests: "Weekly quests",
      questSnapshot: "Quest snapshot",
      openThisWeek: "Open this week",
    };
  }

  return {
    accuracy: "acierto",
    heroTitle: "Tabla de posiciones y movimiento semanal.",
    heroDescription: "Compara tu rendimiento semanal, revisa la zona de ascenso y mira quiénes están a tu alrededor.",
    studentFallback: "Estudiante",
    thisWeek: "Esta semana",
    currentLeague: "Liga actual",
    bronze: "Bronce",
    rankOf: (standing) => `Puesto #${standing?.rankPosition || 0} de ${standing?.memberCount || 0}`,
    pending: "Pendiente",
    weekly: "Semanal",
    practice: "Práctica",
    flashcards: "Flashcards",
    keepEarning: "Sigue sumando puntos esta semana.",
    top3: "Top 3",
    leagueLeaders: "Líderes de la liga",
    promotionZone: "Zona de ascenso",
    weeklyStatus: "Estado semanal",
    promotionSlots: "Cupos de ascenso",
    demotionSlots: "Cupos de descenso",
    backToPractice: "Volver a Let's Practice",
    nearbyRivals: "Rivales cercanos",
    localRanking: "Tu vista local del ranking",
    fullStandings: "Tabla completa",
    currentLeagueTable: "Tabla actual de la liga",
    weeklyQuests: "Misiones semanales",
    questSnapshot: "Resumen de misiones",
    openThisWeek: "Abrir esta semana",
  };
}

function buildLeaderboardHref(view) {
  const params = new URLSearchParams();
  if (view && view !== "weekly") {
    params.set("view", view);
  }
  return params.toString() ? `/app/leaderboard?${params.toString()}` : "/app/leaderboard";
}

function getViewValue(row, view) {
  if (view === "practice") return Number(row?.practicePoints || 0) || 0;
  if (view === "flashcards") return Number(row?.flashcardPoints || 0) || 0;
  return Number(row?.weeklyPoints || 0) || 0;
}

function sortRows(rows, view) {
  return [...(Array.isArray(rows) ? rows : [])]
    .sort((left, right) => {
      const byPoints = getViewValue(right, view) - getViewValue(left, view);
      if (byPoints !== 0) return byPoints;
      return (Number(right?.averageAccuracy || 0) || 0) - (Number(left?.averageAccuracy || 0) || 0);
    })
    .map((row, index) => ({
      ...row,
      derivedRank: index + 1,
    }));
}

function LeaderboardRow({ row, view, highlight = false, accuracyLabel }) {
  return (
    <div className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[16px] border px-4 py-3 ${highlight ? "border-primary/25 bg-primary/10" : "border-[rgba(16,52,116,0.08)] bg-white"}`}>
      <span className="text-sm font-semibold text-foreground">#{row.derivedRank || row.rankPosition}</span>
      <div>
        <p className="text-sm font-semibold text-foreground">{row.name}</p>
        <p className="text-xs text-muted">{Math.round(Number(row.averageAccuracy || 0) || 0)}% {accuracyLabel}</p>
      </div>
      <span className="text-sm font-semibold text-foreground">{getViewValue(row, view)}</span>
    </div>
  );
}

export default function LeaderboardPage({ student, competition, initialView = "weekly", language = "es" }) {
  const copy = buildCopy(language);
  const leaderboardViews = buildViews(language);
  const normalizedView = leaderboardViews.some((entry) => entry.id === initialView) ? initialView : "weekly";
  const orderedRows = sortRows(competition?.leaderboard?.full || [], normalizedView);
  const currentIndex = orderedRows.findIndex((row) => row.isCurrentUser);
  const nearbyRows = currentIndex >= 0
    ? orderedRows.slice(Math.max(0, currentIndex - 2), Math.min(orderedRows.length, currentIndex + 3))
    : orderedRows.slice(0, 5);
  const topRows = orderedRows.slice(0, 3);
  const tier = String(competition?.league?.tier || "bronze").trim().toLowerCase();
  const tierMeta = LEAGUE_TIER_META[tier] || LEAGUE_TIER_META.bronze;
  const quests = Array.isArray(competition?.quests) ? competition.quests : [];

  return (
    <section className="space-y-6 text-foreground">
      <header className="student-panel relative overflow-hidden px-6 py-7 sm:px-7">
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${tierMeta.accentClass} opacity-15`} />
        <div className="relative grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-muted">Ranking</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">{copy.heroTitle}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{copy.heroDescription}</p>
            <p className="mt-4 text-sm font-medium text-foreground">{student?.fullName || copy.studentFallback} · {competition?.week?.title || copy.thisWeek}</p>
          </div>

          <div className="student-panel-soft px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted">{copy.currentLeague}</p>
                <h2 className="mt-2 text-3xl font-semibold text-foreground">{LEAGUE_TIER_LABELS[tier] || copy.bronze}</h2>
                <p className="mt-1 text-sm text-muted">{copy.rankOf(competition?.standing)}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tierMeta.badgeClass}`}>
                {competition?.standing?.promotionLabel || copy.pending}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.weekly}</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{competition?.standing?.weeklyPoints || 0}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.practice}</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{competition?.standing?.practicePoints || 0}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.flashcards}</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{competition?.standing?.flashcardPoints || 0}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">{competition?.standing?.promotionCopy || copy.keepEarning}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        {leaderboardViews.map((view) => {
          const active = normalizedView === view.id;
          return (
            <Link
              key={view.id}
              href={buildLeaderboardHref(view.id)}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${active ? "border-primary/30 bg-primary/10 text-primary" : "border-[rgba(16,52,116,0.12)] bg-white text-foreground hover:border-primary/25 hover:bg-[#f8fbff]"}`}
            >
              {view.label}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.top3}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.leagueLeaders}</h2>
          <div className="mt-5 space-y-3">
            {topRows.map((row) => (
              <LeaderboardRow key={`${row.userId}-${row.derivedRank}`} row={row} view={normalizedView} highlight={row.isCurrentUser} accuracyLabel={copy.accuracy} />
            ))}
          </div>
        </section>

        <aside className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.promotionZone}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{competition?.standing?.promotionLabel || copy.weeklyStatus}</h2>
          <p className="mt-3 text-sm leading-6 text-muted">{competition?.standing?.promotionCopy || copy.keepEarning}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.promotionSlots}</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{competition?.league?.promotionSlots || 0}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted">{copy.demotionSlots}</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{competition?.league?.demotionSlots || 0}</p>
            </div>
          </div>
          <div className="mt-5">
            <Link href="/app/practice" className="student-button-secondary px-4 py-3 text-sm">
              {copy.backToPractice}
            </Link>
          </div>
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.nearbyRivals}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.localRanking}</h2>
          <div className="mt-5 space-y-3">
            {nearbyRows.map((row) => (
              <LeaderboardRow key={`${row.userId}-${row.derivedRank}`} row={row} view={normalizedView} highlight={row.isCurrentUser} accuracyLabel={copy.accuracy} />
            ))}
          </div>
        </section>

        <section className="student-panel px-6 py-6 sm:px-7">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.fullStandings}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.currentLeagueTable}</h2>
          <div className="mt-5 space-y-3">
            {orderedRows.map((row) => (
              <LeaderboardRow key={`${row.userId}-${row.derivedRank}`} row={row} view={normalizedView} highlight={row.isCurrentUser} accuracyLabel={copy.accuracy} />
            ))}
          </div>
        </section>
      </div>

      {quests.length ? (
        <section className="student-panel px-6 py-6 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">{copy.weeklyQuests}</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{copy.questSnapshot}</h2>
            </div>
            <Link href="/app/practice?tab=this-week" className="student-button-secondary px-4 py-3 text-sm">
              {copy.openThisWeek}
            </Link>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {quests.slice(0, 3).map((quest) => (
              <div key={quest.id || quest.code} className="rounded-[18px] border border-[rgba(16,52,116,0.1)] bg-white px-4 py-4">
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
        </section>
      ) : null}
    </section>
  );
}
