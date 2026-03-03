import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import RestartLessonQuizButton from "@/components/restart-lesson-quiz-button";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LESSON_QUIZ_MAX_RESTARTS,
  LESSON_QUIZ_MAX_TOTAL_ATTEMPTS,
  LESSON_QUIZ_STATUS,
  formatDurationSeconds,
  getUsedQuizAttempts,
  isMissingLessonQuizAttemptScoreColumnError,
  isMissingLessonQuizRestartColumnError,
  isMissingLessonQuizTableError,
  normalizeAttemptRow,
} from "@/lib/lesson-quiz";
import { loadLessonQuizAssignments } from "@/lib/lesson-quiz-assignments";
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

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

const EXERCISE_TYPE_LABELS = {
  scramble: "Scrambled Sentence",
  audio_match: "Listening Exercise",
  reading_exercise: "Reading Exercise",
  image_match: "Image Match",
  pairs: "Pairs",
  cloze: "Fill in the blanks",
};

function normalizeExerciseTypeLabel(type) {
  const normalized = String(type || "").trim().toLowerCase();
  return EXERCISE_TYPE_LABELS[normalized] || "Ejercicio";
}

function splitSentenceByBlankTokens(sentence = "") {
  const text = String(sentence || "");
  const regex = /\[\[\s*(blank_[a-z0-9_-]+)\s*\]\]/gi;
  const segments = [];
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "blank", key: String(match[1] || "").trim().toLowerCase() });
    lastIndex = match.index + match[0].length;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ kind: "text", value: text }];
}

