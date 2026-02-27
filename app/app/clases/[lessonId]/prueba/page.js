import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import MonthlyLessonQuizzesModalButton from "@/components/monthly-lesson-quizzes-modal-button";
import RestartLessonQuizButton from "@/components/restart-lesson-quiz-button";
import {
  LESSON_QUIZ_MAX_RESTARTS,
  LESSON_QUIZ_MAX_TOTAL_ATTEMPTS,
  LESSON_QUIZ_STATUS,
  getLessonQuizProgressPercent,
  getUsedQuizAttempts,
  isMissingLessonQuizRestartColumnError,
  isMissingLessonQuizTableError,
  normalizeAttemptRow,
} from "@/lib/lesson-quiz";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { restartLessonQuizAttempt, startLessonQuizAttempt } from "./actions";

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateMs(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return Number.NaN;
  return date.getTime();
}

function parseLessonIdFromQuizUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/app\/clases\/([^/]+)\/prueba/i);
  return String(match?.[1] || "").trim();
}

function formatSessionSubtitle(session) {
  const baseDate = session?.starts_at || session?.session_date;
  const date = new Date(baseDate || "");
  if (Number.isNaN(date.getTime())) {
    const idx = toInt(session?.session_in_cycle, 0);
    return idx > 0 ? `Clase ${idx}` : "";
  }
  const formatted = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Lima",
  })
    .format(date)
    .replace(/\./g, "");
  return `Clase ${session?.session_in_cycle || "-"} • ${formatted}`;
}

function getEstimatedMinutesFromExercises(exercises = []) {
  for (const exercise of exercises) {
    const content = exercise?.content_json || {};
    const candidate = Number(content.estimated_time_minutes ?? content.estimatedTimeMinutes);
    if (Number.isFinite(candidate) && candidate > 0) {
      return Math.round(candidate);
    }
  }
  return null;
}

async function loadLessonTestMeta(supabase, lesson, exercises = []) {
  const fallbackNumber = Math.max(1, toInt(lesson?.ordering, 1));
  const fallbackTitle = String(lesson?.title || "").trim() || "Test de clase";
  const exerciseIds = Array.from(
    new Set((exercises || []).map((exercise) => String(exercise?.id || "").trim()).filter(Boolean))
  );
  if (!exerciseIds.length) {
    return {
      testTitle: fallbackTitle,
      testNumber: fallbackNumber,
    };
  }

  const { data: itemRows, error: itemError } = await supabase
    .from("session_items")
    .select("title, session_id, exercise_id")
    .in("exercise_id", exerciseIds)
    .eq("type", "exercise")
    .order("created_at", { ascending: true })
    .limit(1);

  if (itemError || !itemRows?.length) {
    return {
      testTitle: fallbackTitle,
      testNumber: fallbackNumber,
    };
  }

  const firstItem = itemRows[0];
  let testNumber = fallbackNumber;
  const sessionId = String(firstItem?.session_id || "").trim();
  if (sessionId) {
    const { data: sessionRow } = await supabase
      .from("course_sessions")
      .select("session_in_cycle")
      .eq("id", sessionId)
      .maybeSingle();
    const sessionNumber = toInt(sessionRow?.session_in_cycle, 0);
    if (sessionNumber > 0) {
      testNumber = sessionNumber;
    }
  }

  return {
    testTitle: String(firstItem?.title || "").trim() || fallbackTitle,
    testNumber,
  };
}

