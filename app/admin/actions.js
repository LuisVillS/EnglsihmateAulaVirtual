"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { saveStudentProfile } from "@/lib/students";
import { STUDENT_LEVELS } from "@/lib/student-constants";
import { normalizePreferredHourInput } from "@/lib/student-time";
import { sendEnrollmentEmail } from "@/lib/brevo";
import {
  sendRecordingPublishedEmailsForSession,
  sendZoomReminderEmailsForSession,
} from "@/lib/course-email-automations";
import {
  buildSessionDraftsFromCommission,
  buildFrequencySessionDrafts,
  buildLimaDateTimeIso,
  formatScheduleWithFrequency,
  getFrequencyDurationMonths,
  getFrequencyReference,
  getSessionsPerMonth,
  normalizeFrequencyKey,
} from "@/lib/course-sessions";
import { getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { deriveExercisePrompt, prepareExercisePayload } from "@/lib/duolingo/exercises";
import { EXERCISE_SKILL_TAG_VALUES, EXERCISE_TYPE_VALUES, LEGACY_KIND_BY_TYPE } from "@/lib/duolingo/constants";
import { isPublishableExercise } from "@/lib/duolingo/validation";
import {
  buildFlashcardLibraryMap,
  mapLibraryFlashcardRow,
  parseFlashcardsBatch,
  resolveAssignedFlashcardRow,
} from "@/lib/flashcards";
import {
  mapExerciseCategoryRow,
  mapExerciseLibraryRow,
  normalizeExerciseCategoryName,
  getExerciseDisplayTitle,
  normalizeExerciseLibraryLevel,
  normalizeExerciseLibrarySkill,
  normalizeExerciseLibraryTitle,
} from "@/lib/exercise-library";
import {
  archiveExercisesIfOrphaned,
  runExerciseGarbageCollection,
} from "@/lib/duolingo/exercise-lifecycle";
import { normalizeStudentCefrLevel, normalizeStudentThemeTag } from "@/lib/student-levels";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient({ allowCookieSetter: true });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("No autorizado");
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    throw new Error("Se requiere rol admin");
  }

  return supabase;
}

function toInt(value) {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toPositiveInt(value, fallback = 1) {
  const parsed = toInt(value);
  if (!parsed || parsed < 1) return fallback;
  return parsed;
}

function normalizeExerciseItemPoints(value, fallback = 10) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round((parsed + Number.EPSILON) * 100) / 100));
}

function getText(formData, key) {
  const raw = formData.get(key);
  if (!raw) return "";
  return raw.toString().trim();
}

function resolveFormDataArg(firstArg, secondArg) {
  if (secondArg instanceof FormData) return secondArg;
  if (firstArg instanceof FormData) return firstArg;
  return null;
}

function getTextArray(formData, key) {
  return formData.getAll(key).map((value) => value?.toString().trim() || "");
}

function revalidateCommissionAdminPaths() {
  revalidatePath("/admin/courses");
  revalidatePath("/admin/commissions");
}

function revalidateTemplateAdminPaths(templateId) {
  revalidatePath("/admin/courses/templates");
  if (templateId) {
    revalidatePath(`/admin/courses/templates/${templateId}`);
  }
  revalidateCommissionAdminPaths();
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return { headers: [], rows: [] };
  }
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => line.split(",").map((cell) => cell.trim()));
  return { headers, rows };
}

function normalizeModalityKey(value) {
  if (!value) return null;
  const raw = value.toString().trim().toLowerCase();
  if (!raw) return null;
  if (
    [
      "daily",
      "diaria",
      "diaria (lunes a viernes)",
      "lunes a viernes",
      "lun-vie",
      "l-v",
    ].includes(raw)
  )
    return "DAILY";
  if (
    [
      "mwf",
      "lmv",
      "interdiaria (lunes, miercoles y viernes)",
      "interdiaria (lunes miercoles viernes)",
      "l/m/v",
      "l-m-v",
      "lunes miercoles viernes",
      "lunes, miercoles y viernes",
    ].includes(raw)
  )
    return "MWF";
  if (
    [
      "tt",
      "interdiaria (martes y jueves)",
      "interdiaria (martes, jueves)",
      "m/j",
      "m-j",
      "martes jueves",
      "martes y jueves",
    ].includes(raw)
  )
    return "TT";
  if (
    ["sat", "sabado", "sabatinos", "sabatinos (sabados)", "sabados", "sábados"].includes(raw)
  )
    return "SAT";
  const upper = value.toString().trim().toUpperCase();
  if (upper === "LMV") return "MWF";
  if (["DAILY", "MWF", "TT", "SAT"].includes(upper)) {
    return upper;
  }
  return null;
}

function normalizeTemplateFrequency(value) {
  return normalizeFrequencyKey(value);
}

function getModalityDefinition(modalityKey) {
  const reference = getFrequencyReference(modalityKey);
  if (!reference) return null;
  return {
    label: reference.label,
    days: reference.classDays,
  };
}

function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function parseMonthInput(value) {
  if (!value) return null;
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function formatDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.valueOf())) return "";
  return date.toISOString().slice(0, 10);
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function formatMinutesToTime(value) {
  const totalMinutes = Number(value);
  if (!Number.isFinite(totalMinutes)) return "";
  const minutesInDay = 24 * 60;
  const normalized = ((Math.round(totalMinutes) % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (normalized % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getClassDurationMinutesFromFrequency(frequency) {
  const reference = getFrequencyReference(frequency);
  const hours = Number(reference?.hoursPerClass || 0);
  if (!Number.isFinite(hours) || hours <= 0) return 60;
  return Math.max(1, Math.round(hours * 60));
}

function parseTimeWithSeconds(value) {
  if (!value) return null;
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function buildGenericSessionRows({
  commissionId,
  startDate,
  endDate,
  daysOfWeek,
  startTime,
  endTime,
}) {
  const drafts = buildSessionDraftsFromCommission({
    startDate,
    endDate,
    daysOfWeek,
  });
  return drafts.map((draft, index) => {
    const cycleMonth = draft.session_date ? `${draft.session_date.slice(0, 7)}-01` : null;
    return {
      commission_id: commissionId,
      cycle_month: cycleMonth,
      session_index: index + 1,
      session_in_cycle: index + 1,
      session_date: draft.session_date,
      starts_at: buildLimaDateTimeIso(draft.session_date, startTime),
      ends_at: buildLimaDateTimeIso(draft.session_date, endTime),
      day_label: draft.day_label,
      kind: "class",
      status: "scheduled",
    };
  });
}

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function normalizeTemplateItemType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "slides" || raw === "link" || raw === "file" || raw === "exercise" || raw === "video" || raw === "flashcards") return raw;
  return "link";
}

const INTERNAL_FLASHCARDS_URL = "flashcards://internal";

function normalizeExerciseType(value) {
  const raw = String(value || "").trim().toLowerCase();
  return EXERCISE_TYPE_VALUES.includes(raw) ? raw : "cloze";
}

function defaultSkillTagByType(type) {
  const normalizedType = normalizeExerciseType(type);
  if (normalizedType === "audio_match") return "listening";
  if (normalizedType === "reading_exercise") return "reading";
  if (normalizedType === "image_match" || normalizedType === "pairs") return "reading";
  return "grammar";
}

function normalizeExerciseSkillTag(value, type) {
  let raw = String(value || "").trim().toLowerCase();
  if (raw === "speaking") raw = defaultSkillTagByType(type);
  if (raw === "writing") raw = "grammar";
  if (EXERCISE_SKILL_TAG_VALUES.includes(raw)) return raw;
  return defaultSkillTagByType(type);
}

function normalizeExerciseStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "published" || raw === "archived" || raw === "deleted") return raw;
  return "published";
}

function parseAdditionalSlidesJson(rawValue) {
  if (!rawValue) return [];

  const raw = String(rawValue || "").trim();
  if (!raw) return [];

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (parsed == null) {
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines
      .map((line) => {
        const [maybeTitle, maybeUrl] = line.split("|");
        if (maybeUrl) {
          const title = String(maybeTitle || "").trim();
          const url = String(maybeUrl || "").trim();
          if (!url) return null;
          return { title, url };
        }
        return { title: "", url: line };
      })
      .filter(Boolean);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Slides adicionales inválidos. Debe ser una lista o líneas URL.");
  }

  const normalized = parsed
    .map((item) => {
      if (typeof item === "string") {
        const url = item.trim();
        if (!url) return null;
        return { title: "", url };
      }
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || "").trim();
      const url = String(item.url || "").trim();
      if (!url) return null;
      return { title, url };
    })
    .filter(Boolean);

  return normalized;
}

async function getAdminActorId(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id || null;
}

async function collectTemplateExerciseIdsBySessionIds(supabase, sessionIds = []) {
  const safeSessionIds = Array.from(new Set((sessionIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (!safeSessionIds.length) return [];

  let query = supabase
    .from("template_session_items")
    .select("exercise_id")
    .in("template_session_id", safeSessionIds)
    .eq("type", "exercise");

  let result = await query;
  if (result.error && getMissingTableName(result.error)?.endsWith("template_session_items")) {
    return [];
  }
  if (result.error && getMissingColumnFromError(result.error) === "exercise_id") {
    return [];
  }
  if (result.error) {
    throw new Error(result.error.message || "No se pudieron cargar ejercicios vinculados de plantilla.");
  }

  return Array.from(
    new Set(
      (result.data || [])
        .map((row) => String(row?.exercise_id || "").trim())
        .filter(Boolean)
    )
  );
}

function buildPracticeExerciseUrl(exerciseId, lessonId = null) {
  const id = String(exerciseId || "").trim();
  const lesson = String(lessonId || "").trim();
  if (lesson) {
    return `/app/clases/${lesson}/prueba`;
  }
  if (!id) return "/app/curso";
  return "/app/curso";
}

async function ensureExerciseLibraryLessonId(supabase) {
  const librarySlug = "exercise-library";
  const libraryMarker = "exercise:library";

  const { data: existingCourse, error: existingCourseError } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", librarySlug)
    .maybeSingle();

  if (existingCourseError) {
    throw new Error(existingCourseError.message || "No se pudo validar el curso base de la biblioteca.");
  }

  let courseId = existingCourse?.id || null;
  if (!courseId) {
    const { data: insertedCourse, error: insertCourseError } = await supabase
      .from("courses")
      .insert({
        slug: librarySlug,
        title: "Exercise Library",
        description: "Contenedor interno para la biblioteca reusable de ejercicios.",
      })
      .select("id")
      .maybeSingle();

    if (insertCourseError || !insertedCourse?.id) {
      if (insertCourseError?.code === "23505") {
        const { data: raceCourse } = await supabase
          .from("courses")
          .select("id")
          .eq("slug", librarySlug)
          .maybeSingle();
        if (!raceCourse?.id) {
          throw new Error(insertCourseError?.message || "No se pudo crear el curso base de la biblioteca.");
        }
        courseId = raceCourse.id;
      } else {
        throw new Error(insertCourseError?.message || "No se pudo crear el curso base de la biblioteca.");
      }
    } else {
      courseId = insertedCourse.id;
    }
  }

  const { data: existingUnit, error: existingUnitError } = await supabase
    .from("units")
    .select("id")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingUnitError) {
    throw new Error(existingUnitError.message || "No se pudo validar la unidad base de la biblioteca.");
  }

  let unitId = existingUnit?.id || null;
  if (!unitId) {
    const { data: insertedUnit, error: insertUnitError } = await supabase
      .from("units")
      .insert({
        course_id: courseId,
        title: "Exercise Library",
        position: 1,
      })
      .select("id")
      .maybeSingle();

    if (insertUnitError || !insertedUnit?.id) {
      throw new Error(insertUnitError?.message || "No se pudo crear la unidad base de la biblioteca.");
    }
    unitId = insertedUnit.id;
  }

  const { data: existingLesson, error: existingLessonError } = await supabase
    .from("lessons")
    .select("id, status")
    .eq("description", libraryMarker)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingLessonError) {
    throw new Error(existingLessonError.message || "No se pudo validar la lección base de la biblioteca.");
  }

  if (existingLesson?.id) {
    if (String(existingLesson.status || "").trim().toLowerCase() !== "published") {
      const { error: publishLessonError } = await supabase
        .from("lessons")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", existingLesson.id);
      if (publishLessonError) {
        throw new Error(publishLessonError.message || "No se pudo publicar la lección base de la biblioteca.");
      }
    }
    return existingLesson.id;
  }

  const nowIso = new Date().toISOString();
  const { data: insertedLesson, error: insertLessonError } = await supabase
    .from("lessons")
    .insert({
      unit_id: unitId,
      title: "Exercise Library",
      description: libraryMarker,
      ordering: 1,
      position: 1,
      status: "published",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  if (insertLessonError || !insertedLesson?.id) {
    throw new Error(insertLessonError?.message || "No se pudo crear la lección base de la biblioteca.");
  }

  return insertedLesson.id;
}

async function resolveExerciseCategory(supabase, {
  categoryId,
  categoryName,
  skillTag,
  cefrLevel,
}) {
  const safeSkill = normalizeExerciseLibrarySkill(skillTag, "grammar");
  const safeLevel = normalizeExerciseLibraryLevel(cefrLevel, "A1");
  const safeCategoryId = String(categoryId || "").trim();
  const safeCategoryName = normalizeExerciseCategoryName(categoryName);

  if (safeCategoryId) {
    const { data: existingCategory, error: categoryError } = await supabase
      .from("exercise_categories")
      .select("id, name, skill, cefr_level")
      .eq("id", safeCategoryId)
      .maybeSingle();

    if (categoryError) {
      throw new Error(categoryError.message || "No se pudo validar la categoría.");
    }

    if (
      existingCategory?.id &&
      String(existingCategory.skill || "").trim() === safeSkill &&
      String(existingCategory.cefr_level || "").trim() === safeLevel
    ) {
      return mapExerciseCategoryRow(existingCategory);
    }
  }

  if (!safeCategoryName) {
    return null;
  }

  const { data: matchingCategory, error: matchingCategoryError } = await supabase
    .from("exercise_categories")
    .select("id, name, skill, cefr_level")
    .eq("name", safeCategoryName)
    .eq("skill", safeSkill)
    .eq("cefr_level", safeLevel)
    .maybeSingle();

  if (matchingCategoryError) {
    throw new Error(matchingCategoryError.message || "No se pudo validar la categoría seleccionada.");
  }

  if (matchingCategory?.id) {
    return mapExerciseCategoryRow(matchingCategory);
  }

  const nowIso = new Date().toISOString();
  const { data: insertedCategory, error: insertCategoryError } = await supabase
    .from("exercise_categories")
    .insert({
      name: safeCategoryName,
      skill: safeSkill,
      cefr_level: safeLevel,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id, name, skill, cefr_level")
    .maybeSingle();

  if (insertCategoryError || !insertedCategory?.id) {
    throw new Error(insertCategoryError?.message || "No se pudo crear la categoría.");
  }

  return mapExerciseCategoryRow(insertedCategory);
}

async function loadExerciseLibraryEntryById(supabase, exerciseId) {
  const safeExerciseId = String(exerciseId || "").trim();
  if (!safeExerciseId) return null;

  const { data: exerciseRow, error: exerciseError } = await supabase
    .from("exercises")
    .select(`
      id,
      title,
      prompt,
      type,
      status,
      skill_tag,
      cefr_level,
      category_id,
      content_json,
      created_at,
      updated_at,
      category:exercise_categories (
        id,
        name,
        skill,
        cefr_level
      )
    `)
    .eq("id", safeExerciseId)
    .maybeSingle();

  if (exerciseError) {
    throw new Error(exerciseError.message || "No se pudo cargar el ejercicio.");
  }

  if (!exerciseRow?.id) return null;
  return mapExerciseLibraryRow(exerciseRow);
}

function normalizeQuizTitleValue(value) {
  const raw = String(value || "").trim();
  return raw || "Prueba de clase";
}

function parseExerciseBatchRows(rawBatch) {
  let rows = [];
  try {
    const parsed = JSON.parse(String(rawBatch || "[]"));
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error("Formato invalido de ejercicios (batchJson).");
  }

  return rows
    .map((row) => (row && typeof row === "object" && !Array.isArray(row) ? row : {}))
    .filter(Boolean);
}

function sortSavedExerciseAssignmentRows(rows = []) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftOrder = Number(left?.exercise_order || 0);
    const rightOrder = Number(right?.exercise_order || 0);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left?.created_at || "").localeCompare(String(right?.created_at || ""));
  });
}

async function archiveReleasedExercises({ supabase, actorId, exerciseIds = [] }) {
  const releasedIds = Array.from(
    new Set((exerciseIds || []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  if (!releasedIds.length) {
    return;
  }

  await archiveExercisesIfOrphaned({
    db: supabase,
    exerciseIds: releasedIds,
    actorId,
    ignoreLessonReference: true,
  });
  await runExerciseGarbageCollection({ db: supabase, actorId });
}

function getDefaultExerciseContent(type) {
  const normalizedType = normalizeExerciseType(type);
  switch (normalizedType) {
    case "scramble":
      return {
        prompt_native: "Yo soy estudiante",
        target_words: ["I", "am", "a", "student"],
        answer_order: [0, 1, 2, 3],
        point_value: 10,
      };
    case "audio_match":
      return {
        listening_title: "",
        prompt_native: "Listen to the audio and answer the questions.",
        provider: "youtube",
        source_type: "youtube",
        youtube_url: "",
        max_plays: 2,
        questions: [
          {
            id: "q_1",
            type: "multiple_choice",
            prompt: "Question 1",
            options: ["", "", "", ""],
            correct_index: 0,
          },
        ],
        point_value: 10,
      };
    case "reading_exercise":
      return {
        title: "Reading Title",
        reading_title: "Reading Title",
        text: "Write the reading passage here.",
        image_url: "",
        questions: [
          {
            id: "q_1",
            type: "multiple_choice",
            prompt: "Question 1",
            options: ["", "", "", ""],
            correct_index: 0,
          },
        ],
        point_value: 10,
      };
    case "image_match":
      return {
        question_native: "Que palabra corresponde a la imagen?",
        image_url: "",
        options: [
          { label: "Bread", vocab_id: "" },
          { label: "Water", vocab_id: "" },
          { label: "Milk", vocab_id: "" },
          { label: "House", vocab_id: "" },
        ],
        correct_index: 0,
        correct_vocab_id: "",
        point_value: 10,
      };
    case "pairs":
      return {
        pairs_title: "",
        pairs: [
          { id: "pair_1", native: "Manzana", target: "Apple" },
          { id: "pair_2", native: "Pan", target: "Bread" },
        ],
        point_value: 10,
      };
    case "cloze":
    default:
      return {
        sentence: "",
        options_pool: [
          { id: "opt_1", text: "" },
        ],
        blanks: [],
        point_value: 10,
      };
  }
}

async function ensureTemplateExerciseUnitId(supabase, templateId) {
  const safeTemplateId = String(templateId || "").trim();
  if (!safeTemplateId) {
    throw new Error("Plantilla inválida para crear ejercicios.");
  }

  const slug = `duolingo-template-${safeTemplateId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;

  const { data: existingCourse, error: existingCourseError } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingCourseError) {
    throw new Error(existingCourseError.message || "No se pudo validar curso base de plantilla.");
  }

  let courseId = existingCourse?.id || null;

  if (!courseId) {
    const { data: template, error: templateError } = await supabase
      .from("course_templates")
      .select("id, course_level, frequency, template_name")
      .eq("id", safeTemplateId)
      .maybeSingle();

    if (templateError || !template?.id) {
      throw new Error(templateError?.message || "No se pudo cargar la plantilla para crear ejercicios.");
    }

    const { data: insertedCourse, error: insertCourseError } = await supabase
      .from("courses")
      .insert({
        slug,
        title: template.template_name || `Plantilla ${template.course_level} ${template.frequency}`,
        level: template.course_level,
        description: `Contenedor automático de ejercicios para plantilla ${template.id}.`,
      })
      .select("id")
      .maybeSingle();

    if (insertCourseError || !insertedCourse?.id) {
      if (insertCourseError?.code === "23505") {
        const { data: raceCourse } = await supabase
          .from("courses")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (raceCourse?.id) {
          courseId = raceCourse.id;
        } else {
          throw new Error(insertCourseError.message || "No se pudo crear curso base para plantilla.");
        }
      } else {
        throw new Error(insertCourseError?.message || "No se pudo crear curso base para plantilla.");
      }
    } else {
      courseId = insertedCourse.id;
    }
  }

  if (!courseId) {
    throw new Error("No se pudo resolver curso base para ejercicios de plantilla.");
  }

  const { data: existingUnit, error: existingUnitError } = await supabase
    .from("units")
    .select("id")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingUnitError) {
    throw new Error(existingUnitError.message || "No se pudo validar unidad base de plantilla.");
  }

  if (existingUnit?.id) {
    return existingUnit.id;
  }

  const { data: insertedUnit, error: insertUnitError } = await supabase
    .from("units")
    .insert({
      course_id: courseId,
      title: "Template Exercises",
      position: 1,
    })
    .select("id")
    .maybeSingle();

  if (insertUnitError || !insertedUnit?.id) {
    throw new Error(insertUnitError?.message || "No se pudo crear unidad base para plantilla.");
  }

  return insertedUnit.id;
}

async function ensureTemplateSessionLessonId(supabase, { templateId, templateSessionId, title }) {
  const safeTemplateId = String(templateId || "").trim();
  const safeSessionId = String(templateSessionId || "").trim();
  if (!safeTemplateId || !safeSessionId) {
    throw new Error("Faltan datos para crear la lección de la clase.");
  }

  const marker = `template:${safeTemplateId}:session:${safeSessionId}`;
  const { data: existingLesson, error: existingLessonError } = await supabase
    .from("lessons")
    .select("id, status")
    .eq("description", marker)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingLessonError) {
    throw new Error(existingLessonError.message || "No se pudo validar lección de la clase.");
  }

  if (existingLesson?.id) {
    if (String(existingLesson.status || "").trim().toLowerCase() !== "published") {
      const { error: publishExistingLessonError } = await supabase
        .from("lessons")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", existingLesson.id);
      if (publishExistingLessonError) {
        throw new Error(publishExistingLessonError.message || "No se pudo publicar la leccion de la clase.");
      }
    }
    return existingLesson.id;
  }

  const unitId = await ensureTemplateExerciseUnitId(supabase, safeTemplateId);
  const { data: latestLesson } = await supabase
    .from("lessons")
    .select("ordering, position")
    .eq("unit_id", unitId)
    .order("ordering", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrdering = Math.max(
    1,
    Number(latestLesson?.ordering || latestLesson?.position || 0) + 1
  );

  const lessonTitle = title && title.trim()
    ? `Plantilla - ${title.trim()}`
    : `Plantilla - Clase ${safeSessionId.slice(0, 8)}`;

  const nowIso = new Date().toISOString();
  const { data: insertedLesson, error: insertLessonError } = await supabase
    .from("lessons")
    .insert({
      unit_id: unitId,
      title: lessonTitle,
      description: marker,
      ordering: nextOrdering,
      position: nextOrdering,
      status: "published",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  if (insertLessonError || !insertedLesson?.id) {
    throw new Error(insertLessonError?.message || "No se pudo crear la lección de la clase.");
  }

  return insertedLesson.id;
}

async function resolveTemplateIdFromTemplateSession(supabase, templateSessionId, fallbackTemplateId = null) {
  const fallbackId = String(fallbackTemplateId || "").trim();
  if (fallbackId) return fallbackId;

  const safeTemplateSessionId = String(templateSessionId || "").trim();
  if (!safeTemplateSessionId) return "";

  const { data, error } = await supabase
    .from("template_sessions")
    .select("template_id")
    .eq("id", safeTemplateSessionId)
    .maybeSingle();

  if (error) return "";
  return String(data?.template_id || "").trim();
}

async function ensureCommissionExerciseUnitId(supabase, commissionId) {
  const safeCommissionId = String(commissionId || "").trim();
  if (!safeCommissionId) {
    throw new Error("Comision invalida para crear ejercicios.");
  }

  const slug = `duolingo-commission-${safeCommissionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24)}`;

  const { data: existingCourse, error: existingCourseError } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existingCourseError) {
    throw new Error(existingCourseError.message || "No se pudo validar curso base de la comision.");
  }

  let courseId = existingCourse?.id || null;

  if (!courseId) {
    const { data: commission, error: commissionError } = await supabase
      .from("course_commissions")
      .select("id, course_level, commission_number")
      .eq("id", safeCommissionId)
      .maybeSingle();

    if (commissionError || !commission?.id) {
      throw new Error(commissionError?.message || "No se pudo cargar la comision para crear ejercicios.");
    }

    const { data: insertedCourse, error: insertCourseError } = await supabase
      .from("courses")
      .insert({
        slug,
        title: `Comision ${commission.course_level || ""} #${commission.commission_number || ""}`.trim(),
        level: commission.course_level || null,
        description: `Contenedor automatico de ejercicios para comision ${commission.id}.`,
      })
      .select("id")
      .maybeSingle();

    if (insertCourseError || !insertedCourse?.id) {
      if (insertCourseError?.code === "23505") {
        const { data: raceCourse } = await supabase
          .from("courses")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (raceCourse?.id) {
          courseId = raceCourse.id;
        } else {
          throw new Error(insertCourseError?.message || "No se pudo crear curso base para comision.");
        }
      } else {
        throw new Error(insertCourseError?.message || "No se pudo crear curso base para comision.");
      }
    } else {
      courseId = insertedCourse.id;
    }
  }

  if (!courseId) {
    throw new Error("No se pudo resolver curso base para ejercicios de comision.");
  }

  const { data: existingUnit, error: existingUnitError } = await supabase
    .from("units")
    .select("id")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingUnitError) {
    throw new Error(existingUnitError.message || "No se pudo validar unidad base de la comision.");
  }

  if (existingUnit?.id) {
    return existingUnit.id;
  }

  const { data: insertedUnit, error: insertUnitError } = await supabase
    .from("units")
    .insert({
      course_id: courseId,
      title: "Commission Exercises",
      position: 1,
    })
    .select("id")
    .maybeSingle();

  if (insertUnitError || !insertedUnit?.id) {
    throw new Error(insertUnitError?.message || "No se pudo crear unidad base para comision.");
  }

  return insertedUnit.id;
}

