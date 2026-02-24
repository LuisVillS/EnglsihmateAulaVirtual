"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LESSON_QUIZ_MAX_RESTARTS,
  LESSON_QUIZ_STATUS,
  isMissingLessonQuizRestartColumnError,
  isMissingLessonQuizTableError,
  normalizeAttemptRow,
} from "@/lib/lesson-quiz";

function getText(formData, key) {
  const value = formData?.get(key);
  return value ? String(value).trim() : "";
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
    message.includes("answered_at")
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
  const { count, error } = await supabase
    .from("exercises")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId)
    .eq("status", "published");

  if (error) {
    throw new Error(error.message || "No se pudo contar ejercicios de la prueba.");
  }

  return Number(count || 0) || 0;
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
    score_percent: 0,
    restart_count: Math.max(0, Math.min(LESSON_QUIZ_MAX_RESTARTS, toInt(restartCount, 0))),
    duration_seconds: null,
    started_at: nowIso,
    completed_at: null,
    updated_at: nowIso,
  };

  const { error } = await supabase
    .from("lesson_quiz_attempts")
    .upsert(payload, { onConflict: "user_id,lesson_id" });

  if (error) {
    throw error;
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
        throw query.error;
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
    throw error;
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
        if (fallbackQuery.error) throw fallbackQuery.error;
        currentAttemptRow = {
          ...(fallbackQuery.data || {}),
          restart_count: 0,
        };
      } else {
        throw primaryQuery.error;
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
    throw error;
  }

  revalidateLessonQuizPaths(lessonId);
  redirect(`/app/clases/${lessonId}/prueba/jugar?i=0`);
}

