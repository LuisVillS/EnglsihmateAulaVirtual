import { getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";

export const SKILL_TAG_VALUES = ["speaking", "reading", "grammar"];

export const SKILL_LABELS = {
  speaking: "Speaking",
  reading: "Reading",
  grammar: "Grammar",
  listening: "Listening",
};

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function clampScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

function round1(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((parsed + Number.EPSILON) * 10) / 10;
}

function average(values = []) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => clampScore(value))
    .filter((value) => value != null);
  if (!list.length) return null;
  const total = list.reduce((sum, value) => sum + value, 0);
  return round1(total / list.length);
}

function mergeCourseGrade(adminGrade, quizGrade) {
  const safeAdmin = clampScore(adminGrade);
  const safeQuiz = clampScore(quizGrade);
  if (safeAdmin == null && safeQuiz == null) return null;
  if (safeAdmin == null) return round1(safeQuiz);
  if (safeQuiz == null) return round1(safeAdmin);
  return round1((safeAdmin * 0.5) + (safeQuiz * 0.5));
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

function isMissingObjectError(error, objectName) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes(`relation "${String(objectName || "").toLowerCase()}" does not exist`) ||
    message.includes(`column ${String(objectName || "").toLowerCase()} does not exist`) ||
    message.includes(`could not find the '${String(objectName || "").toLowerCase()}' column`)
  );
}

function isMissingQuizAttemptsRestartColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("restart_count") && message.includes("lesson_quiz_attempts");
}

function toTimestamp(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getTime();
}

function normalizeSkillTag(value) {
  const raw = cleanText(value).toLowerCase();
  if (SKILL_TAG_VALUES.includes(raw)) return raw;
  return null;
}

function deriveSkillTagFromExerciseType(type) {
  const normalizedType = cleanText(type).toLowerCase();
  if (normalizedType === "scramble" || normalizedType === "cloze") return "grammar";
  if (normalizedType === "image_match" || normalizedType === "pairs") return "reading";
  if (normalizedType === "audio_match") return "speaking";
  return "grammar";
}

export function normalizeLevelCode(value) {
  const raw = cleanText(value).toUpperCase();
  if (!raw) return "";
  const match = raw.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  if (match?.[1]) return match[1];
  return "";
}

function resolveProgressScore(row) {
  const byScore = clampScore(row?.score_awarded);
  if (byScore != null) return byScore;

  const status = cleanText(row?.final_status).toLowerCase();
  if (status === "passed") return 100;
  if (status === "failed") return 0;

  return row?.is_correct ? 100 : 0;
}

function mergeSkillScore(current, historical) {
  const safeCurrent = clampScore(current);
  const safeHistorical = clampScore(historical);
  if (safeCurrent == null && safeHistorical == null) return null;
  if (safeCurrent == null) return round1(safeHistorical);
  if (safeHistorical == null) return round1(safeCurrent);
  return round1((safeCurrent * 0.5) + (safeHistorical * 0.5));
}

function groupByUserId(rows = []) {
  return (rows || []).reduce((acc, row) => {
    const userId = cleanText(row?.user_id);
    if (!userId) return acc;
    const current = acc.get(userId) || [];
    current.push(row);
    acc.set(userId, current);
    return acc;
  }, new Map());
}

function buildSkillAverageMap(progressRows = [], currentLevel = "") {
  const levelCode = normalizeLevelCode(currentLevel);
  const bucket = {
    speaking: [],
    reading: [],
    grammar: [],
  };

  for (const row of progressRows || []) {
    const lessonLevel = normalizeLevelCode(row?.exercise?.lesson?.level);
    if (levelCode && lessonLevel && lessonLevel !== levelCode) continue;

    const skillTag = normalizeSkillTag(row?.exercise?.skill_tag) || deriveSkillTagFromExerciseType(row?.exercise?.type);
    if (!SKILL_TAG_VALUES.includes(skillTag)) continue;
    bucket[skillTag].push(resolveProgressScore(row));
  }

  return {
    speaking: average(bucket.speaking),
    reading: average(bucket.reading),
    grammar: average(bucket.grammar),
  };
}