async function ensureCourseSessionLessonId(supabase, { commissionId, courseSessionId, title }) {
  const safeCommissionId = String(commissionId || "").trim();
  const safeSessionId = String(courseSessionId || "").trim();
  if (!safeCommissionId || !safeSessionId) {
    throw new Error("Faltan datos para crear la leccion de la clase.");
  }

  const marker = `commission:${safeCommissionId}:session:${safeSessionId}`;
  const { data: existingLesson, error: existingLessonError } = await supabase
    .from("lessons")
    .select("id, status")
    .eq("description", marker)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingLessonError) {
    throw new Error(existingLessonError.message || "No se pudo validar leccion de la clase.");
  }

  if (existingLesson?.id) {
    if (String(existingLesson.status || "").trim().toLowerCase() !== "published") {
      const { error: publishExistingLessonError } = await supabase
        .from("lessons")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", existingLesson.id);
      if (publishExistingLessonError) {
        throw new Error(publishExistingLessonError.message || "No se pudo publicar la leccion de la clase.");
      }
    }
    return existingLesson.id;
  }

  const unitId = await ensureCommissionExerciseUnitId(supabase, safeCommissionId);
  const { data: latestLesson } = await supabase
    .from("lessons")
    .select("ordering, position")
    .eq("unit_id", unitId)
    .order("ordering", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrdering = Math.max(
    1,
    Number(latestLesson?.ordering || latestLesson?.position || 0) + 1
  );

  const lessonTitle = title && title.trim()
    ? `Comision - ${title.trim()}`
    : `Comision - Clase ${safeSessionId.slice(0, 8)}`;

  const nowIso = new Date().toISOString();
  const { data: insertedLesson, error: insertLessonError } = await supabase
    .from("lessons")
    .insert({
      unit_id: unitId,
      title: lessonTitle,
      description: marker,
      ordering: nextOrdering,
      position: nextOrdering,
      status: "published",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  if (insertLessonError || !insertedLesson?.id) {
    throw new Error(insertLessonError?.message || "No se pudo crear la leccion de la clase.");
  }

  return insertedLesson.id;
}

function getTemplateStructure(frequency) {
  const reference = getFrequencyReference(frequency);
  if (!reference) return null;
  const sessionsPerMonth = reference.sessionsPerMonth || getSessionsPerMonth(frequency);
  const durationMonths = reference.months || getFrequencyDurationMonths(frequency);
  const totalSessions = sessionsPerMonth * durationMonths;
  return {
    sessionsPerMonth,
    durationMonths,
    totalSessions,
  };
}

function buildTemplateSessionKey(monthIndex, sessionInMonth) {
  return `${monthIndex}:${sessionInMonth}`;
}

function resolveTemplateSessionPosition(row, sessionsPerMonth) {
  const monthIndex = Number(row?.month_index);
  const sessionInMonth = Number(row?.session_in_month);
  if (Number.isInteger(monthIndex) && monthIndex >= 1 && Number.isInteger(sessionInMonth) && sessionInMonth >= 1) {
    return { monthIndex, sessionInMonth };
  }
  const cycleIndex = Number(row?.session_in_cycle);
  if (!Number.isInteger(cycleIndex) || cycleIndex < 1 || sessionsPerMonth < 1) {
    return { monthIndex: null, sessionInMonth: null };
  }
  const resolvedMonthIndex = Math.floor((cycleIndex - 1) / sessionsPerMonth) + 1;
  const resolvedSessionInMonth = ((cycleIndex - 1) % sessionsPerMonth) + 1;
  return {
    monthIndex: resolvedMonthIndex,
    sessionInMonth: resolvedSessionInMonth,
  };
}

function normalizeTemplateAdditionalSlides(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (typeof item === "string") {
        const url = item.trim();
        if (!url) return null;
        return { title: "", url };
      }
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || "").trim();
      const url = String(item.url || "").trim();
      if (!url) return null;
      return { title, url };
    })
    .filter(Boolean);
}

async function ensureTemplateSessionSkeleton(supabase, templateId, frequency) {
  const structure = getTemplateStructure(frequency);
  if (!structure) {
    return { error: "Frecuencia invalida para generar plantilla." };
  }
  const { sessionsPerMonth, durationMonths, totalSessions } = structure;

  const { data: existingRows, error: existingError } = await supabase
    .from("template_sessions")
    .select("id, month_index, session_in_month, session_in_cycle, title")
    .eq("template_id", templateId)
    .order("month_index", { ascending: true })
    .order("session_in_month", { ascending: true });

  if (existingError) {
    const missingTable = getMissingTableName(existingError);
    if (missingTable?.endsWith("template_sessions")) {
      return { missingTable: true, created: 0, sessionsPerMonth, durationMonths, totalSessions };
    }
    const missingColumn = getMissingColumnFromError(existingError);
    if (missingColumn === "month_index" || missingColumn === "session_in_month") {
      return { error: "Falta actualizar template_sessions con month_index/session_in_month. Ejecuta SQL actualizado." };
    }
    return { error: existingError.message || "No se pudo consultar sesiones de plantilla." };
  }

  const existingByKey = new Map();
  const rowsToInsert = [];
  const rowsToUpdate = [];
  const staleRows = [];

  for (const row of existingRows || []) {
    const position = resolveTemplateSessionPosition(row, sessionsPerMonth);
    if (!position.monthIndex || !position.sessionInMonth) {
      staleRows.push(row.id);
      continue;
    }
    if (
      position.monthIndex < 1 ||
      position.monthIndex > durationMonths ||
      position.sessionInMonth < 1 ||
      position.sessionInMonth > sessionsPerMonth
    ) {
      staleRows.push(row.id);
      continue;
    }
    const key = buildTemplateSessionKey(position.monthIndex, position.sessionInMonth);
    if (existingByKey.has(key)) {
      staleRows.push(row.id);
      continue;
    }
    existingByKey.set(key, {
      ...row,
      monthIndex: position.monthIndex,
      sessionInMonth: position.sessionInMonth,
    });
  }

  let globalSessionIndex = 1;
  for (let monthIndex = 1; monthIndex <= durationMonths; monthIndex += 1) {
    for (let sessionInMonth = 1; sessionInMonth <= sessionsPerMonth; sessionInMonth += 1) {
      const key = buildTemplateSessionKey(monthIndex, sessionInMonth);
      const existing = existingByKey.get(key);
      const defaultTitle = `Clase ${String(globalSessionIndex).padStart(2, "0")}`;
      if (!existing) {
        rowsToInsert.push({
          template_id: templateId,
          month_index: monthIndex,
          session_in_month: sessionInMonth,
          session_in_cycle: globalSessionIndex,
          title: defaultTitle,
        });
      } else {
        const updatePayload = {};
        if (!existing.title || !existing.title.trim()) {
          updatePayload.title = defaultTitle;
        }
        if (Number(existing.month_index) !== monthIndex) {
          updatePayload.month_index = monthIndex;
        }
        if (Number(existing.session_in_month) !== sessionInMonth) {
          updatePayload.session_in_month = sessionInMonth;
        }
        if (Number(existing.session_in_cycle) !== globalSessionIndex) {
          updatePayload.session_in_cycle = globalSessionIndex;
        }
        if (Object.keys(updatePayload).length) {
          rowsToUpdate.push({
            id: existing.id,
            payload: updatePayload,
          });
        }
      }
      globalSessionIndex += 1;
    }
  }

  if (rowsToInsert.length) {
    const { error: insertError } = await supabase.from("template_sessions").insert(rowsToInsert);
    if (insertError) {
      return { error: insertError.message || "No se pudo crear sesiones base de la plantilla." };
    }
  }

  for (const row of rowsToUpdate) {
    const { error: updateError } = await supabase
      .from("template_sessions")
      .update(row.payload)
      .eq("id", row.id);
    if (updateError) {
      return { error: updateError.message || "No se pudo actualizar titulos base de plantilla." };
    }
  }

  if (staleRows.length) {
    const staleExerciseIds = await collectTemplateExerciseIdsBySessionIds(supabase, staleRows);
    const { error: deleteError } = await supabase.from("template_sessions").delete().in("id", staleRows);
    if (deleteError) {
      return { error: deleteError.message || "No se pudo limpiar sesiones fuera de rango." };
    }

    if (staleExerciseIds.length) {
      const actorId = await getAdminActorId(supabase);
      await archiveExercisesIfOrphaned({
        db: supabase,
        exerciseIds: staleExerciseIds,
        actorId,
        ignoreLessonReference: true,
      });
      await runExerciseGarbageCollection({ db: supabase, actorId });
    }
  }

  return {
    created: rowsToInsert.length,
    sessionsPerMonth,
    durationMonths,
    totalSessions,
    missingTable: false,
  };
}

async function loadTemplateMaterialBySessionIndex(supabase, { templateId = null, courseLevel, frequency }) {
  const safeTemplateId = String(templateId || "").trim();
  const normalizedFrequencyInput = normalizeTemplateFrequency(frequency);

  let template = null;
  if (safeTemplateId) {
    const { data: templateRow, error: templateError } = await supabase
      .from("course_templates")
      .select("id, course_level, frequency")
      .eq("id", safeTemplateId)
      .maybeSingle();

    if (templateError) {
      const missingTable = getMissingTableName(templateError);
      if (missingTable?.endsWith("course_templates")) {
        return { missingTable: true, templateFound: false, byMonthAndSession: new Map() };
      }
      return { error: templateError.message || "No se pudo consultar la plantilla." };
    }
    if (!templateRow?.id) {
      return { templateFound: false, byMonthAndSession: new Map() };
    }
    template = templateRow;
  } else {
    const normalizedFrequency = normalizeTemplateFrequency(frequency);
    if (!courseLevel || !normalizedFrequency) {
      return { templateFound: false, byMonthAndSession: new Map() };
    }

    const { data: templateRow, error: templateError } = await supabase
      .from("course_templates")
      .select("id, course_level, frequency")
      .eq("course_level", courseLevel)
      .eq("frequency", normalizedFrequency)
      .maybeSingle();

    if (templateError) {
      const missingTable = getMissingTableName(templateError);
      if (missingTable?.endsWith("course_templates")) {
        return { missingTable: true, templateFound: false, byMonthAndSession: new Map() };
      }
      return { error: templateError.message || "No se pudo consultar la plantilla." };
    }

    if (!templateRow?.id) {
      return { templateFound: false, byMonthAndSession: new Map() };
    }
    template = templateRow;
  }

  const normalizedFrequency = normalizeTemplateFrequency(template?.frequency || normalizedFrequencyInput);
  const structure = getTemplateStructure(normalizedFrequency);
  if (!structure) {
    return { templateFound: false, byMonthAndSession: new Map() };
  }
  const { sessionsPerMonth } = structure;

  let sessionsResult = await supabase
    .from("template_sessions")
    .select(
      "id, month_index, session_in_month, session_in_cycle, title, class_slide_url, class_slide_title, additional_slides"
    )
    .eq("template_id", template.id)
    .order("month_index", { ascending: true })
    .order("session_in_month", { ascending: true });

  const missingSessionColumn = getMissingColumnFromError(sessionsResult.error);
  if (
    sessionsResult.error &&
    (missingSessionColumn === "class_slide_url" ||
      missingSessionColumn === "class_slide_title" ||
      missingSessionColumn === "additional_slides")
  ) {
    sessionsResult = await supabase
      .from("template_sessions")
      .select("id, month_index, session_in_month, session_in_cycle, title")
      .eq("template_id", template.id)
      .order("month_index", { ascending: true })
      .order("session_in_month", { ascending: true });
  }

  const { data: templateSessions, error: sessionError } = sessionsResult;

  if (sessionError) {
    const missingTable = getMissingTableName(sessionError);
    if (missingTable?.endsWith("template_sessions")) {
      return { missingTable: true, templateFound: true, byMonthAndSession: new Map() };
    }
    const missingColumn = getMissingColumnFromError(sessionError);
    if (missingColumn === "month_index" || missingColumn === "session_in_month") {
      return { error: "Falta actualizar template_sessions con month_index/session_in_month. Ejecuta SQL actualizado." };
    }
    return { error: sessionError.message || "No se pudo consultar sesiones de la plantilla." };
  }

  const templateSessionIds = (templateSessions || []).map((row) => row.id);
  let itemsByTemplateSessionId = new Map();
  let flashcardsByTemplateSessionId = new Map();
  if (templateSessionIds.length) {
    let itemsResult = await supabase
      .from("template_session_items")
      .select("id, template_session_id, type, title, url, exercise_id, exercise_points, exercise_order")
      .in("template_session_id", templateSessionIds)
      .order("created_at", { ascending: true });

    if (itemsResult.error) {
      const missingColumn = getMissingColumnFromError(itemsResult.error);
      if (missingColumn === "exercise_id" || missingColumn === "exercise_points" || missingColumn === "exercise_order") {
        itemsResult = await supabase
          .from("template_session_items")
          .select("id, template_session_id, type, title, url, exercise_id")
          .in("template_session_id", templateSessionIds)
          .order("created_at", { ascending: true });
      }
    }
    const { data: itemsRows, error: itemsError } = itemsResult;

    if (itemsError) {
      const missingTable = getMissingTableName(itemsError);
      if (missingTable?.endsWith("template_session_items")) {
        return { missingTable: true, templateFound: true, byMonthAndSession: new Map() };
      }
      return { error: itemsError.message || "No se pudo consultar materiales de plantilla." };
    }

    const exerciseIds = Array.from(
      new Set(
        (itemsRows || [])
          .map((item) => String(item?.exercise_id || "").trim())
          .filter(Boolean)
      )
    );
    let lessonIdByExerciseId = new Map();
    if (exerciseIds.length) {
      const { data: exerciseRows, error: exerciseRowsError } = await supabase
        .from("exercises")
        .select("id, lesson_id")
        .in("id", exerciseIds)
        .in("status", ["draft", "published"]);
      if (!exerciseRowsError) {
        lessonIdByExerciseId = new Map(
          (exerciseRows || []).map((exercise) => [String(exercise.id || "").trim(), exercise.lesson_id || null])
        );
      }
    }

    itemsByTemplateSessionId = (itemsRows || []).reduce((acc, item) => {
      const current = acc.get(item.template_session_id) || [];
      current.push({
        ...item,
        exercise_points: normalizeExerciseItemPoints(item?.exercise_points, 10),
        exercise_order: toPositiveInt(item?.exercise_order, current.length + 1),
        lesson_id: lessonIdByExerciseId.get(String(item.exercise_id || "").trim()) || null,
      });
      acc.set(item.template_session_id, current);
      return acc;
    }, new Map());

    let flashcardColumns = [
      "id",
      "template_session_id",
      "flashcard_id",
      "word",
      "meaning",
      "image_url",
      "card_order",
      "accepted_answers",
    ];
    let flashcardsResult = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase
        .from("template_session_flashcards")
        .select(flashcardColumns.join(","))
        .in("template_session_id", templateSessionIds)
        .order("card_order", { ascending: true })
        .order("created_at", { ascending: true });
      flashcardsResult = result;
      if (!result.error) break;
      const missingColumn = getMissingColumnFromError(result.error);
      if (!missingColumn || !flashcardColumns.includes(missingColumn)) break;
      flashcardColumns = flashcardColumns.filter((column) => column !== missingColumn);
    }

    if (flashcardsResult?.error) {
      const missingTable = getMissingTableName(flashcardsResult.error);
      if (!missingTable?.endsWith("template_session_flashcards")) {
        return { error: flashcardsResult.error.message || "No se pudo consultar flashcards de plantilla." };
      }
    } else {
      const flashcardIds = Array.from(
        new Set(
          (flashcardsResult?.data || [])
            .map((row) => String(row?.flashcard_id || "").trim())
            .filter(Boolean)
        )
      );
      let flashcardsById = new Map();
      if (flashcardIds.length) {
        const flashcardsLibraryResult = await supabase
          .from("flashcards")
          .select(FLASHCARD_LIBRARY_SELECT)
          .in("id", flashcardIds);
        if (flashcardsLibraryResult.error) {
          return {
            error:
              buildFlashcardsSchemaError(flashcardsLibraryResult.error) ||
              flashcardsLibraryResult.error.message ||
              "No se pudo cargar la biblioteca de flashcards.",
          };
        }
        flashcardsById = buildFlashcardLibraryMap(flashcardsLibraryResult.data || []);
      }

      flashcardsByTemplateSessionId = (flashcardsResult.data || []).reduce((acc, row) => {
        const current = acc.get(row.template_session_id) || [];
        current.push(resolveAssignedFlashcardRow(row, flashcardsById, current.length + 1));
        acc.set(row.template_session_id, current);
        return acc;
      }, new Map());
    }
  }

  const byMonthAndSession = new Map();
  for (const row of templateSessions || []) {
    const position = resolveTemplateSessionPosition(row, sessionsPerMonth);
    if (!position.monthIndex || !position.sessionInMonth) continue;
    const allItems = itemsByTemplateSessionId.get(row.id) || [];
    const flashcardsMaterial = allItems.find(
      (item) => normalizeTemplateItemType(item?.type) === "flashcards"
    ) || null;
    byMonthAndSession.set(
      buildTemplateSessionKey(position.monthIndex, position.sessionInMonth),
      {
        templateSessionId: row.id,
        title: row.title || null,
        items: allItems.filter((item) => normalizeTemplateItemType(item?.type) !== "flashcards"),
        flashcardsMaterial,
        flashcards: flashcardsByTemplateSessionId.get(row.id) || [],
        classSlide: {
          title: String(row.class_slide_title || "").trim(),
          url: String(row.class_slide_url || "").trim(),
        },
        additionalSlides: normalizeTemplateAdditionalSlides(row.additional_slides),
      }
    );
  }

  return {
    templateId: template.id,
    templateLevel: template.course_level || null,
    templateFrequency: normalizedFrequency,
    templateFound: true,
    byMonthAndSession,
  };
}

function buildCommissionCycleSessionKey(cycleMonth, sessionInCycle) {
  return `${String(cycleMonth || "").trim()}::${Number(sessionInCycle) || 0}`;
}

function buildTemplateManagedItemKey(templateSessionItemId, note) {
  const safeTemplateSessionItemId = String(templateSessionItemId || "").trim();
  if (safeTemplateSessionItemId) {
    return `template:item:${safeTemplateSessionItemId}`;
  }
  const safeNote = String(note || "").trim();
  return safeNote.startsWith("template:") ? safeNote : "";
}

async function updateCommissionRowWithMissingColumnFallback(supabase, commissionId, payload) {
  let safePayload = { ...(payload || {}) };
  while (true) {
    const { error } = await supabase
      .from("course_commissions")
      .update(safePayload)
      .eq("id", commissionId);

    if (!error) return null;
    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(safePayload, missingColumn)) {
      delete safePayload[missingColumn];
      continue;
    }
    return error;
  }
}

async function loadCommissionSessionsForTemplateSync(supabase, commissionId) {
  let columns = [
    "id",
    "commission_id",
    "template_session_id",
    "cycle_month",
    "session_index",
    "session_in_cycle",
    "session_date",
    "starts_at",
    "ends_at",
    "day_label",
    "status",
  ];
  let hasTemplateSessionIdColumn = true;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase
      .from("course_sessions")
      .select(columns.join(","))
      .eq("commission_id", commissionId)
      .order("session_index", { ascending: true, nullsFirst: false })
      .order("session_date", { ascending: true });

    if (!result.error) {
      return {
        rows: result.data || [],
        hasTemplateSessionIdColumn,
      };
    }

    const missingColumn = getMissingColumnFromError(result.error);
    if (missingColumn === "template_session_id" && columns.includes("template_session_id")) {
      columns = columns.filter((column) => column !== "template_session_id");
      hasTemplateSessionIdColumn = false;
      continue;
    }

    const missingTable = getMissingTableName(result.error);
    if (missingTable?.endsWith("course_sessions")) {
      return {
        rows: [],
        hasTemplateSessionIdColumn,
        missingTable: true,
      };
    }

    throw new Error(result.error.message || "No se pudieron cargar las sesiones de la comision.");
  }

  return { rows: [], hasTemplateSessionIdColumn };
}

async function saveCommissionSessionWithFallback({
  supabase,
  existingSessionId = null,
  payload,
  hasTemplateSessionIdColumn = true,
}) {
  const sessionPayload = { ...(payload || {}) };
  if (!hasTemplateSessionIdColumn) {
    delete sessionPayload.template_session_id;
  }

  while (true) {
    if (existingSessionId) {
      const { error } = await supabase
        .from("course_sessions")
        .update({ ...sessionPayload, updated_at: new Date().toISOString() })
        .eq("id", existingSessionId);
      if (!error) {
        return { id: existingSessionId };
      }
      const missingColumn = getMissingColumnFromError(error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(sessionPayload, missingColumn)) {
        delete sessionPayload[missingColumn];
        continue;
      }
      throw new Error(error.message || "No se pudo actualizar la sesion de la comision.");
    }

    const { data, error } = await supabase
      .from("course_sessions")
      .insert(sessionPayload)
      .select("id")
      .maybeSingle();
    if (!error && data?.id) {
      return { id: data.id };
    }
    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(sessionPayload, missingColumn)) {
      delete sessionPayload[missingColumn];
      continue;
    }
    throw new Error(error?.message || "No se pudo crear la sesion de la comision.");
  }
}

