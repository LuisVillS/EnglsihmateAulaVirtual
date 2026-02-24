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
  buildSessionDraftsFromCommission,
  buildFrequencySessionDrafts,
  buildLimaDateTimeIso,
  getFrequencyDurationMonths,
  getFrequencyReference,
  getSessionsPerMonth,
  normalizeFrequencyKey,
} from "@/lib/course-sessions";
import { getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { prepareExercisePayload } from "@/lib/duolingo/exercises";
import { EXERCISE_TYPE_VALUES } from "@/lib/duolingo/constants";

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

function formatScheduleLabel(value) {
  if (value == null || value === "") return "Horario a coordinar";
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "Horario a coordinar";
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = minutes % 60 === 0 ? "00" : "30";
  return `${hours}:${mins}`;
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
  if (raw === "slides" || raw === "link" || raw === "file" || raw === "exercise" || raw === "video") return raw;
  return "link";
}

function normalizeExerciseType(value) {
  const raw = String(value || "").trim().toLowerCase();
  return EXERCISE_TYPE_VALUES.includes(raw) ? raw : "cloze";
}

function normalizeExerciseStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "published" || raw === "archived") return raw;
  return "draft";
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

function getDefaultExerciseContent(type) {
  const normalizedType = normalizeExerciseType(type);
  switch (normalizedType) {
    case "scramble":
      return {
        prompt_native: "Yo soy estudiante",
        target_words: ["I", "am", "a", "student"],
        answer_order: [0, 1, 2, 3],
      };
    case "audio_match":
      return {
        text_target: "How are you?",
        mode: "dictation",
        provider: "elevenlabs",
      };
    case "image_match":
      return {
        question_native: "¿Cuál es 'El Pan'?",
        options: [
          { vocab_id: "", image_url: "" },
          { vocab_id: "", image_url: "" },
          { vocab_id: "", image_url: "" },
          { vocab_id: "", image_url: "" },
        ],
        correct_index: 0,
      };
    case "pairs":
      return {
        pairs: [
          { native: "Manzana", target: "Apple" },
          { native: "Pan", target: "Bread" },
        ],
      };
    case "cloze":
    default:
      return {
        sentence: "I ____ a student.",
        options: ["am", "are", "is", "be"],
        correct_index: 0,
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
    const { error: deleteError } = await supabase.from("template_sessions").delete().in("id", staleRows);
    if (deleteError) {
      return { error: deleteError.message || "No se pudo limpiar sesiones fuera de rango." };
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

async function loadTemplateMaterialBySessionIndex(supabase, { courseLevel, frequency }) {
  const normalizedFrequency = normalizeTemplateFrequency(frequency);
  if (!courseLevel || !normalizedFrequency) {
    return { templateFound: false, byMonthAndSession: new Map() };
  }

  const structure = getTemplateStructure(normalizedFrequency);
  if (!structure) {
    return { templateFound: false, byMonthAndSession: new Map() };
  }
  const { sessionsPerMonth } = structure;

  const { data: template, error: templateError } = await supabase
    .from("course_templates")
    .select("id")
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

  if (!template?.id) {
    return { templateFound: false, byMonthAndSession: new Map() };
  }

  const { data: templateSessions, error: sessionError } = await supabase
    .from("template_sessions")
    .select("id, month_index, session_in_month, session_in_cycle, title")
    .eq("template_id", template.id)
    .order("month_index", { ascending: true })
    .order("session_in_month", { ascending: true });

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
  if (templateSessionIds.length) {
    let itemsResult = await supabase
      .from("template_session_items")
      .select("id, template_session_id, type, title, url, exercise_id")
      .in("template_session_id", templateSessionIds)
      .order("created_at", { ascending: true });

    if (itemsResult.error) {
      const missingColumn = getMissingColumnFromError(itemsResult.error);
      if (missingColumn === "exercise_id") {
        itemsResult = await supabase
          .from("template_session_items")
          .select("id, template_session_id, type, title, url")
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
        .in("id", exerciseIds);
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
        lesson_id: lessonIdByExerciseId.get(String(item.exercise_id || "").trim()) || null,
      });
      acc.set(item.template_session_id, current);
      return acc;
    }, new Map());
  }

  const byMonthAndSession = new Map();
  for (const row of templateSessions || []) {
    const position = resolveTemplateSessionPosition(row, sessionsPerMonth);
    if (!position.monthIndex || !position.sessionInMonth) continue;
    byMonthAndSession.set(
      buildTemplateSessionKey(position.monthIndex, position.sessionInMonth),
      {
        title: row.title || null,
        items: itemsByTemplateSessionId.get(row.id) || [],
      }
    );
  }

  return {
    templateFound: true,
    byMonthAndSession,
  };
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
      if (payload.title && payload.title.trim()) {
        const updateResult = await supabase
          .from("course_sessions")
          .update({ day_label: payload.title.trim(), updated_at: new Date().toISOString() })
          .eq("id", session.id);
        if (updateResult.error) {
          return { error: updateResult.error.message || "No se pudo copiar el titulo desde plantilla." };
        }
      }
      for (const item of payload.items) {
        const normalizedType = normalizeTemplateItemType(item.type);
        const resolvedExerciseId = normalizedType === "exercise"
          ? (item.exercise_id || null)
          : null;
        const resolvedUrl = normalizedType === "exercise"
          ? buildPracticeExerciseUrl(resolvedExerciseId, item.lesson_id || null)
          : item.url;
        itemRows.push({
          session_id: session.id,
          type: normalizedType === "slides" ? "slides" : normalizedType,
          title: item.title || "Material",
          url: resolvedUrl,
          exercise_id: resolvedExerciseId,
        });
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
          return { error: "Actualiza el SQL: session_items.type debe permitir 'slides'." };
        }
        return { error: insertItemsResult.error.message || "No se pudieron copiar materiales de plantilla." };
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
    const insertPayload = { ...payload, course_level: courseLevel, commission_number: nextNumber };
    let { data, error } = await supabase
      .from("course_commissions")
      .insert(insertPayload)
      .select("id")
      .maybeSingle();

    if (error) {
      const missingColumn = getMissingColumnFromError(error);
      if (missingColumn === "status") {
        const fallbackPayload = { ...insertPayload };
        delete fallbackPayload.status;
        ({ data, error } = await supabase
          .from("course_commissions")
          .insert(fallbackPayload)
          .select("id")
          .maybeSingle());
      }
    }

    if (!error && data?.id) {
      return data.id;
    }

    if (error?.code !== "23505") {
      throw new Error(error?.message || "No se pudo crear la comision.");
    }
  }

  throw new Error("No se pudo generar una comision unica. Intenta nuevamente.");
}

export async function upsertCommission(prevState, formData) {
  const resolvedFormData = formData instanceof FormData ? formData : prevState;
  const supabase = await requireAdmin();
  const id = resolvedFormData.get("commissionId")?.toString();
  const courseLevel = getText(resolvedFormData, "course_level");
  const startMonthInput = getText(resolvedFormData, "start_month");
  const durationMonthsInput = getText(resolvedFormData, "duration_months");
  const startDateInput = getText(resolvedFormData, "start_date");
  const modalityKey = normalizeModalityKey(getText(resolvedFormData, "modality_key"));
  const startTime = getText(resolvedFormData, "start_time");
  const endTime = getText(resolvedFormData, "end_time");

  if (!STUDENT_LEVELS.includes(courseLevel)) {
    return { error: "Selecciona un curso valido." };
  }

  const modality = getModalityDefinition(modalityKey);
  if (!modality) {
    return { error: "Selecciona una modalidad valida." };
  }

  const startMonthDate = parseMonthInput(startMonthInput) || parseDateOnly(startDateInput);
  const durationMonths = toPositiveInt(durationMonthsInput, 4);
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

  let commissionId = id || null;
  if (id) {
    let { error } = await supabase.from("course_commissions").update(payload).eq("id", id);
    if (error) {
      const missingColumn = getMissingColumnFromError(error);
      if (missingColumn === "status") {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.status;
        const fallbackResult = await supabase.from("course_commissions").update(fallbackPayload).eq("id", id);
        error = fallbackResult.error;
      }
    }
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

  const regeneration = await regenerateCommissionSessions(supabase, {
    ...payload,
    id: commissionId,
  });
  if (regeneration.error) {
    return { error: regeneration.error };
  }

  revalidatePath("/admin");
  revalidateCommissionAdminPaths();
  revalidatePath("/app/curso");
  if (regeneration.missingTable) {
    return { success: true, message: "Comision guardada. Falta crear la tabla course_sessions." };
  }
  return { success: true, message: `Comision guardada. ${regeneration.count || 0} clases generadas.` };
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
  const allowed = new Set(["file", "exercise", "recording", "live_link", "link", "note", "slides", "video"]);
  return allowed.has(raw) ? raw : "note";
}

function normalizeLinkSource(value) {
  const raw = value?.toString().trim().toLowerCase();
  return raw === "auto" ? "auto" : "manual";
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

  const { error } = await supabase.from("course_templates").delete().eq("id", templateId);
  if (error) {
    const missingTable = getMissingTableName(error);
    if (missingTable?.endsWith("course_templates")) {
      return { error: "Falta crear la tabla course_templates. Ejecuta SQL actualizado." };
    }
    return { error: error.message || "No se pudo eliminar la plantilla." };
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

  if (!templateSessionId || !title) {
    return { error: "Completa el titulo de la clase." };
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
    .update({ title })
    .eq("id", templateSessionId);
  if (updateSessionError) {
    const missingTable = getMissingTableName(updateSessionError);
    if (missingTable?.endsWith("template_sessions")) {
      return { error: "Falta crear la tabla template_sessions. Ejecuta SQL actualizado." };
    }
    return { error: updateSessionError.message || "No se pudo guardar la clase de plantilla." };
  }

  if (deleteIds.length) {
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

  revalidateTemplateAdminPaths(templateId);
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
  if (!templateSessionId || !title) {
    return { error: "Completa el titulo de la sesion." };
  }

  const { error } = await supabase
    .from("template_sessions")
    .update({ title })
    .eq("id", templateSessionId);
  if (error) {
    const missingTable = getMissingTableName(error);
    if (missingTable?.endsWith("template_sessions")) {
      return { error: "Falta crear la tabla template_sessions. Ejecuta SQL actualizado." };
    }
    return { error: error.message || "No se pudo actualizar la sesion de plantilla." };
  }

  revalidateTemplateAdminPaths(templateId);
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

  revalidateTemplateAdminPaths(templateId);
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

    revalidateTemplateAdminPaths(templateId);
    return { success: true, exerciseId: insertedExercise.id };
  } catch (error) {
    return { error: error?.message || "No se pudo crear el ejercicio de plantilla." };
  }
}

export async function createTemplateSessionExerciseBatch(prevState, maybeFormData) {
  const formData = resolveFormDataArg(prevState, maybeFormData);
  if (!formData) {
    return { error: "No se recibieron datos de la prueba." };
  }

  const templateId = getText(formData, "templateId");
  const templateSessionId = getText(formData, "templateSessionId");
  const fallbackLessonId = getText(formData, "lessonId");
  const rawBatch = getText(formData, "batchJson");

  if (!templateId || !templateSessionId) {
    return { error: "Clase de plantilla invalida." };
  }

  let rows = [];
  try {
    const parsed = JSON.parse(rawBatch || "[]");
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { error: "Formato invalido de ejercicios (batchJson)." };
  }

  if (!rows.length) {
    return { error: "Agrega al menos un ejercicio para crear la prueba." };
  }

  let created = 0;
  const errors = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const payloadFormData = new FormData();
    payloadFormData.set("templateId", templateId);
    payloadFormData.set("templateSessionId", templateSessionId);
    payloadFormData.set("lessonId", String(row.lessonId || fallbackLessonId || "").trim());
    payloadFormData.set("type", String(row.type || "cloze").trim());
    payloadFormData.set("status", String(row.status || "published").trim());
    payloadFormData.set("title", String(row.title || "").trim());

    const contentCandidate = row.contentJson;
    if (typeof contentCandidate === "string") {
      payloadFormData.set("contentJson", contentCandidate);
    } else {
      payloadFormData.set("contentJson", JSON.stringify(contentCandidate || {}));
    }

    const result = await createTemplateSessionExercise(payloadFormData);
    if (result?.success) {
      created += 1;
      continue;
    }

    errors.push(`Ejercicio ${index + 1}: ${result?.error || "No se pudo crear."}`);
  }

  revalidateTemplateAdminPaths(templateId);

  if (!created) {
    return { error: errors.join(" ") || "No se pudo crear la prueba." };
  }

  if (errors.length) {
    return {
      success: true,
      warning: `Se crearon ${created} ejercicios, pero hubo errores: ${errors.join(" ")}`,
      created,
    };
  }

  return {
    success: true,
    message: `Se crearon ${created} ejercicios para la clase.`,
    created,
  };
}

export async function deleteTemplateSessionItem(formData) {
  const supabase = await requireAdmin();
  const itemId = getText(formData, "itemId");
  const templateId = getText(formData, "templateId") || null;
  if (!itemId) return { error: "Material invalido." };

  const { error } = await supabase.from("template_session_items").delete().eq("id", itemId);
  if (error) {
    return { error: error.message || "No se pudo eliminar el material." };
  }
  revalidateTemplateAdminPaths(templateId);
  return { success: true };
}

export async function ensureCommissionSessions(formData) {
  const supabase = await requireAdmin();
  const commissionId = formData.get("commissionId")?.toString();
  if (!commissionId) {
    return { error: "Comision invalida." };
  }

  const { data: commission, error: commissionError } = await supabase
    .from("course_commissions")
    .select("id, course_level, start_date, end_date, start_month, duration_months, modality_key, days_of_week, start_time, end_time")
    .eq("id", commissionId)
    .maybeSingle();

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

  const payload = {
    day_label: getText(formData, "dayLabel") || null,
    live_link: getText(formData, "liveLink") || null,
    recording_link: getText(formData, "recordingLink") || null,
    live_link_source: normalizeLinkSource(formData.get("liveLinkSource")),
    recording_link_source: normalizeLinkSource(formData.get("recordingLinkSource")),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("course_sessions").update(payload).eq("id", sessionId);
  if (error) {
    return { error: error.message || "No se pudo actualizar la sesion." };
  }

  revalidateCommissionAdminPaths();
  if (commissionId) {
    revalidatePath(`/admin/commissions/${commissionId}`);
  }
  revalidatePath("/app/curso");
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

  await supabase.from("lessons").delete().eq("id", id);
  revalidatePath("/admin");
}

export async function upsertExercise(formData) {
  const supabase = await requireAdmin();
  const id = formData.get("exerciseId")?.toString();
  const lessonId = formData.get("lessonId")?.toString();
  const kind = formData.get("kind")?.toString() || "listening";
  const prompt = getText(formData, "prompt");
  const answer = getText(formData, "answer");
  const choicesInput = getText(formData, "choices");
  const audioUrl = getText(formData, "audioUrl");
  const r2Key = getText(formData, "r2Key");

  const payload = {
    kind,
    prompt,
    lesson_id: lessonId,
    payload: {
      answer,
      audio_url: audioUrl || null,
      choices: choicesInput
        ? choicesInput.split("\n").map((choice) => choice.trim()).filter(Boolean)
        : [],
    },
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

  await supabase.from("exercises").delete().eq("id", id);
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
    resolvedLevelNumber = resolvedLevelNumber || 1;
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
      forcePasswordReset: isNewStudent,
    });

      if (result?.tempPassword) {
        try {
          await sendEnrollmentEmail({
            toEmail: email.toLowerCase(),
            name: fullName || email,
            course: resolvedCourseLevel || "Curso asignado",
            schedule: formatScheduleLabel(resolvedPreferredHour),
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
        forcePasswordReset: true,
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
              schedule: formatScheduleLabel(normalizedPreferredHour),
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


