export const STUDENT_CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

export function normalizeStudentCefrLevel(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  const match = raw.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  return match?.[1] || "";
}

export function normalizeStudentThemeTag(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function formatStudentThemeLabel(value) {
  const normalized = normalizeStudentThemeTag(value);
  if (!normalized) return "";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getStudentLevelBadge(courseLevel, fallback = "Open track") {
  const cefrLevel = normalizeStudentCefrLevel(courseLevel);
  if (!cefrLevel) return fallback;
  return `Level ${cefrLevel}`;
}