async function loadSessionItemsForTemplateSync(supabase, sessionIds = []) {
  const safeSessionIds = Array.from(new Set((sessionIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (!safeSessionIds.length) {
    return { rows: [], hasTemplateSessionItemIdColumn: true };
  }

  let columns = [
    "id",
    "session_id",
    "template_session_item_id",
    "type",
    "title",
    "url",
    "exercise_id",
    "note",
    "updated_at",
    "created_at",
  ];
  let hasTemplateSessionItemIdColumn = true;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase
      .from("session_items")
      .select(columns.join(","))
      .in("session_id", safeSessionIds)
      .order("created_at", { ascending: true });

    if (!result.error) {
      return {
        rows: result.data || [],
        hasTemplateSessionItemIdColumn,
      };
    }

    const missingColumn = getMissingColumnFromError(result.error);
    if (missingColumn === "template_session_item_id" && columns.includes("template_session_item_id")) {
      columns = columns.filter((column) => column !== "template_session_item_id");
      hasTemplateSessionItemIdColumn = false;
      continue;
    }

    throw new Error(result.error.message || "No se pudieron cargar los materiales de sesiones.");
  }

  return { rows: [], hasTemplateSessionItemIdColumn };
}

async function saveSessionItemWithMissingColumnFallback(supabase, itemId, payload) {
  let safePayload = { ...(payload || {}) };
  while (true) {
    const result = itemId
      ? await supabase.from("session_items").update(safePayload).eq("id", itemId)
      : await supabase.from("session_items").insert(safePayload);
    if (!result.error) return null;
    const missingColumn = getMissingColumnFromError(result.error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(safePayload, missingColumn)) {
      delete safePayload[missingColumn];
      continue;
    }
    return result.error;
  }
}

function pickLegacyItemCandidate(existingRows, desiredRow, consumedIds = new Set()) {
  const available = (Array.isArray(existingRows) ? existingRows : []).filter(
    (row) => row?.id && !consumedIds.has(String(row.id || ""))
  );
  if (!available.length) return null;

  if (desiredRow.type === "exercise" && desiredRow.exercise_id) {
    return (
      available.find((row) => {
        if (buildTemplateManagedItemKey(row?.template_session_item_id, row?.note)) return false;
        return (
          normalizeTemplateItemType(row?.type) === "exercise" &&
          String(row?.exercise_id || "").trim() === String(desiredRow.exercise_id || "").trim()
        );
      }) || null
    );
  }

  return (
    available.find((row) => {
      if (buildTemplateManagedItemKey(row?.template_session_item_id, row?.note)) return false;
      return (
        normalizeTemplateItemType(row?.type) === normalizeTemplateItemType(desiredRow.type) &&
        String(row?.url || "").trim() === String(desiredRow.url || "").trim()
      );
    }) || null
  );
}

async function syncSessionItemsFromTemplatePayload({
  supabase,
  commissionId,
  sessionId,
  templatePayload,
  existingItems = [],
  hasTemplateSessionItemIdColumn = true,
}) {
  const safeCommissionId = String(commissionId || "").trim();
  const safeSessionId = String(sessionId || "").trim();
  const byManagedKey = new Map();
  const bySessionRows = (Array.isArray(existingItems) ? existingItems : []).filter(
    (row) => String(row?.session_id || "").trim() === safeSessionId
  );
  bySessionRows.forEach((row) => {
    const managedKey = buildTemplateManagedItemKey(row?.template_session_item_id, row?.note);
    if (managedKey) byManagedKey.set(managedKey, row);
  });

  const desiredRows = [];
  const classSlideUrl = String(templatePayload?.classSlide?.url || "").trim();
  if (classSlideUrl) {
    desiredRows.push({
      managedKey: "template:primary_slide",
      templateSessionItemId: null,
      type: "slides",
      title: String(templatePayload?.classSlide?.title || "").trim() || "Slide de clase",
      url: classSlideUrl,
      exercise_id: null,
      note: "template:primary_slide",
    });
  }

  const additionalSlides = Array.isArray(templatePayload?.additionalSlides) ? templatePayload.additionalSlides : [];
  additionalSlides.forEach((slide, index) => {
    const url = String(slide?.url || "").trim();
    if (!url) return;
    desiredRows.push({
      managedKey: `template:additional_slide:${index + 1}`,
      templateSessionItemId: null,
      type: "slides",
      title: String(slide?.title || "").trim() || `Slide adicional ${index + 1}`,
      url,
      exercise_id: null,
      note: `template:additional_slide:${index + 1}`,
    });
  });

  const templateItems = Array.isArray(templatePayload?.items) ? templatePayload.items : [];
  templateItems.forEach((item) => {
    const templateItemId = String(item?.id || "").trim();
    if (!templateItemId) return;
    desiredRows.push({
      managedKey: `template:item:${templateItemId}`,
      templateSessionItemId: templateItemId,
      type: normalizeTemplateItemType(item?.type),
      title: String(item?.title || "").trim(),
      url: String(item?.url || "").trim() || null,
      exercise_id: String(item?.exercise_id || "").trim() || null,
      exercise_points: normalizeExerciseItemPoints(item?.exercise_points, 10),
      exercise_order: toPositiveInt(item?.exercise_order, desiredRows.length + 1),
      lesson_id: String(item?.lesson_id || "").trim() || null,
      note: `template:item:${templateItemId}`,
    });
  });

  const flashcardsMaterial = templatePayload?.flashcardsMaterial || null;
  if (flashcardsMaterial) {
    desiredRows.push({
      managedKey: "template:flashcards_material",
      templateSessionItemId: null,
      type: "flashcards",
      title: String(flashcardsMaterial?.title || "Flashcards").trim() || "Flashcards",
      url: String(flashcardsMaterial?.url || INTERNAL_FLASHCARDS_URL).trim() || INTERNAL_FLASHCARDS_URL,
      exercise_id: null,
      note: "template:flashcards_material",
    });
  }

  const consumedExistingIds = new Set();
  const desiredKeys = new Set(desiredRows.map((row) => row.managedKey));
  const hasExerciseRows = desiredRows.some(
    (row) => normalizeTemplateItemType(row?.type) === "exercise" && String(row?.exercise_id || "").trim()
  );
  let commissionLessonId = "";
  if (hasExerciseRows && safeCommissionId && safeSessionId) {
    commissionLessonId = await ensureCourseSessionLessonId(supabase, {
      commissionId: safeCommissionId,
      courseSessionId: safeSessionId,
      title: String(templatePayload?.title || "").trim(),
    });
  }

  for (const desired of desiredRows) {
    let existing = byManagedKey.get(desired.managedKey) || null;
    if (!existing) {
      existing = pickLegacyItemCandidate(bySessionRows, desired, consumedExistingIds);
    }

    const normalizedDesiredType = normalizeTemplateItemType(desired.type);
    const isExerciseItem = normalizedDesiredType === "exercise";
    const resolvedExerciseId =
      isExerciseItem ? String(desired.exercise_id || "").trim() : "";
    const resolvedLessonId =
      isExerciseItem
        ? String(commissionLessonId || desired.lesson_id || "").trim() || null
        : null;
    const resolvedUrl =
      isExerciseItem
        ? buildPracticeExerciseUrl(resolvedExerciseId, resolvedLessonId)
        : desired.url || null;

    const itemPayload = {
      session_id: sessionId,
      type: normalizedDesiredType,
      title: desired.title || "Material",
      url: resolvedUrl,
      lesson_id: resolvedLessonId,
      exercise_id: isExerciseItem ? (resolvedExerciseId || null) : null,
      note: desired.note || null,
      updated_at: new Date().toISOString(),
    };
    if (isExerciseItem) {
      itemPayload.exercise_points = normalizeExerciseItemPoints(desired?.exercise_points, 10);
      itemPayload.exercise_order = toPositiveInt(desired?.exercise_order, 1);
    }
    if (hasTemplateSessionItemIdColumn && desired.templateSessionItemId) {
      itemPayload.template_session_item_id = desired.templateSessionItemId;
    }

    const saveError = await saveSessionItemWithMissingColumnFallback(
      supabase,
      existing?.id || null,
      itemPayload
    );
    if (saveError) {
      throw new Error(saveError.message || "No se pudo sincronizar material de la sesion.");
    }
    if (existing?.id) {
      consumedExistingIds.add(String(existing.id));
    }
  }

  const staleManagedIds = bySessionRows
    .filter((row) => {
      const managedKey = buildTemplateManagedItemKey(row?.template_session_item_id, row?.note);
      if (!managedKey) return false;
      return !desiredKeys.has(managedKey);
    })
    .map((row) => String(row?.id || "").trim())
    .filter(Boolean);

  if (staleManagedIds.length) {
    const { error: staleDeleteError } = await supabase
      .from("session_items")
      .delete()
      .in("id", staleManagedIds);
    if (staleDeleteError) {
      throw new Error(staleDeleteError.message || "No se pudo limpiar material obsoleto de sesion.");
    }
  }
}

async function syncSessionFlashcardsFromTemplatePayload({
  supabase,
  sessionId,
  templatePayload,
}) {
  const flashcards = Array.isArray(templatePayload?.flashcards) ? templatePayload.flashcards : [];
  const { error: deleteRowsError } = await supabase
    .from("session_flashcards")
    .delete()
    .eq("session_id", sessionId);
  if (deleteRowsError) {
    const missingTable = getMissingTableName(deleteRowsError);
    if (!missingTable?.endsWith("session_flashcards")) {
      throw new Error(deleteRowsError.message || "No se pudieron limpiar flashcards de la sesion.");
    }
    return;
  }

  if (!flashcards.length) return;

  const rows = flashcards.map((card, index) => ({
    session_id: sessionId,
    flashcard_id: String(card?.flashcardId || "").trim() || null,
    word: String(card?.word || "").trim() || null,
    meaning: String(card?.meaning || "").trim() || null,
    image_url: String(card?.image || "").trim() || null,
    card_order: Number(card?.order || index + 1) || index + 1,
    accepted_answers: Array.isArray(card?.acceptedAnswers) ? card.acceptedAnswers : [],
    updated_at: new Date().toISOString(),
  }));

  const { error: insertRowsError } = await supabase
    .from("session_flashcards")
    .insert(rows);
  if (insertRowsError) {
    throw new Error(insertRowsError.message || "No se pudieron sincronizar flashcards de la sesion.");
  }
}

async function resolveTemplateForCommission(supabase, commission, forcedTemplateId = null) {
  async function loadTemplate(queryBuilder) {
    let columns = [
      "id",
      "course_level",
      "frequency",
      "course_duration_months",
      "class_duration_minutes",
    ];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await queryBuilder(columns.join(","));
      if (!result.error) {
        return result.data || null;
      }
      const missingColumn = getMissingColumnFromError(result.error);
      if (!missingColumn || !columns.includes(missingColumn)) {
        throw new Error(result.error.message || "No se pudo cargar la plantilla.");
      }
      columns = columns.filter((column) => column !== missingColumn);
    }
    return null;
  }

  const forcedId = String(forcedTemplateId || "").trim();
  if (forcedId) {
    const template = await loadTemplate((columns) =>
      supabase
        .from("course_templates")
        .select(columns)
        .eq("id", forcedId)
        .maybeSingle()
    );
    return template || null;
  }

  const linkedTemplateId = String(commission?.template_id || "").trim();
  if (linkedTemplateId) {
    const template = await loadTemplate((columns) =>
      supabase
        .from("course_templates")
        .select(columns)
        .eq("id", linkedTemplateId)
        .maybeSingle()
    );
    if (template?.id) return template;
  }

  const normalizedFrequency = normalizeTemplateFrequency(commission?.modality_key);
  if (!commission?.course_level || !normalizedFrequency) return null;

  const template = await loadTemplate((columns) =>
    supabase
      .from("course_templates")
      .select(columns)
      .eq("course_level", commission.course_level)
      .eq("frequency", normalizedFrequency)
      .maybeSingle()
  );
  return template || null;
}

async function syncCommissionFromTemplate(supabase, commission, { templateId = null } = {}) {
  const commissionId = String(commission?.id || "").trim();
  if (!commissionId) {
    return { error: "Comision invalida para sincronizacion." };
  }

  const template = await resolveTemplateForCommission(supabase, commission, templateId);
  if (!template?.id) {
    return { error: "No se encontro plantilla para sincronizar la comision." };
  }

  const normalizedFrequency = normalizeTemplateFrequency(template.frequency);
  const modality = getModalityDefinition(normalizedFrequency);
  if (!normalizedFrequency || !modality) {
    return { error: "La frecuencia de la plantilla es invalida." };
  }

  const startMonthValue = formatDateOnly(parseMonthInput(commission.start_month || commission.start_date)) || formatDateOnly(new Date());
  const durationMonths = toPositiveInt(
    template.course_duration_months || getFrequencyDurationMonths(normalizedFrequency),
    Math.max(1, getFrequencyDurationMonths(normalizedFrequency) || 1)
  );
  const startTime = String(commission.start_time || "").slice(0, 5) || "18:00";
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes == null) {
    return { error: "La comision no tiene una hora de inicio valida para sincronizar." };
  }

  const classDurationMinutes = toPositiveInt(
    template.class_duration_minutes || getClassDurationMinutesFromFrequency(normalizedFrequency),
    getClassDurationMinutesFromFrequency(normalizedFrequency)
  );
  const computedEndTime = formatMinutesToTime(startMinutes + classDurationMinutes);

  const generatedRows = buildFrequencySessionDrafts({
    commissionId,
    frequency: normalizedFrequency,
    startMonth: startMonthValue,
    durationMonths,
    startTime,
    endTime: computedEndTime,
    status: "scheduled",
  });
  if (!generatedRows.length) {
    return { error: "No se pudieron calcular sesiones para la plantilla seleccionada." };
  }

  const firstSessionDate = generatedRows[0]?.session_date || startMonthValue;
  const lastSessionDate = generatedRows[generatedRows.length - 1]?.session_date || startMonthValue;

  const commissionSyncPayload = {
    template_id: template.id,
    course_level: template.course_level,
    modality_key: normalizedFrequency,
    days_of_week: modality.days,
    start_month: startMonthValue,
    duration_months: durationMonths,
    start_date: firstSessionDate,
    end_date: lastSessionDate,
    start_time: startTime,
    end_time: computedEndTime,
    template_frequency_snapshot: normalizedFrequency,
    template_course_duration_months_snapshot: durationMonths,
    template_class_duration_minutes_snapshot: classDurationMinutes,
  };

  const updateCommissionError = await updateCommissionRowWithMissingColumnFallback(
    supabase,
    commissionId,
    commissionSyncPayload
  );
  if (updateCommissionError) {
    return { error: updateCommissionError.message || "No se pudo actualizar la comision desde plantilla." };
  }

  const templateSeed = await loadTemplateMaterialBySessionIndex(supabase, { templateId: template.id });
  if (templateSeed.error) return { error: templateSeed.error };
  if (templateSeed.missingTable) {
    return { missingTable: true, count: 0 };
  }

  const loadedSessions = await loadCommissionSessionsForTemplateSync(supabase, commissionId);
  if (loadedSessions.missingTable) {
    return { missingTable: true, count: 0 };
  }

  const existingRows = loadedSessions.rows || [];
  const hasTemplateSessionIdColumn = loadedSessions.hasTemplateSessionIdColumn;
  const existingByTemplateSessionId = new Map();
  const existingByCycleKey = new Map();
  existingRows.forEach((row) => {
    const templateSessionId = String(row?.template_session_id || "").trim();
    if (templateSessionId) {
      existingByTemplateSessionId.set(templateSessionId, row);
    }
    existingByCycleKey.set(
      buildCommissionCycleSessionKey(row?.cycle_month, row?.session_in_cycle),
      row
    );
  });

  const monthIndexByCycleMonth = new Map();
  const orderedCycleMonths = Array.from(
    new Set(generatedRows.map((row) => String(row?.cycle_month || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  orderedCycleMonths.forEach((cycleMonth, index) => {
    monthIndexByCycleMonth.set(cycleMonth, index + 1);
  });

  const syncedSessions = [];
  const usedExistingIds = new Set();
  for (const generated of generatedRows) {
    const cycleMonth = String(generated?.cycle_month || "").trim();
    const sessionInCycle = Number(generated?.session_in_cycle || 0);
    const monthIndex = monthIndexByCycleMonth.get(cycleMonth) || null;
    const sessionPayload = monthIndex
      ? templateSeed.byMonthAndSession.get(buildTemplateSessionKey(monthIndex, sessionInCycle))
      : null;

    const templateSessionId = String(sessionPayload?.templateSessionId || "").trim();
    const existingByTemplate = templateSessionId ? existingByTemplateSessionId.get(templateSessionId) : null;
    const existingByCycle = existingByCycleKey.get(buildCommissionCycleSessionKey(cycleMonth, sessionInCycle)) || null;
    const existing = existingByTemplate || existingByCycle || null;

    const savePayload = {
      commission_id: commissionId,
      template_session_id: templateSessionId || null,
      cycle_month: generated.cycle_month,
      session_index: generated.session_index,
      session_in_cycle: generated.session_in_cycle,
      session_date: generated.session_date,
      starts_at: generated.starts_at,
      ends_at: generated.ends_at,
      day_label: String(sessionPayload?.title || generated.day_label || "").trim() || generated.day_label,
      kind: "class",
      status: existing?.status === "completed" ? "completed" : "scheduled",
    };

    const saved = await saveCommissionSessionWithFallback({
      supabase,
      existingSessionId: existing?.id || null,
      payload: savePayload,
      hasTemplateSessionIdColumn,
    });

    if (existing?.id) {
      usedExistingIds.add(String(existing.id));
    }

    syncedSessions.push({
      id: saved.id,
      templatePayload: sessionPayload || {
        classSlide: { title: "", url: "" },
        additionalSlides: [],
        items: [],
        flashcards: [],
        flashcardsMaterial: null,
      },
    });
  }

  const staleTemplateLinkedIds = existingRows
    .filter((row) => {
      const id = String(row?.id || "").trim();
      if (!id || usedExistingIds.has(id)) return false;
      if (String(row?.template_session_id || "").trim()) return true;
      return false;
    })
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);

  if (staleTemplateLinkedIds.length) {
    const { error: staleUpdateError } = await supabase
      .from("course_sessions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in("id", staleTemplateLinkedIds);
    if (staleUpdateError) {
      return { error: staleUpdateError.message || "No se pudo actualizar sesiones obsoletas." };
    }
  }

  const syncedSessionIds = syncedSessions.map((row) => String(row.id || "").trim()).filter(Boolean);
  const loadedItems = await loadSessionItemsForTemplateSync(supabase, syncedSessionIds);
  const existingItems = loadedItems.rows || [];

  for (const sessionRow of syncedSessions) {
    await syncSessionItemsFromTemplatePayload({
      supabase,
      commissionId,
      sessionId: sessionRow.id,
      templatePayload: sessionRow.templatePayload,
      existingItems,
      hasTemplateSessionItemIdColumn: loadedItems.hasTemplateSessionItemIdColumn,
    });
    await syncSessionFlashcardsFromTemplatePayload({
      supabase,
      sessionId: sessionRow.id,
      templatePayload: sessionRow.templatePayload,
    });
  }

  return {
    success: true,
    count: syncedSessions.length,
    templateId: template.id,
  };
}

async function syncTemplateToAllLinkedCommissions(supabase, templateId) {
  const safeTemplateId = String(templateId || "").trim();
  if (!safeTemplateId) {
    return { success: true, synced: 0, errors: [] };
  }

  const { data: template, error: templateError } = await supabase
    .from("course_templates")
    .select("id, course_level, frequency")
    .eq("id", safeTemplateId)
    .maybeSingle();
  if (templateError || !template?.id) {
    return {
      success: false,
      synced: 0,
      errors: [templateError?.message || "No se encontro la plantilla para sincronizar comisiones."],
    };
  }

  const normalizedTemplateFrequency = normalizeTemplateFrequency(template.frequency);
  if (!normalizedTemplateFrequency) {
    return {
      success: false,
      synced: 0,
      errors: ["La frecuencia de la plantilla es invalida para sincronizacion."],
    };
  }

  let selectColumns = ["id", "course_level", "modality_key", "start_month", "start_date", "start_time", "template_id"];
  const commissionsById = new Map();

  let supportsTemplateIdColumn = true;
  {
    const result = await supabase
      .from("course_commissions")
      .select(selectColumns.join(","))
      .eq("template_id", template.id);

    if (result.error) {
      const missingColumn = getMissingColumnFromError(result.error);
      if (missingColumn === "template_id") {
        supportsTemplateIdColumn = false;
        selectColumns = selectColumns.filter((column) => column !== "template_id");
      } else {
        return {
          success: false,
          synced: 0,
          errors: [result.error.message || "No se pudieron cargar comisiones vinculadas a la plantilla."],
        };
      }
    } else {
      (result.data || []).forEach((row) => {
        if (row?.id) commissionsById.set(String(row.id), row);
      });
    }
  }

  {
    const fallbackResult = await supabase
      .from("course_commissions")
      .select(selectColumns.join(","))
      .eq("course_level", template.course_level)
      .eq("modality_key", normalizedTemplateFrequency);
    if (fallbackResult.error) {
      return {
        success: false,
        synced: 0,
        errors: [fallbackResult.error.message || "No se pudieron cargar comisiones para sincronizacion por nivel/frecuencia."],
      };
    }
    (fallbackResult.data || []).forEach((row) => {
      if (row?.id) commissionsById.set(String(row.id), row);
    });
  }

  const commissionsRows = Array.from(commissionsById.values()).map((row) => (
    supportsTemplateIdColumn
      ? row
      : { ...row, template_id: null }
  ));

  const errors = [];
  let synced = 0;
  for (const commission of commissionsRows) {
    const result = await syncCommissionFromTemplate(supabase, commission, { templateId: template.id });
    if (result?.error) {
      errors.push(`Comision ${commission?.id || "-"}: ${result.error}`);
      continue;
    }
    if (result?.missingTable) {
      errors.push(`Comision ${commission?.id || "-"}: falta tabla course_sessions.`);
      continue;
    }
    synced += 1;
  }

  return {
    success: errors.length === 0,
    synced,
    errors,
  };
}

async function syncTemplateLinkedCommissionsAfterChange(supabase, templateId) {
  const syncResult = await syncTemplateToAllLinkedCommissions(supabase, templateId);
  if (syncResult.success) return null;
  if (syncResult.errors?.length) {
    return `Se guardó la plantilla, pero falló la sincronización de comisiones: ${syncResult.errors[0]}`;
  }
  return "Se guardó la plantilla, pero falló la sincronización de comisiones.";
}

async function replaceCommissionSessions(supabase, commissionId, rows) {
  const deleteResult = await supabase.from("course_sessions").delete().eq("commission_id", commissionId);
  if (deleteResult.error) {
    return { error: deleteResult.error };
  }

  if (!rows.length) {
    return { count: 0, error: null };
  }

  const insertResult = await supabase.from("course_sessions").insert(rows);
  if (insertResult.error) {
    return { error: insertResult.error };
  }

  const selectColumns = ["id", "cycle_month", "session_in_cycle", "session_index", "day_label"];
  let sessionsRows = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await supabase
      .from("course_sessions")
      .select(selectColumns.join(","))
      .eq("commission_id", commissionId)
      .order("session_index", { ascending: true, nullsFirst: false })
      .order("session_date", { ascending: true });
    if (!result.error) {
      sessionsRows = result.data || [];
      break;
    }
    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !selectColumns.includes(missingColumn)) {
      return { error: result.error };
    }
    selectColumns.splice(selectColumns.indexOf(missingColumn), 1);
  }

  return { count: rows.length, error: null, sessionsRows };
}

async function regenerateCommissionSessions(supabase, commission) {
  const commissionId = commission?.id;
  if (!commissionId) return { error: "Comision invalida." };

  try {
    const template = await resolveTemplateForCommission(supabase, commission);
    if (template?.id) {
      const synced = await syncCommissionFromTemplate(supabase, commission, { templateId: template.id });
      if (synced?.error) return { error: synced.error };
      if (synced?.missingTable) return { missingTable: true, count: 0 };
      return { count: synced.count || 0, templateFound: true };
    }
  } catch (error) {
    return { error: error?.message || "No se pudo sincronizar la comision desde plantilla." };
  }

  const normalizedFrequency = normalizeTemplateFrequency(commission.modality_key);
  const rows = normalizedFrequency
    ? buildFrequencySessionDrafts({
        commissionId,
        frequency: normalizedFrequency,
        startMonth: commission.start_month || commission.start_date,
        durationMonths: commission.duration_months || 1,
        startTime: commission.start_time,
        endTime: commission.end_time,
        status: "scheduled",
      })
    : buildGenericSessionRows({
        commissionId,
        startDate: commission.start_date,
        endDate: commission.end_date,
        daysOfWeek: commission.days_of_week,
        startTime: commission.start_time,
        endTime: commission.end_time,
      });

  if (!rows.length) {
    return { error: "No hay dias validos para generar sesiones." };
  }

  const firstSessionDate = rows[0]?.session_date || null;
  const lastSessionDate = rows[rows.length - 1]?.session_date || null;
  if (firstSessionDate && lastSessionDate) {
    const { error: updateCommissionDatesError } = await supabase
      .from("course_commissions")
      .update({
        start_date: firstSessionDate,
        end_date: lastSessionDate,
      })
      .eq("id", commissionId);
    if (updateCommissionDatesError) {
      return { error: updateCommissionDatesError.message || "No se pudo actualizar fechas de la comision." };
    }
  }

  const result = await replaceCommissionSessions(supabase, commissionId, rows);
  if (result.error) {
    const missingTable = getMissingTableName(result.error);
    if (missingTable?.endsWith("course_sessions")) {
      return { missingTable: true, count: 0 };
    }
    return { error: result.error.message || "No se pudieron regenerar las sesiones." };
  }

  const templateSeed = await loadTemplateMaterialBySessionIndex(supabase, {
    courseLevel: commission.course_level,
    frequency: normalizedFrequency || commission.modality_key,
  });
  if (templateSeed.error) {
    return { error: templateSeed.error };
  }

  if (templateSeed.missingTable) {
    return { count: result.count || 0, templateMissingTable: true, templateFound: false };
  }

  const sessionRows = result.sessionsRows || [];
  if (templateSeed.templateFound && sessionRows.length) {
    const structure = getTemplateStructure(normalizedFrequency);
    const sessionsPerMonth = structure?.sessionsPerMonth || 0;
    const monthIndexByCycleMonth = new Map();
    const orderedCycleMonths = Array.from(
      new Set(
        sessionRows
          .map((session) => session.cycle_month)
          .filter((value) => typeof value === "string" && value.trim())
      )
    ).sort((a, b) => a.localeCompare(b));
    orderedCycleMonths.forEach((cycleMonth, index) => {
      monthIndexByCycleMonth.set(cycleMonth, index + 1);
    });

    const itemRows = [];
    const flashcardRows = [];
    for (const session of sessionRows) {
      const sessionInMonth = Number(session.session_in_cycle);
      const monthIndexFromCycle = monthIndexByCycleMonth.get(session.cycle_month) || null;
      const monthIndexFromGlobalIndex = sessionsPerMonth > 0 && Number.isInteger(Number(session.session_index))
        ? Math.floor((Number(session.session_index) - 1) / sessionsPerMonth) + 1
        : null;
      const monthIndex = monthIndexFromCycle || monthIndexFromGlobalIndex;
      if (!monthIndex || !sessionInMonth) continue;

      const payload = templateSeed.byMonthAndSession.get(
        buildTemplateSessionKey(monthIndex, sessionInMonth)
      );
      if (!payload) continue;
      const insertedSlideUrls = new Set();
      if (payload.title && payload.title.trim()) {
        const updateResult = await supabase
          .from("course_sessions")
          .update({ day_label: payload.title.trim(), updated_at: new Date().toISOString() })
          .eq("id", session.id);
        if (updateResult.error) {
          return { error: updateResult.error.message || "No se pudo copiar el titulo desde plantilla." };
        }
      }
      const classSlideUrl = String(payload.classSlide?.url || "").trim();
      if (classSlideUrl) {
        itemRows.push({
          session_id: session.id,
          type: "slides",
          title: payload.classSlide?.title || "Slide de clase",
          url: classSlideUrl,
          exercise_id: null,
          note: "primary_slide",
        });
        insertedSlideUrls.add(classSlideUrl);
      }

      const additionalSlides = Array.isArray(payload.additionalSlides) ? payload.additionalSlides : [];
      for (const [idx, slide] of additionalSlides.entries()) {
        const slideUrl = String(slide?.url || "").trim();
        if (!slideUrl || insertedSlideUrls.has(slideUrl)) continue;
        itemRows.push({
          session_id: session.id,
          type: "slides",
          title: String(slide?.title || "").trim() || `Slide adicional ${idx + 1}`,
          url: slideUrl,
          exercise_id: null,
          note: "extra_slide",
        });
        insertedSlideUrls.add(slideUrl);
      }

      let sessionQuizLessonId = null;
      for (const item of payload.items) {
        const normalizedType = normalizeTemplateItemType(item.type);
        const resolvedExerciseId = normalizedType === "exercise"
          ? (item.exercise_id || null)
          : null;
        if (normalizedType === "exercise" && resolvedExerciseId && !sessionQuizLessonId) {
          sessionQuizLessonId = await ensureCourseSessionLessonId(supabase, {
            commissionId,
            courseSessionId: session.id,
            title: payload.title || session.day_label,
          });
        }
        const resolvedUrl = normalizedType === "exercise"
          ? buildPracticeExerciseUrl(resolvedExerciseId, sessionQuizLessonId)
          : item.url;
        if (normalizedType === "slides") {
          const candidateUrl = String(resolvedUrl || "").trim();
          if (!candidateUrl || insertedSlideUrls.has(candidateUrl)) continue;
          insertedSlideUrls.add(candidateUrl);
        }
        itemRows.push({
          session_id: session.id,
          type: normalizedType === "slides" ? "slides" : normalizedType,
          title: item.title || "Material",
          url: resolvedUrl,
          exercise_id: resolvedExerciseId,
          ...(normalizedType === "exercise"
            ? {
              exercise_points: normalizeExerciseItemPoints(item?.exercise_points, 10),
              exercise_order: toPositiveInt(item?.exercise_order, itemRows.length + 1),
            }
            : {}),
        });
      }

      if (Array.isArray(payload.flashcards) && payload.flashcards.length) {
        itemRows.push({
          session_id: session.id,
          type: "flashcards",
          title: String(payload.flashcardsMaterial?.title || "").trim() || "Flashcards",
          url: null,
          exercise_id: null,
        });

        for (const [index, card] of payload.flashcards.entries()) {
          const referenceResult = await ensureFlashcardLibraryReference(supabase, card);
          if (referenceResult.error) {
            return { error: referenceResult.error };
          }
          flashcardRows.push({
            session_id: session.id,
            flashcard_id: referenceResult.card.id,
            card_order: index + 1,
          });
        }
      }
    }

    if (itemRows.length) {
      const insertItemsResult = await supabase.from("session_items").insert(itemRows);
      if (insertItemsResult.error) {
        const message = String(insertItemsResult.error.message || "");
        const missingColumn = getMissingColumnFromError(insertItemsResult.error);
        if (missingColumn === "exercise_id") {
          return { error: "Actualiza el SQL: session_items debe incluir columna exercise_id." };
        }
        if (message.toLowerCase().includes("session_items_type_check")) {
          return { error: "Actualiza el SQL: session_items.type debe permitir 'slides' y 'flashcards'." };
        }
        return { error: insertItemsResult.error.message || "No se pudieron copiar materiales de plantilla." };
      }
    }

    if (flashcardRows.length) {
      const insertFlashcardsResult = await supabase.from("session_flashcards").insert(flashcardRows);
      if (insertFlashcardsResult.error) {
        return {
          error:
            buildFlashcardsSchemaError(insertFlashcardsResult.error) ||
            insertFlashcardsResult.error.message ||
            "No se pudieron copiar flashcards de plantilla.",
        };
      }
    }
  }

  return {
    count: result.count || 0,
    templateFound: Boolean(templateSeed.templateFound),
    templateMissingTable: Boolean(templateSeed.missingTable),
  };
}

async function createCommissionWithRetry(supabase, courseLevel, payload) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: latest } = await supabase
      .from("course_commissions")
      .select("commission_number")
      .eq("course_level", courseLevel)
      .order("commission_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNumber = (latest?.commission_number || 100) + 1;
    let insertPayload = { ...payload, course_level: courseLevel, commission_number: nextNumber };
    while (true) {
      const { data, error } = await supabase
        .from("course_commissions")
        .insert(insertPayload)
        .select("id")
        .maybeSingle();

      if (!error && data?.id) {
        return data.id;
      }

      const missingColumn = getMissingColumnFromError(error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(insertPayload, missingColumn)) {
        delete insertPayload[missingColumn];
        continue;
      }

      if (error?.code === "23505") {
        break;
      }

      throw new Error(error?.message || "No se pudo crear la comision.");
    }
  }

  throw new Error("No se pudo generar una comision unica. Intenta nuevamente.");
}

