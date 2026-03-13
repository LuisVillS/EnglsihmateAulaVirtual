import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import {
  buildSessionDraftsFromCommission,
  buildLimaDateTimeIso,
  formatSessionDateLabel,
} from "@/lib/course-sessions";
import CourseSessionList from "@/components/course-session-list";
import { formatMonthKeyFromDate } from "@/lib/class-format";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { buildWeightedCourseGrade } from "@/lib/course-grade";
import { extractLessonIdFromQuizUrl } from "@/lib/lesson-quiz-assignments";

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

function parseDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

function getSessionCycleKey(session) {
  const byCycle = normalizeMonthKey(session?.cycle_month);
  if (byCycle) return byCycle;
  return formatMonthKeyFromDate(session?.starts_at || session?.session_date);
}

function getSessionEndMs(session) {
  const end = parseDateValue(session?.ends_at);
  if (end) return end.getTime();
  const start = parseDateValue(session?.starts_at);
  if (start) return start.getTime() + 60 * 60 * 1000;
  return Number.NaN;
}

function getSessionStartMs(session) {
  const start = parseDateValue(session?.starts_at || session?.session_date);
  return start ? start.getTime() : Number.NaN;
}

function computeCourseMetrics(sessions, nowIso) {
  const nowMs = new Date(nowIso).getTime();
  const total = sessions.length;
  const completed = sessions.filter((session) => {
    const endMs = getSessionEndMs(session);
    return Number.isFinite(endMs) && nowMs > endMs;
  }).length;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  return {
    total,
    completed,
    progress,
  };
}

function resolveCurrentCycleMonthKey(sessions, nowIso) {
  const nowMs = new Date(nowIso).getTime();
  const byCycle = new Map();

  for (const session of sessions || []) {
    const key = getSessionCycleKey(session);
    if (!key) continue;
    const startMs = getSessionStartMs(session);
    const endMs = getSessionEndMs(session);
    const current = byCycle.get(key) || { startMs: Number.POSITIVE_INFINITY, endMs: Number.NEGATIVE_INFINITY };
    if (Number.isFinite(startMs)) {
      current.startMs = Math.min(current.startMs, startMs);
    }
    if (Number.isFinite(endMs)) {
      current.endMs = Math.max(current.endMs, endMs);
    } else if (Number.isFinite(startMs)) {
      current.endMs = Math.max(current.endMs, startMs);
    }
    byCycle.set(key, current);
  }

  const entries = Array.from(byCycle.entries())
    .map(([key, range]) => ({ key, ...range }))
    .filter((item) => Number.isFinite(item.startMs))
    .sort((a, b) => a.startMs - b.startMs);

  if (!entries.length) return null;

  const active = entries.find((item) => nowMs >= item.startMs && nowMs <= item.endMs);
  if (active) return active.key;

  const past = [...entries].reverse().find((item) => nowMs > item.endMs);
  if (past) return past.key;

  const upcoming = entries.find((item) => nowMs < item.startMs);
  return upcoming?.key || entries[0].key;
}

async function getStudentProfile(supabase, userId) {
  const columns = [
    "role",
    "is_premium",
    "commission_id",
    "student_grade",
    "commission:course_commissions (id, course_level, commission_number, start_date, end_date, start_time, end_time, days_of_week, status, is_active)",
  ];
  let selectedColumns = [...columns];
  let hasStudentGradeColumn = true;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await supabase.from("profiles").select(selectedColumns.join(",")).eq("id", userId).maybeSingle();
    if (!result.error) {
      return {
        profile: {
          ...(result.data || {}),
          student_grade: hasStudentGradeColumn ? result.data?.student_grade ?? null : null,
        },
      };
    }

    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !selectedColumns.includes(missingColumn)) {
      return { error: result.error };
    }

    if (missingColumn === "student_grade") {
      hasStudentGradeColumn = false;
    }
    selectedColumns = selectedColumns.filter((column) => column !== missingColumn);
  }

  return { profile: null };
}

