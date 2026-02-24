import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LESSON_QUIZ_MAX_RESTARTS,
  LESSON_QUIZ_STATUS,
  estimateLessonQuizMinutes,
  getLessonQuizProgressPercent,
  isMissingLessonQuizRestartColumnError,
  isMissingLessonQuizTableError,
  normalizeAttemptRow,
  summarizeLessonQuizTypes,
} from "@/lib/lesson-quiz";
import { restartLessonQuizAttempt, startLessonQuizAttempt } from "./actions";

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10V7a5 5 0 1 1 10 0v3" />
      <rect x="5" y="10" width="14" height="10" rx="2" />
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

function deriveState({ isLocked, totalExercises, attemptStatus, completedCount }) {
  if (isLocked) return LESSON_QUIZ_STATUS.LOCKED;
  if (!totalExercises) return LESSON_QUIZ_STATUS.READY;
  if (attemptStatus === LESSON_QUIZ_STATUS.COMPLETED || completedCount >= totalExercises) {
    return LESSON_QUIZ_STATUS.COMPLETED;
  }
  if (attemptStatus === LESSON_QUIZ_STATUS.IN_PROGRESS || completedCount > 0) {
    return LESSON_QUIZ_STATUS.IN_PROGRESS;
  }
  return LESSON_QUIZ_STATUS.READY;
}