export async function upsertCommission(prevState, formData) {
  const resolvedFormData = formData instanceof FormData ? formData : prevState;
  const supabase = await requireAdmin();
  const id = resolvedFormData.get("commissionId")?.toString();
  const requestedTemplateId =
    getText(resolvedFormData, "template_id") || getText(resolvedFormData, "templateId");
  const usingTemplateFlow = Boolean(requestedTemplateId);

  let courseLevel = getText(resolvedFormData, "course_level");
  const startMonthInput = getText(resolvedFormData, "start_month");
  const durationMonthsInput = getText(resolvedFormData, "duration_months");
  const startDateInput = getText(resolvedFormData, "start_date");
  let modalityKey = normalizeModalityKey(getText(resolvedFormData, "modality_key"));
  let startTime = getText(resolvedFormData, "start_time");
  let endTime = getText(resolvedFormData, "end_time");
  let durationMonths = toPositiveInt(durationMonthsInput, 4);
  let classDurationMinutesSnapshot = null;
  let syncedTemplateId = "";

  if (usingTemplateFlow) {
    const safeTemplateId = String(requestedTemplateId || "").trim();
    let templateColumns = [
      "id",
      "course_level",
      "frequency",
      "course_duration_months",
      "class_duration_minutes",
    ];
    let template = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase
        .from("course_templates")
        .select(templateColumns.join(","))
        .eq("id", safeTemplateId)
        .maybeSingle();
      if (!result.error) {
        template = result.data || null;
        break;
      }
      const missingColumn = getMissingColumnFromError(result.error);
      if (!missingColumn || !templateColumns.includes(missingColumn)) {
        return { error: result.error.message || "No se pudo cargar la plantilla seleccionada." };
      }
      templateColumns = templateColumns.filter((column) => column !== missingColumn);
    }

    if (!template?.id) {
      return { error: "Selecciona una plantilla valida." };
    }

    courseLevel = String(template.course_level || "").trim();
    modalityKey = normalizeTemplateFrequency(template.frequency);
    syncedTemplateId = String(template.id || "").trim();
    if (!modalityKey) {
      return { error: "La plantilla tiene una frecuencia invalida." };
    }

    if (!startTime) {
      return { error: "La hora de inicio es obligatoria." };
    }
    const startMinutes = parseTimeToMinutes(startTime);
    if (startMinutes == null) {
      return { error: "La hora de inicio es invalida." };
    }

    classDurationMinutesSnapshot = toPositiveInt(
      template.class_duration_minutes || getClassDurationMinutesFromFrequency(modalityKey),
      getClassDurationMinutesFromFrequency(modalityKey)
    );
    endTime = formatMinutesToTime(startMinutes + classDurationMinutesSnapshot);
    durationMonths = toPositiveInt(
      template.course_duration_months || getFrequencyDurationMonths(modalityKey),
      Math.max(1, getFrequencyDurationMonths(modalityKey) || 1)
    );
  }

  if (!STUDENT_LEVELS.includes(courseLevel)) {
    return { error: "Selecciona un curso valido." };
  }
  const modality = getModalityDefinition(modalityKey);
  if (!modality) {
    return { error: "Selecciona una modalidad valida." };
  }

  const startMonthDate = parseMonthInput(startMonthInput) || parseDateOnly(startDateInput);
  if (!startMonthDate) {
    return { error: "El mes de inicio es obligatorio." };
  }

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return { error: "La hora de fin debe ser mayor a la hora de inicio." };
  }

  const normalizedFrequency = normalizeTemplateFrequency(modalityKey);
  const monthStartValue = formatDateOnly(startMonthDate);
  const generatedRows = normalizedFrequency
    ? buildFrequencySessionDrafts({
        frequency: normalizedFrequency,
        startMonth: monthStartValue,
        durationMonths,
        startTime,
        endTime,
        status: "scheduled",
      })
    : [];

  if (normalizedFrequency && !generatedRows.length) {
    return { error: "No se pudieron calcular sesiones para esta frecuencia." };
  }

  const firstSessionDate = generatedRows[0]?.session_date || monthStartValue;
  const lastSessionDate = generatedRows[generatedRows.length - 1]?.session_date || monthStartValue;

  const payload = {
    course_level: courseLevel,
    start_date: firstSessionDate,
    end_date: lastSessionDate,
    modality_key: modalityKey,
    days_of_week: modality.days,
    start_time: startTime,
    end_time: endTime,
    start_month: monthStartValue,
    duration_months: durationMonths,
  };
  if (usingTemplateFlow && syncedTemplateId) {
    payload.template_id = syncedTemplateId;
    payload.template_frequency_snapshot = modalityKey;
    payload.template_course_duration_months_snapshot = durationMonths;
    payload.template_class_duration_minutes_snapshot =
      classDurationMinutesSnapshot || getClassDurationMinutesFromFrequency(modalityKey);
  }

  let commissionId = id || null;
  if (id) {
    const error = await updateCommissionRowWithMissingColumnFallback(supabase, id, payload);
    if (error) {
      const message = String(error.message || "");
      if (message.toLowerCase().includes("start_month") || message.toLowerCase().includes("duration_months")) {
        return { error: "Faltan columnas start_month/duration_months en course_commissions. Ejecuta el SQL actualizado." };
      }
      return { error: error.message || "No se pudo actualizar la comision." };
    }
  } else {
    let createdId;
    try {
      createdId = await createCommissionWithRetry(supabase, courseLevel, {
        ...payload,
        is_active: true,
        status: "active",
      });
    } catch (error) {
      const message = String(error?.message || "");
      if (message.toLowerCase().includes("start_month") || message.toLowerCase().includes("duration_months")) {
        return { error: "Faltan columnas start_month/duration_months en course_commissions. Ejecuta el SQL actualizado." };
      }
      return { error: message || "No se pudo crear la comision." };
    }
    commissionId = createdId;
  }

  let regeneration = null;
  if (usingTemplateFlow && syncedTemplateId) {
    const sessionPayloadForSync = {
      id: commissionId,
      ...payload,
      template_id: syncedTemplateId,
    };
    regeneration = await syncCommissionFromTemplate(supabase, sessionPayloadForSync, {
      templateId: syncedTemplateId,
    });
  } else {
    regeneration = await regenerateCommissionSessions(supabase, {
      ...payload,
      id: commissionId,
      template_id: null,
    });
  }
  if (regeneration.error) {
    return { error: regeneration.error };
  }

  revalidatePath("/admin");
  revalidateCommissionAdminPaths();
  revalidatePath("/app/curso");
  if (regeneration.missingTable) {
    return { success: true, message: "Comision guardada. Falta crear la tabla course_sessions." };
  }
  return {
    success: true,
    message: `Comision guardada. ${regeneration.count || 0} clases sincronizadas.`,
  };
}

export async function setCommissionActive(formData) {
  const supabase = await requireAdmin();
  const id = formData.get("commissionId")?.toString();
  const isActive = formData.get("isActive")?.toString() === "true";
  if (!id) {
    return { error: "Comision invalida." };
  }

  const client = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
  const statusValue = isActive ? "active" : "inactive";
  let { error } = await client
    .from("course_commissions")
    .update({ status: statusValue, is_active: isActive })
    .eq("id", id);

  if (error) {
    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn === "status") {
      const fallbackResult = await client.from("course_commissions").update({ is_active: isActive }).eq("id", id);
      error = fallbackResult.error;
    }
  }
  if (error) {
    return { error: error.message || "No se pudo actualizar el estado de la comision." };
  }
  revalidatePath("/admin");
  revalidateCommissionAdminPaths();
  revalidatePath("/app/curso");
  revalidatePath("/app/matricula");
  revalidatePath("/app");
  revalidatePath("/app/ruta-academica");
  return { success: true };
}

export async function deleteCommission(formData) {
  const supabase = await requireAdmin();
  const id = formData.get("commissionId")?.toString();
  if (!id) {
    return { error: "Comision invalida." };
  }

  const client = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
  const { error: detachError } = await client
    .from("profiles")
    .update({ commission_id: null, commission_assigned_at: null, modality_key: null })
    .eq("commission_id", id);
  if (detachError) {
    return { error: detachError.message || "No se pudieron liberar alumnos." };
  }

  const { error } = await client.from("course_commissions").delete().eq("id", id);
  if (error) {
    return { error: error.message || "No se pudo eliminar la comision." };
  }

  revalidatePath("/admin");
  revalidateCommissionAdminPaths();
  revalidatePath("/app/curso");
  revalidatePath("/app/matricula");
  return { success: true };
}

function normalizeSessionItemType(value) {
  const raw = value?.toString().trim().toLowerCase();
  const allowed = new Set(["file", "exercise", "recording", "live_link", "link", "note", "slides", "video", "flashcards"]);
  return allowed.has(raw) ? raw : "note";
}

const FLASHCARD_LIBRARY_SELECT =
  "id, word, meaning, image_url, cefr_level, theme_tag, accepted_answers, audio_url, audio_r2_key, audio_provider, voice_id, elevenlabs_config";

const FLASHCARD_DECK_SELECT =
  "id, title, description, cover_image_url, source_type, cefr_level, theme_tag, is_system, is_active, metadata, created_at, updated_at";

function buildFlashcardsSchemaError(error) {
  const message = String(error?.message || "");
  const missingTable = getMissingTableName(error);
  if (missingTable === "flashcards" || missingTable?.endsWith(".flashcards")) {
    return "Falta crear la tabla flashcards. Ejecuta el SQL actualizado de biblioteca central.";
  }
  const missingColumn = getMissingColumnFromError(error);
  if (missingColumn === "flashcard_id") {
    return "Actualiza el SQL de flashcards: falta la columna flashcard_id en las tablas de asignacion.";
  }
  if (missingColumn === "cefr_level" || missingColumn === "theme_tag") {
    return "Actualiza el SQL de flashcards: faltan las columnas nuevas de nivel y tema.";
  }
  if (/null value in column\s+"?(word|meaning|image_url)"?/i.test(message)) {
    return "Actualiza el SQL de flashcards: las tablas de asignacion aun requieren contenido embebido.";
  }
  return null;
}

async function ensureFlashcardLibraryReference(supabase, row) {
  const requestedId = String(row?.flashcardId || "").trim();
  if (requestedId) {
    const existingResult = await supabase
      .from("flashcards")
      .select(FLASHCARD_LIBRARY_SELECT)
      .eq("id", requestedId)
      .maybeSingle();

    if (existingResult.error) {
      return { error: buildFlashcardsSchemaError(existingResult.error) || existingResult.error.message || "No se pudo validar la flashcard." };
    }

    if (!existingResult.data?.id) {
      return { error: "Una de las flashcards seleccionadas ya no existe en la biblioteca." };
    }

    return { card: mapLibraryFlashcardRow(existingResult.data) };
  }

  if (!row?.word || !row?.meaning || !row?.image) {
    return { error: "Cada flashcard legacy debe incluir word, meaning e image para migrarse a la biblioteca." };
  }

  const reuseResult = await supabase
    .from("flashcards")
    .select(FLASHCARD_LIBRARY_SELECT)
    .eq("word", row.word)
    .eq("meaning", row.meaning)
    .eq("image_url", row.image)
    .limit(1)
    .maybeSingle();

  if (reuseResult.error) {
    return { error: buildFlashcardsSchemaError(reuseResult.error) || reuseResult.error.message || "No se pudo consultar la biblioteca de flashcards." };
  }

  if (reuseResult.data?.id) {
    return { card: mapLibraryFlashcardRow(reuseResult.data) };
  }

  const insertResult = await supabase
    .from("flashcards")
    .insert({
      word: row.word,
      meaning: row.meaning,
      image_url: row.image,
      accepted_answers: Array.isArray(row.acceptedAnswers) ? row.acceptedAnswers : [],
      audio_url: row.audioUrl || null,
      audio_r2_key: row.audioR2Key || null,
      audio_provider: row.audioProvider || "elevenlabs",
      voice_id: row.voiceId || null,
      elevenlabs_config: row.elevenLabsConfig || null,
      updated_at: new Date().toISOString(),
    })
    .select(FLASHCARD_LIBRARY_SELECT)
    .maybeSingle();

  if (insertResult.error) {
    return { error: buildFlashcardsSchemaError(insertResult.error) || insertResult.error.message || "No se pudo migrar una flashcard legacy a la biblioteca." };
  }

  return { card: mapLibraryFlashcardRow(insertResult.data) };
}

async function replaceAssignedFlashcards({
  supabase,
  tableName,
  ownerColumn,
  ownerId,
  rows,
}) {
  if (!rows.length) {
    const deleteResult = await supabase.from(tableName).delete().eq(ownerColumn, ownerId);
    if (deleteResult.error) {
      return {
        error:
          buildFlashcardsSchemaError(deleteResult.error) ||
          deleteResult.error.message ||
          "No se pudieron limpiar las flashcards previas.",
      };
    }
    return { cards: [] };
  }

  const existingRowsResult = await supabase
    .from(tableName)
    .select("id")
    .eq(ownerColumn, ownerId);
  if (existingRowsResult.error) {
    return {
      error:
        buildFlashcardsSchemaError(existingRowsResult.error) ||
        existingRowsResult.error.message ||
        "No se pudieron validar las flashcards actuales.",
    };
  }

  const insertRows = [];
  const savedCards = [];

  for (const [index, row] of rows.entries()) {
    const referenceResult = await ensureFlashcardLibraryReference(supabase, row);
    if (referenceResult.error) {
      return { error: referenceResult.error };
    }

    const libraryCard = referenceResult.card;
    insertRows.push({
      [ownerColumn]: ownerId,
      flashcard_id: libraryCard.id,
      card_order: index + 1,
      updated_at: new Date().toISOString(),
    });
    savedCards.push({
      ...libraryCard,
      order: index + 1,
      legacyId: "",
    });
  }

  const insertResult = await supabase.from(tableName).insert(insertRows);
  if (insertResult.error) {
    return {
      error:
        buildFlashcardsSchemaError(insertResult.error) ||
        insertResult.error.message ||
        "No se pudieron guardar las referencias de flashcards.",
    };
  }

  const existingIds = (existingRowsResult.data || [])
    .map((row) => String(row?.id || "").trim())
    .filter(Boolean);
  if (existingIds.length) {
    const deleteResult = await supabase.from(tableName).delete().in("id", existingIds);
    if (deleteResult.error) {
      return {
        error:
          deleteResult.error.message ||
          "Se insertaron nuevas referencias, pero no se pudieron limpiar las anteriores.",
      };
    }
  }

  return { cards: savedCards };
}

function normalizeLinkSource(value) {
  const raw = value?.toString().trim().toLowerCase();
  return raw === "auto" ? "auto" : "manual";
}

