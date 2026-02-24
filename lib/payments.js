export function getCurrentBillingMonthDate(baseDate = new Date()) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
}

export function getNextBillingMonthDate(baseDate = new Date()) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  return new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
}

export function formatBillingMonth(date) {
  if (!(date instanceof Date)) return null;
  return date.toISOString().slice(0, 10);
}

export function getPaymentWindowStart(nextBillingMonth) {
  if (!(nextBillingMonth instanceof Date)) return null;
  return new Date(nextBillingMonth.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export function isPaymentWindowOpen(now = new Date(), nextBillingMonth = getNextBillingMonthDate(now)) {
  const windowStart = getPaymentWindowStart(nextBillingMonth);
  if (!windowStart) return false;
  return now.getTime() >= windowStart.getTime();
}

const DEFAULT_RENEWAL_PREOPEN_HOURS = 24;

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  const raw = String(value).trim();
  if (!raw) return null;

  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) {
    const year = Number(direct[1]);
    const month = Number(direct[2]);
    const day = Number(direct[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toMonthStartUtc(dateValue) {
  const parsed = parseDateValue(dateValue);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addUtcMonths(dateValue, months) {
  if (!(dateValue instanceof Date) || !Number.isFinite(dateValue.getTime())) return null;
  return new Date(Date.UTC(dateValue.getUTCFullYear(), dateValue.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function getLimaDateParts(dateValue) {
  const parsed = parseDateValue(dateValue);
  if (!parsed) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(parsed);
  const partByType = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  if (!partByType.year || !partByType.month || !partByType.day) return null;
  return {
    year: Number(partByType.year),
    month: Number(partByType.month),
    day: Number(partByType.day),
    dateKey: `${partByType.year}-${partByType.month}-${partByType.day}`,
    monthKey: `${partByType.year}-${partByType.month}-01`,
  };
}

function getSessionCycleKey(session) {
  if (!session) return null;
  const cycleMonthRaw = String(session.cycle_month || "").trim();
  if (/^\d{4}-\d{2}/.test(cycleMonthRaw)) {
    return `${cycleMonthRaw.slice(0, 7)}-01`;
  }
  const startsAtParts = getLimaDateParts(session.starts_at || session.session_date);
  return startsAtParts?.monthKey || null;
}

function getSessionStartsAt(session) {
  const startsAt = parseDateValue(session?.starts_at || session?.session_date);
  return startsAt && Number.isFinite(startsAt.getTime()) ? startsAt : null;
}

function getSessionEndsAt(session, startsAt) {
  const endsAt = parseDateValue(session?.ends_at);
  if (endsAt && Number.isFinite(endsAt.getTime())) return endsAt;
  if (startsAt && Number.isFinite(startsAt.getTime())) {
    return new Date(startsAt.getTime() + 60 * 60 * 1000);
  }
  return null;
}

function normalizeCycleSessions(sessions = []) {
  const grouped = new Map();
  for (const session of sessions || []) {
    const cycleKey = getSessionCycleKey(session);
    const startsAt = getSessionStartsAt(session);
    if (!cycleKey || !startsAt) continue;
    const endsAt = getSessionEndsAt(session, startsAt);
    const current = grouped.get(cycleKey) || [];
    current.push({
      ...session,
      startsAt,
      endsAt,
      sessionInCycle: Number(session?.session_in_cycle) || null,
    });
    grouped.set(cycleKey, current);
  }

  const cycles = Array.from(grouped.entries())
    .map(([cycleKey, rows]) => {
      const sortedRows = [...rows].sort((a, b) => {
        if (a.sessionInCycle != null && b.sessionInCycle != null && a.sessionInCycle !== b.sessionInCycle) {
          return a.sessionInCycle - b.sessionInCycle;
        }
        return a.startsAt.getTime() - b.startsAt.getTime();
      });
      const classOne = sortedRows.find((row) => row.sessionInCycle === 1) || sortedRows[0] || null;
      const classTen = sortedRows.find((row) => row.sessionInCycle === 10) || sortedRows[9] || sortedRows[0] || null;
      const firstStart = classOne?.startsAt || sortedRows[0]?.startsAt || null;
      const lastEnd = sortedRows.reduce((max, row) => {
        const candidate = row.endsAt || row.startsAt;
        if (!candidate) return max;
        if (!max) return candidate;
        return candidate.getTime() > max.getTime() ? candidate : max;
      }, null);
      return {
        cycleKey,
        rows: sortedRows,
        classOneStart: classOne?.startsAt || null,
        classTenStart: classTen?.startsAt || null,
        firstStart,
        lastEnd,
      };
    })
    .filter((cycle) => cycle.firstStart)
    .sort((a, b) => a.firstStart.getTime() - b.firstStart.getTime());

  return cycles;
}

function resolveSessionBasedRenewal({
  nowDate,
  sessions = [],
  preOpenHours = DEFAULT_RENEWAL_PREOPEN_HOURS,
}) {
  const cycles = normalizeCycleSessions(sessions);
  if (!cycles.length) {
    return null;
  }

  const nowMs = nowDate.getTime();
  let currentIndex = 0;
  for (let idx = 0; idx < cycles.length; idx += 1) {
    if (cycles[idx].firstStart.getTime() <= nowMs) {
      currentIndex = idx;
    } else {
      break;
    }
  }

  if (nowMs < cycles[0].firstStart.getTime()) {
    currentIndex = 0;
  }

  const currentCycle = cycles[currentIndex] || cycles[0];
  const nextCycle = cycles[currentIndex + 1] || null;
  const preOpenMs = Math.max(0, Number(preOpenHours) || 0) * 60 * 60 * 1000;
  const rawWindowStart = currentCycle.classTenStart || currentCycle.firstStart;
  const windowStart = rawWindowStart ? new Date(rawWindowStart.getTime() - preOpenMs) : null;
  const windowEnd = nextCycle?.classOneStart || null;
  const canRenewSameCourse = Boolean(nextCycle?.cycleKey);
  const canPayNow = Boolean(
    canRenewSameCourse &&
      windowStart &&
      nowMs >= windowStart.getTime() &&
      (!windowEnd || nowMs < windowEnd.getTime())
  );
  const hasCourseEnded = Boolean(!nextCycle && currentCycle?.lastEnd && nowMs > currentCycle.lastEnd.getTime());
  const canStartNewEnrollment = Boolean(
    (!nextCycle && windowStart && nowMs >= windowStart.getTime()) || hasCourseEnded
  );

  return {
    isCourseBounded: true,
    mode: "session-based",
    cycles,
    currentCycle,
    nextCycle,
    courseStartMonth: parseDateValue(cycles[0].cycleKey),
    courseEndMonth: parseDateValue(cycles[cycles.length - 1].cycleKey),
    currentCourseMonth: parseDateValue(currentCycle.cycleKey),
    nextBillingMonth: nextCycle ? parseDateValue(nextCycle.cycleKey) : null,
    currentBillingMonthKey: currentCycle.cycleKey,
    nextBillingMonthKey: nextCycle?.cycleKey || null,
    enabledFrom: windowStart,
    canPayNow,
    canRenewSameCourse,
    isFinalCourseMonth: !nextCycle,
    hasCourseEnded,
    canStartNewEnrollment,
    windowStart,
    windowEnd,
  };
}

export function resolveCourseRenewalContext({
  now = new Date(),
  courseStartDate,
  courseEndDate,
  sessions = [],
  preOpenHours = DEFAULT_RENEWAL_PREOPEN_HOURS,
}) {
  const nowDate = parseDateValue(now) || new Date();
  const sessionBased = resolveSessionBasedRenewal({
    nowDate,
    sessions,
    preOpenHours,
  });
  if (sessionBased) {
    return sessionBased;
  }

  const nowMonthStart = toMonthStartUtc(nowDate);
  const courseStartMonth = toMonthStartUtc(courseStartDate);
  const courseEndMonth = toMonthStartUtc(courseEndDate);

  if (!courseStartMonth || !courseEndMonth || courseEndMonth.getTime() < courseStartMonth.getTime()) {
    const fallbackNext = getNextBillingMonthDate(nowDate);
    return {
      isCourseBounded: false,
      courseStartMonth: null,
      courseEndMonth: null,
      currentCourseMonth: getCurrentBillingMonthDate(nowDate),
      nextBillingMonth: fallbackNext,
      currentBillingMonthKey: formatBillingMonth(getCurrentBillingMonthDate(nowDate)),
      nextBillingMonthKey: formatBillingMonth(fallbackNext),
      enabledFrom: getPaymentWindowStart(fallbackNext),
      canPayNow: isPaymentWindowOpen(nowDate, fallbackNext),
      canRenewSameCourse: true,
      isFinalCourseMonth: false,
      hasCourseEnded: false,
      canStartNewEnrollment: false,
    };
  }

  const currentCourseMonth = nowMonthStart.getTime() < courseStartMonth.getTime()
    ? courseStartMonth
    : nowMonthStart.getTime() > courseEndMonth.getTime()
      ? courseEndMonth
      : nowMonthStart;

  const nextBillingMonth = addUtcMonths(currentCourseMonth, 1);
  const canRenewSameCourse = nextBillingMonth.getTime() <= courseEndMonth.getTime();
  const enabledFrom = getPaymentWindowStart(nextBillingMonth);
  const canPayNow = canRenewSameCourse && nowDate.getTime() >= enabledFrom.getTime();

  const hasCourseEnded = nowMonthStart.getTime() > courseEndMonth.getTime();
  const isFinalCourseMonth = nowMonthStart.getTime() === courseEndMonth.getTime();
  const canStartNewEnrollment = hasCourseEnded || nowDate.getTime() >= enabledFrom.getTime();

  return {
    isCourseBounded: true,
    courseStartMonth,
    courseEndMonth,
    currentCourseMonth,
    nextBillingMonth,
    currentBillingMonthKey: formatBillingMonth(currentCourseMonth),
    nextBillingMonthKey: formatBillingMonth(nextBillingMonth),
    enabledFrom,
    canPayNow,
    canRenewSameCourse,
    isFinalCourseMonth,
    hasCourseEnded,
    canStartNewEnrollment,
  };
}
