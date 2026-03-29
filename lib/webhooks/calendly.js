const STUDY_WITH_ME_SESSION_MINUTES = 30;
const LIMA_TIME_ZONE = "America/Lima";

function getLimaDateParts(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return { year, month, day };
}

function formatDateKey({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getLimaWeekStartKey(dateValue = new Date()) {
  const parts = getLimaDateParts(dateValue);
  if (!parts) return null;
  const middayUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
  const weekday = middayUtc.getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const monday = new Date(middayUtc.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
  return formatDateKey({
    year: monday.getUTCFullYear(),
    month: monday.getUTCMonth() + 1,
    day: monday.getUTCDate(),
  });
}

export { STUDY_WITH_ME_SESSION_MINUTES };