export async function saveSessionFlashcardsBatch(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibieron datos de flashcards.", cards: null };
  }

  const supabase = await requireAdmin();
  const sessionId = getText(formData, "sessionId");
  const commissionId = getText(formData, "commissionId");
  const materialTitle = getText(formData, "materialTitle") || "Flashcards";

  if (!sessionId) {
    return { success: false, error: "Sesion invalida.", cards: null };
  }

  let rows = [];
  try {
    rows = parseFlashcardsBatch(getText(formData, "batchJson") || "[]");
  } catch (error) {
    return { success: false, error: error?.message || "No se pudo leer el lote de flashcards.", cards: null };
  }

  const { data: session, error: sessionError } = await supabase
    .from("course_sessions")
    .select("id, commission_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session?.id) {
    return { success: false, error: sessionError?.message || "No se encontro la clase.", cards: null };
  }

  if (commissionId && String(session.commission_id || "") !== commissionId) {
    return { success: false, error: "La clase no pertenece a la comision indicada.", cards: null };
  }

  if (!rows.length) {
    const deleteCardsResult = await supabase.from("session_flashcards").delete().eq("session_id", sessionId);
    if (deleteCardsResult.error) {
      const missingTable = getMissingTableName(deleteCardsResult.error);
      if (missingTable?.endsWith("session_flashcards")) {
        return { success: false, error: "Falta crear la tabla session_flashcards. Ejecuta el SQL actualizado.", cards: null };
      }
      return { success: false, error: deleteCardsResult.error.message || "No se pudieron eliminar las flashcards.", cards: null };
    }

    const deleteItemResult = await supabase
      .from("session_items")
      .delete()
      .eq("session_id", sessionId)
      .eq("type", "flashcards");

    if (deleteItemResult.error) {
      return { success: false, error: deleteItemResult.error.message || "No se pudo limpiar el material flashcards.", cards: null };
    }

    revalidateCommissionAdminPaths();
    if (commissionId) {
      revalidatePath(`/admin/commissions/${commissionId}`);
      revalidatePath(`/admin/commissions/${commissionId}/sessions/${sessionId}/flashcards`);
    }
    revalidatePath("/app/curso");
    return {
      success: true,
      message: "Material de flashcards eliminado.",
      cards: [],
      materialTitle: "Flashcards",
    };
  }

  const flashcardsItemResult = await supabase
    .from("session_items")
    .select("id, title")
    .eq("session_id", sessionId)
    .eq("type", "flashcards")
    .order("created_at", { ascending: true });

  if (flashcardsItemResult.error) {
    return { success: false, error: flashcardsItemResult.error.message || "No se pudo validar el material flashcards.", cards: null };
  }

  const existingFlashcardsItem = (flashcardsItemResult.data || [])[0] || null;
  const materialPayload = {
    session_id: sessionId,
    type: "flashcards",
    title: materialTitle,
    url: null,
    storage_key: null,
    note: "flashcards",
    updated_at: new Date().toISOString(),
  };

  if (existingFlashcardsItem?.id) {
    const updateMaterialResult = await supabase
      .from("session_items")
      .update(materialPayload)
      .eq("id", existingFlashcardsItem.id);

    if (updateMaterialResult.error) {
      return { success: false, error: updateMaterialResult.error.message || "No se pudo actualizar el material flashcards.", cards: null };
    }
  } else {
    const insertMaterialResult = await supabase.from("session_items").insert(materialPayload);

    if (insertMaterialResult.error) {
      if (String(insertMaterialResult.error.message || "").toLowerCase().includes("session_items_type_check")) {
        return { success: false, error: "Actualiza el SQL: session_items.type debe permitir 'flashcards'.", cards: null };
      }
      return { success: false, error: insertMaterialResult.error.message || "No se pudo crear el material flashcards.", cards: null };
    }
  }

  const replaceResult = await replaceAssignedFlashcards({
    supabase,
    tableName: "session_flashcards",
    ownerColumn: "session_id",
    ownerId: sessionId,
    rows,
  });
  if (replaceResult.error) {
    return { success: false, error: replaceResult.error, cards: null };
  }

  revalidateCommissionAdminPaths();
  if (commissionId) {
    revalidatePath(`/admin/commissions/${commissionId}`);
    revalidatePath(`/admin/commissions/${commissionId}/sessions/${sessionId}/flashcards`);
  }
  revalidatePath("/app/curso");

  return {
    success: true,
    message: `Flashcards guardadas (${replaceResult.cards.length}).`,
    cards: replaceResult.cards,
    materialTitle,
  };
}

export async function saveTemplateSessionFlashcardsBatch(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibieron datos de flashcards.", cards: null };
  }

  const supabase = await requireAdmin();
  const templateSessionId = getText(formData, "templateSessionId");
  const templateId = getText(formData, "templateId");
  const materialTitle = getText(formData, "materialTitle") || "Flashcards";

  if (!templateSessionId) {
    return { success: false, error: "Sesion de plantilla invalida.", cards: null };
  }

  let rows = [];
  try {
    rows = parseFlashcardsBatch(getText(formData, "batchJson") || "[]");
  } catch (error) {
    return { success: false, error: error?.message || "No se pudo leer el lote de flashcards.", cards: null };
  }

  const { data: session, error: sessionError } = await supabase
    .from("template_sessions")
    .select("id, template_id")
    .eq("id", templateSessionId)
    .maybeSingle();

  if (sessionError || !session?.id) {
    return { success: false, error: sessionError?.message || "No se encontro la clase de plantilla.", cards: null };
  }

  if (templateId && String(session.template_id || "") !== templateId) {
    return { success: false, error: "La clase no pertenece a la plantilla indicada.", cards: null };
  }
  const resolvedTemplateId = templateId || String(session.template_id || "").trim();

  if (!rows.length) {
    const deleteCardsResult = await supabase
      .from("template_session_flashcards")
      .delete()
      .eq("template_session_id", templateSessionId);

    if (deleteCardsResult.error) {
      const missingTable = getMissingTableName(deleteCardsResult.error);
      if (missingTable?.endsWith("template_session_flashcards")) {
        return {
          success: false,
          error: "Falta crear la tabla template_session_flashcards. Ejecuta el SQL actualizado.",
          cards: null,
        };
      }
      return {
        success: false,
        error: deleteCardsResult.error.message || "No se pudieron eliminar las flashcards de plantilla.",
        cards: null,
      };
    }

    const deleteItemResult = await supabase
      .from("template_session_items")
      .delete()
      .eq("template_session_id", templateSessionId)
      .eq("type", "flashcards");

    if (deleteItemResult.error) {
      return {
        success: false,
        error: deleteItemResult.error.message || "No se pudo limpiar el material flashcards de plantilla.",
        cards: null,
      };
    }

    const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, resolvedTemplateId);
    if (syncError) {
      return { success: false, error: syncError, cards: null };
    }
    revalidateTemplateAdminPaths(resolvedTemplateId);
    if (resolvedTemplateId) {
      revalidatePath(`/admin/courses/templates/${resolvedTemplateId}/sessions/${templateSessionId}/flashcards`);
    }
    return {
      success: true,
      message: "Material de flashcards eliminado.",
      cards: [],
      materialTitle: "Flashcards",
    };
  }

  const flashcardsItemResult = await supabase
    .from("template_session_items")
    .select("id, title")
    .eq("template_session_id", templateSessionId)
    .eq("type", "flashcards")
    .order("created_at", { ascending: true });

  if (flashcardsItemResult.error) {
    return {
      success: false,
      error: flashcardsItemResult.error.message || "No se pudo validar el material flashcards de plantilla.",
      cards: null,
    };
  }

  const existingFlashcardsItem = (flashcardsItemResult.data || [])[0] || null;
  const materialPayload = {
    template_session_id: templateSessionId,
    type: "flashcards",
    title: materialTitle,
    url: INTERNAL_FLASHCARDS_URL,
    exercise_id: null,
  };

  if (existingFlashcardsItem?.id) {
    const updateMaterialResult = await supabase
      .from("template_session_items")
      .update(materialPayload)
      .eq("id", existingFlashcardsItem.id);

    if (updateMaterialResult.error) {
      return {
        success: false,
        error: updateMaterialResult.error.message || "No se pudo actualizar el material flashcards de plantilla.",
        cards: null,
      };
    }
  } else {
    const insertMaterialResult = await supabase.from("template_session_items").insert(materialPayload);

    if (insertMaterialResult.error) {
      if (String(insertMaterialResult.error.message || "").toLowerCase().includes("template_session_items_type_check")) {
        return {
          success: false,
          error: "Actualiza el SQL: template_session_items.type debe permitir 'flashcards'.",
          cards: null,
        };
      }
      return {
        success: false,
        error: insertMaterialResult.error.message || "No se pudo crear el material flashcards de plantilla.",
        cards: null,
      };
    }
  }

  const replaceResult = await replaceAssignedFlashcards({
    supabase,
    tableName: "template_session_flashcards",
    ownerColumn: "template_session_id",
    ownerId: templateSessionId,
    rows,
  });
  if (replaceResult.error) {
    return { success: false, error: replaceResult.error, cards: null };
  }

  const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, resolvedTemplateId);
  if (syncError) {
    return { success: false, error: syncError, cards: null };
  }
  revalidateTemplateAdminPaths(resolvedTemplateId);
  if (resolvedTemplateId) {
    revalidatePath(`/admin/courses/templates/${resolvedTemplateId}/sessions/${templateSessionId}/flashcards`);
  }

  return {
    success: true,
    message: `Flashcards guardadas (${replaceResult.cards.length}).`,
    cards: replaceResult.cards,
    materialTitle,
  };
}

export async function upsertFlashcardLibraryEntry(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibieron datos de la flashcard.", flashcard: null };
  }

  const supabase = await requireAdmin();
  const flashcardId = getText(formData, "flashcardId");
  const word = getText(formData, "word");
  const meaning = getText(formData, "meaning");
  const image = getText(formData, "image");
  const cefrLevel = normalizeStudentCefrLevel(getText(formData, "cefrLevel"));
  const themeTag = normalizeStudentThemeTag(getText(formData, "themeTag"));
  const audioUrl = getText(formData, "audioUrl");
  const audioProvider = getText(formData, "audioProvider") || "elevenlabs";
  const voiceId = getText(formData, "voiceId");
  const acceptedAnswers = Array.from(
    new Set(
      [word, ...getText(formData, "acceptedAnswers").split(/[\r\n,|]+/)]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  if (!word || !meaning || !image) {
    return {
      success: false,
      error: "Word, meaning e image son obligatorios.",
      flashcard: null,
    };
  }

  let elevenLabsConfig = null;
  const elevenLabsConfigText = getText(formData, "elevenLabsConfig");
  if (elevenLabsConfigText) {
    try {
      const parsed = JSON.parse(elevenLabsConfigText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { success: false, error: "elevenLabsConfig debe ser un objeto JSON.", flashcard: null };
      }
      elevenLabsConfig = parsed;
    } catch {
      return { success: false, error: "elevenLabsConfig no es JSON valido.", flashcard: null };
    }
  }

  const payload = {
    word,
    meaning,
    image_url: image,
    cefr_level: cefrLevel || null,
    theme_tag: themeTag || null,
    accepted_answers: acceptedAnswers,
    audio_url: audioUrl || null,
    audio_r2_key: getText(formData, "audioR2Key") || null,
    audio_provider: audioProvider || "elevenlabs",
    voice_id: voiceId || null,
    elevenlabs_config: elevenLabsConfig,
    updated_at: new Date().toISOString(),
  };

  const result = flashcardId
    ? await supabase
        .from("flashcards")
        .update(payload)
        .eq("id", flashcardId)
        .select(FLASHCARD_LIBRARY_SELECT)
        .maybeSingle()
    : await supabase
        .from("flashcards")
        .insert(payload)
        .select(FLASHCARD_LIBRARY_SELECT)
        .maybeSingle();

  if (result.error) {
    return {
      success: false,
      error: buildFlashcardsSchemaError(result.error) || result.error.message || "No se pudo guardar la flashcard.",
      flashcard: null,
    };
  }

  revalidatePath("/admin/flashcards");
  revalidatePath("/admin/commissions");
  revalidatePath("/admin/courses/templates");
  revalidatePath("/app/curso");

  return {
    success: true,
    message: flashcardId ? "Flashcard actualizada." : "Flashcard creada.",
    flashcard: mapLibraryFlashcardRow(result.data),
  };
}

export async function deleteFlashcardLibraryEntry(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibio la flashcard a eliminar." };
  }

  const supabase = await requireAdmin();
  const flashcardId = getText(formData, "flashcardId");
  if (!flashcardId) {
    return { success: false, error: "Flashcard invalida." };
  }

  const usageChecks = await Promise.all([
    supabase.from("session_flashcards").select("id", { count: "exact", head: true }).eq("flashcard_id", flashcardId),
    supabase
      .from("template_session_flashcards")
      .select("id", { count: "exact", head: true })
      .eq("flashcard_id", flashcardId),
  ]);

  const usageError = usageChecks.find((result) => result.error)?.error || null;
  if (usageError) {
    return {
      success: false,
      error: buildFlashcardsSchemaError(usageError) || usageError.message || "No se pudo validar el uso de la flashcard.",
    };
  }

  const usageCount = usageChecks.reduce((total, result) => total + Number(result.count || 0), 0);
  if (usageCount > 0) {
    return {
      success: false,
      error: "No se puede eliminar una flashcard que sigue asignada en clases o plantillas.",
    };
  }

  const deleteResult = await supabase.from("flashcards").delete().eq("id", flashcardId);
  if (deleteResult.error) {
    return {
      success: false,
      error: buildFlashcardsSchemaError(deleteResult.error) || deleteResult.error.message || "No se pudo eliminar la flashcard.",
    };
  }

  revalidatePath("/admin/flashcards");
  revalidatePath("/admin/commissions");
  revalidatePath("/admin/courses/templates");
  revalidatePath("/app/curso");

  return { success: true, message: "Flashcard eliminada." };
}

export async function upsertFlashcardDeck(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibieron datos del deck.", deck: null };
  }

  const supabase = await requireAdmin();
  const deckId = getText(formData, "deckId");
  const title = getText(formData, "title");
  const description = getText(formData, "description");
  const coverImageUrl = getText(formData, "coverImageUrl");
  const cefrLevel = normalizeStudentCefrLevel(getText(formData, "cefrLevel"));
  const themeTag = normalizeStudentThemeTag(getText(formData, "themeTag"));
  const isActive = getText(formData, "isActive") !== "false";

  let cardIds = [];
  try {
    const parsed = JSON.parse(getText(formData, "cardIdsJson") || "[]");
    cardIds = Array.from(
      new Set(
        (Array.isArray(parsed) ? parsed : [])
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  } catch {
    return { success: false, error: "La seleccion de flashcards del deck no es valida.", deck: null };
  }

  if (!title) {
    return { success: false, error: "El titulo del deck es obligatorio.", deck: null };
  }

  if (!cefrLevel) {
    return { success: false, error: "Selecciona un nivel CEFR para el deck.", deck: null };
  }

  if (!cardIds.length) {
    return { success: false, error: "Selecciona al menos una flashcard para el deck.", deck: null };
  }

  const { data: cards, error: cardsError } = await supabase
    .from("flashcards")
    .select("id, word, meaning, image_url, cefr_level, theme_tag")
    .in("id", cardIds);

  if (cardsError) {
    return {
      success: false,
      error: buildFlashcardsSchemaError(cardsError) || cardsError.message || "No se pudo validar la biblioteca del deck.",
      deck: null,
    };
  }

  if ((cards || []).length !== cardIds.length) {
    return { success: false, error: "Algunas flashcards seleccionadas ya no existen.", deck: null };
  }

  const payload = {
    title,
    description: description || null,
    cover_image_url: coverImageUrl || null,
    source_type: "system",
    cefr_level: cefrLevel,
    theme_tag: themeTag || null,
    is_system: true,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  };

  const deckResult = deckId
    ? await supabase
        .from("flashcard_decks")
        .update(payload)
        .eq("id", deckId)
        .eq("is_system", true)
        .select(FLASHCARD_DECK_SELECT)
        .maybeSingle()
    : await supabase
        .from("flashcard_decks")
        .insert(payload)
        .select(FLASHCARD_DECK_SELECT)
        .maybeSingle();

  if (deckResult.error || !deckResult.data?.id) {
    return {
      success: false,
      error: deckResult.error?.message || "No se pudo guardar el deck.",
      deck: null,
    };
  }

  const savedDeckId = String(deckResult.data.id || "").trim();
  const deleteItemsResult = await supabase.from("flashcard_deck_items").delete().eq("deck_id", savedDeckId);
  if (deleteItemsResult.error) {
    return {
      success: false,
      error: deleteItemsResult.error.message || "No se pudo actualizar el contenido del deck.",
      deck: null,
    };
  }

  const insertItemsResult = await supabase
    .from("flashcard_deck_items")
    .insert(
      cardIds.map((flashcardId, index) => ({
        deck_id: savedDeckId,
        flashcard_id: flashcardId,
        position: index + 1,
      }))
    );

  if (insertItemsResult.error) {
    return {
      success: false,
      error: insertItemsResult.error.message || "No se pudieron guardar las flashcards del deck.",
      deck: null,
    };
  }

  const cardsById = buildFlashcardLibraryMap(cards || []);
  revalidatePath("/admin/flashcards");
  revalidatePath("/app/practice");
  revalidatePath("/app/flashcards");

  return {
    success: true,
    message: deckId ? "Deck actualizado." : "Deck creado.",
    deck: {
      id: savedDeckId,
      title: deckResult.data.title || "Deck",
      description: deckResult.data.description || "",
      coverImageUrl: deckResult.data.cover_image_url || "",
      cefrLevel: deckResult.data.cefr_level || "",
      themeTag: deckResult.data.theme_tag || "",
      sourceType: deckResult.data.source_type || "system",
      isActive: deckResult.data.is_active !== false,
      cardIds,
      cards: cardIds
        .map((flashcardId) => cardsById.get(flashcardId))
        .filter(Boolean),
      totalCards: cardIds.length,
    },
  };
}

export async function deleteFlashcardDeck(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibio el deck a eliminar." };
  }

  const supabase = await requireAdmin();
  const deckId = getText(formData, "deckId");
  if (!deckId) {
    return { success: false, error: "Deck invalido." };
  }

  const deckResult = await supabase
    .from("flashcard_decks")
    .select("id, is_system")
    .eq("id", deckId)
    .maybeSingle();

  if (deckResult.error) {
    return { success: false, error: deckResult.error.message || "No se pudo validar el deck." };
  }

  if (!deckResult.data?.id || deckResult.data.is_system !== true) {
    return { success: false, error: "Solo se pueden eliminar decks del sistema desde esta vista." };
  }

  const deleteResult = await supabase.from("flashcard_decks").delete().eq("id", deckId);
  if (deleteResult.error) {
    return { success: false, error: deleteResult.error.message || "No se pudo eliminar el deck." };
  }

  revalidatePath("/admin/flashcards");
  revalidatePath("/app/practice");
  revalidatePath("/app/flashcards");

  return { success: true, message: "Deck eliminado." };
}

export async function upsertExerciseLibraryEntry(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibieron datos del ejercicio.", exercise: null };
  }

  try {
    const supabase = await requireAdmin();
    const actorId = await getAdminActorId(supabase);
    const exerciseId = getText(formData, "exerciseId");
    const requestedType = normalizeExerciseType(getText(formData, "type"));
    const requestedSkill = normalizeExerciseLibrarySkill(getText(formData, "skillTag"), "grammar");
    const requestedLevel = normalizeExerciseLibraryLevel(getText(formData, "cefrLevel"), "A1");
    const contentInput = getText(formData, "contentJson");

    if (!requestedType) {
      return { success: false, error: "Tipo de ejercicio invalido.", exercise: null };
    }

    let contentJson = getDefaultExerciseContent(requestedType);
    if (contentInput) {
      try {
        const parsed = JSON.parse(contentInput);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return { success: false, error: "contentJson debe ser un objeto JSON valido.", exercise: null };
        }
        contentJson = parsed;
      } catch {
        return { success: false, error: "contentJson debe ser JSON valido.", exercise: null };
      }
    }

    const category = await resolveExerciseCategory(supabase, {
      categoryId: getText(formData, "categoryId"),
      categoryName: getText(formData, "newCategoryName") || getText(formData, "categoryName"),
      skillTag: requestedSkill,
      cefrLevel: requestedLevel,
    });

    let existingExercise = null;
    if (exerciseId) {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, lesson_id, revision")
        .eq("id", exerciseId)
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message || "No se pudo validar el ejercicio.", exercise: null };
      }
      if (!data?.id) {
        return { success: false, error: "El ejercicio ya no existe.", exercise: null };
      }
      existingExercise = data;
    }

    const lessonId = existingExercise?.lesson_id || await ensureExerciseLibraryLessonId(supabase);
    const revision = existingExercise ? Number(existingExercise.revision || 0) + 1 : 1;
    const publishable = isPublishableExercise({
      type: requestedType,
      contentJson,
    });
    const computedTitle = getExerciseDisplayTitle(
      requestedType,
      contentJson,
      getText(formData, "title")
    );

    const payload = publishable.publishable
      ? await prepareExercisePayload({
        input: {
          lesson_id: lessonId,
          type: requestedType,
          skill_tag: requestedSkill,
          status: "published",
          content_json: contentJson,
          ordering: 1,
          revision,
        },
        actorId,
        db: supabase,
        forcePublishValidation: true,
      })
      : {
        lesson_id: lessonId,
        type: requestedType,
        skill_tag: requestedSkill,
        kind: LEGACY_KIND_BY_TYPE[requestedType] || "multiple_choice",
        status: "published",
        prompt: deriveExercisePrompt(requestedType, contentJson),
        payload: contentJson,
        content_json: contentJson,
        ordering: 1,
        revision,
        updated_at: new Date().toISOString(),
        updated_by: actorId || null,
        last_editor: actorId || null,
        published_at: new Date().toISOString(),
      };

    const nowIso = new Date().toISOString();
    let persistedExerciseId = exerciseId;
    let mutationError = null;

    if (existingExercise?.id) {
      const result = await supabase
        .from("exercises")
        .update({
          ...payload,
          title: normalizeExerciseLibraryTitle(computedTitle),
          skill_tag: requestedSkill,
          cefr_level: requestedLevel,
          category_id: category?.id || null,
          updated_at: nowIso,
        })
        .eq("id", existingExercise.id);
      mutationError = result.error || null;
    } else {
      const { data: insertedExercise, error: insertError } = await supabase
        .from("exercises")
        .insert({
          ...payload,
          title: normalizeExerciseLibraryTitle(computedTitle),
          skill_tag: requestedSkill,
          cefr_level: requestedLevel,
          category_id: category?.id || null,
          created_by: actorId,
          created_at: nowIso,
        })
        .select("id")
        .maybeSingle();
      mutationError = insertError || null;
      persistedExerciseId = insertedExercise?.id || "";
    }

    if (mutationError || !persistedExerciseId) {
      return {
        success: false,
        error: mutationError?.message || "No se pudo guardar el ejercicio en la biblioteca.",
        exercise: null,
      };
    }

    const exercise = await loadExerciseLibraryEntryById(supabase, persistedExerciseId);

    revalidatePath("/admin/exercises");
    revalidatePath("/admin/commissions");
    revalidatePath("/admin/courses/templates");
    revalidatePath("/app/curso");

    return {
      success: true,
      message: exerciseId
        ? "Ejercicio actualizado en la biblioteca."
        : "Ejercicio creado en la biblioteca.",
      exercise,
      category,
    };
  } catch (error) {
    return { success: false, error: error?.message || "No se pudo guardar el ejercicio.", exercise: null };
  }
}

