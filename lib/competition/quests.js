import { WEEKLY_QUEST_METRICS } from "./constants.js";

function toCount(value) {
  return Math.max(0, Math.round(Number(value || 0) || 0));
}

export function getQuestIncrement(definition, activity = {}) {
  const metricType = String(definition?.metric_type || definition?.metricType || "").trim();
  switch (metricType) {
    case WEEKLY_QUEST_METRICS.PRACTICE_SESSIONS_COMPLETED:
      return toCount(activity?.practiceSessionsCompleted);
    case WEEKLY_QUEST_METRICS.PRACTICE_LISTENING_ITEMS_COMPLETED:
      return toCount(activity?.listeningItemsCompleted);
    case WEEKLY_QUEST_METRICS.PRACTICE_WEAKNESS_SESSIONS_COMPLETED:
      return toCount(activity?.weaknessSessionsCompleted);
    case WEEKLY_QUEST_METRICS.FLASHCARD_WRITING_ANSWERS_COMPLETED:
      return toCount(activity?.flashcardWritingAnswersCompleted);
    case WEEKLY_QUEST_METRICS.WEEKLY_XP_EARNED:
      return toCount(activity?.weeklyXpEarned);
    default:
      return 0;
  }
}

export function normalizeQuestRow(row) {
  const progressCount = toCount(row?.progress_count ?? row?.progressCount);
  const targetCount = Math.max(1, toCount(row?.target_count ?? row?.targetCount ?? 1));
  return {
    id: String(row?.id || "").trim(),
    code: String(row?.code || row?.quest_code || "").trim(),
    title: String(row?.title || "").trim(),
    description: String(row?.description || "").trim(),
    rewardXp: toCount(row?.reward_xp ?? row?.rewardXp),
    metricType: String(row?.metric_type || row?.metricType || "").trim(),
    progressCount,
    targetCount,
    progressPercent: Math.min(100, Math.round((progressCount / targetCount) * 100)),
    isCompleted: Boolean(row?.is_completed ?? row?.isCompleted ?? progressCount >= targetCount),
    completedAt: row?.completed_at || row?.completedAt || null,
    rewardXpGranted: toCount(row?.reward_xp_granted ?? row?.rewardXpGranted),
  };
}
