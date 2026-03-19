import { buildPracticeSessionPlan } from "@/lib/duolingo/session-generator";
import { resolveAudioUrlFromContent } from "@/lib/duolingo/audio-cache";
import { TYPE_BY_LEGACY_KIND } from "@/lib/duolingo/constants";
import {
  PRACTICE_MODE_LABELS,
  PRACTICE_MODES,
  normalizePracticeMode,
} from "@/lib/duolingo/practice-config";
import { normalizeExerciseType, parseContentJson } from "@/lib/duolingo/validation";
import { normalizeStudentCefrLevel } from "@/lib/student-levels";

function normalizeExerciseIds(input) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeExerciseRow(row) {
  const type = normalizeExerciseType(row?.type) || TYPE_BY_LEGACY_KIND[row?.kind] || "cloze";
  return {
    id: row?.id,
    lesson_id: row?.lesson_id,
    kind: row?.kind,
    type,
    status: row?.status,
    ordering: Number(row?.ordering || 0) || 0,
    payload: row?.payload || {},
    content_json: parseContentJson(row?.content_json ?? row?.payload) || {},
    updated_at: row?.updated_at || row?.created_at || null,
    lesson: row?.lesson || null,
    skill_tag: row?.skill_tag || "",
    cefr_level: row?.cefr_level || "",
    category_id: row?.category_id || null,
    practice_enabled: row?.practice_enabled !== false,
    ranked_allowed: row?.ranked_allowed === true,
    difficulty_score: row?.difficulty_score ?? null,
    estimated_time_sec: row?.estimated_time_sec ?? null,
    practice_weight: row?.practice_weight ?? 1,
    theme_tags: row?.theme_tags || [],
    scenario_tags: row?.scenario_tags || [],
    category: row?.category || null,
  };
}

function normalizeFilters(filters = {}) {
  return {
    skill: String(filters?.skill || "").trim().toLowerCase() || "",
    cefrLevel: String(filters?.cefrLevel || filters?.cefr_level || "").trim().toUpperCase() || "",
    categoryId: String(filters?.categoryId || filters?.category_id || "").trim() || "",
    theme: String(filters?.theme || "").trim(),
    scenario: String(filters?.scenario || "").trim(),
  };
}

async function loadPublishedExercises(db, { exerciseIds = [], filters = {} } = {}) {
  const ids = normalizeExerciseIds(exerciseIds);
  const normalizedFilters = normalizeFilters(filters);

  let query = db
    .from("exercises")
    .select(
      `
      id,
      lesson_id,
      kind,
      type,
      status,
      ordering,
      payload,
      content_json,
      updated_at,
      skill_tag,
      cefr_level,
      category_id,
      practice_enabled,
      ranked_allowed,
      difficulty_score,
      estimated_time_sec,
      practice_weight,
      theme_tags,
      scenario_tags,
      category:exercise_categories (
        id,
        name,
        skill,
        cefr_level
      ),
      lesson:lessons (
        id,
        title,
        level,
        status,
        subject_id,
        subject:lesson_subjects (
          id,
          name
        )
      )
    `
    )
    .eq("status", "published");

  if (ids.length) {
    query = query.in("id", ids);
  } else {
    if (normalizedFilters.skill) {
      query = query.eq("skill_tag", normalizedFilters.skill);
    }
    if (normalizedFilters.cefrLevel) {
      query = query.eq("cefr_level", normalizedFilters.cefrLevel);
    }
    if (normalizedFilters.categoryId) {
      query = query.eq("category_id", normalizedFilters.categoryId);
    }
    if (normalizedFilters.theme) {
      query = query.contains("theme_tags", [normalizedFilters.theme.toLowerCase().replace(/\s+/g, "_")]);
    }
    if (normalizedFilters.scenario) {
      query = query.contains("scenario_tags", [normalizedFilters.scenario.toLowerCase().replace(/\s+/g, "_")]);
    }
  }

  const { data, error } = await query
    .order("lesson_id", { ascending: true })
    .order("ordering", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar ejercicios publicados.");
  }

  return (data || []).filter((row) => {
    if (normalizedFilters.cefrLevel) {
      return String(row?.cefr_level || "").trim().toUpperCase() === normalizedFilters.cefrLevel;
    }
    return true;
  });
}

async function loadProgressRows(db, userId) {
  const { data, error } = await db
    .from("user_progress")
    .select(
      `
      id,
      user_id,
      exercise_id,
      is_correct,
      attempts,
      last_practiced,
      interval_days,
      ease_factor,
      next_due_at,
      last_quality,
      times_seen,
      times_correct,
      streak_count
    `
    )
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message || "No se pudo cargar progreso de ejercicios.");
  }

  return data || [];
}