export async function duplicateExerciseLibraryEntry(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibió el ejercicio a duplicar.", exercise: null };
  }

  try {
    const supabase = await requireAdmin();
    const actorId = await getAdminActorId(supabase);
    const exerciseId = getText(formData, "exerciseId");
    if (!exerciseId) {
      return { success: false, error: "Ejercicio invalido.", exercise: null };
    }

    const { data: sourceExercise, error: sourceError } = await supabase
      .from("exercises")
      .select("id, title, type, skill_tag, cefr_level, category_id, content_json")
      .eq("id", exerciseId)
      .maybeSingle();

    if (sourceError) {
      return { success: false, error: sourceError.message || "No se pudo cargar el ejercicio.", exercise: null };
    }
    if (!sourceExercise?.id) {
      return { success: false, error: "El ejercicio ya no existe.", exercise: null };
    }

    const lessonId = await ensureExerciseLibraryLessonId(supabase);
    const payload = await prepareExercisePayload({
      input: {
        lesson_id: lessonId,
        type: sourceExercise.type,
        skill_tag: sourceExercise.skill_tag,
        status: "published",
        content_json: sourceExercise.content_json || {},
        ordering: 1,
        revision: 1,
      },
      actorId,
      db: supabase,
      forcePublishValidation: true,
    });

    const nowIso = new Date().toISOString();
    const duplicateTitle = `${normalizeExerciseLibraryTitle(sourceExercise.title || "Exercise")} (Copy)`;
    const { data: insertedExercise, error: insertError } = await supabase
      .from("exercises")
      .insert({
        ...payload,
        title: duplicateTitle,
        skill_tag: normalizeExerciseLibrarySkill(sourceExercise.skill_tag, "grammar"),
        cefr_level: normalizeExerciseLibraryLevel(sourceExercise.cefr_level, "A1"),
        category_id: sourceExercise.category_id,
        created_by: actorId,
        created_at: nowIso,
      })
      .select("id")
      .maybeSingle();

    if (insertError || !insertedExercise?.id) {
      return { success: false, error: insertError?.message || "No se pudo duplicar el ejercicio.", exercise: null };
    }

    const exercise = await loadExerciseLibraryEntryById(supabase, insertedExercise.id);

    revalidatePath("/admin/exercises");
    revalidatePath("/admin/commissions");
    revalidatePath("/admin/courses/templates");
    revalidatePath("/app/curso");

    return {
      success: true,
      message: "Se creó una copia en la biblioteca.",
      exercise,
    };
  } catch (error) {
    return { success: false, error: error?.message || "No se pudo duplicar el ejercicio.", exercise: null };
  }
}

export async function deleteExerciseLibraryEntry(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibió el ejercicio a eliminar." };
  }

  try {
    const supabase = await requireAdmin();
    const exerciseId = getText(formData, "exerciseId");
    if (!exerciseId) {
      return { success: false, error: "Ejercicio invalido." };
    }

    const usageChecks = await Promise.all([
      supabase.from("session_items").select("id", { count: "exact", head: true }).eq("exercise_id", exerciseId),
      supabase
        .from("template_session_items")
        .select("id", { count: "exact", head: true })
        .eq("exercise_id", exerciseId),
      supabase.from("user_progress").select("id", { count: "exact", head: true }).eq("exercise_id", exerciseId),
    ]);

    const usageError = usageChecks.find((result) => result.error)?.error || null;
    if (usageError) {
      return {
        success: false,
        error: usageError.message || "No se pudo validar el uso del ejercicio.",
      };
    }

    const usageCount = usageChecks.reduce((total, result) => total + Number(result.count || 0), 0);
    if (usageCount > 0) {
      return {
        success: false,
        error: "No se puede eliminar un ejercicio que sigue asignado o tiene historial de alumnos.",
      };
    }

    const { error: deleteError } = await supabase.from("exercises").delete().eq("id", exerciseId);
    if (deleteError) {
      return { success: false, error: deleteError.message || "No se pudo eliminar el ejercicio." };
    }

    revalidatePath("/admin/exercises");
    revalidatePath("/admin/commissions");
    revalidatePath("/admin/courses/templates");
    revalidatePath("/app/curso");

    return { success: true, message: "Ejercicio eliminado de la biblioteca." };
  } catch (error) {
    return { success: false, error: error?.message || "No se pudo eliminar el ejercicio." };
  }
}

export async function upsertCourseTemplate(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de plantilla." };
  }

  const supabase = await requireAdmin();
  const templateId = getText(formData, "templateId") || null;
  const requestedCourseLevel = getText(formData, "courseLevel").toUpperCase();
  const requestedFrequency = normalizeTemplateFrequency(getText(formData, "frequency"));
  const templateNameInput = getText(formData, "templateName");
  let resolvedCourseLevel = requestedCourseLevel;
  let resolvedFrequency = requestedFrequency;

  let resolvedTemplateId = templateId;
  if (templateId) {
    const { data: existingTemplate, error: existingTemplateError } = await supabase
      .from("course_templates")
      .select("id, course_level, frequency, template_name")
      .eq("id", templateId)
      .maybeSingle();

    if (existingTemplateError || !existingTemplate?.id) {
      const missingTable = getMissingTableName(existingTemplateError);
      if (missingTable?.endsWith("course_templates")) {
        return { error: "Falta crear la tabla course_templates. Ejecuta SQL actualizado." };
      }
      return { error: "No se encontro la plantilla a editar." };
    }

    resolvedCourseLevel = existingTemplate.course_level;
    resolvedFrequency = normalizeTemplateFrequency(existingTemplate.frequency);
    if (!resolvedFrequency) {
      return { error: "La plantilla tiene una frecuencia invalida." };
    }

    if (requestedCourseLevel && requestedCourseLevel !== resolvedCourseLevel) {
      return { error: "No se puede cambiar el nivel de una plantilla existente." };
    }
    if (requestedFrequency && requestedFrequency !== resolvedFrequency) {
      return { error: "No se puede cambiar la frecuencia de una plantilla existente." };
    }

    const templateName = templateNameInput || existingTemplate.template_name || `${resolvedCourseLevel} - ${resolvedFrequency}`;
    const { error } = await supabase
      .from("course_templates")
      .update({ template_name: templateName })
      .eq("id", templateId);

    if (error) {
      const missingTable = getMissingTableName(error);
      if (missingTable?.endsWith("course_templates")) {
        return { error: "Falta crear la tabla course_templates. Ejecuta SQL actualizado." };
      }
      return { error: error.message || "No se pudo actualizar la plantilla." };
    }
  } else {
    if (!STUDENT_LEVELS.includes(requestedCourseLevel)) {
      return { error: "Selecciona un nivel valido." };
    }
    if (!requestedFrequency) {
      return { error: "Selecciona una frecuencia valida." };
    }
    resolvedCourseLevel = requestedCourseLevel;
    resolvedFrequency = requestedFrequency;

    const templateName = templateNameInput || `${resolvedCourseLevel} - ${resolvedFrequency}`;
    const { data, error } = await supabase
      .from("course_templates")
      .insert({
        course_level: resolvedCourseLevel,
        frequency: resolvedFrequency,
        template_name: templateName,
      })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) {
      const missingTable = getMissingTableName(error);
      if (missingTable?.endsWith("course_templates")) {
        return { error: "Falta crear la tabla course_templates. Ejecuta SQL actualizado." };
      }
      if (error?.code === "23505") {
        return { error: "Ya existe una plantilla para ese nivel y frecuencia." };
      }
      return { error: error?.message || "No se pudo crear la plantilla." };
    }
    resolvedTemplateId = data.id;
  }

  const skeletonResult = await ensureTemplateSessionSkeleton(supabase, resolvedTemplateId, resolvedFrequency);
  if (skeletonResult.error) {
    return { error: skeletonResult.error };
  }
  if (skeletonResult.missingTable) {
    return { error: "Falta crear la tabla template_sessions. Ejecuta SQL actualizado." };
  }

  const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, resolvedTemplateId);
  if (syncError) {
    return { error: syncError };
  }

  revalidateTemplateAdminPaths(resolvedTemplateId);
  return {
    success: true,
    templateId: resolvedTemplateId,
    message: "Plantilla guardada.",
  };
}

export async function deleteCourseTemplate(formData) {
  const supabase = await requireAdmin();
  const templateId = getText(formData, "templateId");
  if (!templateId) return { error: "Plantilla invalida." };

  let exerciseIds = [];
  try {
    const { data: sessionsRows, error: sessionsLookupError } = await supabase
      .from("template_sessions")
      .select("id")
      .eq("template_id", templateId);
    if (sessionsLookupError) {
      const missingTable = getMissingTableName(sessionsLookupError);
      if (!missingTable?.endsWith("template_sessions")) {
        return { error: sessionsLookupError.message || "No se pudieron validar sesiones de plantilla." };
      }
    }
    exerciseIds = await collectTemplateExerciseIdsBySessionIds(
      supabase,
      (sessionsRows || []).map((row) => row.id)
    );
  } catch (error) {
    return { error: error?.message || "No se pudieron validar ejercicios de la plantilla." };
  }

  const { error } = await supabase.from("course_templates").delete().eq("id", templateId);
  if (error) {
    const missingTable = getMissingTableName(error);
    if (missingTable?.endsWith("course_templates")) {
      return { error: "Falta crear la tabla course_templates. Ejecuta SQL actualizado." };
    }
    return { error: error.message || "No se pudo eliminar la plantilla." };
  }

  if (exerciseIds.length) {
    const actorId = await getAdminActorId(supabase);
    await archiveExercisesIfOrphaned({
      db: supabase,
      exerciseIds,
      actorId,
      ignoreLessonReference: true,
    });
    await runExerciseGarbageCollection({ db: supabase, actorId });
  }

  {
    let updatePayload = { template_id: null };
    while (true) {
      const { error: detachTemplateError } = await supabase
        .from("course_commissions")
        .update(updatePayload)
        .eq("template_id", templateId);
      if (!detachTemplateError) break;
      const missingColumn = getMissingColumnFromError(detachTemplateError);
      if (missingColumn && Object.prototype.hasOwnProperty.call(updatePayload, missingColumn)) {
        delete updatePayload[missingColumn];
        continue;
      }
      break;
    }
  }

  revalidateTemplateAdminPaths();
  return { success: true };
}

export async function upsertTemplateClass(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de clase de plantilla." };
  }

  const supabase = await requireAdmin();
  const templateSessionId = getText(formData, "templateSessionId");
  const templateId = getText(formData, "templateId");
  const title = getText(formData, "title");
  const classSlideUrl = getText(formData, "classSlideUrl");
  const classSlideTitle = getText(formData, "classSlideTitle");
  const additionalSlidesRaw =
    getText(formData, "additionalSlidesInput") || getText(formData, "additionalSlidesJson");

  if (!templateSessionId || !title) {
    return { error: "Completa el titulo de la clase." };
  }

  let additionalSlides = [];
  try {
    additionalSlides = parseAdditionalSlidesJson(additionalSlidesRaw || "[]");
  } catch (error) {
    return { error: error?.message || "Slides adicionales invalidos." };
  }

  const removeItemIds = new Set(getTextArray(formData, "removeItemId").filter(Boolean));
  const itemIds = getTextArray(formData, "itemId");
  const itemTypes = getTextArray(formData, "itemType");
  const itemTitles = getTextArray(formData, "itemTitle");
  const itemUrls = getTextArray(formData, "itemUrl");

  const updateRows = [];
  const deleteIds = [];
  for (let idx = 0; idx < itemIds.length; idx += 1) {
    const itemId = itemIds[idx];
    if (!itemId) continue;

    if (removeItemIds.has(itemId)) {
      deleteIds.push(itemId);
      continue;
    }

    const itemTitle = itemTitles[idx] || "";
    const itemUrl = itemUrls[idx] || "";
    if (!itemTitle || !itemUrl) {
      return { error: "Cada material existente debe tener titulo y URL, o marcarse para eliminar." };
    }

    updateRows.push({
      id: itemId,
      payload: {
        type: normalizeTemplateItemType(itemTypes[idx]),
        title: itemTitle,
        url: itemUrl,
      },
    });
  }

  const newItemTypes = getTextArray(formData, "newItemType");
  const newItemTitles = getTextArray(formData, "newItemTitle");
  const newItemUrls = getTextArray(formData, "newItemUrl");
  const maxNewItems = Math.max(newItemTypes.length, newItemTitles.length, newItemUrls.length);
  const insertRows = [];
  for (let idx = 0; idx < maxNewItems; idx += 1) {
    const rawType = newItemTypes[idx] || "";
    const rawTitle = newItemTitles[idx] || "";
    const rawUrl = newItemUrls[idx] || "";
    const hasTitleOrUrl = Boolean(rawTitle || rawUrl);
    if (!hasTitleOrUrl) continue;
    if (!rawTitle || !rawUrl) {
      return { error: "Para agregar material, completa titulo y URL." };
    }
    insertRows.push({
      template_session_id: templateSessionId,
      type: normalizeTemplateItemType(rawType),
      title: rawTitle,
      url: rawUrl,
    });
  }

  const { error: updateSessionError } = await supabase
    .from("template_sessions")
    .update({
      title,
      class_slide_url: classSlideUrl || null,
      class_slide_title: classSlideTitle || null,
      additional_slides: additionalSlides,
    })
    .eq("id", templateSessionId);
  if (updateSessionError) {
    const missingTable = getMissingTableName(updateSessionError);
    if (missingTable?.endsWith("template_sessions")) {
      return { error: "Falta crear la tabla template_sessions. Ejecuta SQL actualizado." };
    }
    return { error: updateSessionError.message || "No se pudo guardar la clase de plantilla." };
  }

  if (deleteIds.length) {
    const deletedExerciseIds = await collectTemplateExerciseIdsBySessionIds(supabase, [templateSessionId]);
    const { error: deleteItemsError } = await supabase
      .from("template_session_items")
      .delete()
      .eq("template_session_id", templateSessionId)
      .in("id", deleteIds);
    if (deleteItemsError) {
      const missingTable = getMissingTableName(deleteItemsError);
      if (missingTable?.endsWith("template_session_items")) {
        return { error: "Falta crear la tabla template_session_items. Ejecuta SQL actualizado." };
      }
      return { error: deleteItemsError.message || "No se pudieron eliminar materiales de plantilla." };
    }
    if (deletedExerciseIds.length) {
      const actorId = await getAdminActorId(supabase);
      await archiveExercisesIfOrphaned({
        db: supabase,
        exerciseIds: deletedExerciseIds,
        actorId,
        ignoreLessonReference: true,
      });
    }
  }

  for (const row of updateRows) {
    const { error: updateItemError } = await supabase
      .from("template_session_items")
      .update(row.payload)
      .eq("id", row.id)
      .eq("template_session_id", templateSessionId);
    if (updateItemError) {
      const missingTable = getMissingTableName(updateItemError);
      if (missingTable?.endsWith("template_session_items")) {
        return { error: "Falta crear la tabla template_session_items. Ejecuta SQL actualizado." };
      }
      return { error: updateItemError.message || "No se pudo actualizar materiales de plantilla." };
    }
  }

  if (insertRows.length) {
    const { error: insertItemsError } = await supabase.from("template_session_items").insert(insertRows);
    if (insertItemsError) {
      const missingTable = getMissingTableName(insertItemsError);
      if (missingTable?.endsWith("template_session_items")) {
        return { error: "Falta crear la tabla template_session_items. Ejecuta SQL actualizado." };
      }
      return { error: insertItemsError.message || "No se pudo agregar materiales de plantilla." };
    }
  }

  const resolvedTemplateId = await resolveTemplateIdFromTemplateSession(
    supabase,
    templateSessionId,
    templateId
  );

  const actorId = await getAdminActorId(supabase);
  await runExerciseGarbageCollection({ db: supabase, actorId });
  const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, resolvedTemplateId);
  if (syncError) {
    return { error: syncError };
  }
  revalidateTemplateAdminPaths(resolvedTemplateId);
  return { success: true };
}

export async function upsertTemplateSession(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de sesion de plantilla." };
  }

  const supabase = await requireAdmin();
  const templateSessionId = getText(formData, "templateSessionId");
  const templateId = getText(formData, "templateId") || null;
  const title = getText(formData, "title");
  const classSlideUrl = getText(formData, "classSlideUrl");
  const classSlideTitle = getText(formData, "classSlideTitle");
  const additionalSlidesRaw =
    getText(formData, "additionalSlidesInput") || getText(formData, "additionalSlidesJson");
  if (!templateSessionId || !title) {
    return { error: "Completa el titulo de la sesion." };
  }

  let additionalSlides = [];
  try {
    additionalSlides = parseAdditionalSlidesJson(additionalSlidesRaw || "[]");
  } catch (error) {
    return { error: error?.message || "Slides adicionales invalidos." };
  }

  const { error } = await supabase
    .from("template_sessions")
    .update({
      title,
      class_slide_url: classSlideUrl || null,
      class_slide_title: classSlideTitle || null,
      additional_slides: additionalSlides,
    })
    .eq("id", templateSessionId);
  if (error) {
    const missingTable = getMissingTableName(error);
    if (missingTable?.endsWith("template_sessions")) {
      return { error: "Falta crear la tabla template_sessions. Ejecuta SQL actualizado." };
    }
    const missingColumn = getMissingColumnFromError(error);
    if (
      missingColumn === "class_slide_url" ||
      missingColumn === "class_slide_title" ||
      missingColumn === "additional_slides"
    ) {
      return { error: "Falta actualizar template_sessions con campos de slide principal. Ejecuta SQL actualizado." };
    }
    return { error: error.message || "No se pudo actualizar la sesion de plantilla." };
  }

  const resolvedTemplateId = await resolveTemplateIdFromTemplateSession(
    supabase,
    templateSessionId,
    templateId
  );
  const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, resolvedTemplateId);
  if (syncError) {
    return { error: syncError };
  }
  revalidateTemplateAdminPaths(resolvedTemplateId);
  return { success: true };
}

export async function upsertTemplateSessionItem(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de material." };
  }

  const supabase = await requireAdmin();
  const itemId = getText(formData, "itemId") || null;
  const templateSessionId = getText(formData, "templateSessionId");
  const templateId = getText(formData, "templateId") || null;
  const type = normalizeTemplateItemType(getText(formData, "type"));
  const requestedTitle = getText(formData, "title");
  const requestedUrl = getText(formData, "url");
  const exerciseId = getText(formData, "exerciseId");

  if (!templateSessionId) {
    return { error: "Clase de plantilla inválida." };
  }

  let previousExerciseId = null;
  if (itemId) {
    const { data: existingItem, error: existingItemError } = await supabase
      .from("template_session_items")
      .select("id, type, exercise_id")
      .eq("id", itemId)
      .maybeSingle();

    if (existingItemError) {
      const missingColumn = getMissingColumnFromError(existingItemError);
      if (missingColumn !== "exercise_id") {
        return { error: existingItemError.message || "No se pudo validar material previo." };
      }
    } else {
      previousExerciseId = String(existingItem?.exercise_id || "").trim() || null;
    }
  }

  let payload = {
    template_session_id: templateSessionId,
    type,
    title: requestedTitle,
    url: requestedUrl,
    exercise_id: null,
  };

  if (type === "exercise") {
    if (!exerciseId) {
      return { error: "Selecciona un ejercicio para asignar a la clase." };
    }

    const { data: exercise, error: exerciseError } = await supabase
      .from("exercises")
      .select("id, lesson_id, type, prompt, status")
      .eq("id", exerciseId)
      .maybeSingle();

    if (exerciseError) {
      return { error: exerciseError.message || "No se pudo validar el ejercicio seleccionado." };
    }
    if (!exercise?.id) {
      return { error: "El ejercicio seleccionado no existe." };
    }
    if (String(exercise.status || "").trim().toLowerCase() === "deleted") {
      return { error: "El ejercicio seleccionado está eliminado y no se puede asignar." };
    }

    const normalizedExerciseStatus = String(exercise.status || "").trim().toLowerCase();
    if (normalizedExerciseStatus !== "published") {
      const nowIso = new Date().toISOString();
      const { error: publishExerciseError } = await supabase
        .from("exercises")
        .update({
          status: "published",
          published_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", exercise.id);
      if (publishExerciseError) {
        return { error: publishExerciseError.message || "No se pudo publicar el ejercicio seleccionado." };
      }
    }

    if (exercise.lesson_id) {
      const { data: lessonRow, error: lessonLookupError } = await supabase
        .from("lessons")
        .select("id, status")
        .eq("id", exercise.lesson_id)
        .maybeSingle();
      if (lessonLookupError) {
        return { error: lessonLookupError.message || "No se pudo validar la leccion del ejercicio." };
      }
      if (lessonRow?.id && String(lessonRow.status || "").trim().toLowerCase() !== "published") {
        const { error: publishLessonError } = await supabase
          .from("lessons")
          .update({ status: "published", updated_at: new Date().toISOString() })
          .eq("id", lessonRow.id);
        if (publishLessonError) {
          return { error: publishLessonError.message || "No se pudo publicar la leccion del ejercicio." };
        }
      }
    }

    const title = requestedTitle || exercise.prompt || `Ejercicio ${exercise.type || ""}`.trim();
    payload = {
      template_session_id: templateSessionId,
      type,
      title,
      url: buildPracticeExerciseUrl(exercise.id, exercise.lesson_id),
      exercise_id: exercise.id,
    };
  } else {
    if (!requestedTitle || !requestedUrl) {
      return { error: "Completa titulo y URL del material." };
    }
    payload = {
      template_session_id: templateSessionId,
      type,
      title: requestedTitle,
      url: requestedUrl,
      exercise_id: null,
    };
  }

  let result;
  if (itemId) {
    result = await supabase.from("template_session_items").update(payload).eq("id", itemId);
  } else {
    result = await supabase.from("template_session_items").insert(payload);
  }
  if (result.error) {
    const missingTable = getMissingTableName(result.error);
    if (missingTable?.endsWith("template_session_items")) {
      return { error: "Falta crear la tabla template_session_items. Ejecuta SQL actualizado." };
    }
    const missingColumn = getMissingColumnFromError(result.error);
    if (missingColumn === "exercise_id") {
      return { error: "Falta la columna exercise_id en template_session_items. Ejecuta SQL actualizado." };
    }
    return { error: result.error.message || "No se pudo guardar el material de plantilla." };
  }

  const nextExerciseId = type === "exercise" ? String(payload.exercise_id || "").trim() : "";
  if (previousExerciseId && previousExerciseId !== nextExerciseId) {
    const actorId = await getAdminActorId(supabase);
    await archiveExercisesIfOrphaned({
      db: supabase,
      exerciseIds: [previousExerciseId],
      actorId,
      ignoreLessonReference: true,
    });
    await runExerciseGarbageCollection({ db: supabase, actorId });
  }

  const resolvedTemplateId = await resolveTemplateIdFromTemplateSession(
    supabase,
    templateSessionId,
    templateId
  );
  const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, resolvedTemplateId);
  if (syncError) {
    return { error: syncError };
  }
  revalidateTemplateAdminPaths(resolvedTemplateId);
  return { success: true };
}

