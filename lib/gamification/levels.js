const BASE_LEVEL_XP = 100;
const LEVEL_STEP_XP = 35;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeLifetimeXp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export function getXpRequiredForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  let total = 0;
  for (let current = 1; current < safeLevel; current += 1) {
    total += BASE_LEVEL_XP + ((current - 1) * LEVEL_STEP_XP);
  }
  return total;
}

export function getLevelFromXp(xp) {
  const safeXp = normalizeLifetimeXp(xp);
  let level = 1;

  while (getXpRequiredForLevel(level + 1) <= safeXp) {
    level += 1;
  }

  return level;
}

export function buildLevelProgress(xp) {
  const lifetimeXp = normalizeLifetimeXp(xp);
  const level = getLevelFromXp(lifetimeXp);
  const currentLevelStartXp = getXpRequiredForLevel(level);
  const nextLevelXp = getXpRequiredForLevel(level + 1);
  const levelSpan = Math.max(1, nextLevelXp - currentLevelStartXp);
  const xpIntoLevel = lifetimeXp - currentLevelStartXp;
  const xpToNextLevel = Math.max(0, nextLevelXp - lifetimeXp);
  const progressPercent = clamp(Math.round((xpIntoLevel / levelSpan) * 100), 0, 100);

  return {
    lifetimeXp,
    level,
    currentLevelStartXp,
    nextLevelXp,
    xpIntoLevel,
    xpToNextLevel,
    progressPercent,
  };
}
