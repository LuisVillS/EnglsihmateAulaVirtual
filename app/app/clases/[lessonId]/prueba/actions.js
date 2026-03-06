"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LESSON_QUIZ_MAX_RESTARTS,
  LESSON_QUIZ_STATUS,
  isMissingLessonQuizAttemptScoreColumnError,
  isMissingLessonQuizRestartColumnError,
  isMissingLessonQuizTableError,
  normalizeAttemptRow,
} from "@/lib/lesson-quiz";
import { loadLessonQuizAssignments } from "@/lib/lesson-quiz-assignments";

const LESSON_QUIZ_MAX_WRONG_ATTEMPTS = 1;

function getText(formData, key) {
  const value = formData?.get(key);
  return value ? String(value).trim() : "";
}

function getJsonObject(formData, key) {
  const raw = getText(formData, key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function getJsonArray(formData, key) {
  const raw = getText(formData, key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round((toNumber(value, 0) + Number.EPSILON) * 100) / 100;
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

async function requireStudentUser() {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.id || profile.role !== "student") {
    redirect("/app/matricula?locked=1");
  }

  return { supabase, userId: user.id };
}

async function loadPublishedExerciseCount(supabase, lessonId) {
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, title, description")
    .eq("id", lessonId)
    .maybeSingle();

  if (lessonError || !lesson?.id) {
    throw new Error(lessonError?.message || "No se pudo cargar la leccion del test.");
  }

  const quiz = await loadLessonQuizAssignments(supabase, lesson);
  return Array.isArray(quiz?.exercises) ? quiz.exercises.length : 0;
}

async function upsertAttemptAsStarted({ supabase, userId, lessonId, totalExercises, restartCount = 0 }) {
  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId,
    lesson_id: lessonId,
    attempt_status: LESSON_QUIZ_STATUS.IN_PROGRESS,
    current_index: 0,
    completed_count: 0,
    total_exercises: totalExercises,
    correct_count: 0,
    attempt_score_percent: 0,
    restart_count: Math.max(0, Math.min(LESSON_QUIZ_MAX_RESTARTS, toInt(restartCount, 0))),
    duration_seconds: null,
    started_at: nowIso,
    completed_at: null,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from("lesson_quiz_attempts")
    .upsert(payload, { onConflict: "user_id,lesson_id" });

  if (
    error &&
    (isMissingLessonQuizRestartColumnError(error) || isMissingLessonQuizAttemptScoreColumnError(error))
  ) {
    const fallbackPayload = { ...payload };
    if (isMissingLessonQuizRestartColumnError(error)) {
      delete fallbackPayload.restart_count;
    }
    if (isMissingLessonQuizAttemptScoreColumnError(error)) {
      delete fallbackPayload.attempt_score_percent;
      fallbackPayload.score_percent = 0;
    }
    const { error: fallbackError } = await supabase
      .from("lesson_quiz_attempts")
      .upsert(fallbackPayload, { onConflict: "user_id,lesson_id" });
    if (fallbackError) {
      throw new Error(fallbackError.message || "No se pudo iniciar/reiniciar la prueba.");
    }
    return;
  }

  if (error) {
    throw new Error(error.message || "No se pudo iniciar/reiniciar la prueba.");
  }
}

function revalidateLessonQuizPaths(lessonId) {
  const safeLessonId = String(lessonId || "").trim();
  if (!safeLessonId) return;
  revalidatePath(`/app/clases/${safeLessonId}/prueba`);
  revalidatePath(`/app/clases/${safeLessonId}/prueba/jugar`);
  revalidatePath(`/app/clases/${safeLessonId}/prueba/resultados`);
  revalidatePath("/app/curso");
}

export async function startLessonQuizAttempt(formData) {
  const lessonId = getText(formData, "lessonId");
  if (!lessonId) return;

  const { supabase, userId } = await requireStudentUser();
  try {
    const totalExercises = await loadPublishedExerciseCount(supabase, lessonId);
    let existingAttempt = null;
    {
      const query = await supabase
        .from("lesson_quiz_attempts")
        .select("restart_count")
        .eq("user_id", userId)
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (query.error && !isMissingLessonQuizRestartColumnError(query.error)) {
        throw new Error(query.error.message || "No se pudo cargar el intento de prueba.");
      }
      existingAttempt = query.error ? null : query.data;
    }
    await upsertAttemptAsStarted({
      supabase,
      userId,
      lessonId,
      totalExercises,
      restartCount: toInt(existingAttempt?.restart_count, 0),
    });
  } catch (error) {
    if (isMissingLessonQuizTableError(error)) {
      redirect(`/app/clases/${lessonId}/prueba?tracking=missing`);
    }
    throw error instanceof Error ? error : new Error(String(error?.message || "No se pudo iniciar la prueba."));
  }

  revalidateLessonQuizPaths(lessonId);
  redirect(`/app/clases/${lessonId}/prueba/jugar?i=0`);
}

export async function restartLessonQuizAttempt(formData) {
  const lessonId = getText(formData, "lessonId");
  if (!lessonId) return;

  const { supabase, userId } = await requireStudentUser();
  try {
    let currentAttemptRow = null;
    {
      const primaryQuery = await supabase
        .from("lesson_quiz_attempts")
        .select("attempt_status, restart_count, total_exercises")
        .eq("user_id", userId)
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (!primaryQuery.error) {
        currentAttemptRow = primaryQuery.data || null;
      } else if (isMissingLessonQuizRestartColumnError(primaryQuery.error)) {
        const fallbackQuery = await supabase
          .from("lesson_quiz_attempts")
          .select("attempt_status, total_exercises")
          .eq("user_id", userId)
          .eq("lesson_id", lessonId)
          .maybeSingle();
        if (fallbackQuery.error) {
          throw new Error(fallbackQuery.error.message || "No se pudo cargar el intento de prueba.");
        }
        currentAttemptRow = {
          ...(fallbackQuery.data || {}),
          restart_count: 0,
        };
      } else {
        throw new Error(primaryQuery.error.message || "No se pudo cargar el intento de prueba.");
      }
    }
    const currentAttempt = normalizeAttemptRow(currentAttemptRow, toInt(currentAttemptRow?.total_exercises, 0));
    const nextRestartCount = Math.max(0, toInt(currentAttempt.restart_count, 0) + 1);
    if (nextRestartCount > LESSON_QUIZ_MAX_RESTARTS) {
      redirect(`/app/clases/${lessonId}/prueba/resultados?repeat_limit=1`);
    }

    const totalExercises = await loadPublishedExerciseCount(supabase, lessonId);
    await upsertAttemptAsStarted({
      supabase,
      userId,
      lessonId,
      totalExercises,
      restartCount: nextRestartCount,
    });
  } catch (error) {
    if (isMissingLessonQuizTableError(error)) {
      redirect(`/app/clases/${lessonId}/prueba?tracking=missing`);
    }
    throw error instanceof Error ? error : new Error(String(error?.message || "No se pudo reiniciar la prueba."));
  }

  revalidateLessonQuizPaths(lessonId);
  redirect(`/app/clases/${lessonId}/prueba/jugar?i=0`);
}

export async function submitLessonQuizStep(formData) {
  const lessonId = getText(formData, "lessonId");
  if (!lessonId) return;
  const responseMode = getText(formData, "responseMode").toLowerCase();
  const isBackgroundMode = responseMode === "background" || responseMode === "json";
  const finalizeAttemptRaw = getText(formData, "finalizeAttempt").toLowerCase();
  const shouldFinalizeAttempt =
    finalizeAttemptRaw === "1" ||
    finalizeAttemptRaw === "true" ||
    finalizeAttemptRaw === "yes" ||
    finalizeAttemptRaw === "on";
  const requestKey = getText(formData, "requestKey");

  const submittedPageIndex = Math.max(0, toInt(getText(formData, "currentIndex"), 0));
  const submittedTotal = Math.max(0, toInt(getText(formData, "totalExercises"), 0));
  const pageResults = getJsonArray(formData, "pageResults");
  const singleExerciseId = getText(formData, "exerciseId");
  const singleWrongAttempts = clamp(
    toInt(getText(formData, "wrongAttempts"), 0),
    0,
    LESSON_QUIZ_MAX_WRONG_ATTEMPTS
  );
  const singleFinalStatusRaw = getText(formData, "finalStatus").toLowerCase();
  const singleScoreAwarded = clamp(round2(toNumber(getText(formData, "scoreAwarded"), 0)), 0, 100);
  const singleAnswerSnapshot = getJsonObject(formData, "answerSnapshot");

  const normalizedPageResults = (Array.isArray(pageResults) ? pageResults : [])
    .map((entry, index) => {
      const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
      const exerciseId = String(source.exerciseId || source.exercise_id || "").trim();
      const exerciseIndex = Math.max(0, toInt(source.exerciseIndex ?? source.currentIndex, submittedPageIndex + index));
      const wrongAttempts = clamp(
        toInt(source.wrongAttempts ?? source.wrong_attempts, 0),
        0,
        LESSON_QUIZ_MAX_WRONG_ATTEMPTS
      );
      const finalStatusRaw = String(source.finalStatus || source.final_status || "").trim().toLowerCase();
      const finalStatus = wrongAttempts >= LESSON_QUIZ_MAX_WRONG_ATTEMPTS || finalStatusRaw === "failed" ? "failed" : "passed";
      const scoreAwarded = clamp(round2(toNumber(source.scoreAwarded ?? source.score_awarded, 0)), 0, 100);
      const answerSnapshot =
        source.answerSnapshot && typeof source.answerSnapshot === "object" && !Array.isArray(source.answerSnapshot)
          ? source.answerSnapshot
          : null;
      return {
        exerciseId,
        exerciseIndex,
        wrongAttempts,
        finalStatus,
        isCorrect: finalStatus === "passed",
        scoreAwarded,
        answerSnapshot,
      };
    })
    .filter((entry) => entry.exerciseId);

  const submissions = normalizedPageResults.length
    ? normalizedPageResults
    : [{
        exerciseId: singleExerciseId,
        exerciseIndex: submittedPageIndex,
        wrongAttempts: singleWrongAttempts,
        finalStatus:
          singleWrongAttempts >= LESSON_QUIZ_MAX_WRONG_ATTEMPTS || singleFinalStatusRaw === "failed"
            ? "failed"
            : "passed",
        isCorrect:
          !(
            singleWrongAttempts >= LESSON_QUIZ_MAX_WRONG_ATTEMPTS || singleFinalStatusRaw === "failed"
          ),
        scoreAwarded: singleScoreAwarded,
        answerSnapshot: singleAnswerSnapshot,
      }];

  const { supabase, userId } = await requireStudentUser();

  let totalExercises = submittedTotal;
  if (!totalExercises) {
    totalExercises = await loadPublishedExerciseCount(supabase, lessonId);
  }
  if (!totalExercises) {
    if (isBackgroundMode) {
      throw new Error("No hay ejercicios publicados para esta prueba.");
    }
    revalidateLessonQuizPaths(lessonId);
    redirect(`/app/clases/${lessonId}/prueba`);
  }

  let existingAttempt = null;
  let legacyScoreMode = false;
  try {
    const { data, error } = await supabase
      .from("lesson_quiz_attempts")
      .select(
        "user_id, lesson_id, attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, attempt_score_percent, restart_count, started_at, completed_at"
      )
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .maybeSingle();

    if (error) {
      if (isMissingLessonQuizRestartColumnError(error) || isMissingLessonQuizAttemptScoreColumnError(error)) {
        legacyScoreMode = true;
        const fallback = await supabase
          .from("lesson_quiz_attempts")
          .select(
            "user_id, lesson_id, attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, started_at, completed_at"
          )
          .eq("user_id", userId)
          .eq("lesson_id", lessonId)
          .maybeSingle();
        if (fallback.error) {
          throw new Error(fallback.error.message || "No se pudo cargar el intento de prueba.");
        }
        existingAttempt = {
          ...(fallback.data || {}),
          restart_count: 0,
          attempt_score_percent: fallback.data?.score_percent ?? null,
        };
      } else {
        throw new Error(error.message || "No se pudo cargar el intento de prueba.");
      }
    } else {
      existingAttempt = data || null;
    }

    if (existingAttempt == null) {
      throw new Error("No se encontro el intento de prueba.");
    }
  } catch (error) {
    if (isMissingLessonQuizTableError(error)) {
      if (isBackgroundMode) {
        throw error instanceof Error ? error : new Error("No se encontro la tabla de intentos.");
      }
      redirect(`/app/clases/${lessonId}/prueba?tracking=missing`);
    }
    throw error instanceof Error ? error : new Error(String(error?.message || "No se pudo enviar el progreso."));
  }

  const current = normalizeAttemptRow(existingAttempt, totalExercises);
  const nowIso = new Date().toISOString();
  const startedAtIso = current.started_at || nowIso;

  async function upsertLessonQuizAttempt(payload) {
    let { error: upsertError } = await supabase
      .from("lesson_quiz_attempts")
      .upsert(payload, { onConflict: "user_id,lesson_id" });

    if (
      upsertError &&
      (isMissingLessonQuizRestartColumnError(upsertError) || isMissingLessonQuizAttemptScoreColumnError(upsertError))
    ) {
      const fallbackPayload = { ...payload };
      if (isMissingLessonQuizRestartColumnError(upsertError)) {
        delete fallbackPayload.restart_count;
      }
      if (isMissingLessonQuizAttemptScoreColumnError(upsertError)) {
        delete fallbackPayload.attempt_score_percent;
      }
      const { error: fallbackUpsertError } = await supabase
        .from("lesson_quiz_attempts")
        .upsert(fallbackPayload, { onConflict: "user_id,lesson_id" });
      upsertError = fallbackUpsertError;
    }

    if (upsertError) {
      if (isMissingLessonQuizTableError(upsertError)) {
        if (isBackgroundMode) {
          throw new Error(upsertError.message || "No se encontro la tabla de intentos.");
        }
        redirect(`/app/clases/${lessonId}/prueba?tracking=missing`);
      }
      throw new Error(upsertError.message || "No se pudo actualizar la prueba.");
    }
  }

  const safeSubmissionResults = submissions
    .map((entry, index) => ({
      ...entry,
      exerciseIndex: Math.max(
        0,
        Math.min(totalExercises - 1, Number.isFinite(entry.exerciseIndex) ? entry.exerciseIndex : submittedPageIndex + index)
      ),
    }))
    .filter((entry) => entry.exerciseId);
  if (!safeSubmissionResults.length) {
    throw new Error("No se recibieron respuestas del bloque de ejercicios.");
  }

  const highestSubmittedIndex = safeSubmissionResults.length
    ? safeSubmissionResults.reduce((max, entry) => Math.max(max, entry.exerciseIndex), 0)
    : Math.max(0, Math.min(totalExercises - 1, Number.isFinite(submittedPageIndex) ? submittedPageIndex : current.current_index));
  const alreadyProcessed = current.completed_count > highestSubmittedIndex;
  if (alreadyProcessed) {
    const alreadyCompleted = current.attempt_status === LESSON_QUIZ_STATUS.COMPLETED;
    const shouldFinalizeNow = !alreadyCompleted && shouldFinalizeAttempt && current.completed_count >= totalExercises;

    if (shouldFinalizeNow) {
      const finishedAttemptScore = clamp(round2(toNumber(current.attempt_score_percent, current.score_percent)), 0, 100);
      const historicalBestScore = clamp(round2(toNumber(current.score_percent, 0)), 0, 100);
      const finishedBestScore = legacyScoreMode
        ? finishedAttemptScore
        : Math.max(historicalBestScore, finishedAttemptScore);
      const storedDurationSeconds = Math.max(0, toInt(current.duration_seconds, 0));
      const finishedDurationSeconds = storedDurationSeconds > 0
        ? storedDurationSeconds
        : Math.max(
            0,
            Math.round(
              (new Date(nowIso).getTime() - new Date(startedAtIso).getTime()) / 1000
            )
          );
      const finalizePayload = {
        user_id: userId,
        lesson_id: lessonId,
        attempt_status: LESSON_QUIZ_STATUS.COMPLETED,
        current_index: Math.max(0, totalExercises - 1),
        completed_count: totalExercises,
        total_exercises: totalExercises,
        correct_count: current.correct_count,
        score_percent: finishedBestScore,
        restart_count: toInt(current.restart_count, 0),
        duration_seconds: finishedDurationSeconds,
        started_at: startedAtIso,
        completed_at: nowIso,
        updated_at: nowIso,
      };
      if (!legacyScoreMode) {
        finalizePayload.attempt_score_percent = finishedAttemptScore;
      }
      await upsertLessonQuizAttempt(finalizePayload);

      revalidateLessonQuizPaths(lessonId);
      if (isBackgroundMode) {
        return {
          ok: true,
          deduped: true,
          finalized: true,
          requestKey: requestKey || null,
          isCompleted: true,
          nextIndex: Math.max(0, totalExercises - 1),
        };
      }
      redirect(`/app/clases/${lessonId}/prueba/resultados`);
    }

    revalidateLessonQuizPaths(lessonId);
    if (isBackgroundMode) {
      return {
        ok: true,
        deduped: true,
        requestKey: requestKey || null,
        isCompleted: alreadyCompleted,
        nextIndex: Math.max(0, Math.min(totalExercises - 1, toInt(current.current_index, 0))),
      };
    }
    if (alreadyCompleted) {
      redirect(`/app/clases/${lessonId}/prueba/resultados`);
    }
    redirect(`/app/clases/${lessonId}/prueba/jugar?i=${Math.max(0, Math.min(totalExercises - 1, toInt(current.current_index, 0)))}`);
  }
  const nextCompleted = Math.min(totalExercises, Math.max(current.completed_count, highestSubmittedIndex + 1));
  const pageCorrectCount = safeSubmissionResults.reduce(
    (count, entry) => count + (entry.isCorrect ? 1 : 0),
    0
  );
  const nextCorrect = current.correct_count + pageCorrectCount;
  const reachedEndOfTest = nextCompleted >= totalExercises;
  const isCompleted = shouldFinalizeAttempt && nextCompleted >= totalExercises;
  const nextStatus = isCompleted ? LESSON_QUIZ_STATUS.COMPLETED : LESSON_QUIZ_STATUS.IN_PROGRESS;
  const nextIndex = nextCompleted >= totalExercises ? totalExercises - 1 : nextCompleted;
  const currentAttemptScore = clamp(round2(toNumber(current.attempt_score_percent, 0)), 0, 100);
  const pageScoreAwarded = safeSubmissionResults.reduce((sum, entry) => sum + entry.scoreAwarded, 0);
  const nextAttemptScore = clamp(round2(currentAttemptScore + pageScoreAwarded), 0, 100);
  const historicalBestScore = clamp(round2(toNumber(current.score_percent, 0)), 0, 100);
  const nextBestScore = legacyScoreMode
    ? nextAttemptScore
    : isCompleted
    ? Math.max(historicalBestScore, nextAttemptScore)
    : historicalBestScore;

  const storedDurationSeconds = Math.max(0, toInt(current.duration_seconds, 0));
  const computedDurationSeconds = Math.max(
    0,
    Math.round(
      (new Date(nowIso).getTime() - new Date(startedAtIso).getTime()) / 1000
    )
  );
  const durationSeconds = reachedEndOfTest
    ? (storedDurationSeconds > 0 ? storedDurationSeconds : computedDurationSeconds)
    : (storedDurationSeconds > 0 ? storedDurationSeconds : null);

  for (const entry of safeSubmissionResults) {
    const exerciseId = entry.exerciseId;
    if (!exerciseId) continue;

    const safeWrongAttempts = entry.wrongAttempts;
    const safeAttempts = Math.max(1, safeWrongAttempts + 1);
    const quality = entry.isCorrect
      ? (safeWrongAttempts <= 0 ? 5 : safeWrongAttempts === 1 ? 4 : 3)
      : 0;

    let existingProgress = null;
    let existingProgressScope = null;
    {
      let progressLookup = await supabase
        .from("user_progress")
        .select("times_seen, times_correct, streak_count")
        .eq("user_id", userId)
        .eq("exercise_id", exerciseId)
        .eq("lesson_id", lessonId)
        .maybeSingle();

      if (progressLookup.error) {
        progressLookup = await supabase
          .from("user_progress")
          .select("times_seen, times_correct, streak_count")
          .eq("user_id", userId)
          .eq("exercise_id", exerciseId)
          .maybeSingle();
        existingProgressScope = progressLookup.error ? null : (progressLookup.data ? "legacy" : null);
      } else if (!progressLookup.data) {
        progressLookup = await supabase
          .from("user_progress")
          .select("times_seen, times_correct, streak_count")
          .eq("user_id", userId)
          .eq("exercise_id", exerciseId)
          .is("lesson_id", null)
          .maybeSingle();

        if (progressLookup.error) {
          progressLookup = await supabase
            .from("user_progress")
            .select("times_seen, times_correct, streak_count")
            .eq("user_id", userId)
            .eq("exercise_id", exerciseId)
            .maybeSingle();
          existingProgressScope = progressLookup.error ? null : (progressLookup.data ? "legacy" : null);
        } else {
          existingProgressScope = progressLookup.data ? "legacy" : null;
        }
      } else {
        existingProgressScope = "lesson";
      }

      existingProgress = progressLookup.error ? null : progressLookup.data || null;
    }

    const progressPayload = {
      user_id: userId,
      exercise_id: exerciseId,
      lesson_id: lessonId,
      is_correct: entry.isCorrect,
      attempts: safeAttempts,
      last_practiced: nowIso,
      interval_days: 1,
      next_due_at: nowIso,
      last_quality: quality,
      times_seen: Math.max(1, toInt(existingProgress?.times_seen, 0) + 1),
      times_correct: Math.max(0, toInt(existingProgress?.times_correct, 0) + (entry.isCorrect ? 1 : 0)),
      streak_count: entry.isCorrect ? Math.max(0, toInt(existingProgress?.streak_count, 0) + 1) : 0,
      updated_at: nowIso,
      wrong_attempts: safeWrongAttempts,
      final_status: entry.finalStatus,
      score_awarded: entry.scoreAwarded,
      answered_at: nowIso,
      answer_snapshot: entry.answerSnapshot,
    };
    const legacyProgressPayload = { ...progressPayload };
    delete legacyProgressPayload.lesson_id;
    const progressFallbackPayload = {
      user_id: userId,
      exercise_id: exerciseId,
      lesson_id: lessonId,
      is_correct: entry.isCorrect,
      attempts: safeAttempts,
      last_practiced: nowIso,
      interval_days: 1,
      next_due_at: nowIso,
      last_quality: quality,
      times_seen: Math.max(1, toInt(existingProgress?.times_seen, 0) + 1),
      times_correct: Math.max(0, toInt(existingProgress?.times_correct, 0) + (entry.isCorrect ? 1 : 0)),
      streak_count: entry.isCorrect ? Math.max(0, toInt(existingProgress?.streak_count, 0) + 1) : 0,
      updated_at: nowIso,
    };
    const legacyProgressFallbackPayload = { ...progressFallbackPayload };
    delete legacyProgressFallbackPayload.lesson_id;

    let progressUpsertError = null;
    if (existingProgressScope === "lesson") {
      let { error } = await supabase
        .from("user_progress")
        .update(progressPayload)
        .eq("user_id", userId)
        .eq("exercise_id", exerciseId)
        .eq("lesson_id", lessonId);
      progressUpsertError = error;

      if (progressUpsertError && isMissingUserProgressQuizColumnsError(progressUpsertError)) {
        ({ error: progressUpsertError } = await supabase
          .from("user_progress")
          .update(progressFallbackPayload)
          .eq("user_id", userId)
          .eq("exercise_id", exerciseId)
          .eq("lesson_id", lessonId));
      }
    } else if (existingProgressScope === "legacy") {
      let { error } = await supabase
        .from("user_progress")
        .update(legacyProgressPayload)
        .eq("user_id", userId)
        .eq("exercise_id", exerciseId);
      progressUpsertError = error;

      if (progressUpsertError && isMissingUserProgressQuizColumnsError(progressUpsertError)) {
        ({ error: progressUpsertError } = await supabase
          .from("user_progress")
          .update(legacyProgressFallbackPayload)
          .eq("user_id", userId)
          .eq("exercise_id", exerciseId));
      }
    } else {
      let { error } = await supabase
        .from("user_progress")
        .insert(progressPayload);
      progressUpsertError = error;

      if (progressUpsertError && isMissingUserProgressQuizColumnsError(progressUpsertError)) {
        ({ error: progressUpsertError } = await supabase
          .from("user_progress")
          .insert(progressFallbackPayload));
      }

      if (progressUpsertError) {
        let { error: legacyInsertError } = await supabase
          .from("user_progress")
          .insert(legacyProgressPayload);

        if (legacyInsertError && isMissingUserProgressQuizColumnsError(legacyInsertError)) {
          ({ error: legacyInsertError } = await supabase
            .from("user_progress")
            .insert(legacyProgressFallbackPayload));
        }

        progressUpsertError = legacyInsertError;
      }
    }

    if (progressUpsertError) {
      throw new Error(progressUpsertError.message || "No se pudo guardar el progreso del ejercicio.");
    }
  }

  const payload = {
    user_id: userId,
    lesson_id: lessonId,
    attempt_status: nextStatus,
    current_index: nextIndex,
    completed_count: nextCompleted,
    total_exercises: totalExercises,
    correct_count: nextCorrect,
    score_percent: nextBestScore,
    restart_count: toInt(current.restart_count, 0),
    duration_seconds: durationSeconds,
    started_at: startedAtIso,
    completed_at: isCompleted ? nowIso : null,
    updated_at: nowIso,
  };
  if (!legacyScoreMode) {
    payload.attempt_score_percent = nextAttemptScore;
  }

  await upsertLessonQuizAttempt(payload);

  revalidateLessonQuizPaths(lessonId);
  if (isBackgroundMode) {
    return {
      ok: true,
      requestKey: requestKey || null,
      isCompleted,
      nextIndex,
    };
  }
  if (isCompleted) {
    redirect(`/app/clases/${lessonId}/prueba/resultados`);
  }
  redirect(`/app/clases/${lessonId}/prueba/jugar?i=${nextIndex}`);
}
