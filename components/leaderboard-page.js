import Link from "next/link";

function buildViews(language) {
  if (language === "en") {
    return [
      { id: "weekly", label: "Weekly" },
      { id: "practice", label: "Practice" },
      { id: "flashcards", label: "Flashcards" },
    ];
  }

  return [
    { id: "weekly", label: "Semanal" },
    { id: "practice", label: "Practica" },
    { id: "flashcards", label: "Flashcards" },
  ];
}

function formatNumber(value, language = "es") {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "es-PE").format(Number(value || 0) || 0);
}

function buildCopy(language) {
  if (language === "en") {
    return {
      heroEyebrow: "Your Performance",
      heroTitle: (rank, leagueLabel) => `Your Position: #${rank} - ${leagueLabel}`,
      heroGap: (xp) => `You are only ${formatNumber(xp, language)} XP away from the next place.`,
      heroLead: (name) => `Keep pushing, ${name}!`,
      challengeLeader: "Challenge Leader",
      viewFullLeague: "View Full League",
      rankLabel: "League Rank",
      sectionEyebrow: "Competitive Tracking",
      sectionTitle: "Top Students",
      totalScore: "Total Score",
      you: "You",
      fullList: (count) => `View Full List (${formatNumber(count, language)} students)`,
      nextMilestoneEyebrow: "Next Milestone",
      nextMilestoneTitle: "Climb the leaderboard",
      nextMilestoneFallback: "Keep earning XP this week to move into a stronger position.",
      progressLabel: "Your Progress",
      streakTitle: (days) => `${formatNumber(days, language)} Day Streak`,
      streakCopy: "Keep your streak alive to secure your current momentum and continue scoring bonus XP.",
      streakCta: "Extend Streak",
      empty: "Leaderboard activity will appear here once your league becomes active.",
      moreDetails: "More details",
      topSpot: "You are leading the table this week.",
      pointsAway: (xp, rank) => `${formatNumber(xp, language)} XP away from #${rank}`,
      challengeCopy: "Use today's practice sessions to close the gap and keep your promotion pace.",
    };
  }

  return {
    heroEyebrow: "Your Performance",
    heroTitle: (rank, leagueLabel) => `Tu Posicion: #${rank} - ${leagueLabel}`,
    heroGap: (xp) => `Estas a solo ${formatNumber(xp, language)} XP de alcanzar el siguiente puesto.`,
    heroLead: (name) => `Sigue asi, ${name}!`,
    challengeLeader: "Desafiar Lider",
    viewFullLeague: "Ver Liga Completa",
    rankLabel: "Posicion en Liga",
    sectionEyebrow: "Competitive Tracking",
    sectionTitle: "Estudiantes Destacados",
    totalScore: "Puntaje Total",
    you: "You",
    fullList: (count) => `Ver Lista Completa (${formatNumber(count, language)} estudiantes)`,
    nextMilestoneEyebrow: "Proximo Hito",
    nextMilestoneTitle: "Sube en el ranking",
    nextMilestoneFallback: "Sigue ganando XP esta semana para mejorar tu posicion.",
    progressLabel: "Tu Progreso",
    streakTitle: (days) => `Racha de ${formatNumber(days, language)} Dias`,
    streakCopy: "Manten tu racha para proteger tu ritmo actual y seguir sumando XP extra.",
    streakCta: "Extender Racha",
    empty: "La actividad del ranking aparecera aqui cuando tu liga tenga mas movimiento.",
    moreDetails: "Mas detalles",
    topSpot: "Ya estas en el primer puesto esta semana.",
    pointsAway: (xp, rank) => `${formatNumber(xp, language)} XP para alcanzar el puesto #${rank}`,
    challengeCopy: "Usa las practicas de hoy para cerrar la distancia y mantener tu ritmo de ascenso.",
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

function getLeagueLabel(tier, language = "es") {
  const normalized = String(tier || "bronze").trim().toLowerCase();
  const labels = language === "en"
    ? { bronze: "Bronze League", silver: "Silver League", gold: "Gold League", diamond: "Diamond League" }
    : { bronze: "Liga Bronce", silver: "Liga Plata", gold: "Liga Oro", diamond: "Liga Diamante" };
  return labels[normalized] || labels.bronze;
}

function getTierAccent(rank) {
  if (rank === 1) return "border-l-[#ffd24d]";
  if (rank === 2) return "border-l-[#c8ccd5]";
  if (rank === 3) return "border-l-[#d39a62]";
  return "border-l-transparent";
}

function getInitials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "EM";
}

function getTrendMeta(row) {
  const state = String(row?.promotionState || "pending").trim().toLowerCase();
  if (state === "promoted") {
    return {
      badgeClass: "bg-[#ebfff1] text-[#16a34a]",
      icon: "+",
      value: "1",
    };
  }
  if (state === "demoted") {
    return {
      badgeClass: "bg-[#fff0f0] text-[#dc2626]",
      icon: "-",
      value: "1",
    };
  }
  return {
    badgeClass: "bg-[#f1f3f6] text-[#8a93a6]",
    icon: "=",
    value: "0",
  };
}

function buildPreviewRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const firstFive = safeRows.slice(0, 5);
  if (firstFive.some((row) => row.isCurrentUser)) {
    return firstFive;
  }
  const currentRow = safeRows.find((row) => row.isCurrentUser);
  if (!currentRow) {
    return firstFive;
  }
  return [...safeRows.slice(0, 4), currentRow].sort((left, right) => (left.derivedRank || 0) - (right.derivedRank || 0));
}

