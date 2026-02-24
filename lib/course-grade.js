export const MIN_QUIZ_WEIGHT = 0.5;

function clampGrade(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, numeric));
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function toUniqueIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function toQuizScoreMap(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const lessonId = String(row?.lesson_id || "").trim();
    if (!lessonId) continue;
    const score = clampGrade(row?.score_percent);
    if (score == null) continue;
    map.set(lessonId, score);
  }
  return map;
}

export function buildWeightedCourseGrade({
  baseCourseGrade,
  assignedQuizLessonIds = [],
  quizAttemptRows = [],
  minQuizWeight = MIN_QUIZ_WEIGHT,
}) {
  const normalizedBase = clampGrade(baseCourseGrade);
  const assignedIds = toUniqueIds(assignedQuizLessonIds);
  const scoreMap = toQuizScoreMap(quizAttemptRows);

  const completedScores = assignedIds
    .map((lessonId) => scoreMap.get(lessonId))
    .filter((score) => score != null);
  const completedQuizCount = completedScores.length;
  const assignedQuizCount = assignedIds.length;

  const quizGrade = assignedQuizCount > 0
    ? roundOne(
        completedQuizCount
          ? completedScores.reduce((sum, score) => sum + score, 0) / completedQuizCount
          : 0
      )
    : null;

  const quizWeight = Math.max(MIN_QUIZ_WEIGHT, Math.min(1, Number(minQuizWeight) || MIN_QUIZ_WEIGHT));

  let finalGrade = null;
  if (quizGrade != null && normalizedBase != null) {
    finalGrade = roundOne((normalizedBase * (1 - quizWeight)) + (quizGrade * quizWeight));
  } else if (quizGrade != null) {
    finalGrade = quizGrade;
  } else if (normalizedBase != null) {
    finalGrade = normalizedBase;
  }

  return {
    finalGrade,
    baseCourseGrade: normalizedBase,
    quizGrade,
    quizWeight,
    assignedQuizCount,
    completedQuizCount,
    exerciseGrade: quizGrade,
    exerciseWeight: quizWeight,
    assignedExerciseCount: assignedQuizCount,
    answeredExerciseCount: completedQuizCount,
  };
}