export async function createTemplateSessionExercise(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos del ejercicio." };
  }

  try {
    const supabase = await requireAdmin();
    const templateSessionId = getText(formData, "templateSessionId");
    const requestedTemplateId = getText(formData, "templateId");
    const requestedLessonId = getText(formData, "lessonId");
    const requestedType = normalizeExerciseType(getText(formData, "type"));
    const requestedSkillTag = normalizeExerciseSkillTag(
      getText(formData, "skillTag") || getText(formData, "skill_tag"),
      requestedType
    );
    const requestedStatus = normalizeExerciseStatus(getText(formData, "status"));
    const requestedTitle = getText(formData, "title");
    const contentInput = getText(formData, "contentJson");

    if (!templateSessionId) {
      return { error: "Clase de plantilla inválida." };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: templateSession, error: templateSessionError } = await supabase
      .from("template_sessions")
      .select("id, template_id, title")
      .eq("id", templateSessionId)
      .maybeSingle();

    if (templateSessionError || !templateSession?.id) {
      const missingTable = getMissingTableName(templateSessionError);
      if (missingTable?.endsWith("template_sessions")) {
        return { error: "Falta crear la tabla template_sessions. Ejecuta SQL actualizado." };
      }
      return { error: templateSessionError?.message || "No se encontró la clase de plantilla." };
    }

    const templateId = requestedTemplateId || templateSession.template_id;
    if (!templateId) {
      return { error: "No se pudo resolver la plantilla para crear ejercicio." };
    }

    let lessonId = requestedLessonId;
    if (lessonId) {
      const { data: lesson, error: lessonError } = await supabase
        .from("lessons")
        .select("id, status")
        .eq("id", lessonId)
        .maybeSingle();
      if (lessonError) {
        return { error: lessonError.message || "No se pudo validar la lección seleccionada." };
      }
      if (!lesson?.id) {
        return { error: "La lección seleccionada no existe." };
      }
      if (
        requestedStatus === "published" &&
        String(lesson.status || "").trim().toLowerCase() !== "published"
      ) {
        const { error: publishLessonError } = await supabase
          .from("lessons")
          .update({ status: "published", updated_at: new Date().toISOString() })
          .eq("id", lesson.id);
        if (publishLessonError) {
          return { error: publishLessonError.message || "No se pudo publicar la lección seleccionada." };
        }
      }
    } else {
      lessonId = await ensureTemplateSessionLessonId(supabase, {
        templateId,
        templateSessionId,
        title: templateSession.title,
      });
    }

    let contentJson = getDefaultExerciseContent(requestedType);
    if (contentInput) {
      try {
        const parsed = JSON.parse(contentInput);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return { error: "contentJson debe ser un objeto JSON válido." };
        }
        contentJson = parsed;
      } catch {
        return { error: "contentJson debe ser JSON válido." };
      }
    }

    const payload = await prepareExercisePayload({
      input: {
        lesson_id: lessonId,
        type: requestedType,
        skill_tag: requestedSkillTag,
        status: requestedStatus,
        content_json: contentJson,
        ordering: 1,
      },
      actorId: user?.id || null,
      db: supabase,
      forcePublishValidation: true,
    });

    const nowIso = new Date().toISOString();
    const { data: insertedExercise, error: insertExerciseError } = await supabase
      .from("exercises")
      .insert({
        ...payload,
        created_by: user?.id || null,
        created_at: nowIso,
      })
      .select("id, lesson_id, type, prompt")
      .maybeSingle();

    if (insertExerciseError || !insertedExercise?.id) {
      return { error: insertExerciseError?.message || "No se pudo crear el ejercicio." };
    }

    const itemTitle = requestedTitle || insertedExercise.prompt || `Ejercicio ${insertedExercise.type || ""}`.trim();
    const { error: insertItemError } = await supabase
      .from("template_session_items")
      .insert({
        template_session_id: templateSessionId,
        type: "exercise",
        title: itemTitle,
        url: buildPracticeExerciseUrl(insertedExercise.id, insertedExercise.lesson_id),
        exercise_id: insertedExercise.id,
      });

    if (insertItemError) {
      const missingTable = getMissingTableName(insertItemError);
      if (missingTable?.endsWith("template_session_items")) {
        return { error: "Falta crear la tabla template_session_items. Ejecuta SQL actualizado." };
      }
      const missingColumn = getMissingColumnFromError(insertItemError);
      if (missingColumn === "exercise_id") {
        return { error: "Falta la columna exercise_id en template_session_items. Ejecuta SQL actualizado." };
      }
      return { error: insertItemError.message || "No se pudo asignar el ejercicio a la clase." };
    }

    const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, templateId);
    if (syncError) {
      return { error: syncError };
    }
    revalidateTemplateAdminPaths(templateId);
    return { success: true, exerciseId: insertedExercise.id };
  } catch (error) {
    return { error: error?.message || "No se pudo crear el ejercicio de plantilla." };
  }
}

async function saveExerciseBatchForContainer({
  supabase,
  rows,
  lessonId,
  title,
  containerType,
  containerId,
  existingItems,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const existingItemMap = new Map(
    (existingItems || []).map((item) => [String(item?.id || "").trim(), item])
  );
  const requestedExerciseIds = Array.from(
    new Set(safeRows.map((row) => String(row?.exerciseId || "").trim()).filter(Boolean))
  );

  const existingExerciseMap = new Map();
  if (requestedExerciseIds.length) {
    const { data: exerciseRows, error: exercisesError } = await supabase
      .from("exercises")
      .select("id, status")
      .in("id", requestedExerciseIds);
    if (exercisesError) {
      throw new Error(exercisesError.message || "No se pudieron cargar ejercicios de la biblioteca.");
    }
    (exerciseRows || []).forEach((exercise) => {
      existingExerciseMap.set(String(exercise.id), exercise);
    });
  }

  const keptItemIds = new Set();
  let created = 0;
  let updated = 0;
  const publishedExerciseIds = new Set();
  const persistedAssignments = [];

  for (let index = 0; index < safeRows.length; index += 1) {
    const row = safeRows[index] || {};
    const savedExerciseId = String(row.exerciseId || "").trim();
    const currentExercise = existingExerciseMap.get(savedExerciseId) || null;
    if (!savedExerciseId || !currentExercise?.id) {
      throw new Error(`Ejercicio ${index + 1}: el ejercicio seleccionado ya no existe.`);
    }

    const exerciseStatus = String(currentExercise.status || "").trim().toLowerCase();
    if (exerciseStatus === "archived" || exerciseStatus === "deleted") {
      throw new Error(`Ejercicio ${index + 1}: el ejercicio esta archivado o eliminado.`);
    }

    if (exerciseStatus !== "published" && !publishedExerciseIds.has(savedExerciseId)) {
      const { error: publishExerciseError } = await supabase
        .from("exercises")
        .update({
          status: "published",
          updated_at: new Date().toISOString(),
        })
        .eq("id", savedExerciseId);
      if (publishExerciseError) {
        throw new Error(publishExerciseError.message || `No se pudo publicar el ejercicio ${index + 1}.`);
      }
      publishedExerciseIds.add(savedExerciseId);
    }

    const pointValue = normalizeExerciseItemPoints(
      row.points ?? row.exercisePoints ?? row.pointValue,
      10
    );
    const exerciseOrder = toPositiveInt(
      row.order ?? row.exerciseOrder ?? index + 1,
      index + 1
    );

    const itemPayload = containerType === "template"
      ? {
        template_session_id: containerId,
        type: "exercise",
        title,
        url: buildPracticeExerciseUrl(savedExerciseId, lessonId),
        exercise_id: savedExerciseId,
        exercise_points: pointValue,
        exercise_order: exerciseOrder,
      }
      : {
        session_id: containerId,
        type: "exercise",
        title,
        url: buildPracticeExerciseUrl(savedExerciseId, lessonId),
        exercise_id: savedExerciseId,
        exercise_points: pointValue,
        exercise_order: exerciseOrder,
        note: null,
        updated_at: new Date().toISOString(),
      };

    const existingItemId = String(row.itemId || "").trim();
    const previousItem = existingItemMap.get(existingItemId) || null;
    let persistedItemId = existingItemId;

    if (previousItem?.id) {
      const tableName = containerType === "template" ? "template_session_items" : "session_items";
      const { error: updateItemError } = await supabase.from(tableName).update(itemPayload).eq("id", previousItem.id);
      if (updateItemError) {
        const missingColumn = getMissingColumnFromError(updateItemError);
        if (missingColumn === "exercise_id" || missingColumn === "exercise_points" || missingColumn === "exercise_order") {
          throw new Error(
            containerType === "template"
              ? "Faltan columnas de referencia de ejercicios en template_session_items. Ejecuta SQL actualizado."
              : "Faltan columnas de referencia de ejercicios en session_items. Ejecuta SQL actualizado."
          );
        }
        throw new Error(updateItemError.message || `No se pudo actualizar el item ${index + 1}.`);
      }
      updated += 1;
    } else {
      const tableName = containerType === "template" ? "template_session_items" : "session_items";
      const { data: insertedItem, error: insertItemError } = await supabase
        .from(tableName)
        .insert(itemPayload)
        .select("id")
        .maybeSingle();
      if (insertItemError || !insertedItem?.id) {
        const missingColumn = getMissingColumnFromError(insertItemError);
        if (missingColumn === "exercise_id" || missingColumn === "exercise_points" || missingColumn === "exercise_order") {
          throw new Error(
            containerType === "template"
              ? "Faltan columnas de referencia de ejercicios en template_session_items. Ejecuta SQL actualizado."
              : "Faltan columnas de referencia de ejercicios en session_items. Ejecuta SQL actualizado."
          );
        }
        throw new Error(insertItemError?.message || `No se pudo crear el item ${index + 1}.`);
      }
      persistedItemId = insertedItem.id;
      created += 1;
    }

    if (persistedItemId) {
      keptItemIds.add(persistedItemId);
      persistedAssignments.push({
        itemId: String(persistedItemId || "").trim(),
        exerciseId: savedExerciseId,
        points: pointValue,
        order: exerciseOrder,
      });
    }
  }

  const removedItems = (existingItems || []).filter((item) => !keptItemIds.has(String(item?.id || "").trim()));
  if (removedItems.length) {
    const tableName = containerType === "template" ? "template_session_items" : "session_items";
    const removedIds = removedItems.map((item) => item.id);
    const { error: deleteItemsError } = await supabase.from(tableName).delete().in("id", removedIds);
    if (deleteItemsError) {
      throw new Error(deleteItemsError.message || "No se pudieron quitar ejercicios eliminados de la prueba.");
    }
  }

  return {
    created,
    updated,
    persistedAssignments: sortSavedExerciseAssignmentRows(
      persistedAssignments.map((row) => ({
        ...row,
        exercise_order: row.order,
        created_at: "",
      }))
    ).map((row) => ({
      itemId: row.itemId,
      exerciseId: row.exerciseId,
      points: row.points,
      order: Number(row.exercise_order || 0),
    })),
  };
}

export async function saveTemplateSessionExerciseBatch(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de la prueba." };
  }

  try {
    const supabase = await requireAdmin();
    const templateId = getText(formData, "templateId");
    const templateSessionId = getText(formData, "templateSessionId");
    const quizTitle = normalizeQuizTitleValue(getText(formData, "quizTitle"));
    const rows = parseExerciseBatchRows(getText(formData, "batchJson"));

    if (!templateId || !templateSessionId) {
      return { error: "Clase de plantilla invalida." };
    }
    if (!rows.length) {
      return { error: "Agrega al menos un ejercicio para crear la prueba." };
    }

    const { data: templateSession, error: templateSessionError } = await supabase
      .from("template_sessions")
      .select("id, template_id, title")
      .eq("id", templateSessionId)
      .maybeSingle();

    if (templateSessionError || !templateSession?.id) {
      const missingTable = getMissingTableName(templateSessionError);
      if (missingTable?.endsWith("template_sessions")) {
        return { error: "Falta crear la tabla template_sessions. Ejecuta SQL actualizado." };
      }
      return { error: templateSessionError?.message || "No se encontró la clase de plantilla." };
    }

    const lessonId = await ensureTemplateSessionLessonId(supabase, {
      templateId: templateId || templateSession.template_id,
      templateSessionId,
      title: templateSession.title,
    });

    let existingItemsResult = await supabase
      .from("template_session_items")
      .select("id, exercise_id")
      .eq("template_session_id", templateSessionId)
      .eq("type", "exercise")
      .order("created_at", { ascending: true });

    if (existingItemsResult.error) {
      const missingTable = getMissingTableName(existingItemsResult.error);
      if (missingTable?.endsWith("template_session_items")) {
        return { error: "Falta crear la tabla template_session_items. Ejecuta SQL actualizado." };
      }
      const missingColumn = getMissingColumnFromError(existingItemsResult.error);
      if (missingColumn === "exercise_id") {
        return { error: "Falta la columna exercise_id en template_session_items. Ejecuta SQL actualizado." };
      }
      return { error: existingItemsResult.error.message || "No se pudieron cargar ejercicios de la clase." };
    }

    const result = await saveExerciseBatchForContainer({
      supabase,
      rows,
      lessonId,
      title: quizTitle,
      containerType: "template",
      containerId: templateSessionId,
      existingItems: existingItemsResult.data || [],
    });

    const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, templateId);
    if (syncError) {
      return { error: syncError };
    }

    revalidateTemplateAdminPaths(templateId);
    revalidatePath(`/admin/courses/templates/${templateId}/sessions/${templateSessionId}/exercises`);

    return {
      success: true,
      created: result.created,
      persistedAssignments: result.persistedAssignments || [],
      quizTitle,
      savedAt: new Date().toISOString(),
      message:
        result.created > 0 && result.updated > 0
          ? `Prueba guardada. ${result.created} referencia(s) nuevas y ${result.updated} actualizadas.`
          : result.created > 0
            ? `Prueba guardada. ${result.created} referencia(s) agregadas.`
            : `Prueba actualizada. ${result.updated} referencia(s) editadas.`,
    };
  } catch (error) {
    return { error: error?.message || "No se pudo guardar la prueba de la clase." };
  }
}

export async function syncTemplateLinkedCommissionsAction(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { success: false, error: "No se recibieron datos para sincronizar comisiones." };
  }

  const supabase = await requireAdmin();
  const templateId = getText(formData, "templateId");
  if (!templateId) {
    return { success: false, error: "Plantilla invalida para sincronizar comisiones." };
  }

  const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, templateId);
  if (syncError) {
    return { success: false, error: syncError };
  }

  revalidateCommissionAdminPaths();
  revalidatePath("/app/curso");
  return { success: true };
}

export async function createTemplateSessionExerciseBatch(prevState, maybeFormData) {
  return saveTemplateSessionExerciseBatch(prevState, maybeFormData);
}

export async function saveCourseSessionExerciseBatch(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de la prueba." };
  }

  try {
    const supabase = await requireAdmin();
    const commissionId = getText(formData, "commissionId");
    const courseSessionId = getText(formData, "courseSessionId");
    const quizTitle = normalizeQuizTitleValue(getText(formData, "quizTitle"));
    const rows = parseExerciseBatchRows(getText(formData, "batchJson"));

    if (!commissionId || !courseSessionId) {
      return { error: "Clase de comision invalida." };
    }
    if (!rows.length) {
      return { error: "Agrega al menos un ejercicio para crear la prueba." };
    }

    const { data: session, error: sessionError } = await supabase
      .from("course_sessions")
      .select("id, commission_id, day_label")
      .eq("id", courseSessionId)
      .eq("commission_id", commissionId)
      .maybeSingle();

    if (sessionError || !session?.id) {
      return { error: sessionError?.message || "No se encontró la clase de la comision." };
    }

    const lessonId = await ensureCourseSessionLessonId(supabase, {
      commissionId,
      courseSessionId,
      title: session.day_label,
    });

    const { data: existingItems, error: existingItemsError } = await supabase
      .from("session_items")
      .select("id, exercise_id")
      .eq("session_id", courseSessionId)
      .eq("type", "exercise")
      .order("created_at", { ascending: true });

    if (existingItemsError) {
      const missingColumn = getMissingColumnFromError(existingItemsError);
      if (missingColumn === "exercise_id") {
        return { error: "Falta la columna exercise_id en session_items. Ejecuta SQL actualizado." };
      }
      return { error: existingItemsError.message || "No se pudieron cargar ejercicios de la clase." };
    }

    const result = await saveExerciseBatchForContainer({
      supabase,
      rows,
      lessonId,
      title: quizTitle,
      containerType: "commission",
      containerId: courseSessionId,
      existingItems: existingItems || [],
    });

    revalidateCommissionAdminPaths();
    revalidatePath(`/admin/commissions/${commissionId}`);
    revalidatePath(`/admin/commissions/${commissionId}/sessions/${courseSessionId}/exercises`);
    revalidatePath("/app/curso");

    return {
      success: true,
      created: result.created,
      persistedAssignments: result.persistedAssignments || [],
      quizTitle,
      savedAt: new Date().toISOString(),
      message:
        result.created > 0 && result.updated > 0
          ? `Prueba guardada. ${result.created} referencia(s) nuevas y ${result.updated} actualizadas.`
          : result.created > 0
            ? `Prueba guardada. ${result.created} referencia(s) agregadas.`
            : `Prueba actualizada. ${result.updated} referencia(s) editadas.`,
    };
  } catch (error) {
    return { error: error?.message || "No se pudo guardar la prueba de la comision." };
  }
}

export async function deleteTemplateSessionExerciseBatch(formData) {
  const supabase = await requireAdmin();
  const templateId = getText(formData, "templateId");
  const templateSessionId = getText(formData, "templateSessionId");

  if (!templateId || !templateSessionId) {
    return { error: "Clase de plantilla invalida." };
  }

  const { data: templateSession, error: templateSessionError } = await supabase
    .from("template_sessions")
    .select("id, template_id")
    .eq("id", templateSessionId)
    .eq("template_id", templateId)
    .maybeSingle();

  if (templateSessionError || !templateSession?.id) {
    const missingTable = getMissingTableName(templateSessionError);
    if (missingTable?.endsWith("template_sessions")) {
      return { error: "Falta crear la tabla template_sessions. Ejecuta SQL actualizado." };
    }
    return { error: templateSessionError?.message || "No se encontro la clase de plantilla." };
  }

  const { error: deleteError } = await supabase
    .from("template_session_items")
    .delete()
    .eq("template_session_id", templateSession.id)
    .eq("type", "exercise");

  if (deleteError) {
    const missingTable = getMissingTableName(deleteError);
    if (missingTable?.endsWith("template_session_items")) {
      return { error: "Falta crear la tabla template_session_items. Ejecuta SQL actualizado." };
    }
    return { error: deleteError.message || "No se pudo eliminar la prueba." };
  }

  const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, templateId);
  if (syncError) {
    return { error: syncError };
  }
  revalidateTemplateAdminPaths(templateId);
  revalidatePath(`/admin/courses/templates/${templateId}/sessions/${templateSessionId}/exercises`);
  return { success: true, message: "Prueba eliminada." };
}

export async function deleteCourseSessionExerciseBatch(formData) {
  const supabase = await requireAdmin();
  const commissionId = getText(formData, "commissionId");
  const courseSessionId = getText(formData, "courseSessionId");

  if (!commissionId || !courseSessionId) {
    return { error: "Clase de comision invalida." };
  }

  const { data: session, error: sessionError } = await supabase
    .from("course_sessions")
    .select("id, commission_id")
    .eq("id", courseSessionId)
    .eq("commission_id", commissionId)
    .maybeSingle();

  if (sessionError || !session?.id) {
    return { error: sessionError?.message || "No se encontro la clase de la comision." };
  }

  const { error: deleteError } = await supabase
    .from("session_items")
    .delete()
    .eq("session_id", session.id)
    .eq("type", "exercise");

  if (deleteError) {
    return { error: deleteError.message || "No se pudo eliminar la prueba." };
  }

  revalidateCommissionAdminPaths();
  revalidatePath(`/admin/commissions/${commissionId}`);
  revalidatePath(`/admin/commissions/${commissionId}/sessions/${courseSessionId}/exercises`);
  revalidatePath("/app/curso");
  return { success: true, message: "Prueba eliminada." };
}

export async function deleteTemplateSessionItem(formData) {
  const supabase = await requireAdmin();
  const itemId = getText(formData, "itemId");
  const templateId = getText(formData, "templateId") || null;
  if (!itemId) return { error: "Material invalido." };

  const { data: itemRow, error: itemLookupError } = await supabase
    .from("template_session_items")
    .select("id, template_session_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemLookupError || !itemRow?.id) {
    return { error: itemLookupError?.message || "No se encontro el material de plantilla." };
  }

  const resolvedTemplateId = await resolveTemplateIdFromTemplateSession(
    supabase,
    itemRow.template_session_id,
    templateId
  );

  const { error } = await supabase.from("template_session_items").delete().eq("id", itemId);
  if (error) {
    return { error: error.message || "No se pudo eliminar el material." };
  }
  const syncError = await syncTemplateLinkedCommissionsAfterChange(supabase, resolvedTemplateId);
  if (syncError) {
    return { error: syncError };
  }
  revalidateTemplateAdminPaths(resolvedTemplateId);
  return { success: true };
}

export async function ensureCommissionSessions(formData) {
  const supabase = await requireAdmin();
  const commissionId = formData.get("commissionId")?.toString();
  if (!commissionId) {
    return { error: "Comision invalida." };
  }

  let commissionColumns = [
    "id",
    "template_id",
    "course_level",
    "start_date",
    "end_date",
    "start_month",
    "duration_months",
    "modality_key",
    "days_of_week",
    "start_time",
    "end_time",
  ];
  let commission = null;
  let commissionError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase
      .from("course_commissions")
      .select(commissionColumns.join(","))
      .eq("id", commissionId)
      .maybeSingle();
    commission = result.data || null;
    commissionError = result.error || null;
    if (!commissionError) break;
    const missingColumn = getMissingColumnFromError(commissionError);
    if (!missingColumn || !commissionColumns.includes(missingColumn)) break;
    commissionColumns = commissionColumns.filter((column) => column !== missingColumn);
  }

  if (commissionError || !commission) {
    const message = String(commissionError?.message || "");
    if (message.toLowerCase().includes("start_month") || message.toLowerCase().includes("duration_months")) {
      return { error: "Faltan columnas start_month/duration_months en course_commissions. Ejecuta el SQL actualizado." };
    }
    return { error: "No se encontro la comision." };
  }

  const regeneration = await regenerateCommissionSessions(supabase, commission);
  if (regeneration.error) return { error: regeneration.error };
  if (regeneration.missingTable) return { error: "Falta crear la tabla course_sessions en Supabase." };

  revalidateCommissionAdminPaths();
  revalidatePath("/app/curso");
  return {
    success: true,
    message: `Se regeneraron ${regeneration.count || 0} clases.`,
  };
}

export async function upsertCourseSessionLinks(formData) {
  const supabase = await requireAdmin();
  const sessionId = formData.get("sessionId")?.toString();
  const commissionId = formData.get("commissionId")?.toString();
  if (!sessionId) {
    return { error: "Sesion invalida." };
  }

  const recordingLinkInput = getText(formData, "recordingLink");
  const recordingPasscodeInput = getText(formData, "recordingPasscode");
  if (recordingLinkInput && !recordingPasscodeInput) {
    return { error: "Si agregas grabacion, el codigo de acceso es obligatorio." };
  }

  const existingSessionResult = await supabase
    .from("course_sessions")
    .select("id, commission_id, recording_link")
    .eq("id", sessionId)
    .maybeSingle();
  if (existingSessionResult.error || !existingSessionResult.data?.id) {
    return {
      error: existingSessionResult.error?.message || "No se encontro la sesion.",
    };
  }

  const existingSession = existingSessionResult.data;
  const previousRecordingLink = String(existingSession?.recording_link || "").trim();
  const nextRecordingLink = recordingLinkInput || null;
  const shouldTriggerRecordingEmail = !previousRecordingLink && Boolean(nextRecordingLink);
  const nowIso = new Date().toISOString();

  const payload = {
    day_label: getText(formData, "dayLabel") || null,
    live_link: getText(formData, "liveLink") || null,
    zoom_link: getText(formData, "liveLink") || null,
    recording_link: nextRecordingLink,
    recording_passcode: nextRecordingLink ? recordingPasscodeInput : null,
    live_link_source: normalizeLinkSource(formData.get("liveLinkSource")),
    recording_link_source: normalizeLinkSource(formData.get("recordingLinkSource")),
    updated_at: nowIso,
  };
  if (shouldTriggerRecordingEmail) {
    payload.recording_published_at = nowIso;
  }

  const { error } = await supabase.from("course_sessions").update(payload).eq("id", sessionId);
  if (error) {
    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn && ["zoom_link", "recording_passcode", "recording_published_at"].includes(missingColumn)) {
      return {
        error: `Falta la columna ${missingColumn} en course_sessions. Ejecuta el SQL actualizado.`,
      };
    }
    return { error: error.message || "No se pudo actualizar la sesion." };
  }

  if (shouldTriggerRecordingEmail && nextRecordingLink && recordingPasscodeInput) {
    const emailClient = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
    try {
      await sendRecordingPublishedEmailsForSession({
        service: emailClient,
        sessionId,
      });
    } catch (notificationError) {
      console.error("No se pudieron enviar correos de grabacion publicada", notificationError);
    }
  }

  revalidateCommissionAdminPaths();
  if (commissionId) {
    revalidatePath(`/admin/commissions/${commissionId}`);
  }
  revalidatePath("/app/curso");
  return { success: true };
}