function buildMilestoneData(rows, standing, copy, language, view) {
  const currentRow = rows.find((row) => row.isCurrentUser) || null;
  const currentPoints = currentRow
    ? getViewValue(currentRow, view)
    : view === "practice"
      ? Number(standing?.practicePoints || 0) || 0
      : view === "flashcards"
        ? Number(standing?.flashcardPoints || 0) || 0
        : Number(standing?.weeklyPoints || 0) || 0;

  if (!currentRow) {
    return {
      title: copy.nextMilestoneTitle,
      description: copy.nextMilestoneFallback,
      current: currentPoints,
      target: Math.max(100, currentPoints || 100),
      progressPercent: currentPoints > 0 ? 100 : 0,
    };
  }

  const rowAbove = rows.find((row) => (row.derivedRank || 0) === (currentRow.derivedRank || 0) - 1) || null;
  if (rowAbove) {
    const target = getViewValue(rowAbove, view) + 1;
    const gap = Math.max(0, target - currentPoints);
    return {
      title: language === "en" ? `Climb to #${rowAbove.derivedRank}` : `Sube al puesto #${rowAbove.derivedRank}`,
      description: copy.pointsAway(gap, rowAbove.derivedRank),
      current: currentPoints,
      target,
      progressPercent: Math.max(0, Math.min(100, Math.round((currentPoints / target) * 100))),
    };
  }

  return {
    title: language === "en" ? "Defend the top position" : "Defiende el primer puesto",
    description: copy.topSpot,
    current: currentPoints,
    target: currentPoints,
    progressPercent: 100,
  };
}