function buildHistoryAverageMap(historyRows = [], currentLevel = "") {
  const currentLevelCode = normalizeLevelCode(currentLevel);
  const previousRows = (historyRows || []).filter((row) => {
    const snapshotLevel = normalizeLevelCode(row?.level);
    if (!snapshotLevel) return true;
    if (!currentLevelCode) return true;
    return snapshotLevel !== currentLevelCode;
  });

  if (!previousRows.length) {
    return {
      speaking: null,
      reading: null,
      grammar: null,
      listening: null,
      grade: null,
      count: 0,
    };
  }

  return {
    speaking: average(previousRows.map((row) => row.final_speaking_0_100)),
    reading: average(previousRows.map((row) => row.final_reading_0_100)),
    grammar: average(previousRows.map((row) => row.final_grammar_0_100)),
    listening: average(previousRows.map((row) => row.final_listening_0_100)),
    grade: average(previousRows.map((row) => row.final_grade_0_100)),
    count: previousRows.length,
  };
}

function pickRowByLevel(rows = [], level = "") {
  const levelCode = normalizeLevelCode(level);
  if (!rows.length) return null;

  if (levelCode) {
    const exact = rows.find((row) => normalizeLevelCode(row?.level) === levelCode);
    if (exact) return exact;
  }

  return [...rows].sort((a, b) => toTimestamp(b?.updated_at || b?.created_at) - toTimestamp(a?.updated_at || a?.created_at))[0] || null;
}

function buildStudentSkillsBundle({
  progressRows = [],
  historyRows = [],
  overrideRows = [],
  currentLevel = "",
}) {
  const current = buildSkillAverageMap(progressRows, currentLevel);
  const history = buildHistoryAverageMap(historyRows, currentLevel);
  const listeningOverride = pickRowByLevel(overrideRows, currentLevel);
  const currentListening = clampScore(listeningOverride?.listening_value_0_100);

  const combined = {
    speaking: mergeSkillScore(current.speaking, history.speaking),
    reading: mergeSkillScore(current.reading, history.reading),
    grammar: mergeSkillScore(current.grammar, history.grammar),
    listening: mergeSkillScore(currentListening, history.listening),
  };

  return {
    current: {
      ...current,
      listening: currentListening,
    },
    historical: history,
    combined,
  };
}

async function loadProgressRowsByUserIds(db, userIds = []) {
  const ids = Array.from(new Set((userIds || []).map((value) => cleanText(value)).filter(Boolean)));
  if (!ids.length) return [];

  let includeScoreColumns = true;
  let includeSkillTag = true;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const baseColumns = [
      "user_id",
      "exercise_id",
      "is_correct",
      "updated_at",
      "last_practiced",
    ];
    if (includeScoreColumns) {
      baseColumns.push("score_awarded", "final_status", "answered_at");
    }

    const exerciseColumns = includeSkillTag
      ? "id, type, skill_tag, lesson:lessons (id, level)"
      : "id, type, lesson:lessons (id, level)";

    const { data, error } = await db
      .from("user_progress")
      .select(`${baseColumns.join(",")}, exercise:exercises (${exerciseColumns})`)
      .in("user_id", ids);

    if (!error) {
      return (data || []).map((row) => {
        const rawSkillTag = row?.exercise?.skill_tag;
        return {
          ...row,
          exercise: {
            ...(row?.exercise || {}),
            skill_tag: normalizeSkillTag(rawSkillTag) || deriveSkillTagFromExerciseType(row?.exercise?.type),
          },
        };
      });
    }

    const missingColumn = getMissingColumnFromError(error);
    const missingTable = getMissingTableName(error);
    if (
      missingTable?.endsWith("user_progress") ||
      missingTable?.endsWith("exercises") ||
      missingTable?.endsWith("lessons")
    ) {
      return [];
    }
    if (includeScoreColumns && (
      missingColumn === "score_awarded" ||
      missingColumn === "final_status" ||
      missingColumn === "answered_at"
    )) {
      includeScoreColumns = false;
      continue;
    }
    if (includeSkillTag && missingColumn === "skill_tag") {
      includeSkillTag = false;
      continue;
    }

    throw new Error(error.message || "No se pudo cargar progreso de habilidades.");
  }

  return [];
}

async function loadRowsByUserIdsWithFallback({
  db,
  table,
  columns,
  userIds = [],
}) {
  const ids = Array.from(new Set((userIds || []).map((value) => cleanText(value)).filter(Boolean)));
  if (!ids.length) return [];

  const { data, error } = await db
    .from(table)
    .select(columns)
    .in("user_id", ids);

  if (!error) return data || [];
  if (isMissingObjectError(error, table)) return [];
  throw new Error(error.message || `No se pudo cargar ${table}.`);
}

