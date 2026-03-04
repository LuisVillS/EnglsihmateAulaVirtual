import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  LESSON_QUIZ_STATUS,
  getLessonQuizProgressPercent,
  isMissingLessonQuizRestartColumnError,
  isMissingLessonQuizTableError,
  normalizeAttemptRow,
} from "@/lib/lesson-quiz";
import { loadLessonQuizAssignments } from "@/lib/lesson-quiz-assignments";
import LessonQuizPagePlayer from "./lesson-quiz-page-player";

const SKILL_ORDER = ["grammar", "listening", "reading", "speaking", "vocabulary"];
const SKILL_LABELS = {
  grammar: "Grammar",
  listening: "Listening",
  reading: "Reading",
  speaking: "Speaking",
  vocabulary: "Vocabulary",
};
const TYPE_ORDER = [
  "cloze",
  "scramble",
  "pairs",
  "image_match",
  "audio_match",
  "reading_exercise",
];
const TYPE_LABELS = {
  scramble: "Scrambled Sentence",
  audio_match: "Listening Exercise",
  reading_exercise: "Reading Exercise",
  image_match: "Image-Word Association",
  pairs: "Pairs Game",
  cloze: "Fill in the blanks",
};

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

function normalizeSkillForQuiz(value, type) {
  const raw = String(value || "").trim().toLowerCase();
  if (SKILL_ORDER.includes(raw)) return raw;
  const normalizedType = String(type || "").trim().toLowerCase();
  if (normalizedType === "audio_match") return "listening";
  if (normalizedType === "reading_exercise") return "reading";
  if (normalizedType === "image_match" || normalizedType === "pairs") return "reading";
  return "grammar";
}

function sortExercisesForQuiz(exercises = []) {
  return [...(Array.isArray(exercises) ? exercises : [])]
    .map((exercise, index) => ({
      ...exercise,
      __sourceIndex: index,
      __skill: normalizeSkillForQuiz(exercise?.skill_tag || exercise?.skill, exercise?.type),
      __type: String(exercise?.type || "").trim().toLowerCase(),
    }))
    .sort((left, right) => {
      const leftSkillIndex = SKILL_ORDER.indexOf(left.__skill);
      const rightSkillIndex = SKILL_ORDER.indexOf(right.__skill);
      const skillCompare = (leftSkillIndex >= 0 ? leftSkillIndex : SKILL_ORDER.length) - (rightSkillIndex >= 0 ? rightSkillIndex : SKILL_ORDER.length);
      if (skillCompare !== 0) return skillCompare;

      const leftTypeIndex = TYPE_ORDER.indexOf(left.__type);
      const rightTypeIndex = TYPE_ORDER.indexOf(right.__type);
      const typeCompare = (leftTypeIndex >= 0 ? leftTypeIndex : TYPE_ORDER.length) - (rightTypeIndex >= 0 ? rightTypeIndex : TYPE_ORDER.length);
      if (typeCompare !== 0) return typeCompare;

      return Number(left.__sourceIndex || 0) - Number(right.__sourceIndex || 0);
    });
}

function buildQuizEntries(exercises = []) {
  const sorted = sortExercisesForQuiz(exercises);
  const entries = [];
  let currentSkill = "";
  let currentType = "";
  let skillCounter = 0;

  sorted.forEach((exercise, globalIndex) => {
    const skill = normalizeSkillForQuiz(exercise?.__skill || exercise?.skill_tag || exercise?.skill, exercise?.type);
    const type = String(exercise?.__type || exercise?.type || "").trim().toLowerCase();
    const changedSkill = skill !== currentSkill;
    const changedType = changedSkill || type !== currentType;

    if (changedSkill) {
      skillCounter = 0;
      currentSkill = skill;
      currentType = "";
    }

    skillCounter += 1;
    if (changedType) {
      currentType = type;
    }

    entries.push({
      exercise,
      globalIndex,
      skill,
      type,
      skillLabel: SKILL_LABELS[skill] || "Skill",
      typeLabel: TYPE_LABELS[type] || "Exercise",
      skillNumber: skillCounter,
      showSkillHeader: changedSkill,
      showTypeHeader: changedType,
    });
  });

  return entries;
}

function buildQuizPages(entries = []) {
  const pages = [];
  let cursor = 0;
  while (cursor < entries.length) {
    const current = entries[cursor];
    const groupSkill = current.skill;
    const groupType = current.type;
    let groupEnd = cursor;
    while (
      groupEnd < entries.length &&
      entries[groupEnd].skill === groupSkill &&
      entries[groupEnd].type === groupType
    ) {
      groupEnd += 1;
    }

    const groupEntries = entries.slice(cursor, groupEnd);
    const pageSize = groupType === "cloze" || groupType === "scramble" ? 10 : 1;
    for (let index = 0; index < groupEntries.length; index += pageSize) {
      pages.push(groupEntries.slice(index, index + pageSize));
    }

    cursor = groupEnd;
  }
  return pages;
}

