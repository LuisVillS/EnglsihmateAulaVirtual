export const UNIFIED_COURSE_PRICE = 179;
export const UNIFIED_COURSE_TYPE = "GENERAL";
export const UNIFIED_COURSE_LABEL = "Curso unico";

export function normalizeUnifiedCourseType() {
  return UNIFIED_COURSE_TYPE;
}

export function formatUnifiedCourseType() {
  return UNIFIED_COURSE_LABEL;
}

export function resolveUnifiedCoursePrice(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return UNIFIED_COURSE_PRICE;
  }
  if (normalized === 99 || normalized === 139) {
    return UNIFIED_COURSE_PRICE;
  }
  return normalized;
}
