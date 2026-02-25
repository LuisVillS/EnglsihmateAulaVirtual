import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import TeacherDashboardStudentsTable from "@/components/teacher-dashboard-students-table";
import { loadTeacherStudentsOverview } from "@/lib/student-skills";

export const metadata = {
  title: "Teacher Dashboard | Admin",
};

const LEVEL_OPTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"];

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function average(values = []) {
  const list = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!list.length) return null;
  const total = list.reduce((sum, value) => sum + value, 0);
  return Math.round((total / list.length) * 10) / 10;
}

function MetricCard({ label, value, hint }) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </article>
  );
}

export default async function TeacherDashboardPage({ searchParams: searchParamsPromise }) {
  const searchParams = (await searchParamsPromise) || {};
  const commissionId = cleanText(searchParams?.commission || searchParams?.commission_id || searchParams?.commissionId);
  const level = cleanText(searchParams?.level).toUpperCase();
  const query = cleanText(searchParams?.q);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRecord?.id) {
    redirect("/admin/login");
  }

  const db = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;

  const dashboard = await loadTeacherStudentsOverview({
    db,
    filters: { commissionId, level, query },
  });

  const students = dashboard.students || [];
  const activeCount = students.filter((student) => student.status === "active").length;
  const inactiveCount = Math.max(0, students.length - activeCount);
  const courseAverage = average(students.map((student) => student.course_average));

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8 text-foreground">
      <header className="rounded-3xl border border-border bg-surface p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-muted">Teacher Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold">Seguimiento de alumnos</h1>
        <p className="mt-2 text-sm text-muted">
          Vista rápida por estudiante con filtros por comisión y nivel. Desde aquí puedes abrir perfil y editar nota.
        </p>
      </header>

      <form className="grid gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-[1.2fr_0.8fr_1fr_auto]">
        <select
          name="commission"
          defaultValue={commissionId}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          <option value="">Todas las comisiones</option>
          {(dashboard.commissions || []).map((commission) => (
            <option key={commission.id} value={commission.id}>
              {commission.course_level} - #{commission.commission_number}
            </option>
          ))}
        </select>
        <select
          name="level"
          defaultValue={level}
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          <option value="">Todos los niveles</option>
          {LEVEL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre o código"
          className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Filtrar
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Alumnos" value={students.length} />
        <MetricCard label="Activos" value={activeCount} />
        <MetricCard label="Inactivos" value={inactiveCount} />
        <MetricCard
          label="Promedio curso"
          value={courseAverage == null ? "--" : `${courseAverage}%`}
          hint="Componente de nota actual del alumno"
        />
      </div>

      <TeacherDashboardStudentsTable students={students} />
    </section>
  );
}