function stripTestNumericPrefix(rawTitle = "") {
  const title = String(rawTitle || "").trim();
  if (!title) return "";
  return title
    .replace(/^(test|prueba)\s*\d+\s*[-:]\s*/i, "")
    .replace(/^(test|prueba)\s*\d+\s*/i, "")
    .trim();
}

export const metadata = {
  title: "Resolver test | Aula Virtual",
};

export default async function LessonQuizPlayPage({ params: paramsPromise, searchParams: searchParamsPromise }) {
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
  const quizEntries = buildQuizEntries(published);
  const totalExercises = quizEntries.length;
  const testTitle = stripTestNumericPrefix(quiz?.title || lesson?.title) || "Prueba de clase";
  const orderedExercises = quizEntries.map((entry) => entry.exercise);
  const exercisePointValues = orderedExercises.map((exercise) => {
    const parsed = Number(exercise?.content_json?.point_value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  });
  if (!totalExercises) {
    redirect(`/app/clases/${lesson.id}/prueba`);
  }

  let attemptRow = null;
  let attemptError = null;
  ({
    data: attemptRow,
    error: attemptError,
  } = await supabase
    .from("lesson_quiz_attempts")
    .select("attempt_status, current_index, completed_count, total_exercises, correct_count, restart_count")
    .eq("user_id", profile.id)
    .eq("lesson_id", lesson.id)
    .maybeSingle());

  if (attemptError && isMissingLessonQuizRestartColumnError(attemptError)) {
    const fallback = await supabase
      .from("lesson_quiz_attempts")
      .select("attempt_status, current_index, completed_count, total_exercises, correct_count")
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
    throw new Error(attemptError.message || "No se pudo cargar el estado de la prueba.");
  }

  const attempt = normalizeAttemptRow(attemptRow, totalExercises);
  if (attempt.attempt_status === LESSON_QUIZ_STATUS.COMPLETED) {
    redirect(`/app/clases/${lesson.id}/prueba/resultados`);
  }
  if (attempt.attempt_status === LESSON_QUIZ_STATUS.READY && attempt.completed_count <= 0) {
    redirect(`/app/clases/${lesson.id}/prueba`);
  }

  const queryIndex = toInt(searchParams?.i, Number.NaN);
  const requestedIndex = Number.isFinite(queryIndex) ? queryIndex : toInt(attempt.current_index, 0);
  const currentIndex = Math.max(0, Math.min(totalExercises - 1, requestedIndex));
  const quizPages = buildQuizPages(quizEntries);
  const currentPageIndex = Math.max(
    0,
    quizPages.findIndex((page) => page.some((entry) => entry.globalIndex === currentIndex))
  );
  const pageEntriesRaw = quizPages[currentPageIndex] || [];
  const currentPageEntries = pageEntriesRaw
    .filter((entry) => entry.globalIndex >= currentIndex)
    .map((entry, index) => (
      index === 0
        ? { ...entry, showTypeHeader: true }
        : entry
    ));
  if (!currentPageEntries.length) {
    redirect(`/app/clases/${lesson.id}/prueba`);
  }
  const pageStartIndex = Number(currentPageEntries[0]?.globalIndex || 0);
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
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Link
          href={`/app/clases/${lesson.id}/prueba`}
          className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
        >
          <ArrowLeftIcon />
          Volver al test
        </Link>

        <article className="rounded-[2rem] border border-border bg-surface p-5 shadow-2xl shadow-black/20 sm:p-10">
          <header className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{testTitle}</h1>
                <p className="text-base text-muted sm:text-lg">
                  Pagina {currentPageIndex + 1} de {Math.max(1, quizPages.length)}
                </p>
              </div>
              {lesson.level ? (
                <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-sm font-semibold text-muted sm:text-base">
                  {lesson.level}
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-muted sm:text-base">
                <span>Progreso: {attempt.completed_count} de {totalExercises}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-3.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-success transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </header>

          <div className="mt-5">
          <LessonQuizPagePlayer
            lessonId={lesson.id}
            totalExercises={totalExercises}
            pageStartIndex={pageStartIndex}
            pageEntries={currentPageEntries}
            exercisePointValues={exercisePointValues}
          />
          </div>
        </article>
      </div>
    </section>
  );
}
