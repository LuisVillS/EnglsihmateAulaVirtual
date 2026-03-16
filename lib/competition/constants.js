export const LEAGUE_TIERS = ["bronze", "silver", "gold", "diamond"];

export const LEAGUE_TIER_LABELS = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};

export const LEAGUE_TIER_META = {
  bronze: {
    accentClass: "from-[#a16207] via-[#c0842c] to-[#f5d08a]",
    badgeClass: "border-[#e7c57b]/50 bg-[#fff7e2] text-[#9a5b00]",
  },
  silver: {
    accentClass: "from-[#64748b] via-[#94a3b8] to-[#e2e8f0]",
    badgeClass: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
  },
  gold: {
    accentClass: "from-[#b45309] via-[#f59e0b] to-[#fef3c7]",
    badgeClass: "border-[#f7d27d] bg-[#fff8db] text-[#9a5b00]",
  },
  diamond: {
    accentClass: "from-[#0f766e] via-[#0891b2] to-[#c4f1ff]",
    badgeClass: "border-[#7dd3fc] bg-[#ecfeff] text-[#0f766e]",
  },
};

export const PROMOTION_STATE_LABELS = {
  pending: "Pending",
  promoted: "Promotion zone",
  safe: "Safe zone",
  demoted: "Risk zone",
  hold: "Diamond hold",
};

export const WEEKLY_QUEST_METRICS = {
  PRACTICE_SESSIONS_COMPLETED: "practice_sessions_completed",
  PRACTICE_LISTENING_ITEMS_COMPLETED: "practice_listening_items_completed",
  PRACTICE_WEAKNESS_SESSIONS_COMPLETED: "practice_weakness_sessions_completed",
  FLASHCARD_WRITING_ANSWERS_COMPLETED: "flashcard_writing_answers_completed",
  WEEKLY_XP_EARNED: "weekly_xp_earned",
};

export function normalizeLeagueTier(input, fallback = "bronze") {
  const value = String(input || "").trim().toLowerCase();
  return LEAGUE_TIERS.includes(value) ? value : fallback;
}

export function getNextLeagueTier(tier) {
  const normalized = normalizeLeagueTier(tier);
  const index = LEAGUE_TIERS.indexOf(normalized);
  if (index < 0 || index >= LEAGUE_TIERS.length - 1) {
    return normalized;
  }
  return LEAGUE_TIERS[index + 1];
}

export function getPreviousLeagueTier(tier) {
  const normalized = normalizeLeagueTier(tier);
  const index = LEAGUE_TIERS.indexOf(normalized);
  if (index <= 0) {
    return normalized;
  }
  return LEAGUE_TIERS[index - 1];
}