async function loadQuizAttemptsByStudent(db, studentId) {
  const userId = cleanText(studentId);
  if (!userId) return [];

  const primary = await db
    .from("lesson_quiz_attempts")
    .select("id, lesson_id, attempt_status, score_percent, restart_count, completed_at, updated_at")
    .eq("user_id", userId)
    .eq("attempt_status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (!primary.error) return primary.data || [];
  if (isMissingTableError(primary.error, "lesson_quiz_attempts")) return [];

  if (isMissingQuizAttemptsRestartColumnError(primary.error)) {
    const fallback = await db
      .from("lesson_quiz_attempts")
      .select("id, lesson_id, attempt_status, score_percent, completed_at, updated_at")
      .eq("user_id", userId)
      .eq("attempt_status", "completed")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false });
    if (!fallback.error) {
      return (fallback.data || []).map((row) => ({ ...row, restart_count: 0 }));
    }
    if (isMissingTableError(fallback.error, "lesson_quiz_attempts")) return [];
    throw new Error(fallback.error.message || "No se pudieron cargar pruebas del alumno.");
  }

  throw new Error(primary.error.message || "No se pudieron cargar pruebas del alumno.");
}

async function loadQuizAttemptsByUserIds(db, userIds = []) {
  const ids = Array.from(new Set((userIds || []).map((value) => cleanText(value)).filter(Boolean)));
  if (!ids.length) return [];

  const primary = await db
    .from("lesson_quiz_attempts")
    .select("id, user_id, lesson_id, attempt_status, score_percent, completed_at, updated_at")
    .in("user_id", ids)
    .eq("attempt_status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (!primary.error) return primary.data || [];
  if (isMissingTableError(primary.error, "lesson_quiz_attempts")) return [];
  throw new Error(primary.error.message || "No se pudieron cargar pruebas de alumnos.");
}

function computeQuizAverageForLevel(quizAttempts = [], lessonMap = new Map(), currentLevel = "") {
  const levelCode = normalizeLevelCode(currentLevel);
  const latestByLesson = new Map();

  for (const attempt of Array.isArray(quizAttempts) ? quizAttempts : []) {
    const lessonId = cleanText(attempt?.lesson_id);
    if (!lessonId) continue;

    const lesson = lessonMap.get(lessonId) || null;
    const lessonLevel = normalizeLevelCode(lesson?.level);
    if (levelCode && lessonLevel && lessonLevel !== levelCode) continue;

    if (!latestByLesson.has(lessonId)) {
      latestByLesson.set(lessonId, attempt);
    }
  }

  const scores = [...latestByLesson.values()].map((attempt) => clampScore(attempt?.score_percent));
  return average(scores);
}

function isMissingTableError(error, tableName) {
  return getMissingTableName(error)?.endsWith(tableName);
}

async function loadLessonsByIds(db, lessonIds = []) {
  const ids = Array.from(new Set((lessonIds || []).map((value) => cleanText(value)).filter(Boolean)));
  if (!ids.length) return new Map();

  const { data, error } = await db
    .from("lessons")
    .select("id, title, level")
    .in("id", ids);

  if (error) {
    if (isMissingTableError(error, "lessons")) return new Map();
    throw new Error(error.message || "No se pudieron cargar lecciones para pruebas.");
  }

  return new Map((data || []).map((row) => [row.id, row]));
}

async function loadStudentsBaseRows(db, { commissionId = "", level = "", query = "" } = {}) {
  const safeCommissionId = cleanText(commissionId);
  const safeLevel = normalizeLevelCode(level);
  const search = cleanText(query).toLowerCase();

  let columns = [
    "id",
    "full_name",
    "student_code",
    "course_level",
    "status",
    "commission_id",
    "student_grade",
    "updated_at",
    "commission:course_commissions (id, course_level, commission_number, status, is_active, end_date)",
  ];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let queryBuilder = db
      .from("profiles")
      .select(columns.join(","))
      .eq("role", "student");

    if (safeCommissionId) {
      queryBuilder = queryBuilder.eq("commission_id", safeCommissionId);
    }

    const { data, error } = await queryBuilder.order("full_name", { ascending: true });
    if (error) {
      const missingColumn = getMissingColumnFromError(error);
      if (missingColumn && columns.includes(missingColumn)) {
        columns = columns.filter((column) => column !== missingColumn);
        continue;
      }
      throw new Error(error.message || "No se pudo cargar alumnos del dashboard docente.");
    }

    const rows = (data || []).map((row) => {
      const currentLevel = normalizeLevelCode(row.course_level || row?.commission?.course_level);
      return {
        ...row,
        current_level: currentLevel || null,
      };
    });

    return rows.filter((row) => {
      if (safeLevel && row.current_level !== safeLevel) return false;
      if (!search) return true;
      const haystack = `${cleanText(row.full_name)} ${cleanText(row.student_code)}`.toLowerCase();
      return haystack.includes(search);
    });
  }

  return [];
}

