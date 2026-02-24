function normalizeSpanishWeekday(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function parseDateInput(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatClassLabel(startsAt, timeZone = "America/Lima") {
  const date = parseDateInput(startsAt);
  if (!date) return "--";
  const parts = new Intl.DateTimeFormat("es-PE", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const weekday = normalizeSpanishWeekday(map.weekday);
  const day = map.day || "--";
  const hour = map.hour || "--";
  const minute = map.minute || "--";
  return `${weekday} ${day} - ${hour}:${minute}`;
}

export function formatMonthKeyFromDate(dateInput, timeZone = "America/Lima") {
  const date = parseDateInput(dateInput);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  if (!map.year || !map.month) return null;
  return `${map.year}-${map.month}-01`;
}
