export const LIMA_TIME_ZONE = "America/Lima";

const LIMA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: LIMA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const MONTH_TITLE_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  timeZone: LIMA_TIME_ZONE,
  month: "long",
  year: "numeric",
});

const DAY_TITLE_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  timeZone: LIMA_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  timeZone: LIMA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function parseMonthParam(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month, monthParam: `${match[1]}-${match[2]}` };
}

function getDatePartsFromLima(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = LIMA_DATE_FORMATTER.formatToParts(date);
  const byType = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  if (!byType.year || !byType.month || !byType.day) return null;
  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
    dateKey: `${byType.year}-${byType.month}-${byType.day}`,
    monthParam: `${byType.year}-${byType.month}`,
  };
}

export function getTodayLimaDateKey() {
  return getDatePartsFromLima(new Date())?.dateKey || null;
}

export function getTodayLimaMonthParam() {
  return getDatePartsFromLima(new Date())?.monthParam || null;
}

export function toDateKey(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
  }
  return getDatePartsFromLima(value)?.dateKey || null;
}

export function getSessionDateKey(session) {
  return toDateKey(session?.session_date) || toDateKey(session?.starts_at) || null;
}

export function shiftMonthParam(monthParam, offset) {
  const parsed = parseMonthParam(monthParam);
  if (!parsed) return getTodayLimaMonthParam();
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1 + offset, 1, 0, 0, 0, 0));
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function formatMonthTitle(monthParam) {
  const parsed = parseMonthParam(monthParam);
  if (!parsed) return "";
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, 15, 12, 0, 0, 0));
  const label = MONTH_TITLE_FORMATTER.format(date);
  return label.slice(0, 1).toUpperCase() + label.slice(1);
}

export function formatDateKeyTitle(dateKey) {
  const direct = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!direct) return "Selecciona un dia";
  const date = new Date(Date.UTC(Number(direct[1]), Number(direct[2]) - 1, Number(direct[3]), 12, 0, 0, 0));
  const label = DAY_TITLE_FORMATTER.format(date);
  return label.slice(0, 1).toUpperCase() + label.slice(1);
}

export function buildMonthCells(monthParam) {
  const parsed = parseMonthParam(monthParam);
  if (!parsed) return [];

  const firstDayUtc = new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 0, 0, 0, 0));
  const startOffset = (firstDayUtc.getUTCDay() + 6) % 7;
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const dayOffset = index - startOffset;
    const cellDate = new Date(Date.UTC(parsed.year, parsed.month - 1, 1 + dayOffset, 0, 0, 0, 0));
    const cellYear = cellDate.getUTCFullYear();
    const cellMonth = String(cellDate.getUTCMonth() + 1).padStart(2, "0");
    const cellDay = String(cellDate.getUTCDate()).padStart(2, "0");

    cells.push({
      key: `${cellYear}-${cellMonth}-${cellDay}`,
      dateKey: `${cellYear}-${cellMonth}-${cellDay}`,
      dayNumber: Number(cellDay),
      inCurrentMonth: cellMonth === String(parsed.month).padStart(2, "0"),
    });
  }

  return cells;
}

export function parseDateTime(value, fallbackDateKey = null) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (fallbackDateKey) {
    const match = String(fallbackDateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 17, 0, 0, 0));
    }
  }

  return null;
}

export function formatTime(value, fallbackDateKey = null) {
  const date = parseDateTime(value, fallbackDateKey);
  if (!date) return "--:--";
  return TIME_FORMATTER.format(date);
}

export function formatTimeRange(session) {
  const dateKey = getSessionDateKey(session);
  const start = formatTime(session?.starts_at, dateKey);
  const end = formatTime(session?.ends_at, dateKey);
  return `${start}-${end}`;
}

export function resolveSessionStatus(session, now = new Date()) {
  const dateKey = getSessionDateKey(session);
  const startsAt = parseDateTime(session?.starts_at, dateKey);
  const endsAt = parseDateTime(session?.ends_at, dateKey) || (startsAt ? new Date(startsAt.getTime() + 90 * 60 * 1000) : null);
  const nowMs = now.getTime();

  if (startsAt && endsAt && nowMs >= startsAt.getTime() && nowMs < endsAt.getTime()) {
    return "live";
  }

  if (endsAt && nowMs >= endsAt.getTime()) {
    return "finished";
  }

  return "upcoming";
}