function buildCommissionStatus(row) {
  const todayIso = getLimaTodayISO();
  const commission = row?.commission || null;
  const status = commission ? resolveCommissionStatus(commission, todayIso) : "inactive";
  if (status === "active" && cleanText(row?.status).toLowerCase() !== "inactive") {
    return "active";
  }
  return "inactive";
}

function sortStudentsForDashboard(rows = []) {
  return [...rows].sort((a, b) => {
    const aActive = buildCommissionStatus(a) === "active";
    const bActive = buildCommissionStatus(b) === "active";
    if (aActive !== bActive) return aActive ? -1 : 1;
    return cleanText(a?.full_name).localeCompare(cleanText(b?.full_name), "es", { sensitivity: "base" });
  });
}

function buildLevelSpecificValue(rows = [], level, fieldName) {
  const match = pickRowByLevel(rows, level);
  return clampScore(match?.[fieldName]);
}

export async function loadTeacherStudentsOverview({ db, filters = {} }) {
  const students = await loadStudentsBaseRows(db, filters);
  const sortedStudents = sortStudentsForDashboard(students);
  const userIds = sortedStudents.map((row) => row.id);

  const [progressRows, historyRows, overrideRows, gradeRows, quizAttemptRows, commissionsResult] = await Promise.all([
    loadProgressRowsByUserIds(db, userIds),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_level_history",
      columns:
        "user_id, level, started_at, completed_at, final_grade_0_100, final_speaking_0_100, final_reading_0_100, final_grammar_0_100, final_listening_0_100, notes, updated_at",
      userIds,
    }),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_skill_overrides",
      columns: "user_id, level, listening_value_0_100, updated_at",
      userIds,
    }),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_course_grades",
      columns: "user_id, level, admin_grade_0_100, comment, updated_at",
      userIds,
    }),
    loadQuizAttemptsByUserIds(db, userIds),
    db
      .from("course_commissions")
      .select("id, course_level, commission_number")
      .order("course_level", { ascending: true })
      .order("commission_number", { ascending: true }),
  ]);

  const progressByUser = groupByUserId(progressRows);
  const historyByUser = groupByUserId(historyRows);
  const overridesByUser = groupByUserId(overrideRows);
  const gradesByUser = groupByUserId(gradeRows);
  const quizAttemptsByUser = groupByUserId(quizAttemptRows);
  const lessonMap = await loadLessonsByIds(
    db,
    (quizAttemptRows || []).map((row) => row.lesson_id)
  );

  const rows = sortedStudents.map((student) => {
    const currentLevel = student.current_level || "";
    const bundle = buildStudentSkillsBundle({
      progressRows: progressByUser.get(student.id) || [],
      historyRows: historyByUser.get(student.id) || [],
      overrideRows: overridesByUser.get(student.id) || [],
      currentLevel,
    });

    const gradeForLevel = buildLevelSpecificValue(gradesByUser.get(student.id) || [], currentLevel, "admin_grade_0_100");
    const adminGrade = gradeForLevel != null ? gradeForLevel : clampScore(student.student_grade);
    const quizGrade = computeQuizAverageForLevel(
      quizAttemptsByUser.get(student.id) || [],
      lessonMap,
      currentLevel
    );
    const currentGrade = mergeCourseGrade(adminGrade, quizGrade);
    const commissionStatus = buildCommissionStatus(student);

    return {
      id: student.id,
      full_name: student.full_name || "Sin nombre",
      student_code: student.student_code || "",
      commission_id: student.commission_id || null,
      commission_label: student.commission
        ? `${student.commission.course_level} #${student.commission.commission_number}`
        : "Sin comisión",
      current_level: currentLevel || null,
      status: commissionStatus,
      course_average: currentGrade,
      admin_grade: adminGrade,
      quiz_grade: quizGrade,
      skills: bundle.combined,
      updated_at: student.updated_at || null,
    };
  });

  return {
    filters: {
      commissionId: cleanText(filters.commissionId),
      level: normalizeLevelCode(filters.level),
      query: cleanText(filters.query),
    },
    commissions: commissionsResult.data || [],
    students: rows,
  };
}

