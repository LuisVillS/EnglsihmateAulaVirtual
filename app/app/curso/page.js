import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  buildSessionDraftsFromCommission,
  buildFrequencySessionDrafts,
  buildLimaDateTimeIso,
  formatSessionDateLabel,
} from "@/lib/course-sessions";
import CourseSessionList from "@/components/course-session-list";
import { formatMonthKeyFromDate } from "@/lib/class-format";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { buildWeightedCourseGrade } from "@/lib/course-grade";

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
    "commission:course_commissions (id, course_level, commission_number, start_date, end_date, start_month, duration_months, modality_key, start_time, end_time, days_of_week, status, is_active)",
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

async function getApprovedBillingMonths(supabase, studentId) {
  const { data, error } = await supabase
    .from("payments")
    .select("billing_month")
    .eq("student_id", studentId)
    .eq("status", "approved");

  if (error) {
    const missingTable = getMissingTableName(error);
    if (!missingTable?.endsWith("payments")) {
      console.error("No se pudieron cargar meses aprobados", error);
    }
    return [];
  }

  return (data || [])
    .map((row) => normalizeMonthKey(row?.billing_month))
    .filter(Boolean);
}

function ProgressBar({ value = 0 }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full bg-primary" style={{ width: `${safe}%` }} />
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10V7a5 5 0 1 1 10 0v3" />
      <rect x="5" y="10" width="14" height="10" rx="2" />
    </svg>
  );
}

