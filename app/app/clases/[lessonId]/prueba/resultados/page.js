import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LESSON_QUIZ_MAX_RESTARTS,
  LESSON_QUIZ_STATUS,
  formatDurationSeconds,
  isMissingLessonQuizRestartColumnError,
  isMissingLessonQuizTableError,
  normalizeAttemptRow,
} from "@/lib/lesson-quiz";
import { restartLessonQuizAttempt } from "../actions";

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function computeExerciseWeight(totalExercises, exerciseIndex) {
  const total = Math.max(1, Number(totalExercises) || 1);
  const index = Math.max(0, Number(exerciseIndex) || 0);
  const base = round2(100 / total);
  if (index < total - 1) return base;
  return round2(100 - (base * (total - 1)));
}

function isMissingUserProgressQuizColumnsError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("wrong_attempts") ||
    message.includes("final_status") ||
    message.includes("score_awarded") ||
    message.includes("answered_at")
  );
}

export const metadata = {
  title: "Resultados de prueba | Aula Virtual",
};

export default async function LessonQuizResultsPage({ params: paramsPromise, searchParams: searchParamsPromise }) {
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
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.id || profile.role !== "student") {
    redirect("/app/matricula?locked=1");
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title, level")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson?.id) notFound();

  const { data: exercises, error: exercisesError } = await supabase
    .from("exercises")
    .select("id, type, prompt, ordering")
    .eq("lesson_id", lesson.id)
    .eq("status", "published")
    .order("ordering", { ascending: true })
    .order("created_at", { ascending: true });

  if (exercisesError) {
    throw new Error(exercisesError.message || "No se pudieron cargar ejercicios de resultados.");
  }

  const published = exercises || [];
  const totalExercises = published.length;

  let attemptRow = null;
  let attemptError = null;
  ({
    data: attemptRow,
    error: attemptError,
  } = await supabase
    .from("lesson_quiz_attempts")
    .select(
      "attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, restart_count, duration_seconds, completed_at, updated_at"
    )
    .eq("user_id", profile.id)
    .eq("lesson_id", lesson.id)
    .maybeSingle());

  if (attemptError && isMissingLessonQuizRestartColumnError(attemptError)) {
    const fallback = await supabase
      .from("lesson_quiz_attempts")
      .select(
        "attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, duration_seconds, completed_at, updated_at"
      )
      .eq("user_id", profile.id)
      .eq("lesson_id", lesson.id)
      .maybeSingle();
    attemptError = fallback.error;
    attemptRow = fallback.data
      ? {
          ...fallback.data,
          restart_count: 0,
        }
      : null;
  }

  if (attemptError) {
    if (isMissingLessonQuizTableError(attemptError)) {
      redirect(`/app/clases/${lesson.id}/prueba?tracking=missing`);
    }
    throw new Error(attemptError.message || "No se pudo cargar resultados de la prueba.");
  }

  const attempt = normalizeAttemptRow(attemptRow, totalExercises);
  if (attempt.attempt_status !== LESSON_QUIZ_STATUS.COMPLETED) {
    redirect(`/app/clases/${lesson.id}/prueba`);
  }

  const exerciseIds = published.map((exercise) => exercise.id);
  let progressRows = [];
  if (exerciseIds.length) {
    let data = null;
    let error = null;
    ({ data, error } = await supabase
      .from("user_progress")
      .select("exercise_id, is_correct, attempts, wrong_attempts, final_status, score_awarded, answered_at")
      .eq("user_id", profile.id)
      .in("exercise_id", exerciseIds));

    if (error && isMissingUserProgressQuizColumnsError(error)) {
      ({ data, error } = await supabase
        .from("user_progress")
        .select("exercise_id, is_correct, attempts, last_practiced")
        .eq("user_id", profile.id)
        .in("exercise_id", exerciseIds));
    }

    if (!error) {
      progressRows = data || [];
    }
  }

  const progressByExercise = new Map(
    normalizeArray(progressRows).map((row) => [String(row.exercise_id || "").trim(), row])
  );
  const durationLabel = formatDurationSeconds(attempt.duration_seconds);
  const scoreValue = attempt.score_percent != null ? round2(attempt.score_percent) : null;
  const repeatCount = Math.max(0, toInt(attempt.restart_count, 0));
  const remainingRestarts = Math.max(0, LESSON_QUIZ_MAX_RESTARTS - repeatCount);
  const canRepeat = remainingRestarts > 0;
  const repeatLimitWarning = searchParams?.repeat_limit === "1";

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-12 left-4 h-64 w-64 rounded-full bg-primary/18 blur-[120px]" />
        <div className="absolute bottom-0 right-10 h-72 w-72 rounded-full bg-accent/12 blur-[140px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Link
              href={`/app/clases/${lesson.id}/prueba`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              <ArrowLeftIcon />
              Volver
            </Link>
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">Resultados - {lesson.title}</h1>
              <p className="text-sm text-muted">Resumen final de la prueba de clase.</p>
            </div>
          </div>
          {lesson.level ? (
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
              {lesson.level}
            </span>
          ) : null}
        </header>
        {repeatLimitWarning ? (
          <div className="rounded-2xl border border-danger/45 bg-danger/12 px-4 py-3 text-sm text-danger">
            Alcanzaste el maximo de 2 repeticiones para esta prueba.
          </div>
        ) : null}

        <article className="rounded-[2rem] border border-success/30 bg-surface p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/25 text-success">
              <CheckIcon />
            </span>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Completado</p>
              <h2 className="text-2xl font-black">Prueba completada</h2>
              <p className="text-sm text-muted">
                {attempt.completed_count} de {totalExercises} ejercicios finalizados.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {scoreValue != null ? (
              <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Puntaje final</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{scoreValue}/100</p>
              </div>
            ) : null}
            {durationLabel ? (
              <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Tiempo</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{durationLabel}</p>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/app/clases/${lesson.id}/prueba`}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-surface px-5 py-3 text-base font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Volver a prueba
            </Link>
            <form action={restartLessonQuizAttempt} className="w-full">
              <input type="hidden" name="lessonId" value={lesson.id} />
              <button
                type="submit"
                disabled={!canRepeat}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {canRepeat
                  ? `Repetir prueba (${remainingRestarts} restantes)`
                  : "Repeticiones agotadas"}
              </button>
            </form>
          </div>
          <p className="mt-2 text-xs text-muted">
            Repeticiones usadas: {repeatCount}/{LESSON_QUIZ_MAX_RESTARTS}
          </p>
        </article>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted">Detalle de ejercicios</h3>
          <div className="mt-3 space-y-2">
            {published.map((exercise, idx) => {
              const progress = progressByExercise.get(String(exercise.id || "").trim()) || null;
              const hasResult = progress != null;
              const weight = computeExerciseWeight(totalExercises, idx);
              const wrongAttempts = hasResult ? Math.max(0, toInt(progress.wrong_attempts, toInt(progress.attempts, 1) - 1)) : null;
              const finalStatus = hasResult
                ? String(progress.final_status || (progress.is_correct ? "passed" : "failed")).toLowerCase()
                : null;
              const awarded = hasResult
                ? round2(
                    progress.score_awarded != null
                      ? progress.score_awarded
                      : finalStatus === "passed"
                      ? weight
                      : 0
                  )
                : null;
              const isPassed = finalStatus === "passed";

              return (
                <article key={exercise.id} className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {idx + 1}. {exercise.prompt || "Ejercicio"}
                      </p>
                      <p className="text-xs text-muted">{exercise.type || "Ejercicio"}</p>
                      {hasResult && awarded != null ? (
                        <p className="mt-1 text-xs text-muted">
                          Ejercicio {idx + 1}: {awarded}/{weight}
                          {wrongAttempts != null ? ` (${wrongAttempts} errores)` : ""}
                        </p>
                      ) : null}
                    </div>

                    {hasResult ? (
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          isPassed
                            ? "bg-success/20 text-success"
                            : "bg-danger/20 text-danger"
                        }`}
                      >
                        {isPassed ? "Passed" : "Failed"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface px-2 py-1 text-xs font-semibold text-muted">
                        Sin data
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
            {!published.length ? (
              <p className="text-sm text-muted">Prueba completada.</p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
