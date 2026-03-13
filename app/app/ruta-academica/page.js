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
  return `${day}/${month}/${year}`;
}

function formatModality(key) {
  const map = {
    DAILY: "Diaria",
    MWF: "LMV",
    LMV: "LMV",
    TT: "MJ",
    SAT: "Sabatino",
  };
  return map[key] || key || "-";
}

export const metadata = {
  title: "Ruta academica | Aula Virtual",
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
      <section className="rounded-3xl border border-border bg-surface p-6 text-foreground">
        <h2 className="text-2xl font-semibold">Ruta academica</h2>
        <p className="mt-2 text-sm text-muted">Aun no tienes cursos asignados.</p>
      </section>
    );
  }

  const todayIso = getLimaTodayISO();
  const status = resolveCommissionStatus(commission, todayIso);
  const activeCourses = status === "active" ? [commission] : [];
  const pastCourses = status === "active" ? [] : [commission];

  return (
    <section className="space-y-6 text-foreground">
      <header className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">Ruta academica</p>
        <h1 className="mt-2 text-3xl font-semibold">Tus cursos</h1>
        <p className="text-sm text-muted">Accede a cursos activos y repasa cursos pasados.</p>
      </header>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Activos</h2>
        {activeCourses.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {activeCourses.map((course) => (
              <div key={course.id} className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-muted">Comision #{course.commission_number}</p>
                <h3 className="mt-2 text-2xl font-semibold">{course.course_level}</h3>
                <p className="mt-2 text-sm text-muted">
                  {formatModality(course.modality_key)} - {course.start_time} - {course.end_time}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Inicio: {formatDate(course.start_date)} - Fin: {formatDate(course.end_date)}
                </p>
                <Link
                  href="/app/curso"
                  className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                >
                  Ir al curso activo
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
            No tienes cursos activos en este momento.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Pasados</h2>
        {pastCourses.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {pastCourses.map((course) => (
              <div key={course.id} className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-muted">Comision #{course.commission_number}</p>
                <h3 className="mt-2 text-2xl font-semibold">{course.course_level}</h3>
                <p className="mt-2 text-sm text-muted">
                  {formatModality(course.modality_key)} - {course.start_time} - {course.end_time}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Inicio: {formatDate(course.start_date)} - Fin: {formatDate(course.end_date)}
                </p>
                <Link
                  href={`/app/ruta-academica/${course.id}`}
                  className="mt-4 inline-flex rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Revisar curso pasado
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
            No tienes cursos pasados registrados.
          </p>
        )}
      </div>
    </section>
  );
}
