const EXERCISE_ACTIVE_STATUSES = new Set(["draft", "published"]);

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeStatus(value, fallback = "draft") {
  const raw = cleanText(value).toLowerCase();
  if (raw === "draft" || raw === "published" || raw === "archived" || raw === "deleted") {
    return raw;
  }
  return fallback;
}

function isMissingDatabaseObject(error, objectName) {
  const message = String(error?.message || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes(`relation "${objectName}" does not exist`) ||
    message.includes(`column ${objectName} does not exist`) ||
    message.includes(`could not find the '${objectName}' column`)
  );
}

async function countRowsByExercise(db, tableName, exerciseId) {
  const { count, error } = await db
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq("exercise_id", exerciseId);

  if (error) {
    if (
      isMissingDatabaseObject(error, tableName) ||
      isMissingDatabaseObject(error, "exercise_id")
    ) {
      return 0;
    }
    throw new Error(error.message || `No se pudo contar referencias en ${tableName}.`);
  }

  return Number(count || 0);
}

export async function getExerciseUsageSnapshot(db, exerciseId) {
  const safeExerciseId = cleanText(exerciseId);
  if (!safeExerciseId) return null;

  const { data: exercise, error: exerciseError } = await db
    .from("exercises")
    .select("id, lesson_id, status")
    .eq("id", safeExerciseId)
    .maybeSingle();

  if (exerciseError) {
    throw new Error(exerciseError.message || "No se pudo validar ejercicio.");
  }
  if (!exercise?.id) return null;

  let lesson = null;
  if (exercise.lesson_id) {
    const { data: lessonRow, error: lessonError } = await db
      .from("lessons")
      .select("id, status, description")
      .eq("id", exercise.lesson_id)
      .maybeSingle();

    if (lessonError && !isMissingDatabaseObject(lessonError, "lessons")) {
      throw new Error(lessonError.message || "No se pudo validar la lección del ejercicio.");
    }
    lesson = lessonRow || null;
  }

  const [templateLinkCount, sessionLinkCount, progressCount] = await Promise.all([
    countRowsByExercise(db, "template_session_items", safeExerciseId),
    countRowsByExercise(db, "session_items", safeExerciseId),
    countRowsByExercise(db, "user_progress", safeExerciseId),
  ]);

  const lessonStatus = normalizeStatus(lesson?.status, "");
  const lessonIsActive = Boolean(lesson?.id) && EXERCISE_ACTIVE_STATUSES.has(lessonStatus);
  const hasLinkReferences = templateLinkCount > 0 || sessionLinkCount > 0;

  return {
    exerciseId: safeExerciseId,
    status: normalizeStatus(exercise.status, "draft"),
    lessonId: exercise.lesson_id || null,
    lessonStatus,
    lessonDescription: cleanText(lesson?.description),
    lessonIsActive,
    templateLinkCount,
    sessionLinkCount,
    progressCount,
    hasLinkReferences,
  };
}

export async function archiveExerciseIfOrphan({
  db,
  exerciseId,
  actorId = null,
  ignoreLessonReference = false,
}) {
  const snapshot = await getExerciseUsageSnapshot(db, exerciseId);
  if (!snapshot) {
    return { changed: false, reason: "missing" };
  }

  const stillReferenced =
    snapshot.hasLinkReferences || (!ignoreLessonReference && snapshot.lessonIsActive);
  if (stillReferenced) {
    return { changed: false, reason: "referenced", snapshot };
  }

  if (snapshot.status === "archived" || snapshot.status === "deleted") {
    return { changed: false, reason: "already_archived", snapshot };
  }

  const payload = {
    status: "archived",
    updated_at: new Date().toISOString(),
  };
  if (actorId) {
    payload.updated_by = actorId;
    payload.last_editor = actorId;
  }

  const { error } = await db.from("exercises").update(payload).eq("id", snapshot.exerciseId);
  if (error) {
    throw new Error(error.message || "No se pudo archivar ejercicio huérfano.");
  }

  return { changed: true, reason: "archived", snapshot };
}

export async function archiveExercisesIfOrphaned({
  db,
  exerciseIds,
  actorId = null,
  ignoreLessonReference = false,
}) {
  const ids = Array.from(
    new Set((exerciseIds || []).map((value) => cleanText(value)).filter(Boolean))
  );
  if (!ids.length) {
    return { archived: 0, checked: 0 };
  }

  let archived = 0;
  for (const exerciseId of ids) {
    const result = await archiveExerciseIfOrphan({
      db,
      exerciseId,
      actorId,
      ignoreLessonReference,
    });
    if (result.changed) archived += 1;
  }

  return { archived, checked: ids.length };
}

export async function runExerciseGarbageCollection({ db, actorId = null }) {
  const { data: candidates, error } = await db
    .from("exercises")
    .select("id")
    .in("status", ["archived", "deleted"])
    .limit(2000);

  if (error) {
    throw new Error(error.message || "No se pudo cargar ejercicios candidatos a limpieza.");
  }

  let deleted = 0;
  let keptWithHistory = 0;
  let skippedReferenced = 0;

  for (const row of candidates || []) {
    const snapshot = await getExerciseUsageSnapshot(db, row.id);
    if (!snapshot) continue;

    const hasActiveReferences =
      snapshot.hasLinkReferences || snapshot.lessonIsActive || snapshot.progressCount > 0;

    if (snapshot.progressCount > 0) {
      keptWithHistory += 1;
      continue;
    }

    if (hasActiveReferences) {
      skippedReferenced += 1;
      continue;
    }

    const { error: deleteError } = await db.from("exercises").delete().eq("id", snapshot.exerciseId);
    if (deleteError) {
      throw new Error(deleteError.message || "No se pudo eliminar ejercicio huérfano.");
    }
    deleted += 1;
  }

  return {
    scanned: (candidates || []).length,
    deleted,
    keptWithHistory,
    skippedReferenced,
    actorId: actorId || null,
  };
}
