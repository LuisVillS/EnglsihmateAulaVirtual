function toTimestamp(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getTime();
}

function pct(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function pushCount(map, key) {
  const current = map.get(key) || 0;
  map.set(key, current + 1);
}

function toTopList(map, limit = 10) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function loadTeacherDashboardData({ db, filters = {} }) {
  const from = filters.from || null;
  const to = filters.to || null;
  const levelFilter = String(filters.level || "").trim();
  const commissionFilter = String(filters.commissionId || "").trim();

  let progressQuery = db
    .from("user_progress")
    .select(
      `
      id,
      user_id,
      exercise_id,
      is_correct,
      attempts,
      last_practiced,
      last_quality,
      exercise:exercises (
        id,
        type,
        lesson_id,
        lesson:lessons (
          id,
          title,
          level,
          subject_id,
          subject:lesson_subjects (
            id,
            name
          )
        )
      )
    `
    )
    .order("last_practiced", { ascending: false });

  if (from) {
    progressQuery = progressQuery.gte("last_practiced", `${from}T00:00:00.000Z`);
  }
  if (to) {
    progressQuery = progressQuery.lte("last_practiced", `${to}T23:59:59.999Z`);
  }

  const { data: progressRows, error: progressError } = await progressQuery;
  if (progressError) {
    throw new Error(progressError.message || "No se pudo cargar progreso docente.");
  }

  const rows = progressRows || [];
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];

  let profilesById = new Map();
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await db
      .from("profiles")
      .select("id, full_name, commission_id, current_streak, course_level")
      .in("id", userIds);

    if (profilesError) {
      throw new Error(profilesError.message || "No se pudo cargar perfiles para dashboard docente.");
    }

    profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  }

  const filteredRows = rows.filter((row) => {
    const lessonLevel = row?.exercise?.lesson?.level || "";
    if (levelFilter && lessonLevel && lessonLevel !== levelFilter) return false;

    const profile = profilesById.get(row.user_id);
    if (commissionFilter && profile?.commission_id !== commissionFilter) return false;

    return true;
  });

  const totalAttempts = filteredRows.length;
  const correctAttempts = filteredRows.filter((row) => row.is_correct).length;
  const incorrectAttempts = totalAttempts - correctAttempts;

  const filteredUserIds = [...new Set(filteredRows.map((row) => row.user_id).filter(Boolean))];
  const streakValues = filteredUserIds
    .map((userId) => Number(profilesById.get(userId)?.current_streak || 0) || 0)
    .filter((value) => Number.isFinite(value));

  const averageStreak = streakValues.length
    ? Math.round((streakValues.reduce((sum, value) => sum + value, 0) / streakValues.length) * 10) / 10
    : 0;

  const errorByLesson = new Map();
  const errorBySubject = new Map();
  const errorByType = new Map();
  const errorByExercise = new Map();

  for (const row of filteredRows) {
    if (row.is_correct) continue;

    const lesson = row?.exercise?.lesson;
    const lessonKey = lesson?.title || "Sin lección";
    const subjectKey = lesson?.subject?.name || "Sin tema";
    const typeKey = row?.exercise?.type || "unknown";
    const exerciseKey = row?.exercise_id || "unknown";

    pushCount(errorByLesson, lessonKey);
    pushCount(errorBySubject, subjectKey);
    pushCount(errorByType, typeKey);
    pushCount(errorByExercise, exerciseKey);
  }

  const hardestExercises = toTopList(errorByExercise, 10).map((entry) => {
    const row = filteredRows.find((item) => item.exercise_id === entry.key);
    return {
      exercise_id: entry.key,
      errors: entry.count,
      type: row?.exercise?.type || "unknown",
      lesson_title: row?.exercise?.lesson?.title || "Sin lección",
      subject: row?.exercise?.lesson?.subject?.name || "Sin tema",
    };
  });

  return {
    totals: {
      attempts: totalAttempts,
      correct: correctAttempts,
      incorrect: incorrectAttempts,
      accuracy: pct(correctAttempts, totalAttempts),
      students: filteredUserIds.length,
      averageStreak,
    },
    rankings: {
      byLesson: toTopList(errorByLesson, 10),
      bySubject: toTopList(errorBySubject, 10),
      byType: toTopList(errorByType, 10),
      hardestExercises,
    },
    filters: {
      from,
      to,
      level: levelFilter || null,
      commissionId: commissionFilter || null,
    },
  };
}

export function summarizeProgressForTeacher(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const total = list.length;
  const correct = list.filter((row) => row.is_correct).length;
  const incorrect = total - correct;
  const due = list.filter((row) => toTimestamp(row.next_due_at) <= Date.now()).length;

  return {
    total,
    correct,
    incorrect,
    due,
    accuracy: pct(correct, total),
  };
}

