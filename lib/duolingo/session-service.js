import { buildSessionPlan } from "@/lib/duolingo/session-generator";
import { resolveAudioUrlFromContent } from "@/lib/duolingo/audio-cache";
import { TYPE_BY_LEGACY_KIND } from "@/lib/duolingo/constants";
import { normalizeExerciseType, parseContentJson } from "@/lib/duolingo/validation";

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
  };
}

async function loadPublishedExercises(db, { exerciseIds = [] } = {}) {
  const ids = normalizeExerciseIds(exerciseIds);
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
  }

  const { data, error } = await query
    .order("lesson_id", { ascending: true })
    .order("ordering", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudieron cargar ejercicios publicados.");
  }

  return data || [];
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

export async function generateStudentSession({ db, userId, now = new Date(), exerciseIds = [] }) {
  const requestedExerciseIds = normalizeExerciseIds(exerciseIds);

  if (requestedExerciseIds.length) {
    const publishedRows = await loadPublishedExercises(db, { exerciseIds: requestedExerciseIds });
    const byId = new Map(publishedRows.map((row) => [String(row.id), normalizeExerciseRow(row)]));
    const orderedItems = requestedExerciseIds
      .map((exerciseId) => byId.get(exerciseId))
      .filter(Boolean)
      .map((item) => ({ ...item, mode: "class" }));

    const items = await hydrateAudioSource(orderedItems);
    return {
      items,
      totals: {
        totalPublished: publishedRows.length,
        requested: requestedExerciseIds.length,
        selectedNew: 0,
        selectedReview: 0,
        sessionSize: items.length,
      },
    };
  }

  const [exercises, progressRows] = await Promise.all([
    loadPublishedExercises(db),
    loadProgressRows(db, userId),
  ]);

  const session = buildSessionPlan({
    exercises,
    progressRows,
    now,
  });

  const items = await hydrateAudioSource(session.items);

  return {
    items,
    totals: session.totals,
  };
}

