import {
  LEAGUE_TIER_LABELS,
  normalizeLeagueTier,
} from "@/lib/competition/constants";
import { getQuestIncrement, normalizeQuestRow } from "@/lib/competition/quests";
import {
  calculateCompetitionPoints,
  getNextTierFromSnapshot,
  summarizeLeagueStanding,
} from "@/lib/competition/scoring";
import {
  formatCountdown,
  getCompetitionWeekBounds,
  getSecondsUntil,
} from "@/lib/competition/time";
import { applyGamificationDelta } from "@/lib/gamification/mutations";
import { ensureGamificationProfile } from "@/lib/gamification/profile";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

function toCount(value) {
  return Math.max(0, Math.round(Number(value || 0) || 0));
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildLeagueTitle(tier, cohortNumber) {
  return `${LEAGUE_TIER_LABELS[normalizeLeagueTier(tier)]} League ${cohortNumber}`;
}

function resolveCompetitionDb(db) {
  if (hasServiceRoleClient()) {
    return getServiceSupabaseClient();
  }
  return db;
}

function computePromotionState({ tier, rankPosition, totalMembers, promotionSlots, demotionSlots }) {
  const normalizedTier = normalizeLeagueTier(tier);
  const safeRank = Math.max(1, toCount(rankPosition));
  const safeTotal = Math.max(1, toCount(totalMembers));
  const safePromotionSlots = Math.max(0, toCount(promotionSlots));
  const safeDemotionSlots = Math.max(0, toCount(demotionSlots));

  if (safeRank <= Math.min(safeTotal, safePromotionSlots)) {
    return normalizedTier === "diamond" ? "hold" : "promoted";
  }
  if (normalizedTier !== "bronze" && safeTotal > safeDemotionSlots && safeRank > safeTotal - safeDemotionSlots) {
    return "demoted";
  }
  return "safe";
}

async function tryFinalizeEndedCompetitionWeeks(db) {
  try {
    await db.rpc("finalize_ended_competition_weeks");
  } catch {
    // Best-effort fallback. The weekly load path still works even if the function has not been migrated yet.
  }
}

async function ensureCurrentCompetitionWeek(db, now = new Date()) {
  db = resolveCompetitionDb(db);
  const bounds = getCompetitionWeekBounds(now);

  const { data: existing, error: existingError } = await db
    .from("competition_weeks")
    .select("*")
    .eq("week_key", bounds.weekKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || "No se pudo cargar la semana competitiva actual.");
  }

  if (existing?.id) {
    return existing;
  }

  const { data: inserted, error: insertError } = await db
    .from("competition_weeks")
    .insert({
      week_key: bounds.weekKey,
      title: bounds.title,
      starts_at: bounds.startsAt,
      ends_at: bounds.endsAt,
      status: "active",
    })
    .select("*")
    .single();

  if (insertError) {
    // Handle race conditions on unique week_key.
    const fallback = await db
      .from("competition_weeks")
      .select("*")
      .eq("week_key", bounds.weekKey)
      .maybeSingle();
    if (fallback.error || !fallback.data?.id) {
      throw new Error(insertError.message || "No se pudo crear la semana competitiva actual.");
    }
    return fallback.data;
  }

  return inserted;
}