export default async function RutaAcademicaDetailPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const commissionId = params?.commissionId?.toString();
  await autoDeactivateExpiredCommissions();
  const { supabase, user, role } = await getRequestUserContext();
  if (!user) redirect("/login");
  if (role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const { profile, error: profileError } = await getStudentProfile(supabase, user.id);
  if (profileError) {
    console.error("No se pudo cargar perfil de curso", profileError);
  }

  const commission = profile?.commission || null;
  if (!commission?.id || commission.id !== commissionId) {
    redirect("/app/ruta-academica");
  }

  const commissionStatus = resolveCommissionStatus(commission, getLimaTodayISO());

  let sessions = [];
  const sessionColumns = [
    "id",
    "cycle_month",
    "session_index",
    "session_in_cycle",
    "session_date",
    "starts_at",
    "ends_at",
    "day_label",
    "live_link",
    "recording_link",
    "recording_passcode",
  ];
  let sessionsResult = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const query = supabase
      .from("course_sessions")
      .select(sessionColumns.join(","))
      .eq("commission_id", commission.id);

    if (sessionColumns.includes("starts_at")) {
      query.order("starts_at", { ascending: true, nullsFirst: false });
    }
    if (sessionColumns.includes("session_date")) {
      query.order("session_date", { ascending: true });
    }

    const result = await query;
    sessionsResult = result;
    if (!result.error) break;
    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !sessionColumns.includes(missingColumn)) break;
    sessionColumns.splice(sessionColumns.indexOf(missingColumn), 1);
  }

  if (sessionsResult?.error) {
    const missingTable = getMissingTableName(sessionsResult.error);
    if (!missingTable?.endsWith("course_sessions")) {
      console.error("No se pudieron cargar sesiones para curso", sessionsResult.error);
    }
  } else {
    sessions = sessionsResult?.data || [];
  }

  if (!sessions.length) {
    const drafts = buildSessionDraftsFromCommission({
      startDate: commission.start_date,
      endDate: commission.end_date,
      daysOfWeek: commission.days_of_week,
    });
    sessions = drafts.map((draft, index) => ({
      id: `draft-${index}`,
      session_date: draft.session_date,
      day_label: draft.day_label,
      live_link: null,
      recording_link: null,
      recording_passcode: null,
      starts_at: buildLimaDateTimeIso(draft.session_date, commission.start_time),
      ends_at: buildLimaDateTimeIso(draft.session_date, commission.end_time),
      __draft: true,
      session_index: index + 1,
      session_in_cycle: index + 1,
    }));
  }

  const persistedSessionIds = sessions
    .map((session) => session.id)
    .filter((sessionId) => typeof sessionId === "string" && !sessionId.startsWith("draft-"));

  let itemsBySession = {};
  let sessionItemRows = [];
  if (persistedSessionIds.length) {
    const { data: itemRows, error: itemsError } = await supabase
      .from("session_items")
      .select("id, session_id, type, title, url, storage_key, note, exercise_id")
      .in("session_id", persistedSessionIds)
      .order("created_at", { ascending: true });

    if (!itemsError) {
      const normalizedRows = (itemRows || []).map((item) => ({
        ...item,
        lesson_id: null,
      }));

      const exerciseIds = Array.from(
        new Set(
          normalizedRows
            .filter((item) => !extractLessonIdFromQuizUrl(item?.url))
            .map((item) => String(item?.exercise_id || "").trim())
            .filter(Boolean)
        )
      );

      let lessonIdByExerciseId = new Map();
      if (exerciseIds.length) {
        const { data: exerciseRows, error: exercisesError } = await supabase
          .from("exercises")
          .select("id, lesson_id")
          .in("id", exerciseIds);
        if (!exercisesError) {
          lessonIdByExerciseId = new Map(
            (exerciseRows || []).map((exercise) => [String(exercise.id || "").trim(), exercise.lesson_id || null])
          );
        }
      }

      sessionItemRows = normalizedRows.map((item) => {
        const fromUrl = extractLessonIdFromQuizUrl(item?.url) || null;
        if (fromUrl) {
          return { ...item, lesson_id: fromUrl };
        }

        const exerciseId = String(item?.exercise_id || "").trim();
        const resolvedLessonId = lessonIdByExerciseId.get(exerciseId) || null;
        return { ...item, lesson_id: resolvedLessonId };
      });

      itemsBySession = sessionItemRows.reduce((acc, item) => {
        if (!acc[item.session_id]) acc[item.session_id] = [];
        acc[item.session_id].push(item);
        return acc;
      }, {});
    } else {
      console.error("No se pudieron cargar items de sesion", itemsError);
    }
  }

  const nowIso = new Date().toISOString();
  const metrics = computeCourseMetrics(sessions, nowIso);
  const assignedQuizLessonIds = Array.from(
    new Set(
      sessionItemRows
        .map((item) => String(item.lesson_id || "").trim())
        .filter(Boolean)
    )
  );
  let quizAttemptRows = [];
  if (assignedQuizLessonIds.length) {
    let attempts = [];
    let attemptsError = null;

    const primary = await supabase
      .from("lesson_quiz_attempts")
      .select("lesson_id, attempt_status, score_percent, restart_count")
      .eq("user_id", user.id)
      .in("lesson_id", assignedQuizLessonIds);

    if (!primary.error) {
      attempts = primary.data || [];
    } else {
      const fallback = await supabase
        .from("lesson_quiz_attempts")
        .select("lesson_id, attempt_status, score_percent")
        .eq("user_id", user.id)
        .in("lesson_id", assignedQuizLessonIds);
      if (!fallback.error) {
        attempts = (fallback.data || []).map((row) => ({ ...row, restart_count: 0 }));
      } else {
        attemptsError = fallback.error;
      }
    }

    if (!attemptsError) {
      quizAttemptRows = attempts;
    }
  }
  const gradeSummary = buildWeightedCourseGrade({
    baseCourseGrade: profile?.student_grade,
    assignedQuizLessonIds,
    quizAttemptRows,
    minQuizWeight: 0.5,
  });
  const gradeLabel = gradeSummary.finalGrade == null ? "--/100" : `${gradeSummary.finalGrade}/100`;
  const allowedMonths = [];

  return (
    <section className="space-y-6 text-foreground">
      <header className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-muted">
              Curso {commissionStatus === "active" ? "activo" : "pasado"}
            </p>
            <h1 className="text-3xl font-semibold">{commission.course_level}</h1>
            <p className="text-sm text-muted">
              Comision #{commission.commission_number} - {formatSessionDateLabel(commission.start_date)} -{" "}
              {formatSessionDateLabel(commission.end_date)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
              {commissionStatus === "active" ? "Activo" : "Pasado"}
            </span>
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Progreso</p>
          <p className="mt-3 text-4xl font-black text-primary">{metrics.progress}%</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-muted">Clases completadas</p>
          <p className="mt-2 text-xs text-muted">
            {metrics.completed} / {metrics.total}
          </p>
        </article>
        <article className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Nota del curso</p>
          <p className="mt-3 text-4xl font-black text-primary">{gradeLabel}</p>
          <p className="mt-2 text-xs text-muted">
            Peso: 50% pruebas + 50% nota admin.
          </p>
          <p className="mt-1 text-xs text-muted">
            Pruebas completadas: {gradeSummary.completedQuizCount}/{gradeSummary.assignedQuizCount}
          </p>
        </article>
      </div>

      <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-4">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Programa</p>
          <h2 className="text-2xl font-semibold">Clases por mes</h2>
        </div>
        <CourseSessionList
          sessions={sessions}
          itemsBySession={itemsBySession}
          commissionTimes={{
            startTime: commission.start_time,
            endTime: commission.end_time,
          }}
          nowIso={nowIso}
          allowedMonths={allowedMonths}
        />
      </section>
    </section>
  );
}