export async function loadTeacherStudentProfile({ db, studentId }) {
  const userId = cleanText(studentId);
  if (!userId) {
    throw new Error("Alumno inválido.");
  }

  let studentColumns = [
    "id",
    "full_name",
    "student_code",
    "course_level",
    "status",
    "student_grade",
    "commission_id",
    "commission:course_commissions (id, course_level, commission_number, status, is_active, end_date)",
  ];
  let student = null;
  let studentError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await db
      .from("profiles")
      .select(studentColumns.join(","))
      .eq("id", userId)
      .eq("role", "student")
      .maybeSingle();

    student = result.data;
    studentError = result.error;
    if (!studentError) break;

    const missingColumn = getMissingColumnFromError(studentError);
    if (missingColumn && studentColumns.includes(missingColumn)) {
      studentColumns = studentColumns.filter((column) => column !== missingColumn);
      continue;
    }
    break;
  }

  if (studentError) {
    throw new Error(studentError.message || "No se pudo cargar perfil del alumno.");
  }
  if (!student?.id) {
    throw new Error("Alumno no encontrado.");
  }

  const currentLevel = normalizeLevelCode(student.course_level || student?.commission?.course_level);
  const [progressRows, historyRows, overrideRows, gradeRows, quizAttempts] = await Promise.all([
    loadProgressRowsByUserIds(db, [student.id]),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_level_history",
      columns:
        "id, user_id, level, started_at, completed_at, final_grade_0_100, final_speaking_0_100, final_reading_0_100, final_grammar_0_100, final_listening_0_100, notes, updated_at",
      userIds: [student.id],
    }),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_skill_overrides",
      columns: "id, user_id, level, listening_value_0_100, updated_by, updated_at",
      userIds: [student.id],
    }),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_course_grades",
      columns: "id, user_id, level, admin_grade_0_100, comment, updated_by, updated_at",
      userIds: [student.id],
    }),
    loadQuizAttemptsByStudent(db, student.id),
  ]);

  const bundle = buildStudentSkillsBundle({
    progressRows,
    historyRows,
    overrideRows,
    currentLevel,
  });

  const gradeForLevel = buildLevelSpecificValue(gradeRows, currentLevel, "admin_grade_0_100");
  const adminGrade = gradeForLevel != null ? gradeForLevel : clampScore(student.student_grade);
  const gradeRow = pickRowByLevel(gradeRows, currentLevel);

  const lessonMap = await loadLessonsByIds(
    db,
    (quizAttempts || []).map((row) => row.lesson_id)
  );

  const tests = (quizAttempts || [])
    .map((attempt) => {
      const lesson = lessonMap.get(attempt.lesson_id) || null;
      const lessonLevel = normalizeLevelCode(lesson?.level);
      if (currentLevel && lessonLevel && lessonLevel !== currentLevel) {
        return null;
      }
      const score = clampScore(attempt.score_percent) ?? 0;
      const restartCount = Number.isFinite(Number(attempt.restart_count)) ? Number(attempt.restart_count) : 0;
      const attemptsUsed = Math.max(1, restartCount + 1);
      const completedAt = attempt.completed_at || attempt.updated_at || null;
      return {
        id: attempt.id,
        lesson_id: attempt.lesson_id,
        lesson_title: lesson?.title || "Prueba",
        level: lesson?.level || null,
        score,
        attempts_used: attemptsUsed,
        completed_at: completedAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => toTimestamp(b.completed_at) - toTimestamp(a.completed_at));
  const quizGrade = average((tests || []).map((row) => row.score));
  const currentGrade = mergeCourseGrade(adminGrade, quizGrade);

  const testEvolution = [...tests]
    .slice(0, 20)
    .reverse()
    .map((row, idx) => ({
      x: idx + 1,
      label: row.completed_at ? new Date(row.completed_at).toLocaleDateString("es-PE") : `Intento ${idx + 1}`,
      score: row.score,
      lesson_title: row.lesson_title,
    }));

  const history = [...historyRows].sort((a, b) => toTimestamp(b.completed_at || b.updated_at) - toTimestamp(a.completed_at || a.updated_at));

  return {
    student: {
      id: student.id,
      full_name: student.full_name || "Sin nombre",
      student_code: student.student_code || "",
      commission_label: student.commission
        ? `${student.commission.course_level} #${student.commission.commission_number}`
        : "Sin comisión",
      current_level: currentLevel || null,
      status: buildCommissionStatus(student),
      current_grade: currentGrade,
      admin_grade: adminGrade,
      quiz_grade: quizGrade,
      current_grade_comment: gradeRow?.comment || "",
    },
    skills: bundle,
    tests,
    test_evolution: testEvolution,
    history,
  };
}

async function loadStudentLevelAndGradeFallback(db, userId) {
  const { data, error } = await db
    .from("profiles")
    .select("id, course_level, student_grade, commission:course_commissions (course_level)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "No se pudo cargar perfil del alumno.");
  if (!data?.id) throw new Error("Alumno no encontrado.");
  return {
    level: normalizeLevelCode(data.course_level || data?.commission?.course_level),
    fallbackGrade: clampScore(data.student_grade),
  };
}

export async function setStudentAdminGrade({
  db,
  actorId,
  userId,
  level,
  adminGrade,
  comment = "",
}) {
  const studentId = cleanText(userId);
  if (!studentId) throw new Error("Alumno inválido.");

  const grade = clampScore(adminGrade);
  if (grade == null) throw new Error("La nota debe estar entre 0 y 100.");

  const levelFallback = await loadStudentLevelAndGradeFallback(db, studentId);
  const resolvedLevel = normalizeLevelCode(level) || levelFallback.level;
  if (!resolvedLevel) throw new Error("No se pudo resolver el nivel del alumno.");

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: studentId,
    level: resolvedLevel,
    admin_grade_0_100: grade,
    comment: cleanText(comment) || null,
    updated_by: actorId || null,
    updated_at: nowIso,
  };

  const { data, error } = await db
    .from("student_course_grades")
    .upsert(payload, { onConflict: "user_id,level" })
    .select("user_id, level, admin_grade_0_100, comment, updated_by, updated_at")
    .maybeSingle();

  if (error) {
    if (isMissingObjectError(error, "student_course_grades")) {
      throw new Error("Falta tabla student_course_grades. Ejecuta SQL actualizado.");
    }
    throw new Error(error.message || "No se pudo actualizar nota del alumno.");
  }

  if (!levelFallback.level || levelFallback.level === resolvedLevel) {
    await db
      .from("profiles")
      .update({ student_grade: grade })
      .eq("id", studentId);
  }

  return data || payload;
}

export async function setStudentListeningOverride({
  db,
  actorId,
  userId,
  level,
  listeningValue,
}) {
  const studentId = cleanText(userId);
  if (!studentId) throw new Error("Alumno inválido.");

  const listening = clampScore(listeningValue);
  if (listening == null) throw new Error("Listening debe estar entre 0 y 100.");

  const levelFallback = await loadStudentLevelAndGradeFallback(db, studentId);
  const resolvedLevel = normalizeLevelCode(level) || levelFallback.level;
  if (!resolvedLevel) throw new Error("No se pudo resolver el nivel del alumno.");

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: studentId,
    level: resolvedLevel,
    listening_value_0_100: listening,
    updated_by: actorId || null,
    updated_at: nowIso,
  };

  const { data, error } = await db
    .from("student_skill_overrides")
    .upsert(payload, { onConflict: "user_id,level" })
    .select("user_id, level, listening_value_0_100, updated_by, updated_at")
    .maybeSingle();

  if (error) {
    if (isMissingObjectError(error, "student_skill_overrides")) {
      throw new Error("Falta tabla student_skill_overrides. Ejecuta SQL actualizado.");
    }
    throw new Error(error.message || "No se pudo actualizar listening.");
  }

  return data || payload;
}

