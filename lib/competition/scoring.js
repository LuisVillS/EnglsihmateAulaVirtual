import {
  LEAGUE_TIER_LABELS,
  PROMOTION_STATE_LABELS,
  getNextLeagueTier,
  getPreviousLeagueTier,
  normalizeLeagueTier,
} from "./constants.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toCount(value) {
  return Math.max(0, Math.round(Number(value || 0) || 0));
}

export function getNextTierFromSnapshot(snapshot) {
  const currentTier = normalizeLeagueTier(snapshot?.league_tier || snapshot?.leagueTier || "bronze");
  const promotionState = String(snapshot?.promotion_state || snapshot?.promotionState || "safe").trim().toLowerCase();
  if (promotionState === "promoted") {
    return getNextLeagueTier(currentTier);
  }
  if (promotionState === "demoted") {
    return getPreviousLeagueTier(currentTier);
  }
  return currentTier;
}

export function buildPromotionCopy({ tier, promotionState }) {
  const normalizedTier = normalizeLeagueTier(tier);
  const normalizedState = String(promotionState || "pending").trim().toLowerCase();

  if (normalizedState === "promoted") {
    return normalizedTier === "diamond"
      ? "You finished in the Diamond champion zone."
      : `You are on track to reach ${LEAGUE_TIER_LABELS[getNextLeagueTier(normalizedTier)]}.`;
  }
  if (normalizedState === "demoted") {
    return normalizedTier === "bronze"
      ? "Bronze players stay in Bronze this week."
      : `You are currently in the risk zone for ${LEAGUE_TIER_LABELS[getPreviousLeagueTier(normalizedTier)]}.`;
  }
  if (normalizedState === "hold") {
    return "Diamond players in the top zone stay at the top.";
  }
  return "Keep earning meaningful weekly points to move up.";
}

export function summarizeLeagueStanding(membership, league) {
  const rankPosition = toCount(membership?.rank_position || membership?.rankPosition || 0);
  const memberCount = Math.max(1, toCount(league?.member_count || league?.memberCount || 0));
  const promotionState = String(membership?.promotion_state || membership?.promotionState || "pending").trim().toLowerCase();
  return {
    tier: normalizeLeagueTier(membership?.league_tier || membership?.leagueTier || league?.tier || "bronze"),
    tierLabel: LEAGUE_TIER_LABELS[normalizeLeagueTier(membership?.league_tier || membership?.leagueTier || league?.tier || "bronze")],
    rankPosition,
    memberCount,
    weeklyPoints: toCount(membership?.weekly_points || membership?.weeklyPoints || 0),
    practicePoints: toCount(membership?.practice_points || membership?.practicePoints || 0),
    flashcardPoints: toCount(membership?.flashcard_points || membership?.flashcardPoints || 0),
    weeklyXpEarned: toCount(membership?.weekly_xp_earned || membership?.weeklyXpEarned || 0),
    averageAccuracy: clamp(Number(membership?.average_accuracy || membership?.averageAccuracy || 0) || 0, 0, 100),
    promotionState,
    promotionLabel: PROMOTION_STATE_LABELS[promotionState] || "Pending",
    promotionCopy: buildPromotionCopy({
      tier: membership?.league_tier || membership?.leagueTier || league?.tier,
      promotionState,
    }),
  };
}