export async function sendManualZoomReminderForSession(formData) {
  const supabase = await requireAdmin();
  const sessionId = formData.get("sessionId")?.toString();
  const commissionId = formData.get("commissionId")?.toString();
  if (!sessionId) {
    return { error: "Sesion invalida." };
  }

  const emailClient = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
  try {
    await sendZoomReminderEmailsForSession({
      service: emailClient,
      sessionId,
    });
  } catch (notificationError) {
    return {
      error:
        notificationError instanceof Error
          ? notificationError.message
          : "No se pudo enviar el recordatorio manual.",
    };
  }

  revalidateCommissionAdminPaths();
  if (commissionId) {
    revalidatePath(`/admin/commissions/${commissionId}`);
  }
  return { success: true };
}

export async function upsertSessionItem(formData) {
  const supabase = await requireAdmin();
  const itemId = formData.get("itemId")?.toString();
  const sessionId = formData.get("sessionId")?.toString();
  const commissionId = formData.get("commissionId")?.toString();
  if (!sessionId) {
    return { error: "Sesion invalida." };
  }

  const payload = {
    session_id: sessionId,
    type: normalizeSessionItemType(formData.get("type")),
    title: getText(formData, "title"),
    url: getText(formData, "url") || null,
    storage_key: getText(formData, "storageKey") || null,
    note: getText(formData, "note") || null,
    updated_at: new Date().toISOString(),
  };

  if (!payload.title) {
    return { error: "El titulo es obligatorio." };
  }

  let result;
  if (itemId) {
    result = await supabase.from("session_items").update(payload).eq("id", itemId);
  } else {
    result = await supabase.from("session_items").insert(payload);
  }

  if (result.error) {
    return { error: result.error.message || "No se pudo guardar el item." };
  }

  revalidateCommissionAdminPaths();
  if (commissionId) {
    revalidatePath(`/admin/commissions/${commissionId}`);
  }
  revalidatePath("/app/curso");
  return { success: true };
}

export async function deleteSessionItem(formData) {
  const supabase = await requireAdmin();
  const itemId = formData.get("itemId")?.toString();
  const commissionId = formData.get("commissionId")?.toString();
  if (!itemId) {
    return { error: "Item invalido." };
  }

  const { error } = await supabase.from("session_items").delete().eq("id", itemId);
  if (error) {
    return { error: error.message || "No se pudo eliminar el item." };
  }

  revalidateCommissionAdminPaths();
  if (commissionId) {
    revalidatePath(`/admin/commissions/${commissionId}`);
  }
  revalidatePath("/app/curso");
  return { success: true };
}

export async function upsertCommissionClass(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de clase." };
  }

  const supabase = await requireAdmin();
  const sessionId = getText(formData, "sessionId");
  const commissionId = getText(formData, "commissionId");
  const dayLabel = getText(formData, "dayLabel");

  if (!sessionId || !commissionId) {
    return { error: "Sesion invalida." };
  }
  if (!dayLabel) {
    return { error: "El titulo de la clase es obligatorio." };
  }

  const removeItemIds = new Set(getTextArray(formData, "removeItemId").filter(Boolean));
  const itemIds = getTextArray(formData, "itemId");
  const itemTypes = getTextArray(formData, "itemType");
  const itemTitles = getTextArray(formData, "itemTitle");
  const itemUrls = getTextArray(formData, "itemUrl");

  const updateRows = [];
  const deleteIds = [];
  for (let idx = 0; idx < itemIds.length; idx += 1) {
    const itemId = itemIds[idx];
    if (!itemId) continue;

    if (removeItemIds.has(itemId)) {
      deleteIds.push(itemId);
      continue;
    }

    const itemTitle = itemTitles[idx] || "";
    const itemUrl = itemUrls[idx] || "";
    if (!itemTitle || !itemUrl) {
      return { error: "Cada material existente debe tener titulo y URL, o marcarse para eliminar." };
    }

    updateRows.push({
      id: itemId,
      payload: {
        type: normalizeSessionItemType(itemTypes[idx]),
        title: itemTitle,
        url: itemUrl,
        storage_key: null,
        note: null,
        updated_at: new Date().toISOString(),
      },
    });
  }

  const newItemTypes = getTextArray(formData, "newItemType");
  const newItemTitles = getTextArray(formData, "newItemTitle");
  const newItemUrls = getTextArray(formData, "newItemUrl");
  const maxNewItems = Math.max(newItemTypes.length, newItemTitles.length, newItemUrls.length);
  const insertRows = [];
  for (let idx = 0; idx < maxNewItems; idx += 1) {
    const rawType = newItemTypes[idx] || "";
    const rawTitle = newItemTitles[idx] || "";
    const rawUrl = newItemUrls[idx] || "";
    const hasTitleOrUrl = Boolean(rawTitle || rawUrl);
    if (!hasTitleOrUrl) continue;
    if (!rawTitle || !rawUrl) {
      return { error: "Para agregar material, completa titulo y URL." };
    }
    insertRows.push({
      session_id: sessionId,
      type: normalizeSessionItemType(rawType),
      title: rawTitle,
      url: rawUrl,
    });
  }

  const { error: updateSessionError } = await supabase
    .from("course_sessions")
    .update({ day_label: dayLabel, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (updateSessionError) {
    return { error: updateSessionError.message || "No se pudo guardar la clase." };
  }

  if (deleteIds.length) {
    const { error: deleteItemsError } = await supabase
      .from("session_items")
      .delete()
      .eq("session_id", sessionId)
      .in("id", deleteIds);
    if (deleteItemsError) {
      return { error: deleteItemsError.message || "No se pudieron eliminar materiales." };
    }
  }

  for (const row of updateRows) {
    const { error: updateItemError } = await supabase
      .from("session_items")
      .update(row.payload)
      .eq("id", row.id)
      .eq("session_id", sessionId);
    if (updateItemError) {
      return { error: updateItemError.message || "No se pudo actualizar materiales." };
    }
  }

  if (insertRows.length) {
    const { error: insertItemsError } = await supabase.from("session_items").insert(insertRows);
    if (insertItemsError) {
      return { error: insertItemsError.message || "No se pudo agregar materiales." };
    }
  }

  revalidatePath(`/admin/commissions/${commissionId}`);
  revalidateCommissionAdminPaths();
  revalidatePath("/app/curso");
  return { success: true };
}

export async function upsertUnit(formData) {
  const supabase = await requireAdmin();
  const id = formData.get("unitId")?.toString();
  const courseId = formData.get("courseId")?.toString();
  const title = getText(formData, "title");
  const position = toInt(formData.get("position"));

  const payload = {
    course_id: courseId,
    title,
    position,
  };

  if (id) {
    await supabase.from("units").update(payload).eq("id", id);
  } else {
    await supabase.from("units").insert(payload);
  }

  revalidatePath("/admin");
}

export async function deleteUnit(formData) {
  const supabase = await requireAdmin();
  const id = formData.get("unitId")?.toString();
  if (!id) return;

  await supabase.from("units").delete().eq("id", id);
  revalidatePath("/admin");
}

export async function upsertLesson(formData) {
  const supabase = await requireAdmin();
  const id = formData.get("lessonId")?.toString();
  const unitId = formData.get("unitId")?.toString();
  const title = getText(formData, "title");
  const description = getText(formData, "description");
  const position = toInt(formData.get("position"));

  const payload = {
    unit_id: unitId,
    title,
    description,
    position,
  };

  if (id) {
    await supabase.from("lessons").update(payload).eq("id", id);
  } else {
    await supabase.from("lessons").insert(payload);
  }

  revalidatePath("/admin");
}

export async function deleteLesson(formData) {
  const supabase = await requireAdmin();
  const id = formData.get("lessonId")?.toString();
  if (!id) return;

  const actorId = await getAdminActorId(supabase);

  await supabase
    .from("lessons")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);

  await supabase
    .from("exercises")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
      updated_by: actorId,
      last_editor: actorId,
    })
    .eq("lesson_id", id)
    .in("status", ["draft", "published"]);

  await runExerciseGarbageCollection({ db: supabase, actorId });
  revalidatePath("/admin");
}

export async function upsertExercise(formData) {
  const supabase = await requireAdmin();
  const id = formData.get("exerciseId")?.toString();
  const lessonId = formData.get("lessonId")?.toString();
  const kind = formData.get("kind")?.toString() || "listening";
  const requestedType = normalizeExerciseType(
    getText(formData, "type") || (kind === "listening" ? "audio_match" : "cloze")
  );
  const requestedSkillTag = normalizeExerciseSkillTag(
    getText(formData, "skillTag") || getText(formData, "skill_tag"),
    requestedType
  );
  const prompt = getText(formData, "prompt");
  const answer = getText(formData, "answer");
  const choicesInput = getText(formData, "choices");
  const audioUrl = getText(formData, "audioUrl");
  const r2Key = getText(formData, "r2Key");
  const actorId = await getAdminActorId(supabase);

  const choices = choicesInput
    ? choicesInput.split("\n").map((choice) => choice.trim()).filter(Boolean)
    : [];

  const contentJson = requestedType === "audio_match"
    ? {
      text_target: prompt || answer || "How are you?",
      mode: "dictation",
      provider: "elevenlabs",
      audio_url: audioUrl || null,
      r2_key: r2Key || null,
    }
    : requestedType === "reading_exercise"
    ? {
      title: prompt || "Reading Title",
      text: answer || prompt || "Write the reading passage here.",
      image_url: null,
      questions: [
        {
          id: "q_1",
          type: "multiple_choice",
          prompt: "Question 1",
          options: ["", "", "", ""],
          correct_index: 0,
        },
      ],
    }
    : {
      sentence: prompt || "Complete the sentence: [Blank]",
      options: choices,
      correct_index: choices.length
        ? Math.max(0, choices.findIndex((choice) => choice.toLowerCase() === answer.toLowerCase()))
        : null,
      answer: answer || (choices.length ? choices[0] : "answer"),
    };

  const normalizedPayload = await prepareExercisePayload({
    input: {
      lesson_id: lessonId,
      type: requestedType,
      skill_tag: requestedSkillTag,
      status: normalizeExerciseStatus(getText(formData, "status") || "published"),
      content_json: contentJson,
      ordering: 1,
    },
    actorId,
    db: supabase,
    forcePublishValidation: false,
  });

  const payload = {
    ...normalizedPayload,
    kind,
    prompt: normalizedPayload.prompt || prompt,
    payload: normalizedPayload.content_json,
    r2_key: r2Key || null,
  };

  if (id) {
    await supabase.from("exercises").update(payload).eq("id", id);
  } else {
    await supabase.from("exercises").insert(payload);
  }

  revalidatePath("/admin");
}

export async function deleteExercise(formData) {
  const supabase = await requireAdmin();
  const id = formData.get("exerciseId")?.toString();
  if (!id) return;

  const actorId = await getAdminActorId(supabase);
  await supabase
    .from("exercises")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
      updated_by: actorId,
      last_editor: actorId,
    })
    .eq("id", id);

  await archiveExercisesIfOrphaned({
    db: supabase,
    exerciseIds: [id],
    actorId,
    ignoreLessonReference: true,
  });
  await runExerciseGarbageCollection({ db: supabase, actorId });
  revalidatePath("/admin");
}

export async function promoteStudentToAdmin(formData) {
  const supabase = await requireAdmin();
  const profileId = formData.get("profileId")?.toString();
  if (!profileId) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, invited, password_set")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile) {
    return;
  }

  await supabase.from("admin_profiles").upsert({
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    invited: profile.invited,
    password_set: profile.password_set,
  });

  await supabase.from("profiles").delete().eq("id", profile.id);

  if (hasServiceRoleClient()) {
    const service = getServiceSupabaseClient();
    await service.auth.admin.updateUserById(profile.id, {
      user_metadata: {
        full_name: profile.full_name || profile.email,
        account_type: "admin",
      },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/students");
}

export async function assignCourseToUser(formData) {
  const supabase = await requireAdmin();
  const profileId = formData.get("profileId")?.toString();
  const courseId = formData.get("courseId")?.toString();
  if (!profileId || !courseId) return;

  await supabase
    .from("course_enrollments")
    .upsert({ user_id: profileId, course_id: courseId }, { onConflict: "user_id,course_id" });

  revalidatePath("/admin");
}

export async function assignStudentsToCommission(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de alumnos." };
  }

  const supabase = await requireAdmin();
  const commissionId = getText(formData, "commissionId");
  const studentIds = getTextArray(formData, "studentIds").filter(Boolean);

  if (!commissionId) {
    return { error: "Comision invalida." };
  }
  if (!studentIds.length) {
    return { error: "Selecciona al menos un alumno." };
  }

  const client = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
  const { data: commission } = await client
    .from("course_commissions")
    .select("id, course_level, modality_key, status, is_active, end_date")
    .eq("id", commissionId)
    .maybeSingle();

  if (!commission?.id) {
    return { error: "No se encontro la comision." };
  }

  const { data: profiles } = await client
    .from("profiles")
    .select("id, role, commission_id, commission:course_commissions(id, status, is_active, end_date)")
    .in("id", studentIds);

  const todayIso = getLimaTodayISO();
  const eligibleIds = (profiles || [])
    .filter((profile) => {
      if (!profile?.id || profile.role !== "student") return false;
      if (!profile.commission_id) return true;
      const status = resolveCommissionStatus(profile.commission, todayIso);
      return status !== "active";
    })
    .map((profile) => profile.id);

  if (!eligibleIds.length) {
    return { error: "No hay alumnos elegibles para esta comision." };
  }

  const payload = {
    commission_id: commissionId,
    commission_assigned_at: new Date().toISOString(),
    modality_key: commission.modality_key || null,
  };

  const { error } = await client.from("profiles").update(payload).in("id", eligibleIds);
  if (error) {
    return { error: error.message || "No se pudieron asignar alumnos." };
  }

  revalidatePath(`/admin/commissions/${commissionId}`);
  revalidatePath("/admin/commissions");
  revalidatePath("/admin/students");
  revalidatePath("/app");
  revalidatePath("/app/curso");
  return { success: true, assigned: eligibleIds.length };
}

export async function removeEnrollment(formData) {
  const supabase = await requireAdmin();
  const enrollmentId = formData.get("enrollmentId")?.toString();
  if (!enrollmentId) return;

  await supabase.from("course_enrollments").delete().eq("id", enrollmentId);
  revalidatePath("/admin");
}

export async function updateStudentPassword(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de contraseña." };
  }

  await requireAdmin();

  if (!hasServiceRoleClient()) {
    return { error: "Configura SUPABASE_SERVICE_ROLE_KEY para editar contraseñas." };
  }

  const profileId = getText(formData, "profileId");
  const password = getText(formData, "password");
  const redirectTo = getText(formData, "redirectTo");

  if (!profileId) {
    return { error: "Alumno invalido." };
  }

  if (!password || password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const service = getServiceSupabaseClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile?.id) {
    return { error: "No se encontro el alumno." };
  }

  const { error: updateAuthError } = await service.auth.admin.updateUserById(profileId, {
    password,
  });

  if (updateAuthError) {
    return { error: updateAuthError.message || "No se pudo actualizar la contraseña." };
  }

  await service
    .from("profiles")
    .update({ password_set: true, invited: true })
    .eq("id", profileId);

  revalidatePath("/admin/students");
  if (redirectTo) {
    revalidatePath(redirectTo);
  }

  return { success: true, message: "Contraseña actualizada correctamente." };
}

export async function upsertStudent(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos del alumno." };
  }
  const supabase = await requireAdmin();
  const profileId = formData.get("profileId")?.toString() || null;
  const isNewStudent = !profileId;
  const redirectTo = getText(formData, "redirectTo");
  const email = getText(formData, "email");
  const fullName = getText(formData, "fullName");
  const dni = getText(formData, "dni");
  const phone = getText(formData, "phone");
  const birthDate = getText(formData, "birthDate");
  const courseLevelRaw = formData.get("courseLevel")?.toString().toUpperCase() || "";
  const levelNumberRaw = formData.get("levelNumber")?.toString();
  const courseType = formData.get("courseType")?.toString() || "regular";
  const startMonth = formData.get("startMonth")?.toString();
  const enrollmentDate = formData.get("enrollmentDate")?.toString();
  const preferredHourInput = formData.get("preferredHour")?.toString();
  const commissionId = getText(formData, "commissionId");
  const studentGrade = formData.get("studentGrade")?.toString();
  const normalizedPreferredHour = normalizePreferredHourInput(preferredHourInput);

  if (!email) {
    return { error: "El correo es obligatorio." };
  }

  let resolvedCourseLevel = courseLevelRaw;
  let resolvedEnrollmentDate = enrollmentDate;
  let resolvedStartMonth = startMonth;
  let resolvedPreferredHour = normalizedPreferredHour;
  let resolvedModality = null;
  let resolvedLevelNumber = levelNumberRaw ? parseInt(levelNumberRaw, 10) : undefined;

  if (commissionId) {
    const { data: commission } = await supabase
      .from("course_commissions")
      .select("course_level, start_date, start_time, modality_key")
      .eq("id", commissionId)
      .maybeSingle();
    if (!commission) {
      return { error: "Comision invalida." };
    }
    resolvedCourseLevel = commission.course_level || resolvedCourseLevel;
    resolvedStartMonth = commission.start_date ? commission.start_date.slice(0, 7) : resolvedStartMonth;
    resolvedPreferredHour = parseTimeWithSeconds(commission.start_time) ?? resolvedPreferredHour;
    resolvedModality = commission.modality_key || null;
  }

  if (resolvedCourseLevel && !STUDENT_LEVELS.includes(resolvedCourseLevel)) {
    return { error: "Selecciona un curso valido." };
  }

  if (!resolvedCourseLevel) {
    return { error: "Selecciona una comision para asignar el curso." };
  }

  const levelNumber = resolvedLevelNumber;

  try {
    const result = await saveStudentProfile({
      profileId,
      email,
      fullName,
      dni,
      phone,
      birthDate,
      courseLevel: resolvedCourseLevel || null,
      levelNumber,
      isPremium: courseType === "premium",
      startMonth: resolvedStartMonth,
      enrollmentDate: resolvedEnrollmentDate,
      preferredHour: resolvedPreferredHour,
      commissionId: commissionId || null,
      studentGrade,
      modalityKey: resolvedModality,
      sendWelcomeEmail: isNewStudent,
      forcePasswordReset: false,
    });

      if (result?.tempPassword) {
        try {
          await sendEnrollmentEmail({
            toEmail: email.toLowerCase(),
            name: fullName || email,
            course: resolvedCourseLevel || "Curso asignado",
            schedule: formatScheduleWithFrequency({
              modalityKey: resolvedModality,
              timeValue: resolvedPreferredHour,
              fallback: "Horario a coordinar",
            }),
            studentCode: result.student_code,
            tempPassword: result.tempPassword,
          });
        } catch (emailError) {
        console.error("No se pudo enviar el correo de inscripcion", emailError);
      }
    }
  } catch (error) {
    console.error("No se pudo guardar el alumno", error);
    return { error: error.message || "No se pudo guardar el alumno." };
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  if (redirectTo) {
    redirect(redirectTo);
  }
  return { success: true };
}

export async function importStudentsCsv(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibio el archivo CSV." };
  }
  await requireAdmin();
  if (!hasServiceRoleClient()) {
    return { error: "Configura SUPABASE_SERVICE_ROLE_KEY para importar." };
  }

  const file = formData.get("csv");
  if (!(file instanceof File)) {
    return { error: "Debes adjuntar un archivo CSV" };
  }

  const text = await file.text();
  if (!text.trim()) {
    return { error: "CSV vacío" };
  }

  const { headers, rows } = parseCsv(text);
  const emailIndex = headers.indexOf("email");
  if (emailIndex === -1) {
    return { error: "El CSV debe incluir una columna email" };
  }

  const fullNameIndex = headers.indexOf("full_name");
  const dniIndex = headers.indexOf("dni");
  const phoneIndex = headers.indexOf("phone");
  const birthDateIndex = headers.indexOf("birth_date");
  const courseLevelIndex = headers.indexOf("course_level");
  const levelNumberIndex = headers.indexOf("level_number");
  const isPremiumIndex = headers.indexOf("is_premium");
  const startMonthIndex = headers.indexOf("start_month");
  const enrollmentDateIndex = headers.indexOf("enrollment_date");
  const hourIndex = headers.indexOf("preferred_hour");
  const modalityIndex = headers.indexOf("modality");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const cells of rows) {
    const email = cells[emailIndex]?.toLowerCase();
    if (!email) {
      skipped += 1;
      continue;
    }

    const courseLevel = courseLevelIndex !== -1 ? cells[courseLevelIndex]?.toUpperCase() : null;
    if (courseLevel && !STUDENT_LEVELS.includes(courseLevel)) {
      console.warn("Nivel inválido para", email, courseLevel);
      skipped += 1;
      continue;
    }

    const fullName = fullNameIndex !== -1 ? cells[fullNameIndex] : null;
    const preferredHourValue = hourIndex !== -1 ? cells[hourIndex] : null;
    const modalityValue = modalityIndex !== -1 ? cells[modalityIndex] : null;
    const normalizedPreferredHour = normalizePreferredHourInput(preferredHourValue);
    const normalizedModality = normalizeModalityKey(modalityValue);

    try {
      const result = await saveStudentProfile({
        email,
        fullName,
        dni: dniIndex !== -1 ? cells[dniIndex] : null,
        phone: phoneIndex !== -1 ? cells[phoneIndex] : null,
        birthDate: birthDateIndex !== -1 ? cells[birthDateIndex] : null,
        courseLevel,
        levelNumber: levelNumberIndex !== -1 ? parseInt(cells[levelNumberIndex] || "", 10) : undefined,
        isPremium: isPremiumIndex !== -1 ? cells[isPremiumIndex] : false,
        startMonth: startMonthIndex !== -1 ? cells[startMonthIndex] : null,
        enrollmentDate: enrollmentDateIndex !== -1 ? cells[enrollmentDateIndex] : null,
        preferredHour: normalizedPreferredHour,
        modalityKey: normalizedModality,
        sendWelcomeEmail: true,
        forcePasswordReset: false,
      });
      if (result.wasExisting) {
        updated += 1;
      } else {
        created += 1;
        if (result?.tempPassword) {
          try {
            await sendEnrollmentEmail({
              toEmail: email,
              name: fullName || email,
              course: courseLevel || "Curso asignado",
              schedule: formatScheduleWithFrequency({
                modalityKey: normalizedModality,
                timeValue: normalizedPreferredHour,
                fallback: "Horario a coordinar",
              }),
              studentCode: result.student_code,
              tempPassword: result.tempPassword,
            });
          } catch (emailError) {
            console.error("No se pudo enviar el correo de inscripcion (CSV)", email, emailError);
          }
        }
      }
    } catch (error) {
      console.error("No se pudo importar", email, error);
      skipped += 1;
    }
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  return {
    success: true,
    message: `Alumnos creados: ${created}, actualizados: ${updated}, omitidos: ${skipped}`,
  };
}

export async function deleteStudent(formData) {
  await requireAdmin();
  const profileId = formData.get("profileId")?.toString();
  if (!profileId) {
    return { error: "Alumno inválido." };
  }

  if (!hasServiceRoleClient()) {
    console.error("Configura SUPABASE_SERVICE_ROLE_KEY para eliminar alumnos completamente.");
    return { error: "Configura SUPABASE_SERVICE_ROLE_KEY para eliminar alumnos." };
  }

  const service = getServiceSupabaseClient();

  const { error: enrollmentsError } = await service.from("course_enrollments").delete().eq("user_id", profileId);
  if (enrollmentsError) {
    console.error("No se pudo eliminar las inscripciones del alumno", enrollmentsError);
    return { error: "No se pudo eliminar las inscripciones del alumno." };
  }

  const { error: profileError } = await service.from("profiles").delete().eq("id", profileId);
  if (profileError) {
    console.error("No se pudo eliminar el perfil del alumno", profileError);
    return { error: "No se pudo eliminar el perfil del alumno." };
  }

  try {
    await service.auth.admin.deleteUser(profileId);
  } catch (error) {
    console.error("No se pudo eliminar el usuario de Auth", error);
  }

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  return { success: true };
}