async function loadFallbackProgress(supabase, userId, exerciseIds = []) {
  const ids = Array.from(new Set((exerciseIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) {
    return { completedCount: 0, correctCount: 0 };
  }

  const { data, error } = await supabase
    .from("user_progress")
    .select("exercise_id, is_correct")
    .eq("user_id", userId)
    .in("exercise_id", ids);

  if (error) {
    return { completedCount: 0, correctCount: 0 };
  }

  const unique = new Map();
  for (const row of data || []) {
    const key = String(row.exercise_id || "").trim();
    if (!key) continue;
    unique.set(key, Boolean(row.is_correct));
  }

  const completedCount = unique.size;
  const correctCount = Array.from(unique.values()).filter(Boolean).length;
  return { completedCount, correctCount };
}

async function loadAttemptRow(supabase, userId, lessonId) {
  const { data, error } = await supabase
    .from("lesson_quiz_attempts")
    .select(
      "attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, restart_count, duration_seconds, started_at, completed_at, updated_at"
    )
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (!error) {
    return { trackingAvailable: true, attempt: data || null };
  }

  if (isMissingLessonQuizRestartColumnError(error)) {
    const fallback = await supabase
      .from("lesson_quiz_attempts")
      .select(
        "attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, duration_seconds, started_at, completed_at, updated_at"
      )
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .maybeSingle();
    if (fallback.error) {
      if (isMissingLessonQuizTableError(fallback.error)) {
        return { trackingAvailable: false, attempt: null };
      }
      throw new Error(fallback.error.message || "No se pudo cargar el tracking de la prueba.");
    }
    return {
      trackingAvailable: true,
      attempt: {
        ...(fallback.data || {}),
        restart_count: 0,
      },
    };
  }

  if (isMissingLessonQuizTableError(error)) {
    return { trackingAvailable: false, attempt: null };
  }
  throw new Error(error.message || "No se pudo cargar el tracking de la prueba.");
}

function deriveState({ totalExercises, attemptStatus, completedCount }) {
  if (!totalExercises) return LESSON_QUIZ_STATUS.READY;
  if (attemptStatus === LESSON_QUIZ_STATUS.COMPLETED || completedCount >= totalExercises) {
    return LESSON_QUIZ_STATUS.COMPLETED;
  }
  if (attemptStatus === LESSON_QUIZ_STATUS.IN_PROGRESS || completedCount > 0) {
    return LESSON_QUIZ_STATUS.IN_PROGRESS;
  }
  return LESSON_QUIZ_STATUS.READY;
}

async function loadCurrentMonthAvailableQuizzes({
  supabase,
  userId,
  commissionId,
  nowIso,
}) {
  const safeCommissionId = String(commissionId || "").trim();
  if (!safeCommissionId) return [];

  const nowMs = parseDateMs(nowIso);
  if (!Number.isFinite(nowMs)) return [];

  const { data: sessions, error: sessionError } = await supabase
    .from("course_sessions")
    .select("id, cycle_month, session_date, starts_at, session_in_cycle, day_label")
    .eq("commission_id", safeCommissionId)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("session_date", { ascending: true });
  if (sessionError) return [];

  const sessionById = new Map((sessions || []).map((session) => [String(session.id || "").trim(), session]));
  const sessionIds = (sessions || []).map((session) => String(session.id || "").trim()).filter(Boolean);
  if (!sessionIds.length) return [];

  const { data: itemRows, error: itemsError } = await supabase
    .from("session_items")
    .select("id, session_id, title, url, exercise_id, type")
    .in("session_id", sessionIds)
    .eq("type", "exercise")
    .order("created_at", { ascending: true });
  if (itemsError) return [];

  const exerciseIds = Array.from(
    new Set(
      (itemRows || [])
        .map((item) => String(item.exercise_id || "").trim())
        .filter(Boolean)
    )
  );

  let lessonIdByExerciseId = new Map();
  if (exerciseIds.length) {
    const { data: exerciseRows, error: exercisesError } = await supabase
      .from("exercises")
      .select("id, lesson_id")
      .in("id", exerciseIds);
    if (!exercisesError) {
      lessonIdByExerciseId = new Map(
        (exerciseRows || []).map((row) => [String(row.id || "").trim(), String(row.lesson_id || "").trim()])
      );
    }
  }

  const grouped = new Map();
  for (const item of itemRows || []) {
    const sessionId = String(item.session_id || "").trim();
    const session = sessionById.get(sessionId);
    if (!session) continue;

    const startsMs = parseDateMs(session.starts_at || session.session_date);
    if (!Number.isFinite(startsMs)) continue;

    const lessonIdFromExercise = lessonIdByExerciseId.get(String(item.exercise_id || "").trim()) || "";
    const lessonId = lessonIdFromExercise || parseLessonIdFromQuizUrl(item.url);
    if (!lessonId) continue;

    const current = grouped.get(lessonId) || {
      lessonId,
      startsMs,
      session,
      itemTitle: "",
    };
    if (Number.isFinite(startsMs) && startsMs < current.startsMs) {
      current.startsMs = startsMs;
      current.session = session;
    }
    if (!current.itemTitle) {
      current.itemTitle = String(item.title || "").trim();
    }
    grouped.set(lessonId, current);
  }

  const groupedRows = Array.from(grouped.values());
  if (!groupedRows.length) return [];

  const lessonIds = groupedRows.map((row) => row.lessonId);
  const { data: lessonRows } = await supabase
    .from("lessons")
    .select("id, title")
    .in("id", lessonIds);
  const lessonTitleMap = new Map(
    (lessonRows || []).map((row) => [String(row.id || "").trim(), String(row.title || "").trim()])
  );

  let attemptRows = [];
  {
    const primary = await supabase
      .from("lesson_quiz_attempts")
      .select("lesson_id, attempt_status, current_index, completed_count, total_exercises, score_percent, restart_count")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds);

    if (!primary.error) {
      attemptRows = primary.data || [];
    } else if (isMissingLessonQuizRestartColumnError(primary.error)) {
      const fallback = await supabase
        .from("lesson_quiz_attempts")
        .select("lesson_id, attempt_status, current_index, completed_count, total_exercises, score_percent")
        .eq("user_id", userId)
        .in("lesson_id", lessonIds);
      if (!fallback.error) {
        attemptRows = (fallback.data || []).map((row) => ({ ...row, restart_count: 0 }));
      }
    }
  }

  const attemptByLessonId = new Map(
    (attemptRows || []).map((row) => [String(row.lesson_id || "").trim(), row])
  );

  return groupedRows
    .map((row) => {
      const attempt = normalizeAttemptRow(attemptByLessonId.get(row.lessonId), toInt(attemptByLessonId.get(row.lessonId)?.total_exercises, 0));
      const state = deriveState({
        totalExercises: toInt(attempt.total_exercises, 0) || 1,
        attemptStatus: attempt.attempt_status,
        completedCount: attempt.completed_count,
      });

      const status =
        state === LESSON_QUIZ_STATUS.COMPLETED
          ? "completed"
          : state === LESSON_QUIZ_STATUS.IN_PROGRESS
          ? "in_progress"
          : "ready";
      const actionUrl =
        status === "completed"
          ? `/app/clases/${row.lessonId}/prueba/resultados`
          : status === "in_progress"
          ? `/app/clases/${row.lessonId}/prueba/jugar?i=${Math.max(0, toInt(attempt.current_index, 0))}`
          : `/app/clases/${row.lessonId}/prueba`;

      const title =
        lessonTitleMap.get(row.lessonId) ||
        row.itemTitle ||
        `Test ${row.session?.session_in_cycle || "-"} - Clase`;

      return {
        lessonId: row.lessonId,
        title,
        subtitle: formatSessionSubtitle(row.session),
        status,
        actionUrl,
        scorePercent: attempt.score_percent,
        startsMs: row.startsMs,
      };
    })
    .sort((a, b) => a.startsMs - b.startsMs);
}

export const metadata = {
  title: "Test por clase | Aula Virtual",
};

export default async function LessonQuizPage({ params: paramsPromise, searchParams: searchParamsPromise }) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const lessonId = String(params?.lessonId || "").trim();
  if (!lessonId) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, status, commission_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.id || profile.role !== "student") {
    redirect("/app/matricula?locked=1");
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title, level, unit_id, ordering, status")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson?.id) notFound();

  const { data: publishedExercises, error: exerciseError } = await supabase
    .from("exercises")
    .select("id, type, status, ordering, prompt, content_json")
    .eq("lesson_id", lesson.id)
    .eq("status", "published")
    .order("ordering", { ascending: true })
    .order("created_at", { ascending: true });

  if (exerciseError) {
    throw new Error(exerciseError.message || "No se pudieron cargar ejercicios publicados.");
  }

  const exercises = publishedExercises || [];
  const totalExercises = exercises.length;
  const estimatedMinutes = getEstimatedMinutesFromExercises(exercises);
  const testMeta = await loadLessonTestMeta(supabase, lesson, exercises);
  const testTitle = testMeta.testTitle;
  const testNumber = testMeta.testNumber;

  const currentAttemptResult = await loadAttemptRow(supabase, profile.id, lesson.id);
  let trackingAvailable = currentAttemptResult.trackingAvailable;
  let currentAttempt = normalizeAttemptRow(currentAttemptResult.attempt, totalExercises);

  if (!trackingAvailable) {
    const fallback = await loadFallbackProgress(
      supabase,
      profile.id,
      exercises.map((exercise) => exercise.id)
    );
    currentAttempt = normalizeAttemptRow(
      {
        attempt_status: fallback.completedCount > 0 ? LESSON_QUIZ_STATUS.IN_PROGRESS : LESSON_QUIZ_STATUS.READY,
        current_index: Math.max(0, fallback.completedCount),
        completed_count: fallback.completedCount,
        correct_count: fallback.correctCount,
        total_exercises: totalExercises,
      },
      totalExercises
    );
  }

  const quizState = deriveState({
    totalExercises,
    attemptStatus: currentAttempt.attempt_status,
    completedCount: currentAttempt.completed_count,
  });
  const progressPercent = getLessonQuizProgressPercent({
    status: quizState,
    completedCount: currentAttempt.completed_count,
    totalExercises,
  });
  const currentIndex = Math.max(0, Math.min(Math.max(0, totalExercises - 1), toInt(currentAttempt.current_index, 0)));
  const canStart = totalExercises > 0 && trackingAvailable;
  const canContinue = canStart && quizState === LESSON_QUIZ_STATUS.IN_PROGRESS;
  const repeatCount = Math.max(0, toInt(currentAttempt.restart_count, 0));
  const attemptsUsed = getUsedQuizAttempts({
    status: quizState,
    restartCount: repeatCount,
    completedCount: currentAttempt.completed_count,
  });
  const remainingAttempts = Math.max(0, LESSON_QUIZ_MAX_TOTAL_ATTEMPTS - attemptsUsed);
  const remainingRestarts = Math.max(0, LESSON_QUIZ_MAX_RESTARTS - repeatCount);
  const canRepeat = trackingAvailable && quizState === LESSON_QUIZ_STATUS.COMPLETED && remainingRestarts > 0;
  const trackingWarning = !trackingAvailable || searchParams?.tracking === "missing";
  const repeatLimitWarning = searchParams?.repeat_limit === "1";

  const nowIso = new Date().toISOString();
  let monthlyQuizzes = await loadCurrentMonthAvailableQuizzes({
    supabase,
    userId: profile.id,
    commissionId: profile.commission_id,
    nowIso,
  });
  if (canContinue && !monthlyQuizzes.some((quiz) => quiz.lessonId === lesson.id)) {
    monthlyQuizzes = [
      {
        lessonId: lesson.id,
        title: `Test ${testNumber} - ${testTitle}`,
        subtitle: "Disponible",
        status: "in_progress",
        actionUrl: `/app/clases/${lesson.id}/prueba/jugar?i=${currentIndex}`,
        scorePercent: currentAttempt.score_percent,
        startsMs: parseDateMs(nowIso),
      },
      ...monthlyQuizzes,
    ];
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-12 left-4 h-64 w-64 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-accent/15 blur-[140px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Link
              href="/app/curso"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              <ArrowLeftIcon />
              Volver
            </Link>
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">{`Test ${testNumber} - ${testTitle}`}</h1>
              <p className="text-sm text-muted">Evalua lo aprendido en esta clase.</p>
            </div>
          </div>
          {lesson.level ? (
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
              {lesson.level}
            </span>
          ) : null}
        </header>

        {trackingWarning ? (
          <div className="rounded-2xl border border-accent/45 bg-accent/12 px-4 py-3 text-sm text-accent">
            Falta activar el tracking del test. Ejecuta el SQL de `lesson_quiz_attempts` para habilitar inicio, reanudar y repetir.
          </div>
        ) : null}
        {repeatLimitWarning ? (
          <div className="rounded-2xl border border-danger/45 bg-danger/12 px-4 py-3 text-sm text-danger">
            Alcanzaste el maximo de {LESSON_QUIZ_MAX_TOTAL_ATTEMPTS} intentos para este test.
          </div>
        ) : null}

        <article className="quiz-hero-card-enter rounded-[2rem] border border-border bg-surface p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-muted">{`Test ${testNumber}`}</p>
                <h2 className="mt-1 text-3xl font-black sm:text-4xl">{testTitle}</h2>
                <p className="mt-1 text-sm text-muted">Evalua lo aprendido en esta clase.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-foreground">
                  {totalExercises} ejercicios
                </span>
                {estimatedMinutes != null ? (
                  <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-foreground">
                    ~{estimatedMinutes} min
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                <span>Progreso: {currentAttempt.completed_count} de {totalExercises}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    quizState === LESSON_QUIZ_STATUS.COMPLETED ? "bg-success" : "bg-primary"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {quizState === LESSON_QUIZ_STATUS.IN_PROGRESS ? (
              <p className="rounded-2xl border border-border bg-surface-2 px-4 py-2 text-sm text-foreground">
                Vas {currentAttempt.completed_count} de {totalExercises}. Te queda {remainingAttempts} intento
                {remainingAttempts === 1 ? "" : "s"}.
              </p>
            ) : null}

            {quizState === LESSON_QUIZ_STATUS.COMPLETED ? (
              <div className="space-y-1 rounded-2xl border border-success/30 bg-success/12 px-4 py-3 text-sm">
                <p className="inline-flex items-center gap-2 font-semibold text-foreground">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-success/25 text-success">
                    <CheckIcon />
                  </span>
                  Completada
                </p>
                {currentAttempt.score_percent != null ? (
                  <p className="text-foreground">Puntaje: {Math.round(currentAttempt.score_percent)}%</p>
                ) : null}
                <p className="text-muted">
                  Intentos usados: {attemptsUsed}/{LESSON_QUIZ_MAX_TOTAL_ATTEMPTS}
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              {quizState === LESSON_QUIZ_STATUS.READY ? (
                <form action={startLessonQuizAttempt} className="w-full">
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <button
                    type="submit"
                    disabled={!canStart}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Realizar test
                  </button>
                </form>
              ) : null}

              {quizState === LESSON_QUIZ_STATUS.IN_PROGRESS ? (
                <MonthlyLessonQuizzesModalButton
                  quizzes={monthlyQuizzes}
                  currentLessonId={lesson.id}
                  triggerLabel="Continuar"
                  triggerDisabled={!canContinue}
                  triggerClassName={`inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-base font-semibold transition ${
                    canContinue
                      ? "bg-primary text-primary-foreground hover:bg-primary-2"
                      : "cursor-not-allowed bg-primary/35 text-primary-foreground/80"
                  }`}
                />
              ) : null}

              {quizState === LESSON_QUIZ_STATUS.COMPLETED ? (
                <>
                  <Link
                    href={`/app/clases/${lesson.id}/prueba/resultados`}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary-2"
                  >
                    Ver resultados
                  </Link>
                  <RestartLessonQuizButton
                    action={restartLessonQuizAttempt}
                    lessonId={lesson.id}
                    canRepeat={canRepeat}
                    remainingAttempts={remainingAttempts}
                    attemptsUsed={attemptsUsed}
                    maxAttempts={LESSON_QUIZ_MAX_TOTAL_ATTEMPTS}
                  />
                </>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