export const metadata = {
  title: "Prueba por clase | Aula Virtual",
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
    .select("id, role, status")
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
    .select("id, type, status, ordering, prompt")
    .eq("lesson_id", lesson.id)
    .eq("status", "published")
    .order("ordering", { ascending: true })
    .order("created_at", { ascending: true });

  if (exerciseError) {
    throw new Error(exerciseError.message || "No se pudieron cargar ejercicios publicados.");
  }

  const exercises = publishedExercises || [];
  const totalExercises = exercises.length;
  const estimatedMinutes = estimateLessonQuizMinutes(totalExercises);
  const typeSummary = summarizeLessonQuizTypes(exercises);

  const previousLessonQuery = await supabase
    .from("lessons")
    .select("id, title")
    .eq("unit_id", lesson.unit_id)
    .eq("status", "published")
    .lt("ordering", lesson.ordering || 0)
    .order("ordering", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousLesson = previousLessonQuery.data || null;

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

  let isLocked = false;
  if (previousLesson?.id) {
    const { data: previousExercises } = await supabase
      .from("exercises")
      .select("id")
      .eq("lesson_id", previousLesson.id)
      .eq("status", "published");
    const previousTotal = (previousExercises || []).length;
    if (previousTotal > 0) {
      const previousAttemptResult = await loadAttemptRow(supabase, profile.id, previousLesson.id);
      if (previousAttemptResult.trackingAvailable) {
        const previousAttempt = normalizeAttemptRow(previousAttemptResult.attempt, previousTotal);
        isLocked = previousAttempt.attempt_status !== LESSON_QUIZ_STATUS.COMPLETED;
      } else {
        trackingAvailable = false;
        const fallback = await loadFallbackProgress(
          supabase,
          profile.id,
          (previousExercises || []).map((exercise) => exercise.id)
        );
        isLocked = fallback.completedCount < previousTotal;
      }
    }
  }

  const quizState = deriveState({
    isLocked,
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
  const canStart = totalExercises > 0 && !isLocked && trackingAvailable;
  const canContinue = canStart && quizState === LESSON_QUIZ_STATUS.IN_PROGRESS;
  const repeatCount = Math.max(0, toInt(currentAttempt.restart_count, 0));
  const remainingRestarts = Math.max(0, LESSON_QUIZ_MAX_RESTARTS - repeatCount);
  const canRepeat = trackingAvailable && remainingRestarts > 0;
  const trackingWarning = !trackingAvailable || searchParams?.tracking === "missing";
  const repeatLimitWarning = searchParams?.repeat_limit === "1";

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
              <h1 className="text-2xl font-semibold sm:text-3xl">Prueba de la clase {lesson.title}</h1>
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
            Falta activar el tracking de prueba. Ejecuta el SQL de `lesson_quiz_attempts` para habilitar inicio, reanudar y repetir.
          </div>
        ) : null}
        {repeatLimitWarning ? (
          <div className="rounded-2xl border border-danger/45 bg-danger/12 px-4 py-3 text-sm text-danger">
            Alcanzaste el maximo de 2 repeticiones para esta prueba.
          </div>
        ) : null}

        <article
          className={`quiz-hero-card-enter rounded-[2rem] border border-border bg-surface p-5 shadow-2xl shadow-black/20 sm:p-7 ${
            quizState === LESSON_QUIZ_STATUS.LOCKED ? "opacity-80" : ""
          }`}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-muted">Prueba</p>
                <h2 className="mt-1 text-3xl font-black sm:text-4xl">Prueba</h2>
                <p className="mt-1 text-sm text-muted">Evalua lo aprendido en esta clase.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-foreground">
                  {totalExercises} ejercicios
                </span>
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-foreground">
                  ~{estimatedMinutes || 0} min
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                <span>Progreso</span>
                <span>
                  {currentAttempt.completed_count} de {totalExercises}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {quizState === LESSON_QUIZ_STATUS.LOCKED ? (
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
                <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface">
                  <LockIcon />
                </span>
                <div>
                  <p className="font-semibold text-foreground">Bloqueado</p>
                  <p>Completa la leccion anterior para desbloquear.</p>
                </div>
              </div>
            ) : null}

            {quizState === LESSON_QUIZ_STATUS.IN_PROGRESS ? (
              <p className="rounded-2xl border border-border bg-surface-2 px-4 py-2 text-sm text-muted">
                Vas {currentAttempt.completed_count} de {totalExercises}.
              </p>
            ) : null}

            {quizState === LESSON_QUIZ_STATUS.COMPLETED ? (
              <div className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/12 px-4 py-3 text-sm">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-success/25 text-success">
                  <CheckIcon />
                </span>
                <div>
                  <p className="font-semibold text-foreground">Prueba completada</p>
                  {currentAttempt.score_percent != null ? (
                    <p className="text-muted">Puntaje: {Math.round(currentAttempt.score_percent)}%</p>
                  ) : (
                    <p className="text-muted">Puedes revisar resultados o repetir la prueba.</p>
                  )}
                  <p className="text-xs text-muted">
                    Repeticiones usadas: {repeatCount}/{LESSON_QUIZ_MAX_RESTARTS}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              {quizState === LESSON_QUIZ_STATUS.LOCKED ? (
                <button
                  type="button"
                  disabled
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-primary/35 px-5 py-3 text-base font-semibold text-primary-foreground/80 disabled:cursor-not-allowed"
                >
                  Realizar prueba
                </button>
              ) : null}

              {quizState === LESSON_QUIZ_STATUS.READY ? (
                <form action={startLessonQuizAttempt} className="w-full">
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <button
                    type="submit"
                    disabled={!canStart}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Realizar prueba
                  </button>
                </form>
              ) : null}

              {quizState === LESSON_QUIZ_STATUS.IN_PROGRESS ? (
                <Link
                  href={canContinue ? `/app/clases/${lesson.id}/prueba/jugar?i=${currentIndex}` : "#"}
                  className={`inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-base font-semibold transition ${
                    canContinue
                      ? "bg-primary text-primary-foreground hover:bg-primary-2"
                      : "pointer-events-none bg-primary/35 text-primary-foreground/80"
                  }`}
                >
                  Continuar
                </Link>
              ) : null}

              {quizState === LESSON_QUIZ_STATUS.COMPLETED ? (
                <>
                  <Link
                    href={`/app/clases/${lesson.id}/prueba/resultados`}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary-2"
                  >
                    Ver resultados
                  </Link>
                  <form action={restartLessonQuizAttempt} className="w-full sm:w-auto">
                    <input type="hidden" name="lessonId" value={lesson.id} />
                    <button
                      type="submit"
                      disabled={!canRepeat}
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-surface px-5 py-3 text-base font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {canRepeat
                        ? `Repetir prueba (${remainingRestarts} restantes)`
                        : "Repeticiones agotadas"}
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        </article>

        {typeSummary.length ? (
          <details className="rounded-2xl border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.22em] text-muted">
              Incluye
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {typeSummary.map((row) => (
                <div key={row.key} className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
                  <p className="font-semibold text-foreground">{row.label}</p>
                  <p className="text-xs text-muted">{row.count}</p>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