async function hydrateAudioSource(items) {
  const hydrated = [];
  for (const item of items) {
    if (item.type !== "audio_match") {
      hydrated.push(item);
      continue;
    }

    const content = item.content_json || {};
    if (content.audio_url) {
      hydrated.push(item);
      continue;
    }

    const signed = await resolveAudioUrlFromContent(content);
    hydrated.push({
      ...item,
      content_json: {
        ...content,
        audio_url: signed,
      },
    });
  }
  return hydrated;
}

async function createPracticeSessionRecords(
  db,
  {
    userId,
    mode,
    filters,
    sourceContext = null,
    timeLimitSec = null,
    items,
  }
) {
  if (!items.length) {
    return null;
  }

  const insertSession = await db
    .from("practice_sessions")
    .insert({
      user_id: userId,
      mode,
      status: "active",
      source_context: sourceContext,
      filters,
      session_size: items.length,
      total_items: items.length,
      time_limit_sec: timeLimitSec,
    })
    .select("*")
    .single();

  if (insertSession.error) {
    throw new Error(insertSession.error.message || "No se pudo crear la sesion de practica.");
  }

  const session = insertSession.data;
  const itemPayload = items.map((item, index) => ({
    practice_session_id: session.id,
    exercise_id: item.id,
    position: index + 1,
    source_reason: item.source_reason || item.mode || "new",
    exercise_type: item.type,
    skill_tag: item.skill_tag || null,
    cefr_level: item.cefr_level || null,
    category_id: item.category_id || null,
  }));

  const insertItems = await db
    .from("practice_session_items")
    .insert(itemPayload)
    .select("*")
    .order("position", { ascending: true });

  if (insertItems.error) {
    throw new Error(insertItems.error.message || "No se pudieron registrar los items de practica.");
  }

  return {
    session,
    items: insertItems.data || [],
  };
}

export async function generateStudentSession({
  db,
  userId,
  now = new Date(),
  exerciseIds = [],
  options = {},
}) {
  const requestedExerciseIds = normalizeExerciseIds(exerciseIds);
  const mode = requestedExerciseIds.length
    ? PRACTICE_MODES.DIRECT
    : normalizePracticeMode(options?.mode, PRACTICE_MODES.MIXED_REVIEW);
  const size = Number(options?.size || 12) || 12;
  const requestedFilters = normalizeFilters(options?.filters);
  const allowedCefrLevel = normalizeStudentCefrLevel(options?.allowedCefrLevel);
  const filters = {
    ...requestedFilters,
    cefrLevel: allowedCefrLevel || requestedFilters.cefrLevel,
  };
  const sourceContext = String(options?.sourceContext || "").trim() || null;
  const timeLimitSec = options?.timeLimitSec == null ? null : Number(options.timeLimitSec);

  const [exerciseRows, progressRows] = await Promise.all([
    loadPublishedExercises(db, {
      exerciseIds: requestedExerciseIds,
      filters: requestedExerciseIds.length ? {} : filters,
    }),
    loadProgressRows(db, userId),
  ]);

  let sessionPlan = null;

  if (requestedExerciseIds.length) {
    const byId = new Map(exerciseRows.map((row) => [String(row.id), normalizeExerciseRow(row)]));
    const orderedRows = requestedExerciseIds
      .map((exerciseId) => byId.get(exerciseId))
      .filter(Boolean);

    sessionPlan = {
      items: orderedRows.map((item) => ({
        ...item,
        source_reason: "class",
        mode: "class",
      })),
      totals: {
        totalPublished: orderedRows.length,
        requested: requestedExerciseIds.length,
        selectedNew: 0,
        selectedReview: 0,
        sessionSize: orderedRows.length,
      },
      meta: {
        weakSkills: [],
        hasWeaknessCandidates: false,
        hasReviewCandidates: false,
      },
    };
  } else {
    sessionPlan = buildPracticeSessionPlan({
      exercises: exerciseRows,
      progressRows,
      now,
      mode,
      size,
      filters,
    });
  }

  const hydratedItems = await hydrateAudioSource(sessionPlan.items);
  const persisted = options?.persist === false
    ? null
    : await createPracticeSessionRecords(db, {
      userId,
      mode,
      filters,
      sourceContext,
      timeLimitSec,
      items: hydratedItems,
    });

  const itemRows = persisted?.items || [];

  return {
    id: persisted?.session?.id || null,
    mode,
    label: PRACTICE_MODE_LABELS[mode] || PRACTICE_MODE_LABELS[PRACTICE_MODES.MIXED_REVIEW],
    filters,
    time_limit_sec: Number.isFinite(timeLimitSec) ? Math.max(0, timeLimitSec) : null,
    items: hydratedItems.map((item, index) => ({
      ...item,
      practice_item_id: itemRows[index]?.id || null,
    })),
    totals: sessionPlan.totals,
    meta: sessionPlan.meta,
  };
}
