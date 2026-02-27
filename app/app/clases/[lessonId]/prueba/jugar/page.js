import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LESSON_QUIZ_STATUS,
  getLessonQuizProgressPercent,
  isMissingLessonQuizTableError,
  normalizeAttemptRow,
} from "@/lib/lesson-quiz";
import LessonQuizPlayer from "./lesson-quiz-player";

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export const metadata = {
  title: "Resolver test | Aula Virtual",
};

export default async function LessonQuizPlayPage({ params: paramsPromise }) {
  const params = await paramsPromise;
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
    .select("id, title, level, unit_id, ordering")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson?.id) notFound();

  const { data: exercises, error: exercisesError } = await supabase
    .from("exercises")
    .select("id, type, prompt, content_json, ordering")
    .eq("lesson_id", lesson.id)
    .eq("status", "published")
    .order("ordering", { ascending: true })
    .order("created_at", { ascending: true });

  if (exercisesError) {
    throw new Error(exercisesError.message || "No se pudo cargar la prueba.");
  }

  const published = exercises || [];
  const totalExercises = published.length;
  const testMeta = await loadLessonTestMeta(supabase, lesson, published);
  const testTitle = testMeta.testTitle;
  const testNumber = testMeta.testNumber;
  const exercisePointValues = published.map((exercise) => {
    const parsed = Number(exercise?.content_json?.point_value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });
  if (!totalExercises) {
    redirect(`/app/clases/${lesson.id}/prueba`);
  }

  const { data: attemptRow, error: attemptError } = await supabase
    .from("lesson_quiz_attempts")
    .select("attempt_status, current_index, completed_count, total_exercises, correct_count")
    .eq("user_id", profile.id)
    .eq("lesson_id", lesson.id)
    .maybeSingle();

  if (attemptError) {
    if (isMissingLessonQuizTableError(attemptError)) {
      redirect(`/app/clases/${lesson.id}/prueba?tracking=missing`);
    }
    throw new Error(attemptError.message || "No se pudo cargar el estado de la prueba.");
  }

  const attempt = normalizeAttemptRow(attemptRow, totalExercises);
  if (attempt.attempt_status === LESSON_QUIZ_STATUS.COMPLETED) {
    redirect(`/app/clases/${lesson.id}/prueba/resultados`);
  }
  if (attempt.attempt_status === LESSON_QUIZ_STATUS.READY && attempt.completed_count <= 0) {
    redirect(`/app/clases/${lesson.id}/prueba`);
  }

  const currentIndex = Math.max(0, Math.min(totalExercises - 1, toInt(attempt.current_index, 0)));
  const currentExercise = published[currentIndex];
  if (!currentExercise?.id) {
    redirect(`/app/clases/${lesson.id}/prueba`);
  }

  const progressPercent = getLessonQuizProgressPercent({
    status: LESSON_QUIZ_STATUS.IN_PROGRESS,
    completedCount: attempt.completed_count,
    totalExercises,
  });
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
              Volver al test
            </Link>
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">{`Test ${testNumber} - ${testTitle}`}</h1>
              <p className="text-sm text-muted">
                Ejercicio {currentIndex + 1} de {totalExercises}
              </p>
            </div>
          </div>
          {lesson.level ? (
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted">
              {lesson.level}
            </span>
          ) : null}
        </header>

        <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
            <span>Progreso: {attempt.completed_count} de {totalExercises}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <article className="rounded-[2rem] border border-border bg-surface p-5 shadow-2xl shadow-black/20 sm:p-7">
          <LessonQuizPlayer
            lessonId={lesson.id}
            currentIndex={currentIndex}
            totalExercises={totalExercises}
            exercise={currentExercise}
            exercisePointValues={exercisePointValues}
          />
        </article>
      </div>
    </section>
  );
}