export default async function CourseGatePage() {
  const supabase = await createSupabaseServerClient();
  await autoDeactivateExpiredCommissions();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { profile, error: profileError } = await getStudentProfile(supabase, user.id);
  if (profileError) {
    console.error("No se pudo cargar perfil de curso", profileError);
  }

  if (profile?.role !== "student") {
    redirect("/app/matricula?locked=1");
  }

  const commission = profile?.commission || null;
  const todayIso = getLimaTodayISO();
  const commissionStatus = commission ? resolveCommissionStatus(commission, todayIso) : "inactive";
  if (!commission?.id || commissionStatus !== "active") {
    return (
      <section className="rounded-3xl border border-border bg-surface p-6 text-foreground">
        <h2 className="text-2xl font-semibold">Mi curso</h2>
        <p className="mt-2 text-sm text-muted">No tienes un curso activo aun.</p>
      </section>
    );
  }

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
    const startMonth = commission.start_month || commission.start_date;
    const durationMonths = Number(commission.duration_months || 4);
    const hasFrequencyInputs = Boolean(commission.modality_key && startMonth && commission.start_time && commission.end_time);
    const rows = hasFrequencyInputs
      ? buildFrequencySessionDrafts({
          commissionId: null,
          frequency: commission.modality_key,
          startMonth,
          durationMonths,
          startTime: commission.start_time,
          endTime: commission.end_time,
          status: "scheduled",
        })
      : [];

    const drafts = rows.length
      ? rows.map((row) => ({
          session_date: row.session_date,
          day_label: row.day_label,
          cycle_month: row.cycle_month,
          session_index: row.session_index,
          session_in_cycle: row.session_in_cycle,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
        }))
      : buildSessionDraftsFromCommission({
          startDate: commission.start_date,
          endDate: commission.end_date,
          daysOfWeek: commission.days_of_week,
        }).map((draft, index) => ({
          session_date: draft.session_date,
          day_label: draft.day_label,
          cycle_month: null,
          session_index: index + 1,
          session_in_cycle: index + 1,
          starts_at: buildLimaDateTimeIso(draft.session_date, commission.start_time),
          ends_at: buildLimaDateTimeIso(draft.session_date, commission.end_time),
        }));

    sessions = drafts.map((draft, index) => ({
      id: `draft-${index}`,
      session_date: draft.session_date,
      day_label: draft.day_label,
      cycle_month: draft.cycle_month,
      live_link: null,
      recording_link: null,
      starts_at: draft.starts_at,
      ends_at: draft.ends_at,
      __draft: true,
      session_index: draft.session_index || index + 1,
      session_in_cycle: draft.session_in_cycle || index + 1,
    }));
  }

  const firstSessionDate = sessions[0]?.session_date || commission.start_date;
  const lastSessionDate = sessions[sessions.length - 1]?.session_date || commission.end_date;

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
        } else {
          console.error("No se pudieron resolver lecciones de ejercicios", exercisesError);
        }
      }

      sessionItemRows = normalizedRows.map((item) => {
        const exerciseId = String(item?.exercise_id || "").trim();
        const resolvedLessonId = lessonIdByExerciseId.get(exerciseId) || null;
        if (resolvedLessonId) {
          return { ...item, lesson_id: resolvedLessonId };
        }

        const url = String(item?.url || "").trim();
        const fromUrl = url.match(/\/app\/clases\/([^/]+)\/prueba/i)?.[1] || null;
        return { ...item, lesson_id: fromUrl };
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
  const approvedBillingMonths = await getApprovedBillingMonths(supabase, user.id);
  const allowedMonths = new Set(approvedBillingMonths);
  if (!allowedMonths.size) {
    const currentCycleKey = resolveCurrentCycleMonthKey(sessions, nowIso);
    const fallbackCycle = currentCycleKey || normalizeMonthKey(commission.start_date);
    if (fallbackCycle) {
      allowedMonths.add(fallbackCycle);
    }
  }

  const assignedQuizLessonIds = Array.from(
    new Set(
      sessionItemRows
        .map((item) => String(item.lesson_id || "").trim())
        .filter(Boolean)
    )
  );
  let quizAttemptRows = [];
  if (assignedQuizLessonIds.length) {
    const { data: attempts, error: attemptsError } = await supabase
      .from("lesson_quiz_attempts")
      .select("lesson_id, attempt_status, score_percent")
      .eq("user_id", user.id)
      .eq("attempt_status", "completed")
      .in("lesson_id", assignedQuizLessonIds);
    if (attemptsError) {
      const missingTable = getMissingTableName(attemptsError);
      if (!missingTable?.endsWith("lesson_quiz_attempts")) {
        console.error("No se pudo cargar progreso de pruebas asignadas", attemptsError);
      }
    } else {
      quizAttemptRows = attempts || [];
    }
  }

  const gradeSummary = buildWeightedCourseGrade({
    baseCourseGrade: profile?.student_grade,
    assignedQuizLessonIds,
    quizAttemptRows,
    minQuizWeight: 0.5,
  });
  const gradeValue = gradeSummary.finalGrade;
  const gradeLabel = gradeValue == null ? "--/100" : `${gradeValue}/100`;
  const quizWeightPercent = Math.round((gradeSummary.quizWeight || 0.5) * 100);
  const baseWeightPercent = Math.max(0, 100 - quizWeightPercent);
  let gradeHint = "Sin pruebas asignadas por clase. Se usa la nota base del curso.";
  if (gradeSummary.quizGrade != null && gradeSummary.baseCourseGrade != null) {
    gradeHint = `${quizWeightPercent}% pruebas (${gradeSummary.completedQuizCount}/${gradeSummary.assignedQuizCount} completadas) + ${baseWeightPercent}% nota admin.`;
  } else if (gradeSummary.quizGrade != null) {
    gradeHint = `Nota basada en pruebas (${gradeSummary.completedQuizCount}/${gradeSummary.assignedQuizCount} completadas).`;
  }

  return (
    <section className="space-y-6 text-foreground">
      <header className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Comision {commission.commission_number}</p>
            <h1 className="text-3xl font-semibold">{commission.course_level}</h1>
            <p className="text-sm text-muted">
              Certificacion al finalizar el programa. Material y grabaciones disponibles por clase.
            </p>
            <p className="text-xs text-muted">
              Inicio: {formatSessionDateLabel(firstSessionDate)} - Fin: {formatSessionDateLabel(lastSessionDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
              Aula Virtual
            </span>
            {profile?.is_premium ? (
              <span className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                Premium
              </span>
            ) : (
              <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                Regular
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Notas</p>
          <p className="mt-3 text-4xl font-black text-primary">{gradeLabel}</p>
          <p className="mt-2 text-xs text-muted">{gradeHint}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-muted">Progreso de clases</p>
          <div className="mt-2">
            <ProgressBar value={metrics.progress} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Completadas: {metrics.completed} / {metrics.total}
          </p>
        </article>

        <article className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Certificado</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2 text-muted">
              <LockIcon />
            </span>
            <div>
              <p className="text-lg font-semibold">Bloqueado</p>
              <p className="text-sm text-muted">Disponible al finalizar el curso.</p>
            </div>
          </div>
          <button
            type="button"
            disabled
            className="mt-4 rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted disabled:cursor-not-allowed"
          >
            Descargar certificado
          </button>
        </article>
      </div>

      <section className="space-y-4">
        <div>
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
          allowedMonths={Array.from(allowedMonths)}
        />
      </section>
    </section>
  );
}
