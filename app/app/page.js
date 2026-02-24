import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { buildFrequencySessionDrafts } from "@/lib/course-sessions";

const SKILL_MOCKS = [
  { label: "Speaking", value: 7 },
  { label: "Reading", value: 6 },
  { label: "Grammar", value: 5 },
  { label: "Listening", value: 8 },
];

const LIMA_TIME_ZONE = "America/Lima";
const LIMA_OFFSET_HOURS = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCourseLevel(raw) {
  if (!raw) return null;
  return raw.toUpperCase().replace(/\s+/g, " ").trim();
}

function parseCourseLevel(raw) {
  const normalized = normalizeCourseLevel(raw);
  if (!normalized) return { tier: "Avanzado", code: "C1", normalized: null };

  const codeMatch = normalized.match(/[ABC]\d/);
  const code = codeMatch ? codeMatch[0] : null;
  let tier = "Avanzado";

  if (normalized.includes("BASICO")) {
    tier = "Basico";
  } else if (normalized.includes("INTERMEDIO")) {
    tier = "Intermedio";
  }

  return { tier, code, normalized };
}

function formatMonthYear(value) {
  if (!value) return "Por definir";
  const date = value instanceof Date ? value : parseDateOnly(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return "Por definir";
  return new Intl.DateTimeFormat("es", {
    month: "short",
    year: "numeric",
    timeZone: LIMA_TIME_ZONE,
  }).format(date);
}

function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, LIMA_OFFSET_HOURS, 0, 0, 0));
}

function getLimaParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  };
}

function limaPartsToUtcDate({ year, month, day, hour = 0, minute = 0 }) {
  return new Date(Date.UTC(year, month - 1, day, hour + LIMA_OFFSET_HOURS, minute, 0, 0));
}

function formatDaysFull(days) {
  if (!Array.isArray(days) || !days.length) return "Dias por definir";
  const map = {
    1: "Lunes",
    2: "Martes",
    3: "Miercoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sabado",
    7: "Domingo",
  };
  return days.map((day) => map[day] || day).join(", ");
}

function getNextClassDate({ daysOfWeek, startTime, startDate, endDate }) {
  if (!Array.isArray(daysOfWeek) || !daysOfWeek.length || !startTime) return null;

  const now = new Date();
  const nowParts = getLimaParts(now);
  const nowLimaUtc = limaPartsToUtcDate(nowParts);
  const baseDate = startDate && startDate > nowLimaUtc
    ? startDate
    : limaPartsToUtcDate({ year: nowParts.year, month: nowParts.month, day: nowParts.day });

  for (let i = 0; i < 21; i += 1) {
    const candidate = new Date(Date.UTC(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth(),
      baseDate.getUTCDate() + i,
      LIMA_OFFSET_HOURS,
      0,
      0,
      0
    ));
    if (endDate && candidate > endDate) return null;

    const weekday = candidate.getUTCDay();
    const normalized = weekday === 0 ? 7 : weekday;

    if (!daysOfWeek.includes(normalized)) continue;

    const [hours, minutes] = startTime.split(":").map(Number);
    candidate.setUTCHours((hours || 0) + LIMA_OFFSET_HOURS, minutes || 0, 0, 0);

    if (candidate >= nowLimaUtc) {
      return candidate;
    }
  }

  return null;
}

function resolveNextClassFromRows(rows, nowMs) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const normalized = rows
    .map((row) => {
      const startsAt = row?.starts_at ? new Date(row.starts_at) : null;
      const ms = startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.getTime() : Number.NaN;
      return { ms, startsAt };
    })
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => a.ms - b.ms);

  const upcoming = normalized.find((entry) => entry.ms >= nowMs);
  return upcoming?.startsAt || null;
}

function resolveDraftRangeAndNext(commission, nowMs) {
  if (!commission) return { startDate: null, endDate: null, nextClass: null };
  const startMonth = commission.start_month || commission.start_date;
  const durationMonths = Number(commission.duration_months || 4);
  const modalityKey = commission.modality_key;
  const startTime = commission.start_time;
  const endTime = commission.end_time;
  if (!startMonth || !durationMonths || !modalityKey || !startTime || !endTime) {
    return { startDate: null, endDate: null, nextClass: null };
  }

  const rows = buildFrequencySessionDrafts({
    commissionId: null,
    frequency: modalityKey,
    startMonth,
    durationMonths,
    startTime,
    endTime,
    status: "scheduled",
  });

  return {
    startDate: rows[0]?.session_date || null,
    endDate: rows[rows.length - 1]?.session_date || null,
    nextClass: resolveNextClassFromRows(rows, nowMs),
  };
}

function parseTimeParts(value) {
  if (!value || typeof value !== "string") return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
}