export function calculateCompetitionPoints(activity = {}) {
  const source = String(activity?.source || "").trim().toLowerCase();

  if (source === "practice") {
    const answeredItems = toCount(activity?.answeredItems ?? activity?.totalItems ?? 0);
    const correctItems = toCount(activity?.correctItems);
    const accuracyPercent = clamp(Number(activity?.accuracyPercent || 0) || 0, 0, 100);
    const timeSpentSec = activity?.timeSpentSec == null ? null : Math.max(0, Number(activity.timeSpentSec) || 0);
    const mode = String(activity?.mode || "").trim().toLowerCase();
    const listeningItems = toCount(activity?.listeningItemsCompleted);
    const meaningful = answeredItems >= 6 && correctItems >= 2 && accuracyPercent >= 40;
    const suspiciouslyFast = timeSpentSec != null && answeredItems > 0 && timeSpentSec < answeredItems * 4;

    let points = 0;
    if (meaningful) {
      points = Math.min(62, (correctItems * 3) + answeredItems + (accuracyPercent >= 90 ? 8 : accuracyPercent >= 80 ? 5 : accuracyPercent >= 70 ? 3 : 0));
      if (mode === "timed" || mode === "weakness") {
        points += 4;
      }
      if (suspiciouslyFast) {
        points = Math.round(points * 0.35);
      }
    }

    return {
      meaningful,
      suspiciouslyFast,
      weeklyPoints: Math.max(0, points),
      practicePoints: Math.max(0, points),
      flashcardPoints: 0,
      weeklyXpEarned: Math.max(0, toCount(activity?.xpEarned)),
      practiceSessionsCompleted: meaningful ? 1 : 0,
      flashcardSessionsCompleted: 0,
      listeningItemsCompleted: listeningItems,
      weaknessSessionsCompleted: meaningful && mode === "weakness" ? 1 : 0,
      flashcardWritingAnswersCompleted: 0,
      completedRuns: meaningful ? 1 : 0,
      accuracyScoreTotal: meaningful ? accuracyPercent : 0,
    };
  }

  if (source === "flashcards") {
    const totalPrompts = toCount(activity?.totalPrompts);
    const correctAnswers = toCount(activity?.correctAnswers);
    const accuracyPercent = clamp(Number(activity?.accuracyPercent || 0) || 0, 0, 100);
    const durationSec = activity?.durationSec == null ? null : Math.max(0, Number(activity.durationSec) || 0);
    const mode = String(activity?.mode || "").trim().toLowerCase();
    const writingAnswers = mode === "writing_sprint" ? totalPrompts : 0;
    const meaningful = totalPrompts >= 6 && correctAnswers >= 2 && accuracyPercent >= 45;
    const suspiciouslyFast = durationSec != null && totalPrompts > 0 && durationSec < totalPrompts * 2.5;

    let points = 0;
    if (meaningful) {
      points = Math.min(58, (correctAnswers * 3) + Math.floor(totalPrompts / 2) + (accuracyPercent >= 90 ? 8 : accuracyPercent >= 80 ? 5 : accuracyPercent >= 70 ? 3 : 0));
      if (mode === "writing_sprint") {
        points += 5;
      } else if (mode === "speed_match" || mode === "memory_grid") {
        points += 3;
      }
      if (suspiciouslyFast) {
        points = Math.round(points * 0.4);
      }
    }

    return {
      meaningful,
      suspiciouslyFast,
      weeklyPoints: Math.max(0, points),
      practicePoints: 0,
      flashcardPoints: Math.max(0, points),
      weeklyXpEarned: Math.max(0, toCount(activity?.xpEarned)),
      practiceSessionsCompleted: 0,
      flashcardSessionsCompleted: meaningful ? 1 : 0,
      listeningItemsCompleted: 0,
      weaknessSessionsCompleted: 0,
      flashcardWritingAnswersCompleted: writingAnswers,
      completedRuns: meaningful ? 1 : 0,
      accuracyScoreTotal: meaningful ? accuracyPercent : 0,
    };
  }

  return {
    meaningful: false,
    suspiciouslyFast: false,
    weeklyPoints: 0,
    practicePoints: 0,
    flashcardPoints: 0,
    weeklyXpEarned: 0,
    practiceSessionsCompleted: 0,
    flashcardSessionsCompleted: 0,
    listeningItemsCompleted: 0,
    weaknessSessionsCompleted: 0,
    flashcardWritingAnswersCompleted: 0,
    completedRuns: 0,
    accuracyScoreTotal: 0,
  };
}
