const LIMA_TIME_ZONE = "America/Lima";
const LIMA_OFFSET_HOURS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function getLimaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    weekdayLabel: String(lookup.weekday || "").trim().toLowerCase(),
  };
}

function limaDateToUtc(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + LIMA_OFFSET_HOURS, minute, 0, 0));
}

function formatDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayToIndex(weekdayLabel = "") {
  const normalized = String(weekdayLabel || "").trim().toLowerCase();
  const map = {
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 7,
  };
  return map[normalized] || 1;
}

export function getCompetitionWeekBounds(referenceDate = new Date()) {
  const lima = getLimaDateParts(referenceDate);
  const weekdayIndex = weekdayToIndex(lima.weekdayLabel);
  const todayUtc = limaDateToUtc(lima.year, lima.month, lima.day);
  const startUtc = new Date(todayUtc.getTime() - ((weekdayIndex - 1) * DAY_MS));
  const endUtc = new Date(startUtc.getTime() + (7 * DAY_MS));

  return {
    weekKey: formatDateKey(startUtc),
    startsAt: startUtc.toISOString(),
    endsAt: endUtc.toISOString(),
    title: `Week of ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(startUtc)}`,
  };
}

export function getCompetitionWeekDateLabel(weekKey) {
  const parsed = new Date(`${String(weekKey || "").trim()}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "This week";
  return `Week of ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed)}`;
}

export function getSecondsUntil(isoString) {
  if (!isoString) return 0;
  const target = new Date(isoString);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.max(0, Math.round((target.getTime() - Date.now()) / 1000));
}

export function formatCountdown(seconds) {
  const safe = Math.max(0, Number(seconds || 0) || 0);
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