function countClassesBetween({ startDate, endDate, daysOfWeek, startTime, today = new Date() }) {
  if (!startDate || !endDate || !Array.isArray(daysOfWeek) || !daysOfWeek.length) {
    return { total: 0, completed: 0 };
  }

  const todayParts = getLimaParts(today);
  const todayLimaUtc = limaPartsToUtcDate(todayParts);
  const timeParts = parseTimeParts(startTime);
  const totalDays = Math.max(0, Math.floor((endDate - startDate) / 86400000) + 1);
  let total = 0;
  let completed = 0;

  for (let i = 0; i < totalDays; i += 1) {
    const current = new Date(Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate() + i,
      LIMA_OFFSET_HOURS,
      0,
      0,
      0
    ));
    const weekday = current.getUTCDay();
    const normalized = weekday === 0 ? 7 : weekday;
    if (!daysOfWeek.includes(normalized)) continue;

    total += 1;
    if (timeParts) {
      current.setUTCHours(timeParts.hours + LIMA_OFFSET_HOURS, timeParts.minutes, 0, 0);
    }
    if (current <= todayLimaUtc) {
      completed += 1;
    }
  }

  return { total, completed };
}

function computeProgressFromSchedule({ startDate, endDate, daysOfWeek, startTime }) {
  const { total, completed } = countClassesBetween({ startDate, endDate, daysOfWeek, startTime });
  if (!total) return 0;
  const percent = Math.round((completed / total) * 100);
  return clamp(percent, 0, 100);
}

function formatNextClass(date) {
  if (!date) return "Por definir";
  const dateLabel = new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    timeZone: LIMA_TIME_ZONE,
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LIMA_TIME_ZONE,
  }).format(date);
  return `${dateLabel} - ${timeLabel}`;
}

