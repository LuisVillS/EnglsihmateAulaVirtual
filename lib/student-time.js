export function parsePreferredHour(value) {
  if (value == null || value === "") return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;

  const parseFromClock = () => {
    if (!trimmed.includes(":")) return null;
    const [hoursStr, minutesStr] = trimmed.split(":");
    const hours = Number(hoursStr);
    const minutes = Number(minutesStr);
    if (
      !Number.isFinite(hours) ||
      !Number.isFinite(minutes) ||
      hours < 0 ||
      hours > 23 ||
      (minutes !== 0 && minutes !== 30)
    ) {
      return null;
    }
    return hours * 60 + minutes;
  };

  let minutes = Number(trimmed);
  if (!Number.isFinite(minutes)) {
    minutes = parseFromClock();
  }

  if (!Number.isFinite(minutes)) {
    return null;
  }

  if (minutes < 360 || minutes > 1410 || minutes % 30 !== 0) {
    return null;
  }

  return minutes;
}

export function normalizePreferredHourInput(value) {
  return parsePreferredHour(value);
}
