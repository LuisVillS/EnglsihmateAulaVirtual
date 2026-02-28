import { normalizeFrequencyKey } from "@/lib/course-sessions";

const ENROLLMENT_FREQUENCY_LABELS = {
  DAILY: "Diario",
  MWF: "Interdiario (LMV)",
  TT: "Interdiario (MJ)",
  SAT: "Sabatino",
};

export function formatEnrollmentFrequencyLabel(value, fallback = "-") {
  const normalized = normalizeFrequencyKey(value);
  if (normalized && ENROLLMENT_FREQUENCY_LABELS[normalized]) {
    return ENROLLMENT_FREQUENCY_LABELS[normalized];
  }

  const raw = String(value || "").trim();
  return raw || fallback;
}
