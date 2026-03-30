import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import { resolveStudentUiLanguage } from "@/lib/student-ui-language";
import {
  STUDY_WITH_ME_SESSION_MINUTES,
  STUDY_WITH_ME_WEEKLY_LIMIT,
  getStudyWithMeAccess,
} from "@/lib/study-with-me-access";

export const metadata = {
  title: "Study With Me | Aula Virtual",
};

const STUDY_WITH_ME_CALENDLY_URL =
  process.env.CALENDLY_STUDY_WITH_ME_URL ||
  process.env.NEXT_PUBLIC_CALENDLY_STUDY_WITH_ME_URL ||
  "";

const MENTOR_IMAGE_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBn7Kr7VKPDhWEUA6X6YZgrX-IMKIL5Clt2L67LvgRK7MNLnyGqLEbAGK74QmXBPCfG9hr77-zHsTvMhCRwsSemKCEBiRpRRfBBelz0cB5RuLKx24NHGVNbgDti1swSbNo1zlzXYutwXxfLqRM_oAmP9P1P_Pl8eBRhCR8E358v_jKvM1LWXgid3fHP6NNjeOQzKfsIwpIDm6rVx2TImZ5vwsbow2fnznh8FFrQnYLdOOky1HDztCsF_I82GcKK0CDX_yBLiQ1VyDY";

