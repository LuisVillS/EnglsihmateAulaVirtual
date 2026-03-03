function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePointValue(value, fallback = 10) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round((parsed + Number.EPSILON) * 100) / 100));
}

export function parseLessonMarker(description) {
  const raw = String(description || "").trim();
  const templateMatch = raw.match(/^template:([^:]+):session:([^:]+)$/i);
  if (templateMatch) {
    return {
      kind: "template",
      ownerId: String(templateMatch[1] || "").trim(),
      containerId: String(templateMatch[2] || "").trim(),
      tableName: "template_session_items",
      foreignKey: "template_session_id",
    };
  }

  const commissionMatch = raw.match(/^commission:([^:]+):session:([^:]+)$/i);
  if (commissionMatch) {
    return {
      kind: "commission",
      ownerId: String(commissionMatch[1] || "").trim(),
      containerId: String(commissionMatch[2] || "").trim(),
      tableName: "session_items",
      foreignKey: "session_id",
    };
  }

  return null;
}

function cloneContentWithPoints(contentJson, pointValue) {
  const source =
    contentJson && typeof contentJson === "object" && !Array.isArray(contentJson)
      ? contentJson
      : {};
  return {
    ...source,
    point_value: normalizePointValue(pointValue, normalizePointValue(source.point_value, 10)),
  };
}

function sortItemRows(rows = []) {
  return [...rows].sort((left, right) => {
    const leftOrder = Number(left?.exercise_order || 0);
    const rightOrder = Number(right?.exercise_order || 0);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left?.created_at || "").localeCompare(String(right?.created_at || ""));
  });
}

async function loadContainerTestNumber(supabase, marker, fallbackNumber) {
  const tableName =
    marker?.kind === "commission"
      ? "course_sessions"
      : marker?.kind === "template"
      ? "template_sessions"
      : "";

  if (!tableName || !marker?.containerId) {
    return fallbackNumber;
  }

  const { data } = await supabase
    .from(tableName)
    .select("session_in_cycle")
    .eq("id", marker.containerId)
    .maybeSingle();

  const sessionNumber = toInt(data?.session_in_cycle, 0);
  return sessionNumber > 0 ? sessionNumber : fallbackNumber;
}

async function loadLegacyLessonExercises(supabase, lesson) {
  const { data, error } = await supabase
    .from("exercises")
    .select("id, title, type, status, prompt, content_json, ordering, created_at")
    .eq("lesson_id", lesson.id)
    .eq("status", "published")
    .order("ordering", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "No se pudo cargar la prueba.");
  }

  const exercises = (data || []).map((exercise) => ({
    ...exercise,
    title: String(exercise?.title || exercise?.prompt || "").trim() || "Exercise",
    content_json: cloneContentWithPoints(exercise?.content_json, exercise?.content_json?.point_value),
  }));

  return {
    title: String(lesson?.title || "").trim() || "Prueba de clase",
    testNumber: Math.max(1, toInt(lesson?.ordering, 1)),
    exercises,
  };
}

async function loadContainerItems(supabase, lesson, marker) {
  const fallbackNumber = Math.max(1, toInt(lesson?.ordering, 1));
  const selectColumns = ["id", "title", "exercise_id", "exercise_points", "exercise_order", "created_at"];
  let query = supabase
    .from(marker.tableName)
    .select(selectColumns.join(","))
    .eq(marker.foreignKey, marker.containerId)
    .eq("type", "exercise");

  let result = await query;
  if (result.error) {
    const missingColumn = getMissingColumnFromError(result.error);
    if (missingColumn === "exercise_points" || missingColumn === "exercise_order") {
      result = await supabase
        .from(marker.tableName)
        .select("id, title, exercise_id, created_at")
        .eq(marker.foreignKey, marker.containerId)
        .eq("type", "exercise");
    }
  }

  if (result.error) {
    throw new Error(result.error.message || "No se pudieron cargar ejercicios asignados.");
  }

  const itemRows = sortItemRows(result.data || []).map((item, index) => ({
    ...item,
    exercise_points: normalizePointValue(item?.exercise_points, 10),
    exercise_order: Number(item?.exercise_order || index + 1) || index + 1,
  }));
  const testNumber = await loadContainerTestNumber(supabase, marker, fallbackNumber);

  const exerciseIds = Array.from(
    new Set(itemRows.map((item) => String(item?.exercise_id || "").trim()).filter(Boolean))
  );
  if (!exerciseIds.length) {
    return {
      title: String(itemRows[0]?.title || lesson?.title || "").trim() || "Prueba de clase",
      testNumber,
      exercises: [],
    };
  }

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("exercises")
    .select("id, title, type, status, prompt, content_json, created_at")
    .in("id", exerciseIds);

  if (exerciseError) {
    throw new Error(exerciseError.message || "No se pudieron cargar ejercicios guardados.");
  }

  const exerciseById = new Map(
    (exerciseRows || []).map((exercise) => [String(exercise.id || "").trim(), exercise])
  );

  const exercises = itemRows
    .map((item) => {
      const exercise = exerciseById.get(String(item?.exercise_id || "").trim()) || null;
      const status = String(exercise?.status || "").trim().toLowerCase();
      if (!exercise?.id || status !== "published") return null;

      return {
        ...exercise,
        title: String(exercise?.title || exercise?.prompt || "").trim() || "Exercise",
        prompt: String(exercise?.prompt || exercise?.title || "").trim() || "Exercise",
        content_json: cloneContentWithPoints(exercise?.content_json, item.exercise_points),
      };
    })
    .filter(Boolean);

  return {
    title: String(itemRows[0]?.title || lesson?.title || "").trim() || "Prueba de clase",
    testNumber,
    exercises,
  };
}

export function extractLessonIdFromQuizUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/app\/clases\/([^/]+)\/prueba/i);
  return String(match?.[1] || "").trim();
}

export async function loadLessonQuizAssignments(supabase, lesson) {
  if (!lesson?.id) {
    return {
      title: "Prueba de clase",
      testNumber: 1,
      exercises: [],
    };
  }

  const marker = parseLessonMarker(lesson.description);
  if (!marker) {
    return loadLegacyLessonExercises(supabase, lesson);
  }

  return loadContainerItems(supabase, lesson, marker);
}