export async function submitLessonQuizStep(formData) {
  const lessonId = getText(formData, "lessonId");
  if (!lessonId) return;

  const exerciseId = getText(formData, "exerciseId");
  const submittedIndex = Math.max(0, toInt(getText(formData, "currentIndex"), 0));
  const submittedTotal = Math.max(0, toInt(getText(formData, "totalExercises"), 0));
  const submittedWrongAttempts = clamp(toInt(getText(formData, "wrongAttempts"), 0), 0, 3);
  const submittedFinalStatus = getText(formData, "finalStatus").toLowerCase();
  const submittedScoreAwarded = round2(toNumber(getText(formData, "scoreAwarded"), 0));

  const finalStatus = submittedWrongAttempts >= 3 || submittedFinalStatus === "failed" ? "failed" : "passed";
  const isCorrect = finalStatus === "passed";
  const scoreAwarded = isCorrect ? clamp(submittedScoreAwarded, 0, 100) : 0;

  const { supabase, userId } = await requireStudentUser();

  let totalExercises = submittedTotal;
  if (!totalExercises) {
    totalExercises = await loadPublishedExerciseCount(supabase, lessonId);
  }
  if (!totalExercises) {
    revalidateLessonQuizPaths(lessonId);
    redirect(`/app/clases/${lessonId}/prueba`);
  }

  let existingAttempt = null;
  try {
    const { data, error } = await supabase
      .from("lesson_quiz_attempts")
      .select(
        "user_id, lesson_id, attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, restart_count, started_at, completed_at"
      )
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .maybeSingle();

    if (error) {
      if (isMissingLessonQuizRestartColumnError(error)) {
        const fallback = await supabase
          .from("lesson_quiz_attempts")
          .select(
            "user_id, lesson_id, attempt_status, current_index, completed_count, total_exercises, correct_count, score_percent, started_at, completed_at"
          )
          .eq("user_id", userId)
          .eq("lesson_id", lessonId)
          .maybeSingle();
        if (fallback.error) throw fallback.error;
        existingAttempt = {
          ...(fallback.data || {}),
          restart_count: 0,
        };
      } else {
        throw error;
      }
    } else {
      existingAttempt = data || null;
    }

    if (existingAttempt == null) {
      throw new Error("No se encontro el intento de prueba.");
    }
  } catch (error) {
    if (isMissingLessonQuizTableError(error)) {
      redirect(`/app/clases/${lessonId}/prueba?tracking=missing`);
    }
    throw error;
  }

  const current = normalizeAttemptRow(existingAttempt, totalExercises);
  const nowIso = new Date().toISOString();
  const startedAtIso = current.started_at || nowIso;
  const safeCurrentIndex = Math.max(0, Math.min(totalExercises - 1, Number.isFinite(submittedIndex) ? submittedIndex : current.current_index));
  const nextCompleted = Math.min(totalExercises, Math.max(current.completed_count, safeCurrentIndex) + 1);
  const nextCorrect = current.correct_count + (isCorrect ? 1 : 0);
  const isCompleted = nextCompleted >= totalExercises;
  const nextStatus = isCompleted ? LESSON_QUIZ_STATUS.COMPLETED : LESSON_QUIZ_STATUS.IN_PROGRESS;
  const nextIndex = isCompleted ? totalExercises - 1 : safeCurrentIndex + 1;
  const nextScore = clamp(round2(toNumber(current.score_percent, 0) + scoreAwarded), 0, 100);

  const durationSeconds = isCompleted
    ? Math.max(
        0,
        Math.round(
          (new Date(nowIso).getTime() - new Date(startedAtIso).getTime()) / 1000
        )
      )
    : null;

  if (exerciseId) {
    const safeWrongAttempts = submittedWrongAttempts;
    const safeAttempts = Math.max(1, safeWrongAttempts + 1);
    const quality = isCorrect
      ? (safeWrongAttempts <= 0 ? 5 : safeWrongAttempts === 1 ? 4 : 3)
      : 0;

    const { data: existingProgress } = await supabase
      .from("user_progress")
      .select("times_seen, times_correct, streak_count")
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId)
      .maybeSingle();

    const progressPayload = {
      user_id: userId,
      exercise_id: exerciseId,
      is_correct: isCorrect,
      attempts: safeAttempts,
      last_practiced: nowIso,
      interval_days: 1,
      next_due_at: nowIso,
      last_quality: quality,
      times_seen: Math.max(1, toInt(existingProgress?.times_seen, 0) + 1),
      times_correct: Math.max(0, toInt(existingProgress?.times_correct, 0) + (isCorrect ? 1 : 0)),
      streak_count: isCorrect ? Math.max(0, toInt(existingProgress?.streak_count, 0) + 1) : 0,
      updated_at: nowIso,
      wrong_attempts: safeWrongAttempts,
      final_status: finalStatus,
      score_awarded: scoreAwarded,
      answered_at: nowIso,
    };

    let progressUpsertError = null;
    const { error: upsertProgressError } = await supabase
      .from("user_progress")
      .upsert(progressPayload, { onConflict: "user_id,exercise_id" });
    progressUpsertError = upsertProgressError;

    if (progressUpsertError && isMissingUserProgressQuizColumnsError(progressUpsertError)) {
      const fallbackPayload = {
        user_id: userId,
        exercise_id: exerciseId,
        is_correct: isCorrect,
        attempts: safeAttempts,
        last_practiced: nowIso,
        interval_days: 1,
        next_due_at: nowIso,
        last_quality: quality,
        times_seen: Math.max(1, toInt(existingProgress?.times_seen, 0) + 1),
        times_correct: Math.max(0, toInt(existingProgress?.times_correct, 0) + (isCorrect ? 1 : 0)),
        streak_count: isCorrect ? Math.max(0, toInt(existingProgress?.streak_count, 0) + 1) : 0,
        updated_at: nowIso,
      };
      const { error: fallbackUpsertError } = await supabase
        .from("user_progress")
        .upsert(fallbackPayload, { onConflict: "user_id,exercise_id" });
      progressUpsertError = fallbackUpsertError;
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
    score_percent: nextScore,
    restart_count: toInt(current.restart_count, 0),
    duration_seconds: durationSeconds,
    started_at: startedAtIso,
    completed_at: isCompleted ? nowIso : null,
    updated_at: nowIso,
  };

  const { error: upsertError } = await supabase
    .from("lesson_quiz_attempts")
    .upsert(payload, { onConflict: "user_id,lesson_id" });

  if (upsertError) {
    if (isMissingLessonQuizTableError(upsertError)) {
      redirect(`/app/clases/${lessonId}/prueba?tracking=missing`);
    }
    throw new Error(upsertError.message || "No se pudo actualizar la prueba.");
  }

  revalidateLessonQuizPaths(lessonId);
  if (isCompleted) {
    redirect(`/app/clases/${lessonId}/prueba/resultados`);
  }
  redirect(`/app/clases/${lessonId}/prueba/jugar?i=${nextIndex}`);
}
