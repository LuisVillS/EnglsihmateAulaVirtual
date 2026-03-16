import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
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

function formatDate(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day) return raw;
  return `${day}/${month}/${year}`;
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

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7L12 3Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H17.5A2.5 2.5 0 0 1 20 6.5v6A2.5 2.5 0 0 1 17.5 15H10l-4 4v-4H6.5A2.5 2.5 0 0 1 4 12.5v-6Z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
      <path d="M7.5 3.5v4M16.5 3.5v4M3.5 9.5h17" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default async function StudyWithMePage() {
  const { supabase, user } = await getRequestUserContext();

  if (!user) redirect("/login");

  const access = await getStudyWithMeAccess({ supabase, userId: user.id });
  if (!access.canAccessPage) {
    redirect("/app/matricula?locked=1");
  }

  const calendlyUrl = buildCalendlyUrl({
    baseUrl: STUDY_WITH_ME_CALENDLY_URL,
    email: access?.profile?.email || user.email || "",
    name: access?.profile?.full_name || "",
  });
  const canBookNow = Boolean(calendlyUrl);

  const valuePoints = [
    "Practice speaking in a focused 1:1 format.",
    "Use the session to solve specific doubts from class.",
    "Stay accountable with a weekly booking rhythm.",
  ];

  const benefitCards = [
    {
      title: "Focused speaking time",
      description: "Use each session to practice live conversation with direct support instead of waiting for group class time.",
      icon: <ChatIcon />,
    },
    {
      title: "Weekly booking rhythm",
      description: "Keep a simple habit with one guided session each week when your schedule needs extra speaking practice.",
      icon: <CalendarIcon />,
    },
    {
      title: "Premium support layer",
      description: "Treat this as a companion space for confidence, correction, and continuity between regular classes.",
      icon: <SparkIcon />,
    },
  ];

  return (
    <section className="space-y-8 text-foreground">
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <header className="student-panel relative overflow-hidden px-6 py-7 sm:px-7">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-[80px] bg-[linear-gradient(135deg,rgba(16,52,116,0.16),rgba(16,52,116,0.03))]" />
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Premium</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.02em] text-foreground sm:text-[2.65rem]">
            Study With Me
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted">
            A focused 1:1 session space for students who want extra live practice, faster feedback, and a clearer weekly rhythm.
          </p>

          <div className="mt-6 space-y-3">
            {valuePoints.map((point) => (
              <div key={point} className="flex items-start gap-3 text-sm text-foreground">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-[10px] bg-[#eef3fb] text-[#103474]">
                  <CheckIcon />
                </span>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </header>

        <aside className="student-panel px-6 py-7 sm:px-7">
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Book your session</p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">Reserve your weekly 1:1 slot</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            This booking module is your direct access point. Keep it simple: reserve, attend, and use the session for your highest-priority practice need.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="student-panel-soft px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Duration</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{STUDY_WITH_ME_SESSION_MINUTES} min</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Weekly limit</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{STUDY_WITH_ME_WEEKLY_LIMIT} session</p>
            </div>
            <div className="student-panel-soft px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Current week</p>
              <p className="mt-2 text-sm text-foreground">
                {formatDate(access.weekStartKey)} to {formatDate(access.weekEndKey)}
              </p>
            </div>
          </div>

          {!calendlyUrl ? (
            <div className="mt-5 rounded-[12px] border border-danger/35 bg-danger/10 p-4 text-sm text-danger">
              Calendly is not configured yet (`CALENDLY_STUDY_WITH_ME_URL`).
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {canBookNow ? (
              <a
                href={calendlyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="student-button-primary px-5 py-2.5 text-sm"
              >
                Book my 1:1 session
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center rounded-[12px] border border-border bg-surface-2 px-5 py-2.5 text-sm font-semibold text-muted"
              >
                Booking unavailable
              </button>
            )}
            <a href="/app/curso" className="student-button-secondary px-5 py-2.5 text-sm">
              Review my course first
            </a>
          </div>
        </aside>
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.36em] text-muted">How it helps</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">A stronger support layer between regular classes</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {benefitCards.map((card) => (
            <article key={card.title} className="student-panel px-5 py-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#eef3fb] text-[#103474]">
                {card.icon}
              </span>
              <h3 className="mt-4 text-xl font-semibold text-foreground">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="student-panel px-6 py-6 sm:px-7">
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Best use</p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">When to book a session</h3>
          </div>
          <div className="text-sm leading-6 text-muted">
            Book when you want to prepare for a class, review a speaking weakness, or keep momentum during a demanding week.
          </div>
          <div className="text-sm leading-6 text-muted">
            Use the live session for practical goals: pronunciation, speaking confidence, corrections, and focused repetition.
          </div>
        </div>
      </section>
    </section>
  );
}