function buildClozeReviewLayout(exercise, answerSnapshot, revealAll = false) {
  const content = normalizeObject(exercise?.content_json);
  const rawBlanks = normalizeArray(content.blanks);
  const optionTextById = new Map(
    normalizeArray(content.options_pool).map((option) => [
      String(option?.id || "").trim().toLowerCase(),
      String(option?.text || "").trim(),
    ])
  );

  let blanks = rawBlanks.map((blank, idx) => {
    const key = String(blank?.key || blank?.id || `blank_${idx + 1}`).trim().toLowerCase();
    const correctOptionId = String(blank?.correct_option_id || blank?.correctOptionId || "").trim().toLowerCase();
    const correctText =
      optionTextById.get(correctOptionId) ||
      String(blank?.answer || blank?.correct || "").trim();
    return {
      key,
      correctText,
    };
  });

  if (!blanks.length) {
    const legacyOptions = normalizeArray(content.options).map((item) => String(item || "").trim());
    const correctIndex = Math.max(0, Math.min(legacyOptions.length - 1, toInt(content.correct_index, 0)));
    const correctText =
      legacyOptions[correctIndex] ||
      String(content.answer || content.correct || "").trim();
    if (correctText) {
      blanks = [{ key: "blank_1", correctText }];
    }
  }

  if (!blanks.length) return null;

  let sentence = String(content.sentence || exercise?.prompt || "").trim();
  if (!sentence) sentence = "Complete the sentence.";
  if (!/\[\[\s*blank_/i.test(sentence)) {
    if (/_{2,}/.test(sentence)) {
      sentence = sentence.replace(/_{2,}/, `[[${blanks[0].key}]]`);
    } else if (blanks.length === 1) {
      sentence = `${sentence} [[${blanks[0].key}]]`.trim();
    }
  }

  const snapshot = normalizeObject(answerSnapshot);
  const snapshotByKey = new Map(
    normalizeArray(snapshot.blanks).map((blank, idx) => {
      const key = String(blank?.key || `blank_${idx + 1}`).trim().toLowerCase();
      return [key, normalizeObject(blank)];
    })
  );
  const displayByKey = new Map(
    blanks.map((blank) => {
      const saved = snapshotByKey.get(blank.key) || null;
      const text = revealAll
        ? blank.correctText
        : saved?.isCorrect
        ? String(saved.correctText || blank.correctText || "").trim()
        : "";
      return [blank.key, text];
    })
  );

  return {
    segments: splitSentenceByBlankTokens(sentence),
    hasPerBlankReview: snapshotByKey.size > 0,
    displayByKey,
  };
}

function buildExerciseAnswerLines(exercise) {
  const type = String(exercise?.type || "").trim().toLowerCase();
  const content = normalizeObject(exercise?.content_json);

  if (type === "scramble") {
    const words = normalizeArray(content.target_words);
    const order = normalizeArray(content.answer_order);
    const resolved = order.length === words.length
      ? order.map((index) => words[index]).filter(Boolean)
      : words.filter(Boolean);
    return resolved.length ? [resolved.join(" ")] : [];
  }

  if (type === "audio_match" || type === "reading_exercise") {
    const questions = normalizeArray(content.questions);
    if (questions.length) {
      return questions.map((question, index) => {
        const questionType = String(question?.type || "").trim().toLowerCase();
        const prompt = String(question?.prompt || "").trim() || `Pregunta ${index + 1}`;

        if (questionType === "written") {
          const answers = normalizeArray(question?.accepted_answers).map((item) => String(item || "").trim()).filter(Boolean);
          return `${prompt}: ${answers.join(" / ") || "-"}`;
        }

        if (questionType === "true_false") {
          return `${prompt}: ${question?.correct_boolean ? "True" : "False"}`;
        }

        const options = normalizeArray(question?.options).map((item) => String(item || "").trim());
        const correctIndex = Math.max(0, Math.min(options.length - 1, toInt(question?.correct_index, 0)));
        return `${prompt}: ${options[correctIndex] || `Option ${correctIndex + 1}`}`;
      });
    }

    const legacyCorrect = String(
      content.correct ||
      content.answer ||
      content.text_target ||
      ""
    ).trim();
    return legacyCorrect ? [legacyCorrect] : [];
  }

  if (type === "image_match") {
    const options = normalizeArray(content.options);
    const correctIndex = Math.max(0, Math.min(options.length - 1, toInt(content.correct_index, 0)));
    const option = options[correctIndex];
    const label = typeof option === "string"
      ? option
      : String(option?.label || option?.word_native || option?.word_target || option?.text || "").trim();
    return label ? [label] : [];
  }

  if (type === "pairs") {
    const pairs = normalizeArray(content.pairs)
      .map((pair) => {
        const left = String(pair?.left || pair?.native || "").trim();
        const right = String(pair?.right || pair?.target || "").trim();
        if (!left || !right) return "";
        return `${left} = ${right}`;
      })
      .filter(Boolean);
    return pairs;
  }

  if (type === "cloze") {
    const blanks = normalizeArray(content.blanks);
    const optionsPool = new Map(
      normalizeArray(content.options_pool).map((option) => [
        String(option?.id || "").trim().toLowerCase(),
        String(option?.text || "").trim(),
      ])
    );

    if (blanks.length) {
      return blanks.map((blank, index) => {
        const correctOptionId = String(blank?.correct_option_id || blank?.correctOptionId || "").trim().toLowerCase();
        const correctText =
          optionsPool.get(correctOptionId) ||
          String(blank?.answer || blank?.correct || "").trim() ||
          "-";
        return `Blank ${index + 1}: ${correctText}`;
      });
    }

    const legacyOptions = normalizeArray(content.options).map((item) => String(item || "").trim());
    if (legacyOptions.length) {
      const correctIndex = Math.max(0, Math.min(legacyOptions.length - 1, toInt(content.correct_index, 0)));
      return [legacyOptions[correctIndex] || "-"];
    }

    const answer = String(content.answer || content.correct || "").trim();
    return answer ? [answer] : [];
  }

  return [];
}

function computeExerciseWeight(totalExercises, exerciseIndex) {
  const total = Math.max(1, Number(totalExercises) || 1);
  const index = Math.max(0, Number(exerciseIndex) || 0);
  const base = round2(100 / total);
  if (index < total - 1) return base;
  return round2(100 - (base * (total - 1)));
}

function computeExerciseWeightFromPoints(totalExercises, exerciseIndex, pointValues = []) {
  const total = Math.max(1, Number(totalExercises) || 1);
  const index = Math.max(0, Number(exerciseIndex) || 0);
  const values = normalizeArray(pointValues)
    .slice(0, total)
    .map((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    });
  const hasCustom = values.length === total && values.some((value) => value > 0);
  if (!hasCustom) return computeExerciseWeight(total, index);

  const sum = values.reduce((acc, value) => acc + value, 0);
  if (!Number.isFinite(sum) || sum <= 0) return computeExerciseWeight(total, index);
  return round2((values[index] / sum) * 100);
}

function isMissingUserProgressQuizColumnsError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("wrong_attempts") ||
    message.includes("final_status") ||
    message.includes("score_awarded") ||
    message.includes("answered_at") ||
    message.includes("answer_snapshot")
  );
}