async function ensureWeeklyQuestProgressRows(db, { weekId, userId }) {
  db = resolveCompetitionDb(db);
  const { data: definitions, error: definitionsError } = await db
    .from("weekly_quest_definitions")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (definitionsError) {
    throw new Error(definitionsError.message || "No se pudieron cargar las misiones semanales.");
  }

  const { data: existingRows, error: progressError } = await db
    .from("weekly_quest_progress")
    .select("id, quest_definition_id")
    .eq("week_id", weekId)
    .eq("user_id", userId);

  if (progressError) {
    throw new Error(progressError.message || "No se pudo cargar el progreso de misiones.");
  }

  const existingIds = new Set((existingRows || []).map((row) => String(row?.quest_definition_id || "").trim()));
  const insertRows = (definitions || [])
    .filter((definition) => !existingIds.has(String(definition?.id || "").trim()))
    .map((definition) => ({
      week_id: weekId,
      user_id: userId,
      quest_definition_id: definition.id,
      progress_count: 0,
      target_count: toCount(definition.target_count || 1),
    }));

  if (insertRows.length) {
    const { error: insertError } = await db
      .from("weekly_quest_progress")
      .insert(insertRows);

    if (insertError) {
      throw new Error(insertError.message || "No se pudo inicializar el progreso de misiones.");
    }
  }

  const { data: rows, error: rowsError } = await db
    .from("weekly_quest_progress")
    .select(`
      *,
      definition:weekly_quest_definitions (
        id,
        code,
        title,
        description,
        reward_xp,
        metric_type,
        target_count,
        sort_order
      )
    `)
    .eq("week_id", weekId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (rowsError) {
    throw new Error(rowsError.message || "No se pudo cargar el estado final de misiones.");
  }

  return rows || [];
}

async function ensureLeagueMembership(db, { week, userId }) {
  db = resolveCompetitionDb(db);
  const { data: existingMembership, error: membershipError } = await db
    .from("weekly_league_memberships")
    .select(`
      *,
      league:weekly_leagues (
        id,
        tier,
        title,
        member_count,
        max_members,
        promotion_slots,
        demotion_slots,
        cohort_number
      )
    `)
    .eq("week_id", week.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message || "No se pudo cargar la liga semanal.");
  }

  if (existingMembership?.id) {
    return existingMembership;
  }

  const { data: latestSnapshot, error: snapshotError } = await db
    .from("weekly_rank_snapshots")
    .select("league_tier, promotion_state, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshotError) {
    throw new Error(snapshotError.message || "No se pudo resolver la liga anterior.");
  }

  const targetTier = getNextTierFromSnapshot(latestSnapshot);
  const { data: leagueRows, error: leaguesError } = await db
    .from("weekly_leagues")
    .select("*")
    .eq("week_id", week.id)
    .eq("tier", targetTier)
    .eq("status", "active")
    .order("cohort_number", { ascending: true });

  if (leaguesError) {
    throw new Error(leaguesError.message || "No se pudieron cargar las ligas disponibles.");
  }

  let league = (leagueRows || []).find((row) => toCount(row?.member_count) < toCount(row?.max_members)) || null;

  if (!league) {
    const highestCohortNumber = Math.max(0, ...(leagueRows || []).map((row) => toCount(row?.cohort_number)));
    const nextCohortNumber = highestCohortNumber + 1;
    const { data: insertedLeague, error: insertLeagueError } = await db
      .from("weekly_leagues")
      .insert({
        week_id: week.id,
        tier: targetTier,
        cohort_number: nextCohortNumber,
        title: buildLeagueTitle(targetTier, nextCohortNumber),
        max_members: 20,
        member_count: 0,
        promotion_slots: 3,
        demotion_slots: 3,
        status: "active",
      })
      .select("*")
      .single();

    if (insertLeagueError) {
      throw new Error(insertLeagueError.message || "No se pudo crear una liga semanal.");
    }

    league = insertedLeague;
  }

  const { data: insertedMembership, error: insertMembershipError } = await db
    .from("weekly_league_memberships")
    .insert({
      week_id: week.id,
      league_id: league.id,
      user_id: userId,
      league_tier: targetTier,
    })
    .select(`
      *,
      league:weekly_leagues (
        id,
        tier,
        title,
        member_count,
        max_members,
        promotion_slots,
        demotion_slots,
        cohort_number
      )
    `)
    .single();

  if (insertMembershipError) {
    const fallback = await db
      .from("weekly_league_memberships")
      .select(`
        *,
        league:weekly_leagues (
          id,
          tier,
          title,
          member_count,
          max_members,
          promotion_slots,
          demotion_slots,
          cohort_number
        )
      `)
      .eq("week_id", week.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (fallback.error || !fallback.data?.id) {
      throw new Error(insertMembershipError.message || "No se pudo asignar la liga semanal.");
    }
    return fallback.data;
  }

  const { count } = await db
    .from("weekly_league_memberships")
    .select("id", { count: "exact", head: true })
    .eq("league_id", insertedMembership.league_id);

  await db
    .from("weekly_leagues")
    .update({
      member_count: Math.max(1, toCount(count)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", insertedMembership.league_id);

  return insertedMembership;
}

async function refreshLeagueRanks(db, membership) {
  db = resolveCompetitionDb(db);
  const leagueId = membership?.league_id || membership?.leagueId;
  if (!leagueId) return;

  const { data: league, error: leagueError } = await db
    .from("weekly_leagues")
    .select("*")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueError || !league?.id) {
    return;
  }

  const { data: rows, error: rowsError } = await db
    .from("weekly_league_memberships")
    .select("id, weekly_points, average_accuracy, updated_at")
    .eq("league_id", leagueId)
    .order("weekly_points", { ascending: false })
    .order("average_accuracy", { ascending: false })
    .order("updated_at", { ascending: true });

  if (rowsError) {
    return;
  }

  const totalMembers = Math.max(1, (rows || []).length);
  for (let index = 0; index < (rows || []).length; index += 1) {
    const row = rows[index];
    const rankPosition = index + 1;
    const promotionState = computePromotionState({
      tier: league.tier,
      rankPosition,
      totalMembers,
      promotionSlots: league.promotion_slots,
      demotionSlots: league.demotion_slots,
    });
    await db
      .from("weekly_league_memberships")
      .update({
        rank_position: rankPosition,
        promotion_state: promotionState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  await db
    .from("weekly_leagues")
    .update({
      member_count: totalMembers,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leagueId);
}

async function updateQuestProgress(db, { userId, weekId, activity, legacyXpTotal }) {
  db = resolveCompetitionDb(db);
  const rows = await ensureWeeklyQuestProgressRows(db, { weekId, userId });
  let rewardXp = 0;

  for (const row of rows) {
    const increment = getQuestIncrement(row.definition, activity);
    if (!increment) continue;

    const nextProgress = Math.min(
      toCount(row.progress_count) + increment,
      Math.max(1, toCount(row.target_count || row.definition?.target_count || 1))
    );
    const completedBefore = Boolean(row.reward_granted_at);
    const isNowCompleted = nextProgress >= Math.max(1, toCount(row.target_count || row.definition?.target_count || 1));
    const shouldGrantReward = isNowCompleted && !completedBefore;
    const questReward = shouldGrantReward ? toCount(row.definition?.reward_xp) : 0;

    const { error: updateError } = await db
      .from("weekly_quest_progress")
      .update({
        progress_count: nextProgress,
        is_completed: isNowCompleted,
        completed_at: isNowCompleted && !row.completed_at ? new Date().toISOString() : row.completed_at,
        reward_xp_granted: toCount(row.reward_xp_granted) + questReward,
        reward_granted_at: shouldGrantReward ? new Date().toISOString() : row.reward_granted_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(updateError.message || "No se pudo actualizar el progreso de las misiones.");
    }

    rewardXp += questReward;
  }

  let gamification = null;
  if (rewardXp > 0) {
    gamification = await applyGamificationDelta(db, {
      userId,
      legacyXpTotal,
      xpDelta: rewardXp,
    });
  }

  const finalRows = await ensureWeeklyQuestProgressRows(db, { weekId, userId });
  return {
    rewardXp,
    gamification,
    quests: finalRows,
  };
}

function buildLeaderboardRows(rows, currentUserId) {
  const ordered = (rows || []).map((row, index) => ({
    userId: row?.user_id || null,
    name: row?.profile?.full_name || "Student",
    weeklyPoints: toCount(row?.weekly_points),
    practicePoints: toCount(row?.practice_points),
    flashcardPoints: toCount(row?.flashcard_points),
    averageAccuracy: Math.max(0, Math.min(100, Number(row?.average_accuracy || 0) || 0)),
    rankPosition: toCount(row?.rank_position || index + 1) || index + 1,
    promotionState: String(row?.promotion_state || "pending").trim().toLowerCase(),
    isCurrentUser: row?.user_id === currentUserId,
  }));

  const currentIndex = ordered.findIndex((row) => row.isCurrentUser);
  const nearby = currentIndex >= 0
    ? ordered.slice(Math.max(0, currentIndex - 2), Math.min(ordered.length, currentIndex + 3))
    : ordered.slice(0, 5);

  return {
    top: ordered.slice(0, 3),
    nearby,
    full: ordered,
  };
}

async function loadMembershipWithLeague(db, { membershipId, weekId, userId, fallbackMembership = null }) {
  const baseSelect = `
    *,
    league:weekly_leagues (
      id,
      tier,
      title,
      member_count,
      max_members,
      promotion_slots,
      demotion_slots,
      cohort_number
    )
  `;

  const query = membershipId
    ? db.from("weekly_league_memberships").select(baseSelect).eq("id", membershipId)
    : db.from("weekly_league_memberships").select(baseSelect).eq("week_id", weekId).eq("user_id", userId);

  const joinedResult = await query.maybeSingle();
  if (joinedResult.data?.id) {
    return joinedResult.data;
  }

  const fallbackQuery = membershipId
    ? db.from("weekly_league_memberships").select("*").eq("id", membershipId)
    : db.from("weekly_league_memberships").select("*").eq("week_id", weekId).eq("user_id", userId);

  const baseResult = await fallbackQuery.maybeSingle();
  const baseMembership = baseResult.data?.id ? baseResult.data : fallbackMembership?.id ? fallbackMembership : null;
  const loadError = joinedResult.error || baseResult.error;

  if (!baseMembership?.id) {
    return {
      membership: null,
      error: loadError,
    };
  }

  const leagueId = baseMembership.league_id || fallbackMembership?.league_id || fallbackMembership?.league?.id || null;
  let league = baseMembership.league || fallbackMembership?.league || null;
  if (leagueId && !league?.id) {
    const { data: leagueRow, error: leagueError } = await db
      .from("weekly_leagues")
      .select("id, tier, title, member_count, max_members, promotion_slots, demotion_slots, cohort_number")
      .eq("id", leagueId)
      .maybeSingle();

    if (leagueError && !leagueRow?.id) {
      return {
        membership: null,
        error: leagueError,
      };
    }
    league = leagueRow || league || null;
  }

  return {
    membership: {
      ...fallbackMembership,
      ...baseMembership,
      league,
    },
    error: loadError,
  };
}

async function loadCurrentCompetitionData(db, { userId, legacyXpTotal = 0 } = {}) {
  db = resolveCompetitionDb(db);
  await tryFinalizeEndedCompetitionWeeks(db);
  const week = await ensureCurrentCompetitionWeek(db);
  await ensureWeeklyQuestProgressRows(db, { weekId: week.id, userId });
  const initialMembership = await ensureLeagueMembership(db, { week, userId });
  await refreshLeagueRanks(db, initialMembership);

  const { membership: hydratedMembership, error: freshMembershipError } = await loadMembershipWithLeague(db, {
    membershipId: initialMembership?.id || null,
    weekId: week.id,
    userId,
    fallbackMembership: initialMembership,
  });
  const freshMembership = hydratedMembership?.id ? hydratedMembership : initialMembership;

  if (!freshMembership?.id) {
    throw new Error(freshMembershipError?.message || "No se pudo cargar la membresia semanal.");
  }
  if (freshMembershipError) {
    console.warn("Competition membership hydration fallback", {
      userId,
      weekId: week.id,
      membershipId: initialMembership?.id || null,
      message: freshMembershipError.message || String(freshMembershipError),
    });
  }

  const [leaderboardRowsResult, questRows, latestSnapshotResult, gamification] = await Promise.all([
    db
      .from("weekly_league_memberships")
      .select(`
        user_id,
        weekly_points,
        practice_points,
        flashcard_points,
        average_accuracy,
        rank_position,
        promotion_state,
        profile:profiles (
          full_name
        )
      `)
      .eq("league_id", freshMembership.league_id || freshMembership.league?.id || "")
      .order("rank_position", { ascending: true }),
    ensureWeeklyQuestProgressRows(db, { weekId: week.id, userId }),
    db
      .from("weekly_rank_snapshots")
      .select("league_tier, rank_position, promotion_state, reward_xp_awarded, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ensureGamificationProfile(db, {
      userId,
      legacyXpTotal,
    }),
  ]);

  if (leaderboardRowsResult.error) {
    throw new Error(leaderboardRowsResult.error.message || "No se pudo cargar el leaderboard semanal.");
  }

  return {
    gamification,
    week: {
      id: week.id,
      weekKey: week.week_key,
      title: week.title,
      startsAt: week.starts_at,
      endsAt: week.ends_at,
      endsInLabel: formatCountdown(getSecondsUntil(week.ends_at)),
    },
    league: {
      id: freshMembership.league?.id || null,
      title: freshMembership.league?.title || buildLeagueTitle(freshMembership.league_tier, 1),
      tier: normalizeLeagueTier(freshMembership.league_tier || freshMembership.league?.tier),
      memberCount: toCount(freshMembership.league?.member_count || 0),
      cohortNumber: toCount(freshMembership.league?.cohort_number || 1),
      promotionSlots: toCount(freshMembership.league?.promotion_slots || 3),
      demotionSlots: toCount(freshMembership.league?.demotion_slots || 3),
    },
    standing: summarizeLeagueStanding(freshMembership, freshMembership.league),
    leaderboard: buildLeaderboardRows(leaderboardRowsResult.data || [], userId),
    quests: (questRows || []).map((row) => normalizeQuestRow({
      id: row.id,
      code: row.definition?.code,
      title: row.definition?.title,
      description: row.definition?.description,
      reward_xp: row.definition?.reward_xp,
      metric_type: row.definition?.metric_type,
      progress_count: row.progress_count,
      target_count: row.target_count,
      is_completed: row.is_completed,
      completed_at: row.completed_at,
      reward_xp_granted: row.reward_xp_granted,
    })),
    latestSnapshot: latestSnapshotResult.error ? null : latestSnapshotResult.data || null,
  };
}

export async function recordCompetitionActivity(db, {
  userId,
  legacyXpTotal = 0,
  activity,
} = {}) {
  db = resolveCompetitionDb(db);
  const week = await ensureCurrentCompetitionWeek(db);
  const membership = await ensureLeagueMembership(db, { week, userId });
  const contribution = calculateCompetitionPoints(activity);

  const currentAccuracyTotal = toNumber(membership.accuracy_score_total);
  const currentCompletedRuns = toCount(membership.completed_runs);
  const nextCompletedRuns = currentCompletedRuns + toCount(contribution.completedRuns);
  const nextAccuracyTotal = currentAccuracyTotal + toNumber(contribution.accuracyScoreTotal);
  const nextAverageAccuracy = nextCompletedRuns
    ? Math.round((nextAccuracyTotal / nextCompletedRuns) * 100) / 100
    : 0;

  const { error: updateError } = await db
    .from("weekly_league_memberships")
    .update({
      weekly_points: toCount(membership.weekly_points) + toCount(contribution.weeklyPoints),
      practice_points: toCount(membership.practice_points) + toCount(contribution.practicePoints),
      flashcard_points: toCount(membership.flashcard_points) + toCount(contribution.flashcardPoints),
      weekly_xp_earned: toCount(membership.weekly_xp_earned) + toCount(contribution.weeklyXpEarned),
      practice_sessions_completed:
        toCount(membership.practice_sessions_completed) + toCount(contribution.practiceSessionsCompleted),
      flashcard_sessions_completed:
        toCount(membership.flashcard_sessions_completed) + toCount(contribution.flashcardSessionsCompleted),
      listening_items_completed:
        toCount(membership.listening_items_completed) + toCount(contribution.listeningItemsCompleted),
      weakness_sessions_completed:
        toCount(membership.weakness_sessions_completed) + toCount(contribution.weaknessSessionsCompleted),
      flashcard_writing_answers_completed:
        toCount(membership.flashcard_writing_answers_completed) + toCount(contribution.flashcardWritingAnswersCompleted),
      completed_runs: nextCompletedRuns,
      accuracy_score_total: nextAccuracyTotal,
      average_accuracy: nextAverageAccuracy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", membership.id);

  if (updateError) {
    throw new Error(updateError.message || "No se pudo actualizar la liga semanal.");
  }

  await refreshLeagueRanks(db, membership);

  const questUpdate = await updateQuestProgress(db, {
    userId,
    weekId: week.id,
    activity: contribution,
    legacyXpTotal,
  });

  const competition = await loadCurrentCompetitionData(db, {
    userId,
    legacyXpTotal: questUpdate.gamification?.lifetimeXp || legacyXpTotal,
  });

  return {
    contribution,
    questRewardXp: questUpdate.rewardXp,
    gamification: questUpdate.gamification || competition.gamification,
    competition,
  };
}

export async function loadCompetitionHubData(db, { userId, legacyXpTotal = 0 } = {}) {
  db = resolveCompetitionDb(db);
  return loadCurrentCompetitionData(db, { userId, legacyXpTotal });
}

export async function loadCompetitionSummary(db, { userId, legacyXpTotal = 0 } = {}) {
  db = resolveCompetitionDb(db);
  const data = await loadCurrentCompetitionData(db, { userId, legacyXpTotal });
  return {
    week: data.week,
    league: data.league,
    standing: data.standing,
    quests: data.quests,
  };
}