function formatDate(value, locale = "en-US") {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateRange(start, end, locale = "en-US") {
  if (!start || !end) return "-";
  return `${formatDate(start, locale)} - ${formatDate(end, locale)}`;
}

function formatDurationHours(totalMinutes) {
  const minutes = Number(totalMinutes || 0);
  if (!minutes) return "0h";
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function buildCalendlyUrl({ baseUrl, email, name }) {
  if (!baseUrl) return "";
  try {
    const url = new URL(baseUrl);
    if (email) url.searchParams.set("email", email);
    if (name) url.searchParams.set("name", name);
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("study_with_me_sessions") && (message.includes("does not exist") || message.includes("could not find the table"));
}

function CalendarLargeIcon() {
  return (
    <svg viewBox="0 0 80 80" className="h-28 w-28 text-[#dfe6f2]" fill="none" stroke="currentColor" strokeWidth="4">
      <rect x="12" y="16" width="56" height="52" rx="10" />
      <path d="M24 10v14M56 10v14M12 30h56" />
      <circle cx="27" cy="42" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="40" cy="42" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="53" cy="42" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="27" cy="54" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="40" cy="54" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="53" cy="54" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SpeakingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4a3 3 0 0 1 3 3v3a3 3 0 1 1-6 0V7a3 3 0 0 1 3-3Z" />
      <path d="M6 10a6 6 0 0 0 12 0M12 16v4M8.5 20h7" />
      <path d="M18.5 7a4.5 4.5 0 0 1 0 6M20.5 4.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

function FocusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3a8.5 8.5 0 1 0 8.5 8.5A8.5 8.5 0 0 0 12 3Z" />
      <path d="M12 8.2a3.3 3.3 0 1 1-3.3 3.3A3.3 3.3 0 0 1 12 8.2Z" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.5 2" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 7h8a3 3 0 0 1 3 3v1M17 7l2 2-2 2" />
      <path d="M17 17H9a3 3 0 0 1-3-3v-1M7 17l-2-2 2-2" />
    </svg>
  );
}

function DateRangeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 3.5v4M16.5 3.5v4M3.5 9.5h17" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}

function buildCopy(language) {
  if (language === "en") {
    return {
      eyebrow: "One-on-One",
      title: "Study With Me",
      intro:
        "Unlock your potential with tailored 1:1 sessions. These focused windows are designed for live speaking practice, addressing specific course hurdles, and receiving expert guidance on your academic journey.",
      available: "Session Available",
      weeklyBooked: "Weekly credit already used",
      unavailable: "Booking unavailable",
      readyTitle: "Ready for your next session?",
      bookedTitle: "Your weekly session is already covered",
      readyDescription: "Your weekly booking credit is active. Choose a slot that fits your schedule for an intensive deep-dive.",
      bookedDescription: "You already have a Study With Me session inside this booking window. Use the rest of the week to review your course and arrive with focused questions.",
      missingCalendly: "Calendly is not configured yet (`CALENDLY_STUDY_WITH_ME_URL`).",
      bookNow: "Book my 1:1 session",
      reviewCourse: "Review my course first",
      bookingUnavailable: "Booking unavailable",
      duration: "Session Duration",
      weeklyLimit: "Weekly Limit",
      currentWindow: "Current Window",
      quotaRemaining: "Weekly Quota Remaining",
      session: "session",
      sessionsPlural: "sessions",
      mentorTitle: "Connect with the best.",
      mentorBody: "Certified mentors are ready to assist you today.",
      progressTitle: "Your Progress",
      viewHistory: "View History",
      totalSessions: "Total Sessions",
      focusedHours: "Focused Hours",
      satisfaction: "Satisfaction",
      academicExcellence: "Academic Excellence",
      liveLearning: "Live Learning",
      attendanceRating: "Attendance Rating",
      historyTitle: "Session History",
      historyEmpty: "Your Study With Me history will appear here after your first session is booked.",
      historyClose: "Hide History",
      speakingCardTitle: "Speaking Mastery",
      speakingCardBody: "Practice fluid conversation and refine your phonetics in a safe, constructive environment.",
      focusCardTitle: "Focus Support",
      focusCardBody: "Stuck on a specific module? Use this time to break down complex theories with a mentor.",
      statuses: {
        scheduled: "Scheduled",
        completed: "Completed",
        cancelled: "Cancelled",
        no_show: "No show",
      },
    };
  }

  return {
    eyebrow: "One-on-One",
    title: "Study With Me",
    intro:
      "Desbloquea tu potencial con sesiones 1:1 personalizadas. Estos espacios están diseñados para practicar speaking en vivo, resolver trabas puntuales del curso y recibir acompañamiento académico experto.",
    available: "Sesión disponible",
    weeklyBooked: "Crédito semanal ya usado",
    unavailable: "Reserva no disponible",
    readyTitle: "¿Lista para tu siguiente sesión?",
    bookedTitle: "Tu sesión semanal ya está cubierta",
    readyDescription: "Tu crédito semanal de reserva está activo. Elige un horario que funcione para una sesión intensiva y enfocada.",
    bookedDescription: "Ya tienes una sesión de Study With Me dentro de esta ventana semanal. Usa el resto de la semana para revisar tu curso y llegar con preguntas claras.",
    missingCalendly: "Calendly todavía no está configurado (`CALENDLY_STUDY_WITH_ME_URL`).",
    bookNow: "Reservar mi sesión 1:1",
    reviewCourse: "Revisar mi curso primero",
    bookingUnavailable: "Reserva no disponible",
    duration: "Duración",
    weeklyLimit: "Límite semanal",
    currentWindow: "Ventana actual",
    quotaRemaining: "Cuota semanal restante",
    session: "sesión",
    sessionsPlural: "sesiones",
    mentorTitle: "Conecta con los mejores.",
    mentorBody: "Mentores certificados están listos para apoyarte hoy.",
    progressTitle: "Tu progreso",
    viewHistory: "Ver historial",
    totalSessions: "Total de sesiones",
    focusedHours: "Horas enfocadas",
    satisfaction: "Satisfacción",
    academicExcellence: "Excelencia académica",
    liveLearning: "Aprendizaje en vivo",
    attendanceRating: "Constancia en sesiones",
    historyTitle: "Historial de sesiones",
    historyEmpty: "Tu historial de Study With Me aparecerá aquí después de tu primera reserva.",
    historyClose: "Ocultar historial",
    speakingCardTitle: "Speaking Mastery",
    speakingCardBody: "Practica conversación fluida y mejora tu fonética en un entorno seguro y constructivo.",
    focusCardTitle: "Focus Support",
    focusCardBody: "¿Atascada en un módulo específico? Usa este espacio para desarmar teorías complejas con una mentora.",
    statuses: {
      scheduled: "Programada",
      completed: "Completada",
      cancelled: "Cancelada",
      no_show: "Inasistencia",
    },
  };
}

export default async function StudyWithMePage({ searchParams }) {
  const params = (await Promise.resolve(searchParams)) || {};
  const { supabase, user, profile } = await getRequestUserContext();

  if (!user) redirect("/login");

  const access = await getStudyWithMeAccess({ supabase, userId: user.id });
  if (!access.canAccessPage) {
    redirect("/app/matricula?locked=1");
  }

  const language = resolveStudentUiLanguage({
    courseLevel: profile?.course_level || "",
    pathname: "/app/study-with-me",
  });
  const locale = language === "en" ? "en-US" : "es-PE";
  const copy = buildCopy(language);
  const showHistory = String(params?.history || "") === "1";
  const calendlyUrl = buildCalendlyUrl({
    baseUrl: STUDY_WITH_ME_CALENDLY_URL,
    email: access?.profile?.email || user.email || "",
    name: access?.profile?.full_name || "",
  });

  let sessions = [];
  const { data: sessionRows, error: sessionError } = await supabase
    .from("study_with_me_sessions")
    .select("id, week_start, starts_at, ends_at, status, source, created_at")
    .eq("student_id", user.id)
    .order("starts_at", { ascending: false });

  if (!sessionError) {
    sessions = Array.isArray(sessionRows) ? sessionRows : [];
  } else if (!isMissingTableError(sessionError)) {
    console.error("No se pudo cargar Study With Me history", sessionError);
  }

  const currentWeekSessions = sessions.filter(
    (session) =>
      String(session?.week_start || "") === String(access.weekStartKey || "") &&
      ["scheduled", "completed", "no_show"].includes(String(session?.status || ""))
  );
  const weeklyUsed = currentWeekSessions.length;
  const weeklyRemaining = Math.max(0, Number(access.weeklyLimit || STUDY_WITH_ME_WEEKLY_LIMIT) - weeklyUsed);
  const quotaPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round((weeklyRemaining / Math.max(1, Number(access.weeklyLimit || STUDY_WITH_ME_WEEKLY_LIMIT))) * 100)
    )
  );
  const latestBookedSession =
    currentWeekSessions.find((session) => String(session?.status || "") === "scheduled") || currentWeekSessions[0] || null;
  const canBookNow = Boolean(calendlyUrl) && weeklyRemaining > 0;

  const completedSessions = sessions.filter((session) => String(session?.status || "") === "completed");
  const activeHistorySessions = sessions.filter((session) => String(session?.status || "") !== "cancelled");
  const completedMinutes = completedSessions.reduce((sum, session) => {
    const start = new Date(session?.starts_at || "").getTime();
    const end = new Date(session?.ends_at || "").getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return sum + STUDY_WITH_ME_SESSION_MINUTES;
    }
    return sum + Math.round((end - start) / 60000);
  }, 0);
  const attendanceBase = sessions.filter((session) => ["completed", "no_show", "scheduled"].includes(String(session?.status || "")));
  const satisfactionValue = attendanceBase.length
    ? Math.round((completedSessions.length / attendanceBase.length) * 100)
    : 100;

  const historyHref = showHistory ? "/app/study-with-me" : "/app/study-with-me?history=1#study-history";
  const bookingHeadline = canBookNow ? copy.readyTitle : weeklyRemaining === 0 ? copy.bookedTitle : copy.readyTitle;
  const bookingDescription = canBookNow
    ? copy.readyDescription
    : weeklyRemaining === 0
      ? latestBookedSession?.starts_at
        ? `${copy.bookedDescription} ${formatDate(latestBookedSession.starts_at, locale)}.`
        : copy.bookedDescription
      : copy.missingCalendly;

  return (
    <section className="space-y-8 text-foreground sm:space-y-10">
      <header className="max-w-4xl">
        <div className="inline-flex items-center rounded-full bg-[#dbe5ff] px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.18em] text-[#103474]">
          {copy.eyebrow}
        </div>
        <h1 className="mt-5 text-[2.7rem] font-semibold tracking-[-0.05em] text-[#0b3774] sm:text-[4rem]">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-5xl text-[18px] leading-[1.8] text-[#50596d] sm:mt-5 sm:text-[22px] sm:leading-[1.9]">
          {copy.intro}
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr] xl:gap-8">
        <div className="space-y-6 sm:space-y-8">
          <section className="student-panel relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10 sm:px-11">
            <div className="absolute right-7 top-7 hidden text-[#dfe6f2] md:block">
              <CalendarLargeIcon />
            </div>
            <div className="relative z-10 max-w-[560px]">
              <div className="flex items-center gap-4">
                <span
                  className={`h-4 w-4 rounded-full ${canBookNow ? "bg-[#19b77f]" : weeklyRemaining === 0 ? "bg-[#ffb168]" : "bg-[#94a3b8]"}`}
                />
                <p className={`text-[15px] font-semibold sm:text-[18px] ${canBookNow ? "text-[#16986c]" : weeklyRemaining === 0 ? "text-[#d97706]" : "text-[#64748b]"}`}>
                  {canBookNow ? copy.available : weeklyRemaining === 0 ? copy.weeklyBooked : copy.unavailable}
                </p>
              </div>

              <h2 className="mt-8 text-[2.35rem] font-semibold tracking-[-0.05em] text-[#103474] sm:mt-10 sm:text-[44px] sm:text-[3.35rem]">
                {bookingHeadline}
              </h2>
              <p className="mt-4 max-w-[560px] text-[16px] leading-[1.7] text-[#566072] sm:mt-5 sm:text-[20px] sm:leading-[1.65]">
                {bookingDescription}
              </p>

              {!calendlyUrl ? (
                <div className="mt-6 rounded-[16px] border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {copy.missingCalendly}
                </div>
              ) : null}

              <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row">
                {canBookNow ? (
                  <a
                    href={calendlyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="student-button-primary min-h-[64px] w-full rounded-[18px] px-6 text-[16px] font-semibold shadow-[0_14px_28px_rgba(16,52,116,0.18)] sm:w-auto sm:px-10 sm:text-[17px]"
                  >
                    {copy.bookNow}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-[64px] w-full items-center justify-center rounded-[18px] border border-border bg-surface-2 px-6 text-[16px] font-semibold text-muted sm:w-auto sm:px-10 sm:text-[17px]"
                  >
                    {copy.bookingUnavailable}
                  </button>
                )}
                <a
                  href="/app/curso"
                  className="inline-flex min-h-[64px] w-full items-center justify-center rounded-[18px] bg-[#e7eaef] px-6 text-[16px] font-semibold text-[#1f2937] transition hover:bg-[#dde2ea] sm:w-auto sm:px-10 sm:text-[17px]"
                >
                  {copy.reviewCourse}
                </a>
              </div>
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <article className="rounded-[24px] bg-[#f5f7fb] px-6 py-6 shadow-[0_14px_26px_rgba(15,23,42,0.04)] sm:px-8 sm:py-8">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#e7edf8] text-[#123a7b] sm:h-16 sm:w-16">
                <SpeakingIcon />
              </span>
              <h3 className="mt-6 text-[18px] font-semibold tracking-[-0.03em] text-[#103474] sm:mt-8 sm:text-[20px]">
                {copy.speakingCardTitle}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.7] text-[#50596d] sm:mt-4 sm:text-[17px] sm:leading-[1.8]">
                {copy.speakingCardBody}
              </p>
            </article>

            <article className="rounded-[24px] bg-[#f5f7fb] px-6 py-6 shadow-[0_14px_26px_rgba(15,23,42,0.04)] sm:px-8 sm:py-8">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#e7edf8] text-[#123a7b] sm:h-16 sm:w-16">
                <FocusIcon />
              </span>
              <h3 className="mt-6 text-[18px] font-semibold tracking-[-0.03em] text-[#103474] sm:mt-8 sm:text-[20px]">
                {copy.focusCardTitle}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.7] text-[#50596d] sm:mt-4 sm:text-[17px] sm:leading-[1.8]">
                {copy.focusCardBody}
              </p>
            </article>
          </div>
        </div>

        <aside className="space-y-8">
          <section className="overflow-hidden rounded-[24px] bg-[#103474] px-6 py-8 text-white shadow-[0_24px_50px_rgba(16,52,116,0.24)] sm:px-8 sm:py-9">
            <h3 className="text-[20px] font-semibold tracking-[-0.03em] sm:text-[24px]">Current Cycle Summary</h3>

            <div className="mt-6 space-y-5 sm:mt-8 sm:space-y-6">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 sm:pb-5">
                <div className="flex items-center gap-3 text-white/80 sm:gap-4">
                  <ClockIcon />
                  <span className="text-[14px] sm:text-[16px]">{copy.duration}</span>
                </div>
                <span className="text-[16px] font-semibold sm:text-[18px]">{STUDY_WITH_ME_SESSION_MINUTES} mins</span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 sm:pb-5">
                <div className="flex items-center gap-3 text-white/80 sm:gap-4">
                  <RepeatIcon />
                  <span className="text-[14px] sm:text-[16px]">{copy.weeklyLimit}</span>
                </div>
                <span className="text-[16px] font-semibold sm:text-[18px]">
                  {access.weeklyLimit} {access.weeklyLimit === 1 ? copy.session : copy.sessionsPlural}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 sm:pb-5">
                <div className="flex items-center gap-3 text-white/80 sm:gap-4">
                  <DateRangeIcon />
                  <span className="text-[14px] sm:text-[16px]">{copy.currentWindow}</span>
                </div>
                <span className="text-[16px] font-semibold sm:text-[18px]">
                  {formatDateRange(access.weekStartKey, access.weekEndKey, locale)}
                </span>
              </div>
            </div>

            <div className="mt-8 sm:mt-10">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#b7cffb]">
                  {copy.quotaRemaining}
                </span>
                <span className="text-[12px] font-bold">{quotaPercent}%</span>
              </div>
              <div className="h-4 rounded-full bg-white/12 p-1">
                <div
                  className="h-full rounded-full bg-[#68a5ff] transition-all"
                  style={{ width: `${Math.max(quotaPercent, weeklyRemaining > 0 ? 18 : 8)}%` }}
                />
              </div>
            </div>
          </section>

          <article className="group relative min-h-[280px] overflow-hidden rounded-[24px] shadow-[0_22px_48px_rgba(15,23,42,0.16)] sm:h-[352px]">
            <img
              src={MENTOR_IMAGE_URL}
              alt="Student working with mentor"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#103474]/88 via-[#103474]/28 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
              <p className="text-[16px] font-semibold tracking-[-0.02em] sm:text-[18px]">{copy.mentorTitle}</p>
              <p className="mt-2 text-[14px] text-white/75 sm:text-[15px]">{copy.mentorBody}</p>
            </div>
          </article>
        </aside>
      </div>

      <section className="border-t border-[rgba(16,52,116,0.1)] pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[28px] font-semibold tracking-[-0.04em] text-[#103474] sm:text-[32px]">{copy.progressTitle}</h2>
          <Link href={historyHref} className="inline-flex items-center gap-2 text-[16px] font-semibold text-[#103474]">
            {showHistory ? copy.historyClose : copy.viewHistory}
            <ArrowRightIcon />
          </Link>
        </div>

        <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-3">
          <article className="flex items-center gap-4 rounded-[22px] bg-[#f5f7fb] px-5 py-5 shadow-[0_12px_24px_rgba(15,23,42,0.04)] sm:gap-5 sm:px-8 sm:py-7">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[24px] font-semibold text-[#103474] shadow-[0_8px_18px_rgba(15,23,42,0.08)] sm:h-16 sm:w-16 sm:text-[28px]">
              {activeHistorySessions.length}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5d6475] sm:text-[12px]">{copy.totalSessions}</p>
              <p className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#103474] sm:text-[18px]">{copy.academicExcellence}</p>
            </div>
          </article>

          <article className="flex items-center gap-4 rounded-[22px] bg-[#f5f7fb] px-5 py-5 shadow-[0_12px_24px_rgba(15,23,42,0.04)] sm:gap-5 sm:px-8 sm:py-7">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[24px] font-semibold text-[#103474] shadow-[0_8px_18px_rgba(15,23,42,0.08)] sm:h-16 sm:w-16 sm:text-[28px]">
              {formatDurationHours(completedMinutes)}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5d6475] sm:text-[12px]">{copy.focusedHours}</p>
              <p className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#103474] sm:text-[18px]">{copy.liveLearning}</p>
            </div>
          </article>

          <article className="flex items-center gap-4 rounded-[22px] bg-[#f5f7fb] px-5 py-5 shadow-[0_12px_24px_rgba(15,23,42,0.04)] sm:gap-5 sm:px-8 sm:py-7">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[22px] font-semibold text-[#103474] shadow-[0_8px_18px_rgba(15,23,42,0.08)] sm:h-16 sm:w-16 sm:text-[24px]">
              {`${satisfactionValue}%`}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#5d6475] sm:text-[12px]">{copy.satisfaction}</p>
              <p className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#103474] sm:text-[18px]">{copy.attendanceRating}</p>
            </div>
          </article>
        </div>

        {showHistory ? (
          <section id="study-history" className="student-panel mt-8 px-6 py-6 sm:px-7">
            <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-[#103474]">{copy.historyTitle}</h3>
            {sessions.length ? (
              <div className="mt-6 space-y-3">
                {sessions.slice(0, 6).map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col gap-2 rounded-[18px] border border-[rgba(16,52,116,0.08)] bg-[#f8fbff] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-[16px] font-semibold text-[#103474]">
                        {formatDate(session.starts_at, locale)}
                      </p>
                      <p className="mt-1 text-sm text-[#667089]">
                        {session.starts_at
                          ? new Intl.DateTimeFormat(locale, {
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(session.starts_at))
                          : "-"}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-[#e7edf8] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#103474]">
                      {copy.statuses[String(session.status || "scheduled")] || String(session.status || "scheduled")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">{copy.historyEmpty}</p>
            )}
          </section>
        ) : null}
      </section>
    </section>
  );
}
