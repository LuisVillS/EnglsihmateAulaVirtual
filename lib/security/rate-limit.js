function toDate(value, fallback = null) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function isRateLimitLocked(record, now = new Date()) {
  const lockedUntil = toDate(record?.locked_until || record?.lockedUntil);
  if (!lockedUntil) return false;
  return lockedUntil.getTime() > now.getTime();
}

export function computeNextFailureWindow(
  record,
  {
    now = new Date(),
    windowMinutes = 10,
    maxAttempts = 4,
    lockMinutes = 20,
  } = {}
) {
  const currentWindowStart = toDate(record?.window_started_at || record?.windowStartedAt);
  const lockedUntil = toDate(record?.locked_until || record?.lockedUntil);
  const currentAttempts = Math.max(0, Number(record?.attempt_count || record?.attemptCount || 0) || 0);
  const nowDate = toDate(now, new Date()) || new Date();
  const windowMs = Math.max(1, Number(windowMinutes) || 10) * 60 * 1000;
  const lockMs = Math.max(1, Number(lockMinutes) || 20) * 60 * 1000;

  if (lockedUntil && lockedUntil.getTime() > nowDate.getTime()) {
    return {
      attemptCount: currentAttempts,
      windowStartedAt: currentWindowStart || nowDate,
      lockedUntil,
      locked: true,
    };
  }

  const withinWindow =
    currentWindowStart && nowDate.getTime() - currentWindowStart.getTime() < windowMs;
  const nextAttemptCount = withinWindow ? currentAttempts + 1 : 1;
  const nextWindowStart = withinWindow ? currentWindowStart : nowDate;
  const nextLockedUntil =
    nextAttemptCount >= Math.max(1, Number(maxAttempts) || 1)
      ? new Date(nowDate.getTime() + lockMs)
      : null;

  return {
    attemptCount: nextAttemptCount,
    windowStartedAt: nextWindowStart,
    lockedUntil: nextLockedUntil,
    locked: Boolean(nextLockedUntil),
  };
}
