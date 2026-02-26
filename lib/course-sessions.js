const LIMA_UTC_OFFSET_HOURS = 5;

export const SESSION_FREQUENCIES = {
  DAILY: "DAILY",
  MWF: "MWF",
  TT: "TT",
  SAT: "SAT",
};

export const FREQUENCY_REFERENCE = {
  DAILY: {
    key: SESSION_FREQUENCIES.DAILY,
    label: "Daily (L-V)",
    hoursPerClass: 1,
    sessionsPerMonth: 20,
    hoursPerMonth: 20,
    months: 3,
    firstClassWeekday: 1,
    classDays: [1, 2, 3, 4, 5],
    offsets: [0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25],
  },
  MWF: {
    key: SESSION_FREQUENCIES.MWF,
    label: "Interdiario 1 (LMV)",
    hoursPerClass: 1.5,
    sessionsPerMonth: 11,
    hoursPerMonth: 16.5,
    months: 4,
    firstClassWeekday: 1,
    classDays: [1, 3, 5],
    offsets: [0, 2, 4, 7, 9, 11, 14, 16, 18, 21, 23],
  },
  TT: {
    key: SESSION_FREQUENCIES.TT,
    label: "Interdiario 2 (MJ)",
    hoursPerClass: 2,
    sessionsPerMonth: 8,
    hoursPerMonth: 16,
    months: 4,
    firstClassWeekday: 2,
    classDays: [2, 4],
    offsets: [0, 2, 7, 9, 14, 16, 21, 23],
  },
  SAT: {
    key: SESSION_FREQUENCIES.SAT,
    label: "Sabatinos (Sabados)",
    hoursPerClass: 4,
    sessionsPerMonth: 4,
    hoursPerMonth: 16,
    months: 4,
    firstClassWeekday: 6,
    classDays: [6],
    offsets: [0, 7, 14, 21],
  },
};

function parseDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeDayNumber(day) {
  const value = Number(day);
  if (!Number.isFinite(value)) return null;
  if (value >= 1 && value <= 7) return value;
  return null;
}

function toIsoWeekDay(date) {
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function addDaysUTC(date, days) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
    0,
    0,
    0,
    0
  ));
}

function formatSessionLabel(date, index) {
  if (!(date instanceof Date)) return `Clase ${index}`;
  const label = date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Clase ${String(index).padStart(2, "0")} - ${label}`;
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const [hoursRaw, minutesRaw] = String(value).split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function parseScheduleTimeToMinutes(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  return parseTimeToMinutes(value);
}

function formatMinutesToHour(minutes) {
  const safeMinutes = Number(minutes);
  if (!Number.isFinite(safeMinutes)) return "";
  const hours = Math.floor(safeMinutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = Math.abs(safeMinutes % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${mins}`;
}

export function normalizeFrequencyKey(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "LMV") return SESSION_FREQUENCIES.MWF;
  if (Object.values(SESSION_FREQUENCIES).includes(raw)) return raw;
  return null;
}

export function getFrequencyReference(frequency) {
  const key = normalizeFrequencyKey(frequency);
  if (!key) return null;
  return FREQUENCY_REFERENCE[key] || null;
}

export function formatScheduleWithFrequency({
  modalityKey,
  timeValue,
  fallback = "Horario a coordinar",
} = {}) {
  const normalizedFrequency = normalizeFrequencyKey(modalityKey);
  const timeMinutes = parseScheduleTimeToMinutes(timeValue);
  const timeLabel = timeMinutes == null ? "" : formatMinutesToHour(timeMinutes);

  if (!normalizedFrequency && !timeLabel) return fallback;

  const frequencyLabelMap = {
    DAILY: "Diario",
    MWF: "Interdiario 1 (LMV)",
    TT: "Interdiario 2 (MJ)",
    SAT: "Sabatino",
  };

  const frequencyLabel = frequencyLabelMap[normalizedFrequency] || "";
  if (frequencyLabel && timeLabel) return `${frequencyLabel} - ${timeLabel}`;
  if (frequencyLabel) return `${frequencyLabel} - Por definir`;
  if (timeLabel) return timeLabel;
  return fallback;
}

export function getFrequencyDurationMonths(frequency) {
  return getFrequencyReference(frequency)?.months || 0;
}

export function getSessionsPerMonth(frequency) {
  return getFrequencyReference(frequency)?.sessionsPerMonth || 0;
}

export function getSessionsPerCycle(frequency) {
  return getSessionsPerMonth(frequency);
}

export function addMonthsDateOnly(value, months) {
  const base = parseDateOnly(value);
  if (!base) return null;
  const target = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1, 0, 0, 0, 0));
  return target;
}

export function buildCycleMonthAnchors(startMonth, durationMonths) {
  const safeDuration = Math.max(1, Number(durationMonths) || 1);
  const anchors = [];
  for (let i = 0; i < safeDuration; i += 1) {
    const monthDate = addMonthsDateOnly(startMonth, i);
    if (!monthDate) continue;
    anchors.push(monthDate);
  }
  return anchors;
}

