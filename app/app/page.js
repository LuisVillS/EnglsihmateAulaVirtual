import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { buildFrequencySessionDrafts } from "@/lib/course-sessions";
import { loadStudentAppSkillSnapshot, normalizeLevelCode } from "@/lib/student-skills";

const LIMA_TIME_ZONE = "America/Lima";
const LIMA_OFFSET_HOURS = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return clamp(parsed, 0, 100);
}

function normalizeCourseLevel(raw) {
  if (!raw) return null;
  return raw.toUpperCase().replace(/\s+/g, " ").trim();
}

function parseCourseLevel(raw) {
  const normalized = normalizeCourseLevel(raw);
  if (!normalized) return { tier: "Advanced", code: "C1", normalized: null };

  const codeMatch = normalized.match(/[ABC]\d/);
  const code = codeMatch ? codeMatch[0] : null;
  let tier = "Advanced";

  if (normalized.includes("BASICO")) {
    tier = "Basic";
  } else if (normalized.includes("INTERMEDIO")) {
    tier = "Intermediate";
  }

  return { tier, code, normalized };
}

function formatMonthYear(value) {
  if (!value) return "TBD";
  const date = value instanceof Date ? value : parseDateOnly(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
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
  if (!Array.isArray(days) || !days.length) return "Days TBD";
  const map = {
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
    7: "Sunday",
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
  if (!date) return "TBD";
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    timeZone: LIMA_TIME_ZONE,
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LIMA_TIME_ZONE,
  }).format(date);
  return `${dateLabel} - ${timeLabel}`;
}

