import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { buildFrequencySessionDrafts, buildSessionDraftsFromCommission } from "@/lib/course-sessions";
import { loadStudentAppSkillSnapshot, normalizeLevelCode } from "@/lib/student-skills";
import { withSupabaseRequestTrace } from "@/lib/supabase-tracing";

const LIMA_TIME_ZONE = "America/Lima";
const LIMA_OFFSET_HOURS = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseDateTime(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, LIMA_OFFSET_HOURS, 0, 0, 0));
}

function normalizeDateInput(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return parseDateTime(value) || parseDateOnly(value);
}

function formatDateLabel(date, locale = "en-US") {
  const normalized = normalizeDateInput(date);
  if (!normalized) return "TBD";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "2-digit",
    month: "short",
    timeZone: LIMA_TIME_ZONE,
  }).format(normalized);
}

function formatMonthYear(value, locale = "en-US") {
  const date = normalizeDateInput(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: LIMA_TIME_ZONE,
  }).format(date);
}

function formatTimeLabel(date, locale = "en-US") {
  const normalized = normalizeDateInput(date);
  if (!normalized) return "TBD";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LIMA_TIME_ZONE,
  }).format(normalized);
}

function formatNextClass(date) {
  if (!date) return "Schedule pending";
  return `${formatDateLabel(date)} - ${formatTimeLabel(date)}`;
}

function formatLevelBadge(level) {
  const raw = String(level || "").trim();
  if (!raw) return "Course pending";
  return raw.toUpperCase();
}

function getFirstName(name) {
  return String(name || "").trim().split(/\s+/).filter(Boolean)[0] || "Luis";
}

