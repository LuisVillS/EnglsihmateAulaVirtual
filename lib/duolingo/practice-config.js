export const PRACTICE_MODES = {
  QUICK: "quick",
  TOPIC: "topic",
  WEAKNESS: "weakness",
  MIXED_REVIEW: "mixed_review",
  TIMED: "timed",
  SCENARIO: "scenario",
  DIRECT: "direct",
};

export const PRACTICE_MODE_VALUES = Object.values(PRACTICE_MODES);

export const PRACTICE_MODE_LABELS = {
  [PRACTICE_MODES.QUICK]: "Quick Practice",
  [PRACTICE_MODES.TOPIC]: "Topic Drill",
  [PRACTICE_MODES.WEAKNESS]: "Weakness Recovery",
  [PRACTICE_MODES.MIXED_REVIEW]: "Mixed Review",
  [PRACTICE_MODES.TIMED]: "Timed Challenge",
  [PRACTICE_MODES.SCENARIO]: "Situational Practice",
  [PRACTICE_MODES.DIRECT]: "Direct Practice",
};

export const PRACTICE_SOURCE_REASONS = {
  NEW: "new",
  REVIEW: "review",
  WEAKNESS: "weakness",
  CHALLENGE: "challenge",
  SCENARIO: "scenario",
  CLASS: "class",
};

export function normalizePracticeMode(value, fallback = PRACTICE_MODES.MIXED_REVIEW) {
  const normalized = String(value || "").trim().toLowerCase();
  return PRACTICE_MODE_VALUES.includes(normalized) ? normalized : fallback;
}

export function normalizeSessionSize(value, fallback = 12) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(15, Math.max(5, Math.round(parsed)));
}

export function normalizeTimedSeconds(value, fallback = 180) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(600, Math.max(60, Math.round(parsed)));
}
