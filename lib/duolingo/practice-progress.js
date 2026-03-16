import { PRACTICE_MODES } from "./practice-config.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calculatePracticeItemXp({ isCorrect, attempts = 1, mode }) {
  if (!isCorrect) return 1;

  let gain = attempts <= 1 ? 12 : attempts === 2 ? 9 : 7;
  if (mode === PRACTICE_MODES.TIMED) {
    gain += 2;
  }
  return gain;
}

export function calculatePracticeSessionBonus({
  mode,
  totalItems,
  correctItems,
  answeredItems,
  completed = true,
}) {
  const safeTotal = Math.max(0, Number(totalItems || 0) || 0);
  const safeCorrect = Math.max(0, Number(correctItems || 0) || 0);
  const safeAnswered = Math.max(0, Number(answeredItems || 0) || 0);
  if (!completed || !safeTotal) return 0;

  const accuracy = safeCorrect / safeTotal;
  let bonus = 10;

  if (safeAnswered >= safeTotal) {
    bonus += 5;
  }
  if (accuracy >= 0.98) {
    bonus += 15;
  } else if (accuracy >= 0.9) {
    bonus += 10;
  } else if (accuracy >= 0.8) {
    bonus += 6;
  }

  if (mode === PRACTICE_MODES.TIMED && accuracy >= 0.75) {
    bonus += 10;
  }

  if (mode === PRACTICE_MODES.WEAKNESS && accuracy >= 0.7) {
    bonus += 8;
  }

  return bonus;
}

export function calculateAccuracyPercent({ totalItems, correctItems }) {
  const safeTotal = Math.max(0, Number(totalItems || 0) || 0);
  if (!safeTotal) return 0;
  const safeCorrect = Math.max(0, Number(correctItems || 0) || 0);
  return clamp(Math.round((safeCorrect / safeTotal) * 100), 0, 100);
}

export function deriveRecommendedNextMode({ mode, accuracyPercent = 0, hasWeakness = false, hasReview = false }) {
  if (accuracyPercent < 70 && hasWeakness) {
    return PRACTICE_MODES.WEAKNESS;
  }
  if (mode === PRACTICE_MODES.TIMED && accuracyPercent < 80) {
    return PRACTICE_MODES.MIXED_REVIEW;
  }
  if (hasReview) {
    return PRACTICE_MODES.MIXED_REVIEW;
  }
  return PRACTICE_MODES.QUICK;
}