function formatMinutesToHours(minutes) {
  const safe = Number(minutes);
  if (!Number.isFinite(safe) || safe <= 0) return "0h";
  const rounded = Math.round((safe / 60) * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded}h`;
}

function getSessionStart(row) {
  return parseDateTime(row?.starts_at) || parseDateOnly(row?.session_date);
}

function getSessionEnd(row) {
  return parseDateTime(row?.ends_at) || getSessionStart(row);
}

function resolveNextSession(rows, nowMs) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ row, startsAt: getSessionStart(row) }))
    .filter((entry) => entry.startsAt && !Number.isNaN(entry.startsAt.getTime()))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .find((entry) => entry.startsAt.getTime() >= nowMs) || null;
}

function countScheduleMetrics(rows, nowMs) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const start = getSessionStart(row);
      const end = getSessionEnd(row) || start;
      if (!start) return null;
      return {
        startMs: start.getTime(),
        endMs: end ? end.getTime() : start.getTime(),
        durationMinutes: end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : 0,
      };
    })
    .filter(Boolean);

  const total = normalized.length;
  const completed = normalized.filter((entry) => entry.endMs < nowMs).length;
  const practiceMinutes = normalized.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  return { total, completed, practiceMinutes };
}

function buildDraftSessions(commission) {
  if (!commission) return [];

  const frequencyRows = commission.start_month && commission.modality_key && commission.start_time && commission.end_time
    ? buildFrequencySessionDrafts({
        commissionId: commission.id || null,
        frequency: commission.modality_key,
        startMonth: commission.start_month || commission.start_date,
        durationMonths: Number(commission.duration_months || 4),
        startTime: commission.start_time,
        endTime: commission.end_time,
        status: "scheduled",
      })
    : [];

  if (frequencyRows.length) return frequencyRows;

  return buildSessionDraftsFromCommission({
    startDate: commission.start_date,
    endDate: commission.end_date,
    daysOfWeek: commission.days_of_week,
  }).map((draft, index) => ({
    id: `draft-${index + 1}`,
    cycle_month: draft.session_date?.slice(0, 7) ? `${draft.session_date.slice(0, 7)}-01` : null,
    session_index: index + 1,
    session_in_cycle: index + 1,
    session_date: draft.session_date,
    starts_at: null,
    ends_at: null,
    day_label: draft.day_label,
    live_link: null,
  }));
}

function groupSessionsIntoModules(rows, nowMs) {
  const sessions = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const aMs = getSessionStart(a)?.getTime() || 0;
    const bMs = getSessionStart(b)?.getTime() || 0;
    return aMs - bMs;
  });

  if (!sessions.length) return [];

  const chunkSize = Math.max(1, Math.ceil(sessions.length / 3));
  const groups = [];

  for (let i = 0; i < 3; i += 1) {
    const startIndex = i * chunkSize;
    const groupRows = sessions.slice(startIndex, startIndex + chunkSize);
    if (!groupRows.length) continue;

    const first = groupRows[0];
    const last = groupRows[groupRows.length - 1];
    const completed = groupRows.filter((row) => {
      const end = getSessionEnd(row);
      return end ? end.getTime() < nowMs : false;
    }).length;
    const minutes = groupRows.reduce((sum, row) => {
      const start = getSessionStart(row);
      const end = getSessionEnd(row) || start;
      return sum + (start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : 0);
    }, 0);

    groups.push({
      step: String(i + 1).padStart(2, "0"),
      title: formatMonthYear(first?.cycle_month || first?.session_date || first?.starts_at),
      subtitle: `${groupRows.length} Lessons • ${formatMinutesToHours(minutes)} Practice Hours`,
      progress: groupRows.length ? clamp(Math.round((completed / groupRows.length) * 100), 0, 100) : 0,
      range: `${formatDateLabel(first?.starts_at || first?.session_date)} - ${formatDateLabel(last?.starts_at || last?.session_date)}`,
      href: first?.live_link || "/app/curso",
    });
  }

  return groups.slice(0, 3);
}

function ProgressRing({ value = 0 }) {
  const safeValue = clamp(Math.round(Number(value) || 0), 0, 100);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative mx-auto flex h-[170px] w-[170px] items-center justify-center">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(16,52,116,0.12)" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#103474"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (safeValue / 100) * circumference}
        />
      </svg>
      <div className="absolute inset-4 rounded-full bg-white/95" />
      <div className="absolute text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">Progress</p>
        <p className="mt-2 text-4xl font-semibold tracking-tight text-primary">{safeValue}%</p>
      </div>
    </div>
  );
}

function MetricTile({ label, value }) {
  return (
    <div className="rounded-[18px] border border-[rgba(16,52,116,0.08)] bg-white/85 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold leading-tight text-foreground">{value}</p>
    </div>
  );
}

function SkillBar({ label, value }) {
  const safeValue = clamp(Number(value) || 0, 0, 100);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <span className="text-sm font-semibold text-primary">{label}</span>
        <span className="text-sm font-medium text-muted">{Math.round(safeValue)}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-[#dbe5ff]">
        <div className="h-full rounded-full bg-[#c9d7ff]" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function ArrowRightIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}

function ChevronRightIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ModuleCard({ step, title, subtitle, progress, range, href }) {
  const isExternal = String(href || "").startsWith("http");
  const actionClassName =
    "mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-[16px] border border-[rgba(16,52,116,0.10)] bg-white px-4 py-3 text-sm font-semibold text-primary transition hover:bg-[#f8fbff]";

  return (
    <article className="rounded-[24px] border border-[rgba(16,52,116,0.08)] bg-white p-6 shadow-[0px_12px_32px_rgba(0,25,67,0.04)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#eef4ff] text-lg font-semibold text-primary">
          {step}
        </div>
        <div className="min-w-0">
          <h3 className="text-xl font-semibold leading-tight text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          <span>Progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#edf0f5]">
          <div className="h-full rounded-full bg-[#e3e7ee]" style={{ width: `${clamp(Number(progress) || 0, 0, 100)}%` }} />
        </div>
      </div>

      <p className="mt-6 text-xs text-muted">{range}</p>

      {isExternal ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={actionClassName}>
          Start Module
        </a>
      ) : (
        <Link href={href} className={actionClassName}>
          Start Module
        </Link>
      )}
    </article>
  );
}

async function loadCourseSessions(supabase, commissionId) {
  if (!commissionId) return [];

  let columns = [
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

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const query = supabase.from("course_sessions").select(columns.join(",")).eq("commission_id", commissionId);
    if (columns.includes("starts_at")) query.order("starts_at", { ascending: true, nullsFirst: false });
    if (columns.includes("session_date")) query.order("session_date", { ascending: true });

    const result = await query;
    if (!result.error) return result.data || [];

    const missingColumn = String(result.error?.message || "").match(
      /(?:could not find the '([^']+)' column|column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist|column\s+([a-zA-Z0-9_]+)\s+does not exist)/i
    );
    const missing = missingColumn?.[1] || missingColumn?.[2] || missingColumn?.[3] || null;
    if (!missing || !columns.includes(missing)) break;
    columns = columns.filter((column) => column !== missing);
  }

  return [];
}

export default async function StudentDashboard() {
  return withSupabaseRequestTrace("page:/app", async () => {
    await autoDeactivateExpiredCommissions();
    const { supabase, user, isAdmin, role } = await getRequestUserContext();

    if (!user) redirect("/");
    if (isAdmin) redirect("/admin/panel");
    if (role === USER_ROLES.NON_STUDENT) redirect("/app/matricula?locked=1");

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "full_name, course_level, commission:course_commissions (id, course_level, commission_number, start_date, end_date, start_month, duration_months, modality_key, days_of_week, start_time, end_time, status, is_active)"
      )
      .eq("id", user.id)
      .maybeSingle();

    const name = profile?.full_name || user.user_metadata?.full_name || user.email || "Student";
    const commission = profile?.commission || null;
    const hasActiveEnrollment = Boolean(commission?.id && resolveCommissionStatus(commission, getLimaTodayISO()) === "active");
    const nowMs = Date.now();

    const rawSessions = hasActiveEnrollment ? await loadCourseSessions(supabase, commission.id) : [];
    const draftSessions = !rawSessions.length && hasActiveEnrollment ? buildDraftSessions(commission) : [];
    const sessionRows = rawSessions.length ? rawSessions : draftSessions;

    const nextSession = hasActiveEnrollment ? resolveNextSession(sessionRows, nowMs) : null;
    const resolvedCourseLevel = hasActiveEnrollment ? commission?.course_level : profile?.course_level || null;
    const resolvedLevelCode = normalizeLevelCode(resolvedCourseLevel || "");
    const skillSnapshot = await loadStudentAppSkillSnapshot({
      db: supabase,
      userId: user.id,
      currentLevel: resolvedLevelCode,
    });

    const skillCards = [
      { label: "Speaking", value: skillSnapshot?.combined?.speaking },
      { label: "Reading", value: skillSnapshot?.combined?.reading },
      { label: "Grammar", value: skillSnapshot?.combined?.grammar },
      { label: "Listening", value: skillSnapshot?.combined?.listening },
    ];

    const metrics = countScheduleMetrics(sessionRows, nowMs);
    const courseProgress = metrics.total ? clamp(Math.round((metrics.completed / metrics.total) * 100), 0, 100) : 0;
    const moduleCards = groupSessionsIntoModules(sessionRows, nowMs);
    const firstName = getFirstName(name);
    const courseBadge = formatLevelBadge(resolvedCourseLevel || commission?.course_level || "");
    const nextClassLabel = hasActiveEnrollment
      ? nextSession?.row?.live_link
        ? "Join Class"
        : "Go to Course"
      : "Open Enrollment";
    const nextClassHref = hasActiveEnrollment ? nextSession?.row?.live_link || "/app/curso" : "/app/matricula";
    const nextClassExternal = Boolean(hasActiveEnrollment && nextSession?.row?.live_link);
    const academicTip = !hasActiveEnrollment
      ? "Complete enrollment first so your class schedule, course path, and skill indicators can populate here."
      : skillCards.filter((skill) => skill.value != null).every((skill) => Number(skill.value) === 0)
        ? "Consistency is key in language acquisition. Dedicate at least 15 minutes daily to your Reading exercises."
        : "Keep your weakest skill in view before the next class and review your course rhythm regularly.";

    return (
      <section className="space-y-10 text-foreground">
        <header className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)] xl:items-start">
          <article className="pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted">Bienvenido de nuevo</p>
            <h1 className="mt-4 max-w-[14ch] text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-[#103474] sm:text-[3.25rem]">
              ¡Hola, {firstName}! Qué bueno verte de nuevo.
            </h1>
            <p className="mt-6 max-w-2xl text-[18px] leading-[1.6] text-[#535866]">
              Continue your academic journey in the language atelier. Your customized learning path is ready for exploration.
            </p>
          </article>

          <aside className="relative overflow-hidden rounded-[30px] bg-[linear-gradient(145deg,#082454_0%,#103474_55%,#35538b_100%)] px-6 py-7 text-white shadow-[0_28px_60px_rgba(16,52,116,0.28)] sm:px-8 sm:py-8">
            <div className="absolute -right-10 -bottom-12 h-44 w-44 rounded-full bg-white/10 blur-3xl" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full bg-white/18 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/90">
                    Próxima Clase
                  </span>
                  <h2 className="mt-4 text-3xl font-semibold tracking-[-0.02em] text-white">{courseBadge}</h2>
                </div>
                <svg viewBox="0 0 24 24" className="mt-1 h-9 w-9 text-white/55" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h13v16h-13A2.5 2.5 0 0 1 4 17.5Z" />
                  <path d="M7 4v16" />
                  <path d="M11 8h4M11 12h5M11 16h4" />
                </svg>
              </div>

              <p className="mt-8 flex items-center gap-3 text-white/82">
                <span className="inline-flex h-5 w-5 items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4.5" y="5" width="15" height="14" rx="2" />
                    <path d="M8 3.5v4M16 3.5v4M4.5 9.5h15" />
                  </svg>
                </span>
                <span className="text-[15px] font-medium">
                  {hasActiveEnrollment ? formatNextClass(nextSession?.startsAt) : "Schedule pending"}
                </span>
              </p>

              <div className="mt-8">
                {nextClassExternal ? (
                  <a
                    href={nextClassHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[18px] bg-white px-5 py-4 text-[18px] font-semibold text-[#103474] transition hover:bg-[#f3f6ff]"
                  >
                    <span>{nextClassLabel}</span>
                    <ArrowRightIcon />
                  </a>
                ) : (
                  <Link
                    href={nextClassHref}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[18px] bg-white px-5 py-4 text-[18px] font-semibold text-[#103474] transition hover:bg-[#f3f6ff]"
                  >
                    <span>{nextClassLabel}</span>
                    <ArrowRightIcon />
                  </Link>
                )}
              </div>
            </div>
          </aside>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
          <article className="rounded-[30px] border border-[rgba(16,52,116,0.08)] bg-white p-6 shadow-[0px_12px_32px_rgba(0,25,67,0.04)] sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted">Global Progress</p>
            <div className="mt-10 flex justify-center">
              <ProgressRing value={courseProgress} />
            </div>

            <div className="mt-10 border-t border-[rgba(16,52,116,0.08)] pt-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <MetricTile label="Modules" value={String(moduleCards.length || 0)} />
                <MetricTile label="Lessons" value={String(metrics.total || 0)} />
                <MetricTile label="Practice" value={formatMinutesToHours(metrics.practiceMinutes)} />
              </div>
            </div>
          </article>

          <article className="rounded-[30px] border border-[rgba(16,52,116,0.08)] bg-white p-6 shadow-[0px_12px_32px_rgba(0,25,67,0.04)] sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted">Editorial Insight: Skills Snapshot</p>

            <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
              {skillCards.map((skill) => (
                <SkillBar key={skill.label} label={skill.label} value={skill.value} />
              ))}
            </div>

            <div className="mt-8 rounded-[24px] bg-[#f2f3f5] px-4 py-4 sm:px-5 sm:py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#103474] text-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M12 17v1.5" />
                    <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.8-2.5 2.1-2.5 4.2" />
                    <circle cx="12" cy="12" r="8.5" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#103474]">Academic Tip:</p>
                  <p className="mt-1 text-[17px] leading-[1.55] text-[#565b66]">{academicTip}</p>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-muted">Syllabus Guide</p>
              <h2 className="mt-2 text-[34px] font-semibold tracking-[-0.03em] text-[#103474]">Course Completion</h2>
            </div>

            <Link href="/app/curso" className="inline-flex items-center gap-2 text-[18px] font-semibold text-[#103474]">
              <span>View Full Syllabus</span>
              <ChevronRightIcon />
            </Link>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            {(moduleCards.length
              ? moduleCards
              : [
                  { step: "01", title: "Course Cycle", subtitle: "0 Lessons • 0h Practice Hours", progress: 0, range: "TBD", href: "/app/curso" },
                  { step: "02", title: "Course Cycle", subtitle: "0 Lessons • 0h Practice Hours", progress: 0, range: "TBD", href: "/app/curso" },
                  { step: "03", title: "Course Cycle", subtitle: "0 Lessons • 0h Practice Hours", progress: 0, range: "TBD", href: "/app/curso" },
                ])
              .slice(0, 3)
              .map((card, index) => (
                <ModuleCard
                  key={`${card.step}-${index}`}
                  step={card.step}
                  title={card.title}
                  subtitle={card.subtitle}
                  progress={card.progress}
                  range={card.range}
                  href={card.href}
                />
              ))}
          </div>
        </section>
      </section>
    );
  });
}
