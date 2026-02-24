const EF_MIN = 1.3;
const EF_MAX = 2.8;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toSafeInteger(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return rounded < 1 ? fallback : rounded;
}

export function qualityFromAttempt({ isCorrect, attempts }) {
  const tries = toSafeInteger(attempts, 1);
  if (!isCorrect) {
    if (tries >= 3) return 1;
    return 2;
  }
  if (tries === 1) return 5;
  if (tries === 2) return 4;
  return 3;
}

export function computeEaseFactor(prevEaseFactor, quality) {
  const previous = Number.isFinite(Number(prevEaseFactor)) ? Number(prevEaseFactor) : 2.5;
  const q = clamp(Number(quality) || 0, 0, 5);
  const updated = previous + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  return clamp(Number(updated.toFixed(2)), EF_MIN, EF_MAX);
}

export function computeIntervalDays({ prevIntervalDays, easeFactor, quality }) {
  const previous = toSafeInteger(prevIntervalDays, 1);
  const q = clamp(Number(quality) || 0, 0, 5);

  if (q < 3) {
    return 1;
  }

  const candidate = Math.round(previous * (Number(easeFactor) || 2.5));
  return Math.max(1, candidate);
}

export function computeSpacedRepetitionUpdate({
  prevIntervalDays,
  prevEaseFactor,
  isCorrect,
  attempts,
  now = new Date(),
}) {
  const quality = qualityFromAttempt({ isCorrect, attempts });
  const easeFactor = computeEaseFactor(prevEaseFactor, quality);
  const intervalDays = computeIntervalDays({
    prevIntervalDays,
    easeFactor,
    quality,
  });

  const date = now instanceof Date ? now : new Date(now);
  const nextDueAt = new Date(date.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    quality,
    easeFactor,
    intervalDays,
    nextDueAt: nextDueAt.toISOString(),
  };
}