export default async function StudentDashboard() {
  const supabase = await createSupabaseServerClient();
  await autoDeactivateExpiredCommissions();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (adminRecord?.id) {
    redirect("/admin/panel");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, role, status, course_level, level_number, start_month, enrollment_date, preferred_hour, commission_id, commission:course_commissions (id, course_level, commission_number, start_date, end_date, start_month, duration_months, modality_key, days_of_week, start_time, end_time, status, is_active)"
    )
    .eq("id", user.id)
    .maybeSingle();

  const effectiveRole = resolveProfileRole({ role: profile?.role, status: profile?.status });
  const isNonStudent = effectiveRole === USER_ROLES.NON_STUDENT;
  if (isNonStudent) {
    redirect("/app/matricula?locked=1");
  }

  const name = profile?.full_name || user.user_metadata?.full_name || user.email || "Estudiante";
  const commission = profile?.commission || null;
  const todayIso = getLimaTodayISO();
  const commissionStatus = commission ? resolveCommissionStatus(commission, todayIso) : "inactive";
  const hasActiveEnrollment = Boolean(commission?.id && commissionStatus === "active");
  const now = new Date();
  const nowMs = now.getTime();

  let derivedStartDate = commission?.start_date || null;
  let derivedEndDate = commission?.end_date || null;
  let derivedNextClassDate = null;

  const fallbackDraft = hasActiveEnrollment ? resolveDraftRangeAndNext(commission, nowMs) : null;

  if (hasActiveEnrollment && commission?.id) {
    const nowIso = now.toISOString();

    const { data: nextRows, error: nextError } = await supabase
      .from("course_sessions")
      .select("starts_at")
      .eq("commission_id", commission.id)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(1);

    if (!nextError) {
      derivedNextClassDate = resolveNextClassFromRows(nextRows || [], nowMs);
    }

    const { data: firstRows, error: firstError } = await supabase
      .from("course_sessions")
      .select("session_date")
      .eq("commission_id", commission.id)
      .order("session_date", { ascending: true })
      .limit(1);

    if (!firstError && firstRows?.[0]?.session_date) {
      derivedStartDate = firstRows[0].session_date;
    }

    const { data: lastRows, error: lastError } = await supabase
      .from("course_sessions")
      .select("session_date")
      .eq("commission_id", commission.id)
      .order("session_date", { ascending: false })
      .limit(1);

    if (!lastError && lastRows?.[0]?.session_date) {
      derivedEndDate = lastRows[0].session_date;
    }
  }

  if (hasActiveEnrollment && !derivedStartDate) derivedStartDate = fallbackDraft?.startDate || null;
  if (hasActiveEnrollment && !derivedEndDate) derivedEndDate = fallbackDraft?.endDate || null;
  if (hasActiveEnrollment && !derivedNextClassDate) derivedNextClassDate = fallbackDraft?.nextClass || null;

  const resolvedCourseLevel = hasActiveEnrollment ? commission?.course_level : profile?.course_level || null;
  const levelInfo = parseCourseLevel(resolvedCourseLevel);
  const courseTitle = hasActiveEnrollment && resolvedCourseLevel
    ? `English ${levelInfo.code || "C1"} (Nivel ${levelInfo.tier})`
    : "Sin curso asignado";

  const courseProgress = hasActiveEnrollment
    ? computeProgressFromSchedule({
    startDate: parseDateOnly(derivedStartDate || commission?.start_date),
    endDate: parseDateOnly(derivedEndDate || commission?.end_date),
    daysOfWeek: commission?.days_of_week,
    startTime: commission?.start_time,
      })
    : 0;
  const globalProgress = courseProgress;
  const remainingProgress = clamp(100 - globalProgress, 0, 100);

  const startLabel = hasActiveEnrollment && derivedStartDate ? formatMonthYear(derivedStartDate) : "Por definir";
  const endLabel = hasActiveEnrollment && derivedEndDate ? formatMonthYear(derivedEndDate) : "Por definir";

  const scheduleRange = hasActiveEnrollment && commission?.start_time && commission?.end_time
    ? `${commission.start_time} a ${commission.end_time}`
    : "Horario por definir";

  const classDays = hasActiveEnrollment ? formatDaysFull(commission?.days_of_week) : "Dias por definir";

  const nextClassDate = hasActiveEnrollment
    ? derivedNextClassDate ||
      getNextClassDate({
        daysOfWeek: commission?.days_of_week,
        startTime: commission?.start_time,
        startDate: parseDateOnly(derivedStartDate || commission?.start_date),
        endDate: parseDateOnly(derivedEndDate || commission?.end_date),
      })
    : null;

  return (
    <section className="space-y-8 text-foreground">
      {isNonStudent ? (
        <div className="rounded-3xl border border-primary/40 bg-primary/10 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">No matriculado</p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">Completa tu matricula</h3>
          <p className="mt-2 text-sm text-muted">
            Tu cuenta esta activa, pero aun no tienes un curso asignado. Completa el proceso para acceder a Mi curso.
          </p>
          <Link
            href="/app/matricula"
            className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
          >
            Ir a Mi Matricula
          </Link>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.35em] text-muted">Inicio</p>
        <h2 className="text-3xl font-semibold">Hola, {name}!</h2>
        <p className="text-sm text-muted">
          Este es tu panel de progreso. Encuentra todo lo que necesitas para mantener tu ritmo de estudio.
        </p>
      </div>

      <div className="grid gap-6">
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/35">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted">Tu curso actual</p>
                <h3 className="mt-2 text-2xl font-semibold">{courseTitle}</h3>
                {hasActiveEnrollment && commission?.commission_number ? (
                  <p className="mt-1 text-xs text-muted">Comision #{commission.commission_number}</p>
                ) : null}
              </div>
              <div>
                <p className="text-sm text-muted">
                  {hasActiveEnrollment ? `${courseProgress}% completado` : "No tienes un curso activo aun"}
                </p>
                <div className="mt-2 h-2.5 w-full max-w-md rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent"
                    style={{ width: `${courseProgress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface-2 p-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted">Proxima clase</p>
                <p className="mt-1 text-sm text-foreground">{formatNextClass(nextClassDate)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted">Rango del curso</p>
                <p className="mt-1 text-sm text-foreground">Del {startLabel} al {endLabel}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-muted">Dias y horario</p>
                <p className="mt-1 text-sm text-foreground">{classDays} - {scheduleRange}</p>
              </div>
              <div className="mt-1 grid gap-2">
                <Link
                  href="/app/curso"
                  className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    hasActiveEnrollment
                      ? "bg-primary text-primary-foreground hover:bg-primary-2"
                      : "pointer-events-none border border-border bg-surface text-muted"
                  }`}
                >
                  Ir al curso
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted">Mi ruta de aprendizaje</p>
                <h3 className="mt-2 text-xl font-semibold">Progreso hacia avanzado</h3>
              </div>
              <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted">
                {remainingProgress}% restante
              </span>
            </div>
            <p className="mt-3 text-sm text-muted">
              Te falta {remainingProgress}% para llegar a Avanzado.
            </p>
            <div className="mt-4 h-3 w-full rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent"
                style={{ width: `${globalProgress}%` }}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
              {"Basico,Intermedio,Avanzado".split(",").map((level) => (
                <span key={level} className="rounded-full border border-border px-3 py-1">
                  {level}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Tus habilidades</p>
            <div className="mt-4 space-y-4">
              {SKILL_MOCKS.map((skill) => (
                <div key={skill.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{skill.label}</span>
                    <span className="text-muted">{skill.value}/10</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(skill.value / 10) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