function PerformanceHero({ copy, competition, student, currentRow, rankGap, language }) {
  const leagueLabel = getLeagueLabel(competition?.standing?.tier || competition?.league?.tier, language);
  const rankPosition = currentRow?.derivedRank || competition?.standing?.rankPosition || 0;

  return (
    <section className="relative overflow-hidden rounded-[30px] border border-[rgba(196,198,209,0.35)] bg-[#f9fafc] px-7 py-8 shadow-[0_18px_50px_rgba(0,25,67,0.05)] sm:px-10 sm:py-10">
      <div className="absolute -bottom-16 -right-14 h-60 w-60 rounded-full bg-[rgba(0,42,92,0.05)] blur-3xl" />
      <div className="relative grid gap-8 lg:grid-cols-[1fr_240px] lg:items-center">
        <div className="space-y-5 text-center lg:text-left">
          <span className="inline-flex rounded-full border border-[rgba(196,198,209,0.55)] bg-white px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#6f7f98]">
            {copy.heroEyebrow}
          </span>

          <div className="space-y-3">
            <h1 className="max-w-4xl text-[clamp(2.2rem,4.1vw,3.7rem)] font-extrabold leading-[0.98] tracking-[-0.045em] text-[#002a5c]">
              {copy.heroTitle(rankPosition, leagueLabel)}
            </h1>
            <p className="max-w-2xl text-[1rem] leading-8 text-[#4c5568]">
              {rankGap > 0 ? copy.heroGap(rankGap) : copy.topSpot}
              <br />
              {copy.heroLead(student?.fullName || "EnglishMate")}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 pt-1 lg:justify-start">
            <Link href="/app/practice/exercises" className="rounded-[18px] bg-[#002a5c] px-7 py-3.5 text-[0.95rem] font-bold text-white shadow-[0_16px_28px_rgba(0,42,92,0.22)] transition hover:translate-y-[-1px]">
              {copy.challengeLeader}
            </Link>
            <Link href="#leaderboard-list" className="rounded-[18px] border border-[rgba(196,198,209,0.7)] bg-white px-7 py-3.5 text-[0.95rem] font-bold text-[#33415d] transition hover:bg-[#f8fafc]">
              {copy.viewFullLeague}
            </Link>
          </div>
        </div>

        <div className="mx-auto flex min-h-[210px] w-full max-w-[250px] flex-col items-center justify-center rounded-[26px] border border-[rgba(196,198,209,0.35)] bg-white px-6 py-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="text-[clamp(4rem,7.5vw,5.1rem)] font-black leading-none tracking-[-0.07em] text-[#002a5c]">#{rankPosition}</div>
          <div className="mt-3 text-[0.82rem] font-bold uppercase tracking-[0.2em] text-[#6f7f98]">{copy.rankLabel}</div>
        </div>
      </div>
    </section>
  );
}

function LeaderboardRow({ row, currentTier, view, copy, language }) {
  const trend = getTrendMeta(row);
  const points = getViewValue(row, view);

  return (
    <article
      className={`grid gap-5 rounded-[24px] border-l-4 px-5 py-5 shadow-[0_12px_32px_rgba(0,25,67,0.04)] transition sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${
        row.isCurrentUser
          ? "border border-[#002a5c] bg-[#eef5ff]"
          : `border border-white bg-white ${getTierAccent(row.derivedRank || row.rankPosition)}`
      }`}
    >
      <div className="grid grid-cols-[68px_auto_1fr] items-center gap-4 sm:grid-cols-[72px_64px_1fr] sm:gap-6">
        <div className="text-center">
          <span className={`text-[1.85rem] font-black tracking-[-0.055em] ${row.isCurrentUser ? "text-[#002a5c]" : "text-[#dce3ee]"}`}>
            {String(row.derivedRank || row.rankPosition).padStart(2, "0")}
          </span>
        </div>

        <div className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-black uppercase shadow-inner ${row.isCurrentUser ? "bg-[#d9e2ff] text-[#002a5c]" : "bg-[#e9eef5] text-[#49617f]"}`}>
          {getInitials(row.name)}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[0.98rem] font-extrabold tracking-[-0.025em] text-[#002a5c] sm:text-[1.05rem]">{row.name}</h3>
            {row.isCurrentUser ? (
              <span className="rounded-full bg-[#002a5c] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                {copy.you}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[0.82rem] font-medium uppercase tracking-[0.08em] text-[#73809a]">
            {getLeagueLabel(currentTier, language)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 lg:min-w-[240px] lg:justify-end lg:gap-10">
        <div className="text-right">
          <div className="text-[1.65rem] font-black tracking-[-0.045em] text-[#002a5c]">{formatNumber(points, language)} XP</div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#a0acc1]">{copy.totalScore}</div>
        </div>
        <div className={`inline-flex min-w-[60px] items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[0.82rem] font-bold ${trend.badgeClass}`}>
          <span>{trend.icon}</span>
          <span>{trend.value}</span>
        </div>
      </div>
    </article>
  );
}

function TrophyWatermark() {
  return (
    <svg viewBox="0 0 200 200" className="h-36 w-36 text-[#f4f7fb]" fill="currentColor" aria-hidden="true">
      <path d="M62 34h76v18c0 19-10 36-26 45v17h16a10 10 0 0 1 10 10v6H62v-6a10 10 0 0 1 10-10h16V97C72 88 62 71 62 52V34Zm-16 8h12v10c0 18 7 34 19 45-18-2-31-18-31-37V42Zm96 0h12v18c0 19-13 35-31 37 12-11 19-27 19-45V42Z" />
    </svg>
  );
}

export default function LeaderboardPage({ student, competition, initialView = "weekly", language = "es" }) {
  const copy = buildCopy(language);
  const leaderboardViews = buildViews(language);
  const normalizedView = leaderboardViews.some((entry) => entry.id === initialView) ? initialView : "weekly";
  const orderedRows = sortRows(competition?.leaderboard?.full || [], normalizedView);
  const currentRow = orderedRows.find((row) => row.isCurrentUser) || null;
  const previewRows = buildPreviewRows(orderedRows);
  const memberCount = Number(competition?.standing?.memberCount || competition?.league?.memberCount || orderedRows.length || 0) || 0;
  const currentPoints = currentRow ? getViewValue(currentRow, normalizedView) : 0;
  const rowAbove = currentRow ? orderedRows.find((row) => (row.derivedRank || 0) === (currentRow.derivedRank || 0) - 1) : null;
  const rankGap = rowAbove ? Math.max(0, getViewValue(rowAbove, normalizedView) - currentPoints + 1) : 0;
  const milestone = buildMilestoneData(orderedRows, competition?.standing, copy, language, normalizedView);
  const streakDays = Math.max(0, Number(student?.currentStreak || 0) || 0);

  return (
    <section className="space-y-12 text-[#191c1d]">
      <PerformanceHero
        copy={copy}
        competition={competition}
        student={student}
        currentRow={currentRow}
        rankGap={rankGap}
        language={language}
      />

      <section className="space-y-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="mb-3 block text-xs font-bold uppercase tracking-[0.28em] text-[#94a3b8]">{copy.sectionEyebrow}</span>
            <h2 className="text-[clamp(1.85rem,3.3vw,2.8rem)] font-extrabold tracking-[-0.045em] text-[#002a5c]">{copy.sectionTitle}</h2>
          </div>

          <div className="flex flex-wrap gap-2 rounded-full bg-[#eff2f6] p-1.5">
            {leaderboardViews.map((view) => {
              const active = normalizedView === view.id;
              return (
                <Link
                  key={view.id}
                  href={buildLeaderboardHref(view.id)}
                  className={`rounded-full px-5 py-2.5 text-[0.88rem] font-bold transition ${
                    active ? "bg-[#002a5c] text-white shadow-[0_10px_24px_rgba(0,42,92,0.18)]" : "text-[#002a5c] hover:bg-white"
                  }`}
                >
                  {view.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div id="leaderboard-list" className="space-y-4">
          {previewRows.length ? (
            previewRows.map((row) => (
              <LeaderboardRow
                key={`${row.userId || row.name}-${row.derivedRank}`}
                row={row}
                currentTier={competition?.standing?.tier || competition?.league?.tier}
                view={normalizedView}
                copy={copy}
                language={language}
              />
            ))
          ) : (
            <div className="rounded-[24px] border border-[rgba(196,198,209,0.3)] bg-white px-6 py-8 text-center text-sm text-[#667085] shadow-[0_12px_30px_rgba(0,25,67,0.04)]">
              {copy.empty}
            </div>
          )}
        </div>

        <details className="group">
          <summary className="list-none">
            <div className="flex cursor-pointer justify-center pt-3">
              <span className="inline-flex items-center gap-3 text-[0.98rem] font-extrabold text-[#002a5c] transition group-open:opacity-85">
                {copy.fullList(memberCount)}
                <span className="text-2xl leading-none">{"->"}</span>
              </span>
            </div>
          </summary>

          <div className="mt-8 rounded-[26px] border border-[rgba(196,198,209,0.3)] bg-[#fbfcfd] px-4 py-4 shadow-[0_14px_36px_rgba(0,25,67,0.04)] sm:px-6 sm:py-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-xl font-extrabold tracking-[-0.03em] text-[#002a5c]">{copy.moreDetails}</h3>
              <Link href="/app/practice/exercises" className="text-sm font-bold text-[#002a5c]">
                {copy.challengeLeader}
              </Link>
            </div>
            <div className="space-y-3">
              {orderedRows.map((row) => (
                <LeaderboardRow
                  key={`full-${row.userId || row.name}-${row.derivedRank}`}
                  row={row}
                  currentTier={competition?.standing?.tier || competition?.league?.tier}
                  view={normalizedView}
                  copy={copy}
                  language={language}
                />
              ))}
            </div>
          </div>
        </details>
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <article className="relative overflow-hidden rounded-[30px] bg-white px-7 py-8 shadow-[0_18px_50px_rgba(0,25,67,0.05)] sm:px-9 sm:py-9">
          <div className="absolute -right-8 -top-8 opacity-90">
            <TrophyWatermark />
          </div>
          <div className="relative z-10 space-y-6">
            <div className="space-y-3">
              <span className="block text-[11px] font-bold uppercase tracking-[0.24em] text-[#9aa6bc]">{copy.nextMilestoneEyebrow}</span>
              <h3 className="text-[clamp(1.8rem,2.9vw,2.5rem)] font-extrabold tracking-[-0.045em] text-[#002a5c]">{milestone.title}</h3>
              <p className="max-w-2xl text-[0.98rem] leading-8 text-[#586274]">
                {milestone.description || copy.nextMilestoneFallback}
                <br />
                {copy.challengeCopy}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex flex-col gap-2 text-sm font-bold text-[#002a5c] sm:flex-row sm:items-center sm:justify-between">
                <span>{copy.progressLabel}</span>
                <span>{formatNumber(milestone.current, language)} / {formatNumber(milestone.target, language)} XP</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-[#edf1f6]">
                <div className="h-full rounded-full bg-[#002a5c]" style={{ width: `${milestone.progressPercent}%` }} />
              </div>
            </div>
          </div>
        </article>

        <article className="flex flex-col justify-center rounded-[30px] bg-[#002a5c] px-7 py-8 text-center text-white shadow-[0_24px_46px_rgba(0,42,92,0.24)] sm:px-8">
          <div className="mx-auto mb-4 text-5xl text-white/55">*</div>
          <h3 className="text-[1.75rem] font-extrabold tracking-[-0.035em]">{copy.streakTitle(streakDays)}</h3>
          <p className="mt-4 text-[0.96rem] leading-8 text-[#d5e2fb]">{copy.streakCopy}</p>
          <Link href="/app/practice/exercises" className="mt-8 inline-flex items-center justify-center rounded-[18px] bg-white px-6 py-3.5 text-[1rem] font-bold text-[#002a5c] transition hover:bg-[#f8fafc]">
            {copy.streakCta}
          </Link>
        </article>
      </section>
    </section>
  );
}