async function loadLessonProgressRows(supabase, userId, lessonId, exerciseIds = []) {
  const ids = Array.from(
    new Set((exerciseIds || []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (!ids.length) return [];

  async function runProgressQuery(scope = "lesson") {
    let query = supabase
      .from("user_progress")
      .select("exercise_id, is_correct, attempts, wrong_attempts, final_status, score_awarded, answered_at, answer_snapshot")
      .eq("user_id", userId)
      .in("exercise_id", ids);

    if (scope === "lesson") {
      query = query.eq("lesson_id", lessonId);
    } else if (scope === "legacy") {
      query = query.is("lesson_id", null);
    }

    let { data, error } = await query;

    if (error && isMissingUserProgressQuizColumnsError(error)) {
      let fallbackQuery = supabase
        .from("user_progress")
        .select("exercise_id, is_correct, attempts, last_practiced")
        .eq("user_id", userId)
        .in("exercise_id", ids);

      if (scope === "lesson") {
        fallbackQuery = fallbackQuery.eq("lesson_id", lessonId);
      } else if (scope === "legacy") {
        fallbackQuery = fallbackQuery.is("lesson_id", null);
      }

      ({ data, error } = await fallbackQuery);
    }

    return {
      data: data || [],
      error,
    };
  }

  const scoped = await runProgressQuery("lesson");
  if (scoped.error) {
    const noScope = await runProgressQuery("any");
    return noScope.error ? [] : noScope.data;
  }
  if (scoped.data.length) {
    return scoped.data;
  }

  const legacy = await runProgressQuery("legacy");
  return legacy.error ? scoped.data : legacy.data;
}

export const metadata = {
  title: "Resultados de test | Aula Virtual",
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
    .select("id, title, level, unit_id, ordering, description")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson?.id) notFound();

  const quiz = await loadLessonQuizAssignments(supabase, lesson);
  const published = Array.isArray(quiz?.exercises) ? quiz.exercises : [];
  const totalExercises = published.length;
  const fallbackNumber = Math.max(1, toInt(lesson?.ordering, 1));
  const testTitle = String(quiz?.title || lesson?.title || "").trim() || "Test de clase";
  const testNumber = Math.max(1, toInt(quiz?.testNumber, fallbackNumber));
  const exercisePointValues = published.map((exercise) => {
    const parsed = Number(exercise?.content_json?.point_value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });

  let attemptRow = null;
  let attemptError = null;
  ({
    data: attemptRow,
    error: attemptError,
  } = await supabase
    .from("lesson_quiz_attempts")
    .select(
      "attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, attempt_score_percent, restart_count, duration_seconds, completed_at, updated_at"
    )
    .eq("user_id", profile.id)
    .eq("lesson_id", lesson.id)
    .maybeSingle());

  if (
    attemptError &&
    (isMissingLessonQuizRestartColumnError(attemptError) || isMissingLessonQuizAttemptScoreColumnError(attemptError))
  ) {
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
          attempt_score_percent: fallback.data?.score_percent ?? null,
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
  const progressRows = await loadLessonProgressRows(supabase, profile.id, lesson.id, exerciseIds);

  const progressByExercise = new Map(
    normalizeArray(progressRows).map((row) => [String(row.exercise_id || "").trim(), row])
  );
  const durationLabel = formatDurationSeconds(attempt.duration_seconds);
  const scoreValue = attempt.attempt_score_percent != null ? round2(attempt.attempt_score_percent) : null;
  const bestScoreValue = attempt.score_percent != null ? round2(attempt.score_percent) : scoreValue;
  const repeatCount = Math.max(0, toInt(attempt.restart_count, 0));
  const attemptsUsed = getUsedQuizAttempts({
    status: attempt.attempt_status,
    restartCount: repeatCount,
    completedCount: attempt.completed_count,
  });
  const remainingAttempts = Math.max(0, LESSON_QUIZ_MAX_TOTAL_ATTEMPTS - attemptsUsed);
  const remainingRestarts = Math.max(0, LESSON_QUIZ_MAX_RESTARTS - repeatCount);
  const canRepeat = remainingRestarts > 0;
  const revealCorrectAnswers = !canRepeat;
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
              <h1 className="text-2xl font-semibold sm:text-3xl">{`Test ${testNumber} - ${testTitle}`}</h1>
              <p className="text-sm text-muted">Resultados finales del test.</p>
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
            Alcanzaste el maximo de {LESSON_QUIZ_MAX_TOTAL_ATTEMPTS} intentos para este test.
          </div>
        ) : null}

        <article className="rounded-[2rem] border border-success/30 bg-surface p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/25 text-success">
              <CheckIcon />
            </span>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Completado</p>
              <h2 className="text-2xl font-black">Test completado</h2>
              <p className="text-sm text-muted">
                {attempt.completed_count} de {totalExercises} ejercicios finalizados.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {scoreValue != null ? (
              <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Puntaje del intento</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{scoreValue}/100</p>
              </div>
            ) : null}
            {bestScoreValue != null && bestScoreValue !== scoreValue ? (
              <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted">Mejor puntaje</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{bestScoreValue}/100</p>
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
              Volver al test
            </Link>
            <RestartLessonQuizButton
              action={restartLessonQuizAttempt}
              lessonId={lesson.id}
              canRepeat={canRepeat}
              remainingAttempts={remainingAttempts}
              attemptsUsed={attemptsUsed}
              maxAttempts={LESSON_QUIZ_MAX_TOTAL_ATTEMPTS}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Intentos usados: {attemptsUsed}/{LESSON_QUIZ_MAX_TOTAL_ATTEMPTS}
          </p>
        </article>

        <section className="rounded-3xl border border-border bg-surface p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted">Detalle de ejercicios</h3>
          <p className="mt-1 text-sm text-muted">
            {revealCorrectAnswers
              ? "Revisa cada ejercicio con su resultado y la respuesta correcta para detectar rapido en que fallaste."
              : "Si acertaste un ejercicio, su respuesta ya se muestra. En Fill in the blanks se ven solo los blanks correctos y los incorrectos quedan vacios hasta agotar intentos."}
          </p>
          <div className="mt-4 space-y-3">
            {published.map((exercise, idx) => {
              const progress = progressByExercise.get(String(exercise.id || "").trim()) || null;
              const hasResult = progress != null;
              const weight = computeExerciseWeightFromPoints(totalExercises, idx, exercisePointValues);
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
              const exerciseType = String(exercise?.type || "").trim().toLowerCase();
              const clozeReview = exerciseType === "cloze"
                ? buildClozeReviewLayout(exercise, progress?.answer_snapshot, revealCorrectAnswers || isPassed)
                : null;
              const showStandardAnswer = hasResult && (isPassed || revealCorrectAnswers);
              const showClozePartial = hasResult && !showStandardAnswer && Boolean(clozeReview?.hasPerBlankReview);
              const answerLines = buildExerciseAnswerLines(exercise);
              const typeLabel = normalizeExerciseTypeLabel(exercise.type);
              const title = String(exercise.prompt || "").trim() || typeLabel;

              return (
                <article
                  key={exercise.id}
                  className={`rounded-2xl border p-4 sm:p-5 ${
                    hasResult
                      ? isPassed
                        ? "border-success/35 bg-success/5"
                        : "border-danger/35 bg-danger/5"
                      : "border-border bg-surface-2"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Ejercicio {idx + 1}
                        </span>
                        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted">
                          {typeLabel}
                        </span>
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground sm:text-lg">{title}</p>
                        {!hasResult ? (
                          <p className="mt-1 text-sm text-muted">No se encontro data de este ejercicio.</p>
                        ) : isPassed ? (
                          <p className="mt-1 text-sm text-success">Lo resolviste correctamente.</p>
                        ) : showClozePartial ? (
                          <p className="mt-1 text-sm text-muted">
                            Se muestran los blanks que resolviste bien. Los incorrectos quedan vacios por ahora.
                          </p>
                        ) : revealCorrectAnswers ? (
                          <p className="mt-1 text-sm text-danger">Aqui estuvo tu error. Revisa la respuesta correcta abajo.</p>
                        ) : (
                          <p className="mt-1 text-sm text-muted">Aun tienes intentos disponibles. La respuesta correcta seguira oculta por ahora.</p>
                        )}
                      </div>
                    </div>

                    {hasResult ? (
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isPassed
                            ? "bg-success/20 text-success"
                            : "bg-danger/20 text-danger"
                        }`}
                      >
                        {isPassed ? "Correcto" : "Necesita repaso"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
                        Sin data
                      </span>
                    )}
                  </div>

                  {hasResult ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border border-border bg-surface px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Puntaje</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {awarded != null ? `${awarded}/${weight}` : `0/${weight}`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Intentos</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {Math.max(1, toInt(progress.attempts, 1))}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-surface px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Errores</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {wrongAttempts != null ? wrongAttempts : 0}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-border bg-surface px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {showStandardAnswer
                        ? "Respuesta correcta"
                        : showClozePartial
                        ? "Detalle de blanks"
                        : "Respuesta bloqueada"}
                    </p>
                    {showStandardAnswer ? (
                      clozeReview ? (
                        <div className="mt-2 rounded-2xl border border-border bg-surface-2 px-3 py-3 text-sm font-semibold text-foreground">
                          {clozeReview.segments.map((segment, segmentIndex) => {
                            if (segment.kind !== "blank") {
                              return <span key={`${exercise.id}-segment-text-${segmentIndex}`}>{segment.value}</span>;
                            }
                            const value = clozeReview.displayByKey.get(String(segment.key || "").toLowerCase()) || "";
                            return (
                              <span
                                key={`${exercise.id}-segment-blank-${segmentIndex}`}
                                className={`mx-1 my-1 inline-flex min-h-10 min-w-24 items-center justify-center rounded-xl border px-3 py-2 align-middle ${
                                  value
                                    ? "border-success/35 bg-success/10"
                                    : "border-dashed border-border bg-surface"
                                }`}
                              >
                                {value ? value : <span className="block h-4 w-10" aria-hidden="true" />}
                              </span>
                            );
                          })}
                        </div>
                      ) : answerLines.length ? (
                        <div className="mt-2 space-y-1.5">
                          {answerLines.map((line, lineIndex) => (
                            <p key={`${exercise.id}-answer-${lineIndex}`} className="text-sm text-foreground">
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted">No hay respuesta visible para este ejercicio.</p>
                      )
                    ) : showClozePartial ? (
                      <div className="mt-2 rounded-2xl border border-border bg-surface-2 px-3 py-3 text-sm font-semibold text-foreground">
                        {clozeReview.segments.map((segment, segmentIndex) => {
                          if (segment.kind !== "blank") {
                            return <span key={`${exercise.id}-segment-text-${segmentIndex}`}>{segment.value}</span>;
                          }
                          const value = clozeReview.displayByKey.get(String(segment.key || "").toLowerCase()) || "";
                          return (
                            <span
                              key={`${exercise.id}-segment-blank-${segmentIndex}`}
                              className={`mx-1 my-1 inline-flex min-h-10 min-w-24 items-center justify-center rounded-xl border px-3 py-2 align-middle ${
                                value
                                  ? "border-success/35 bg-success/10"
                                  : "border-dashed border-border bg-surface"
                              }`}
                            >
                              {value ? value : <span className="block h-4 w-10" aria-hidden="true" />}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted">
                        Completa todos tus intentos del test para desbloquear las respuestas correctas.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
            {!published.length ? (
              <p className="text-sm text-muted">Test completado.</p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
