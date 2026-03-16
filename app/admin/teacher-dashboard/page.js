import { requireAdminPageAccess } from "@/lib/admin/access";
import { AdminPage, AdminPageHeader, AdminStatCard, AdminStatsGrid, AdminToolbar } from "@/components/admin-page";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import TeacherDashboardStudentsTable from "@/components/teacher-dashboard-students-table";
import { loadTeacherStudentsOverview } from "@/lib/student-skills";

export const metadata = {
  title: "Dashboard docente | Admin",
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
  return <AdminStatCard label={label} value={value} hint={hint} />;
}

export default async function TeacherDashboardPage({ searchParams: searchParamsPromise }) {
  const searchParams = (await searchParamsPromise) || {};
  const commissionId = cleanText(searchParams?.commission || searchParams?.commission_id || searchParams?.commissionId);
  const level = cleanText(searchParams?.level).toUpperCase();
  const query = cleanText(searchParams?.q);

  const { supabase } = await requireAdminPageAccess();
  const db = hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;

  const dashboard = await loadTeacherStudentsOverview({
    db,
    filters: { commissionId, level, query },
  });

  const students = dashboard.students || [];
  const activeCount = students.filter((student) => student.status === "active").length;
  const inactiveCount = Math.max(0, students.length - activeCount);
  const courseAverage = average(students.map((student) => student.course_average));
  const lowAverageCount = students.filter((student) => Number(student.course_average) > 0 && Number(student.course_average) < 70).length;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Seguimiento academico"
        title="Dashboard docente"
        description="Prioriza riesgo academico, seguimiento de comisiones y revision rapida de calificaciones con la misma logica actual."
      />

      <AdminToolbar>
        <form className="grid gap-3 md:grid-cols-[1.15fr_0.75fr_1fr_auto]">
          <select
            name="commission"
            defaultValue={commissionId}
            className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a]"
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
            className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a]"
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
            placeholder="Buscar por nombre o codigo"
            className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a]"
          />
          <button type="submit" className="rounded-2xl bg-[#103474] px-4 py-2 text-sm font-semibold text-white">
            Filtrar
          </button>
        </form>
      </AdminToolbar>

      <AdminStatsGrid className="xl:grid-cols-5">
        <MetricCard label="Alumnos" value={students.length} />
        <MetricCard label="Activos" value={activeCount} />
        <MetricCard label="Inactivos" value={inactiveCount} />
        <MetricCard label="Bajo promedio" value={lowAverageCount} hint="Menor a 70%" />
        <MetricCard
          label="Promedio curso"
          value={courseAverage == null ? "--" : `${courseAverage}%`}
          hint="Componente de nota actual del alumno"
        />
      </AdminStatsGrid>

      <TeacherDashboardStudentsTable students={students} />
    </AdminPage>
  );
}