function findFirstWeekdayInMonth(monthDate, weekday) {
  const base = parseDateOnly(monthDate) || parseDateOnly(formatDateOnly(monthDate));
  const normalizedWeekday = normalizeDayNumber(weekday);
  if (!base || !normalizedWeekday) return null;
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const firstWeekday = toIsoWeekDay(firstDay);
  const daysToWeekday = firstWeekday === normalizedWeekday
    ? 0
    : (7 + normalizedWeekday - firstWeekday) % 7;
  return addDaysUTC(firstDay, daysToWeekday);
}

export function computeFirstClassDateForMonth(monthDate, frequency) {
  const reference = getFrequencyReference(frequency);
  if (!reference) return null;
  const firstClassDate = findFirstWeekdayInMonth(monthDate, reference.firstClassWeekday);
  if (!firstClassDate) return null;
  if (firstClassDate.getUTCDate() < 6) {
    return addDaysUTC(firstClassDate, 7);
  }
  return firstClassDate;
}

export function computeLMVCycleStart(monthDate) {
  return computeFirstClassDateForMonth(monthDate, SESSION_FREQUENCIES.MWF);
}

export function generateCycleDatesByFrequency(monthDate, frequency) {
  const reference = getFrequencyReference(frequency);
  if (!reference) return [];
  const cycleStart = computeFirstClassDateForMonth(monthDate, frequency);
  if (!cycleStart) return [];
  return reference.offsets.map((offset) => addDaysUTC(cycleStart, offset));
}

export function generateLMVCycleDates(monthDate) {
  return generateCycleDatesByFrequency(monthDate, SESSION_FREQUENCIES.MWF);
}

export function buildLimaDateTimeIso(dateOnlyValue, timeValue) {
  const dateOnly = parseDateOnly(dateOnlyValue);
  const minutes = parseTimeToMinutes(timeValue);
  if (!dateOnly || minutes == null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  // Lima is UTC-5. To persist timestamptz correctly, convert local Lima time to UTC.
  const utcDate = new Date(Date.UTC(
    dateOnly.getUTCFullYear(),
    dateOnly.getUTCMonth(),
    dateOnly.getUTCDate(),
    hours + LIMA_UTC_OFFSET_HOURS,
    mins,
    0,
    0
  ));
  return utcDate.toISOString();
}

export function buildFrequencySessionDrafts({
  commissionId,
  frequency,
  startMonth,
  durationMonths,
  startTime,
  endTime,
  status = "scheduled",
}) {
  const cycleMonths = buildCycleMonthAnchors(startMonth, durationMonths);
  const rows = [];
  let globalIndex = 1;

  for (const cycleMonthDate of cycleMonths) {
    const cycleMonth = formatDateOnly(cycleMonthDate);
    const dates = generateCycleDatesByFrequency(cycleMonthDate, frequency);
    dates.forEach((sessionDateObj, idx) => {
      const sessionDate = formatDateOnly(sessionDateObj);
      rows.push({
        commission_id: commissionId || null,
        cycle_month: cycleMonth,
        session_index: globalIndex,
        session_in_cycle: idx + 1,
        session_date: sessionDate,
        starts_at: buildLimaDateTimeIso(sessionDate, startTime),
        ends_at: buildLimaDateTimeIso(sessionDate, endTime),
        day_label: formatSessionLabel(sessionDateObj, globalIndex),
        status,
        kind: "class",
      });
      globalIndex += 1;
    });
  }

  return rows;
}

export function buildLMVSessionDrafts(params) {
  return buildFrequencySessionDrafts({
    ...params,
    frequency: SESSION_FREQUENCIES.MWF,
  });
}

export function buildSessionDraftsFromCommission({ startDate, endDate, daysOfWeek }) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const daySet = new Set((Array.isArray(daysOfWeek) ? daysOfWeek : []).map(normalizeDayNumber).filter(Boolean));
  if (!daySet.size) return [];

  const drafts = [];
  let cursor = new Date(start.getTime());
  let index = 1;

  while (cursor.getTime() <= end.getTime()) {
    if (daySet.has(toIsoWeekDay(cursor))) {
      drafts.push({
        session_date: formatDateOnly(cursor),
        day_label: formatSessionLabel(cursor, index),
      });
      index += 1;
    }
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1));
  }

  return drafts;
}

export function isSessionLiveNow({ sessionDate, startTime, endTime, now = new Date() }) {
  const baseDate = parseDateOnly(sessionDate);
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (!baseDate || startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return false;

  const start = new Date(baseDate.getTime());
  start.setUTCMinutes(startMinutes);
  const end = new Date(baseDate.getTime());
  end.setUTCMinutes(endMinutes);

  const nowDate = now instanceof Date ? now : new Date();
  return nowDate.getTime() >= start.getTime() && nowDate.getTime() <= end.getTime();
}

export function formatSessionDateLabel(value) {
  const date = parseDateOnly(value);
  if (!date) return "-";
  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
