import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestUserContext } from "@/lib/request-user-context";
import { USER_ROLES } from "@/lib/roles";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";

function formatDate(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day) return raw;
  return `${month}/${day}/${year}`;
}

function formatModality(key) {
  const map = {
    DAILY: "Daily",
    MWF: "MWF",
    LMV: "MWF",
    TT: "Tue / Thu",
    SAT: "Saturday",
  };
  return map[key] || key || "-";
}

function resolveTrackStage(courseLevel = "") {
  const normalized = String(courseLevel || "").toUpperCase();
  if (normalized.includes("BASICO") || normalized.includes("A1") || normalized.includes("A2")) return "Basic";
  if (normalized.includes("INTERMEDIO") || normalized.includes("B1") || normalized.includes("B2")) return "Intermediate";
  return "Advanced";
}

export const metadata = {
  title: "Academic path | Aula Virtual",
};

export default async function RutaAcademicaPage() {
  await autoDeactivateExpiredCommissions();
  const { supabase, user, role } = await getRequestUserContext();

  if (!user) redirect("/login");
  if (role !== USER_ROLES.STUDENT) {
    redirect("/app/matricula?locked=1");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "commission_id, commission:course_commissions (id, course_level, commission_number, start_date, end_date, start_time, end_time, modality_key, status, is_active)"
    )
    .eq("id", user.id)
    .maybeSingle();

  const commission = profile?.commission || null;
  if (!commission?.id) {
    return (
      <section className="space-y-6 text-foreground">
        <header className="student-panel px-5 py-5 sm:px-6">
          <p className="text-xs uppercase tracking-[0.38em] text-muted">Academic path</p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">Your course history</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Review active and archived course records from one place as your path grows.
          </p>
        </header>
        <div className="student-empty-panel px-5 py-6 sm:px-6">
          <h2 className="text-xl font-semibold text-foreground">No academic path available yet</h2>
          <p className="mt-2 text-sm text-muted">Once a course is assigned, it will appear here as part of your current path.</p>
          <Link href="/app/matricula" className="student-button-primary mt-4 inline-flex px-4 py-2.5 text-sm">
            Open enrollment
          </Link>
        </div>
      </section>
    );
  }

  const todayIso = getLimaTodayISO();
  const status = resolveCommissionStatus(commission, todayIso);
  const activeCourses = status === "active" ? [commission] : [];
  const pastCourses = status === "active" ? [] : [commission];
  const currentStage = resolveTrackStage(commission.course_level);

  return (
    <section className="space-y-6 text-foreground">
      <header className="student-panel px-5 py-5 sm:px-6">
        <p className="text-xs uppercase tracking-[0.38em] text-muted">Academic path</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Your course history</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Keep track of your active commission and any archived course records without changing the current route structure.
        </p>
      </header>

      <div className="student-panel px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Progression</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">Current stage: {currentStage}</h2>
          </div>
          <span className="rounded-[10px] border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
            {commission.course_level || "Track pending"}
          </span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {["Basic", "Intermediate", "Advanced"].map((stage) => {
            const isCurrent = stage === currentStage;
            return (
              <div
                key={stage}
                className={`rounded-[12px] border px-4 py-3 text-sm shadow-[0_10px_24px_rgba(15,23,42,0.03)] ${
                  isCurrent
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-white text-muted"
                }`}
              >
                <p className="font-semibold">{stage}</p>
                <p className="mt-1 text-xs">{isCurrent ? "Current academic stage" : "Upcoming / completed stage"}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-foreground">Active course</h2>
          <span className="text-sm text-muted">{activeCourses.length ? "Current academic workload" : "No active course"}</span>
        </div>
        {activeCourses.length ? (
          <div className="grid gap-4">
            {activeCourses.map((course) => (
              <article key={course.id} className="student-panel px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-muted">Commission #{course.commission_number}</p>
                    <h3 className="mt-2 text-3xl font-semibold text-foreground">{course.course_level}</h3>
                    <p className="mt-2 text-sm text-muted">
                      {formatModality(course.modality_key)} · {course.start_time} - {course.end_time}
                    </p>
                  </div>
                  <span className="rounded-[10px] border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-success">
                    Active
                  </span>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="student-panel-soft px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-muted">Start date</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{formatDate(course.start_date)}</p>
                  </div>
                  <div className="student-panel-soft px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-muted">End date</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{formatDate(course.end_date)}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <Link href="/app/curso" className="student-button-primary px-4 py-2.5 text-sm">
                    Open current course
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="student-empty-panel px-4 py-4 text-sm text-muted">
            There is no active course in your path right now.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-foreground">Archived courses</h2>
          <span className="text-sm text-muted">Past course records</span>
        </div>
        {pastCourses.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {pastCourses.map((course) => (
              <article key={course.id} className="student-panel px-5 py-5">
                <p className="text-xs uppercase tracking-[0.28em] text-muted">Commission #{course.commission_number}</p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">{course.course_level}</h3>
                <p className="mt-2 text-sm text-muted">
                  {formatModality(course.modality_key)} · {course.start_time} - {course.end_time}
                </p>
                <p className="mt-2 text-xs text-muted">
                  {formatDate(course.start_date)} to {formatDate(course.end_date)}
                </p>
                <Link href={`/app/ruta-academica/${course.id}`} className="student-button-secondary mt-4 inline-flex px-4 py-2.5 text-sm">
                  Review archived course
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="student-empty-panel px-4 py-4 text-sm text-muted">
            Archived courses will appear here once you complete a commission.
          </p>
        )}
      </div>
    </section>
  );
}