export async function closeStudentLevel({
  db,
  actorId,
  userId,
  level,
  startedAt = null,
  completedAt = null,
  notes = "",
}) {
  const studentId = cleanText(userId);
  if (!studentId) throw new Error("Alumno inválido.");

  const levelFallback = await loadStudentLevelAndGradeFallback(db, studentId);
  const resolvedLevel = normalizeLevelCode(level) || levelFallback.level;
  if (!resolvedLevel) throw new Error("No se pudo resolver el nivel del alumno.");

  const [profileData, historyRows, gradeRows, overrideRows, progressRows] = await Promise.all([
    loadStudentLevelAndGradeFallback(db, studentId),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_level_history",
      columns:
        "id, user_id, level, started_at, completed_at, final_grade_0_100, final_speaking_0_100, final_reading_0_100, final_grammar_0_100, final_listening_0_100, notes, updated_at",
      userIds: [studentId],
    }),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_course_grades",
      columns: "user_id, level, admin_grade_0_100, comment, updated_at",
      userIds: [studentId],
    }),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_skill_overrides",
      columns: "user_id, level, listening_value_0_100, updated_at",
      userIds: [studentId],
    }),
    loadProgressRowsByUserIds(db, [studentId]),
  ]);

  const skillMap = buildSkillAverageMap(progressRows, resolvedLevel);
  const listeningRow = pickRowByLevel(overrideRows, resolvedLevel);
  const listening = clampScore(listeningRow?.listening_value_0_100);
  const gradeRow = pickRowByLevel(gradeRows, resolvedLevel);
  const adminGrade = clampScore(gradeRow?.admin_grade_0_100) ?? profileData.fallbackGrade ?? 0;
  const quizAttempts = await loadQuizAttemptsByStudent(db, studentId);
  const lessonMap = await loadLessonsByIds(
    db,
    (quizAttempts || []).map((row) => row.lesson_id)
  );
  const quizGrade = computeQuizAverageForLevel(quizAttempts, lessonMap, resolvedLevel);
  const grade = mergeCourseGrade(adminGrade, quizGrade) ?? 0;
  const previousSnapshot = pickRowByLevel(historyRows, resolvedLevel);

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: studentId,
    level: resolvedLevel,
    started_at: startedAt || previousSnapshot?.started_at || null,
    completed_at: completedAt || nowIso,
    final_grade_0_100: grade,
    final_speaking_0_100: clampScore(skillMap.speaking) ?? 0,
    final_reading_0_100: clampScore(skillMap.reading) ?? 0,
    final_grammar_0_100: clampScore(skillMap.grammar) ?? 0,
    final_listening_0_100: listening ?? 0,
    notes: cleanText(notes) || null,
    updated_by: actorId || null,
    updated_at: nowIso,
  };

  const { data, error } = await db
    .from("student_level_history")
    .upsert(payload, { onConflict: "user_id,level" })
    .select(
      "id, user_id, level, started_at, completed_at, final_grade_0_100, final_speaking_0_100, final_reading_0_100, final_grammar_0_100, final_listening_0_100, notes, updated_at"
    )
    .maybeSingle();

  if (error) {
    if (isMissingObjectError(error, "student_level_history")) {
      throw new Error("Falta tabla student_level_history. Ejecuta SQL actualizado.");
    }
    throw new Error(error.message || "No se pudo cerrar nivel del alumno.");
  }

  return data || payload;
}

export async function loadStudentAppSkillSnapshot({
  db,
  userId,
  currentLevel,
}) {
  const studentId = cleanText(userId);
  if (!studentId) {
    return {
      current: { speaking: null, reading: null, grammar: null, listening: null },
      historical: { speaking: null, reading: null, grammar: null, listening: null, grade: null, count: 0 },
      combined: { speaking: null, reading: null, grammar: null, listening: null },
    };
  }

  const levelCode = normalizeLevelCode(currentLevel);
  const [progressRows, historyRows, overrideRows] = await Promise.all([
    loadProgressRowsByUserIds(db, [studentId]),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_level_history",
      columns:
        "user_id, level, completed_at, final_grade_0_100, final_speaking_0_100, final_reading_0_100, final_grammar_0_100, final_listening_0_100",
      userIds: [studentId],
    }),
    loadRowsByUserIdsWithFallback({
      db,
      table: "student_skill_overrides",
      columns: "user_id, level, listening_value_0_100, updated_at",
      userIds: [studentId],
    }),
  ]);

  return buildStudentSkillsBundle({
    progressRows,
    historyRows,
    overrideRows,
    currentLevel: levelCode,
  });
}
