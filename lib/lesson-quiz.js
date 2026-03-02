export const LESSON_QUIZ_STATUS = {
  LOCKED: "locked",
  READY: "ready",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
};

export const LESSON_QUIZ_MAX_TOTAL_ATTEMPTS = 2;
export const LESSON_QUIZ_MAX_RESTARTS = LESSON_QUIZ_MAX_TOTAL_ATTEMPTS - 1;

export const LESSON_QUIZ_TYPE_META = {
  scramble: { label: "Scrambled Sentence", key: "scramble" },
  audio_match: { label: "Listening Exercise", key: "audio_match" },
  reading_exercise: { label: "Reading Exercise", key: "reading_exercise" },
  image_match: { label: "Image Match", key: "image_match" },
  pairs: { label: "Pairs", key: "pairs" },
  cloze: { label: "Fill in the blanks", key: "cloze" },
};

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function estimateLessonQuizMinutes(totalExercises) {
  const total = Math.max(0, toInt(totalExercises, 0));
  if (!total) return 0;
  return Math.max(1, Math.round((total * 40) / 60));
}

export function summarizeLessonQuizTypes(exercises = []) {
  const counts = {
    scramble: 0,
    audio_match: 0,
    reading_exercise: 0,
    image_match: 0,
    pairs: 0,
    cloze: 0,
  };

  for (const exercise of exercises) {
    const type = String(exercise?.type || "").trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, type)) {
      counts[type] += 1;
    }
  }

  return Object.values(LESSON_QUIZ_TYPE_META)
    .map((meta) => ({ ...meta, count: counts[meta.key] || 0 }))
    .filter((row) => row.count > 0);
}

export function normalizeAttemptRow(row, totalExercises) {
  if (!row) {
    return {
      attempt_status: LESSON_QUIZ_STATUS.READY,
      current_index: 0,
      completed_count: 0,
      total_exercises: Math.max(0, toInt(totalExercises, 0)),
      correct_count: 0,
      score_percent: null,
      attempt_score_percent: null,
      restart_count: 0,
      duration_seconds: null,
      updated_at: null,
      started_at: null,
      completed_at: null,
    };
  }

  const total = Math.max(0, toInt(totalExercises ?? row.total_exercises, 0));
  const completedCount = Math.min(total, Math.max(0, toInt(row.completed_count, 0)));
  const normalizedStatus = normalizeLessonQuizStatus(row.attempt_status, completedCount, total);
  const maxIndex = total > 0 ? total - 1 : 0;
  const currentIndex = Math.max(0, Math.min(maxIndex, toInt(row.current_index, 0)));

  return {
    attempt_status: normalizedStatus,
    current_index: currentIndex,
    completed_count: completedCount,
    total_exercises: total,
    correct_count: Math.max(0, toInt(row.correct_count, 0)),
    score_percent: toNumber(row.score_percent, null),
    attempt_score_percent: toNumber(row.attempt_score_percent, toNumber(row.score_percent, null)),
    restart_count: Math.max(0, toInt(row.restart_count, 0)),
    duration_seconds: toInt(row.duration_seconds, 0) || null,
    updated_at: row.updated_at || null,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
  };
}

export function getRemainingQuizRestarts(row) {
  const normalized = normalizeAttemptRow(row, row?.total_exercises ?? 0);
  return Math.max(0, LESSON_QUIZ_MAX_RESTARTS - normalized.restart_count);
}

export function getUsedQuizAttempts({ status, restartCount, completedCount = 0 }) {
  const normalizedStatus = normalizeLessonQuizStatus(status, completedCount, 0);
  const safeRestartCount = Math.max(0, toInt(restartCount, 0));
  const hasStarted = normalizedStatus !== LESSON_QUIZ_STATUS.READY || Math.max(0, toInt(completedCount, 0)) > 0;
  if (!hasStarted) return 0;
  return Math.min(LESSON_QUIZ_MAX_TOTAL_ATTEMPTS, safeRestartCount + 1);
}

export function normalizeLessonQuizStatus(status, completedCount, totalExercises) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === LESSON_QUIZ_STATUS.LOCKED) return LESSON_QUIZ_STATUS.LOCKED;
  if (normalized === LESSON_QUIZ_STATUS.COMPLETED) return LESSON_QUIZ_STATUS.COMPLETED;
  if (normalized === LESSON_QUIZ_STATUS.IN_PROGRESS) return LESSON_QUIZ_STATUS.IN_PROGRESS;
  if (normalized === LESSON_QUIZ_STATUS.READY) return LESSON_QUIZ_STATUS.READY;

  const total = Math.max(0, toInt(totalExercises, 0));
  const completed = Math.max(0, toInt(completedCount, 0));
  if (!total || completed <= 0) return LESSON_QUIZ_STATUS.READY;
  if (completed >= total) return LESSON_QUIZ_STATUS.COMPLETED;
  return LESSON_QUIZ_STATUS.IN_PROGRESS;
}

export function getLessonQuizProgressPercent({ status, completedCount, totalExercises }) {
  if (status === LESSON_QUIZ_STATUS.COMPLETED) return 100;
  const total = Math.max(0, toInt(totalExercises, 0));
  if (!total) return 0;
  const completed = Math.max(0, Math.min(total, toInt(completedCount, 0)));
  return Math.round((completed / total) * 100);
}

export function formatDurationSeconds(durationSeconds) {
  const total = Math.max(0, toInt(durationSeconds, 0));
  if (!total) return null;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (!minutes) return `${seconds}s`;
  if (!seconds) return `${minutes} min`;
  return `${minutes} min ${seconds}s`;
}

export function isMissingLessonQuizTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("lesson_quiz_attempts") && message.includes("does not exist");
}

export function isMissingLessonQuizRestartColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("restart_count") && message.includes("lesson_quiz_attempts");
}

export function isMissingLessonQuizAttemptScoreColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("attempt_score_percent") && message.includes("lesson_quiz_attempts");
}
