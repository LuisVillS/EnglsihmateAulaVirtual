import { normalizeStudentCefrLevel } from "@/lib/student-levels";

const FORCED_SPANISH_PREFIXES = ["/app/matricula", "/app/tramites", "/app/matricula-y-tramites"];

export function getStudentUiLanguage(courseLevel) {
  const cefrLevel = normalizeStudentCefrLevel(courseLevel);
  if (["B1", "B2", "C1", "C2"].includes(cefrLevel)) {
    return "en";
  }
  return "es";
}

export function isForcedSpanishStudentPath(pathname = "") {
  const normalized = String(pathname || "").trim();
  return FORCED_SPANISH_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

export function resolveStudentUiLanguage({ courseLevel = "", pathname = "" } = {}) {
  if (isForcedSpanishStudentPath(pathname)) {
    return "es";
  }
  return getStudentUiLanguage(courseLevel);
}