export default async function StudentDashboard() {
  await autoDeactivateExpiredCommissions();
  const { supabase, user, isAdmin, role } = await getRequestUserContext();

  if (!user) {
    redirect("/");
  }

  if (isAdmin) {
    redirect("/admin/panel");
  }
  if (role === USER_ROLES.NON_STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, course_level, start_month, enrollment_date, preferred_hour, commission_id, commission:course_commissions (id, course_level, commission_number, start_date, end_date, start_month, duration_months, modality_key, days_of_week, start_time, end_time, status, is_active)"
    )
    .eq("id", user.id)
    .maybeSingle();

  const name = profile?.full_name || user.user_metadata?.full_name || user.email || "Student";
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
  const resolvedLevelCode = normalizeLevelCode(resolvedCourseLevel || "");
  const skillSnapshot = await loadStudentAppSkillSnapshot({
    db: supabase,
    userId: user.id,
    currentLevel: resolvedLevelCode,
  });
  const skillCards = [
    { label: "Speaking", value: parseScore(skillSnapshot?.combined?.speaking) },
    { label: "Reading", value: parseScore(skillSnapshot?.combined?.reading) },
    { label: "Grammar", value: parseScore(skillSnapshot?.combined?.grammar) },
    { label: "Listening", value: parseScore(skillSnapshot?.combined?.listening) },
  ];
  const levelInfo = parseCourseLevel(resolvedCourseLevel);
  const courseTitle = hasActiveEnrollment && resolvedCourseLevel
    ? `English ${levelInfo.code || "C1"}`
    : "No active course assigned";
  const courseStageLabel = hasActiveEnrollment ? resolvedCourseLevel || `${levelInfo.tier} track` : "Enrollment required";

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

  const startLabel = hasActiveEnrollment && derivedStartDate ? formatMonthYear(derivedStartDate) : "TBD";
  const endLabel = hasActiveEnrollment && derivedEndDate ? formatMonthYear(derivedEndDate) : "TBD";

  const scheduleRange = hasActiveEnrollment && commission?.start_time && commission?.end_time
    ? `${commission.start_time} to ${commission.end_time}`
    : "Hours TBD";

  const classDays = hasActiveEnrollment ? formatDaysFull(commission?.days_of_week) : "Days TBD";

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
    <section className="space-y-6 text-foreground">
      <header className="student-panel px-5 py-5 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.38em] text-muted">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">Welcome back, {name}.</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Track your current course, upcoming class, academic path, and core skills from one place.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Current level</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{hasActiveEnrollment ? courseStageLabel : "Pending"}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Next class</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{nextClassDate ? "Scheduled" : "Waiting"}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted">Progress</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{hasActiveEnrollment ? `${courseProgress}%` : "Locked"}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <article className="student-panel px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Current course</p>
              <h2 className="mt-2 text-3xl font-semibold text-foreground">{courseTitle}</h2>
              <p className="mt-2 text-sm text-muted">{courseStageLabel}</p>
            </div>
            {hasActiveEnrollment && commission?.commission_number ? (
              <span className="rounded-[10px] border border-border bg-surface-2 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Commission #{commission.commission_number}
              </span>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="student-panel-soft px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Course window</p>
              <p className="mt-2 text-sm font-medium text-foreground">{startLabel} to {endLabel}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Study days</p>
              <p className="mt-2 text-sm font-medium text-foreground">{classDays}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Schedule</p>
              <p className="mt-2 text-sm font-medium text-foreground">{scheduleRange}</p>
            </div>
          </div>

          <div className="mt-6 rounded-[12px] border border-[rgba(16,52,116,0.1)] bg-[#f7faff] px-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">Course completion</span>
              <span className="font-semibold text-foreground">{hasActiveEnrollment ? `${courseProgress}%` : "Locked"}</span>
            </div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent"
                style={{ width: `${courseProgress}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-muted">
              {hasActiveEnrollment
                ? "Your current commission is active and ready to continue."
                : "Complete enrollment to unlock your current course workspace."}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={hasActiveEnrollment ? "/app/curso" : "/app/matricula"} className="student-button-primary px-4 py-2.5 text-sm">
              {hasActiveEnrollment ? "Go to course" : "Open enrollment"}
            </Link>
            <Link href="/app/ruta-academica" className="student-button-secondary px-4 py-2.5 text-sm">
              View academic path
            </Link>
          </div>
        </article>

        <aside className="student-panel px-5 py-5 sm:px-6">
          <div className="student-panel-soft px-4 py-4">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Next class</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{formatNextClass(nextClassDate)}</h2>
            <p className="mt-2 text-sm text-muted">
              {hasActiveEnrollment
                ? "Keep your schedule visible and jump straight into the live course workspace."
                : "Your next live class will appear here once your enrollment is active."}
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="student-panel-soft px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Course access</p>
              <p className="mt-2 text-sm font-medium text-foreground">{hasActiveEnrollment ? "Open and available" : "Pending enrollment"}</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Recommendation</p>
              <p className="mt-2 text-sm text-foreground">
                {hasActiveEnrollment ? "Review the class list and upcoming materials before your next session." : "Complete enrollment first to unlock classes and recordings."}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <Link
              href={hasActiveEnrollment ? "/app/curso" : "/app/matricula"}
              className={`inline-flex items-center justify-center rounded-[12px] px-4 py-2.5 text-sm font-semibold transition ${
                hasActiveEnrollment
                  ? "bg-primary text-primary-foreground hover:bg-primary-2"
                  : "border border-[rgba(15,23,42,0.1)] bg-white text-[#103474] hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
              }`}
            >
              {hasActiveEnrollment ? "Go to course" : "Open enrollment"}
            </Link>
          </div>
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="student-panel px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted">Academic path</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Progress toward the next level</h2>
            </div>
            <span className="rounded-[10px] border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
              {remainingProgress}% remaining
            </span>
          </div>
          <p className="mt-3 text-sm text-muted">
            Use your current course progress as a quick reference for how far you are from the next stage.
          </p>

          <div className="mt-5 rounded-[12px] border border-[rgba(16,52,116,0.1)] bg-[#f7faff] px-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Progress map</span>
              <span className="font-semibold text-foreground">{globalProgress}%</span>
            </div>
            <div className="mt-3 h-3 w-full rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-primary-2 to-accent"
                style={{ width: `${globalProgress}%` }}
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["Basic", "Intermediate", "Advanced"].map((level) => (
              <span key={level} className="student-panel-soft px-4 py-3 text-sm font-medium text-foreground">
                {level}
              </span>
            ))}
          </div>
          <div className="mt-5">
            <Link href="/app/ruta-academica" className="student-button-secondary px-4 py-2.5 text-sm">
              View academic path
            </Link>
          </div>
        </article>

        <article className="student-panel px-5 py-5 sm:px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Skills snapshot</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">Current performance</h2>
          <p className="mt-2 text-sm text-muted">
            Review the latest combined indicators for your core language skills.
          </p>
          <div className="mt-5 space-y-3">
            {skillCards.map((skill) => (
              <div key={skill.label} className="student-panel-soft px-4 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{skill.label}</span>
                  <span className="text-muted">{skill.value == null ? "--" : `${Math.round(skill.value)}%`}</span>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${skill.value ?? 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
