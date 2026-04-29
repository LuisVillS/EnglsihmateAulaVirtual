import Link from "next/link";
import { requireAdminPageAccess } from "@/lib/admin/access";
import {
  AdminBadge,
  AdminCard,
  AdminPage as AdminPageLayout,
  AdminPageHeader,
  AdminSectionHeader,
  AdminStatCard,
  AdminStatsGrid,
} from "@/components/admin-page";
import {
  promoteStudentToAdmin,
  assignCourseToUser,
  removeEnrollment,
  importStudentsCsv,
} from "./actions";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

export const metadata = {
  title: "Panel admin | Aula Virtual",
};

function InfoCard({ label, value }) {
  return <AdminStatCard label={label} value={value} />;
}

function UserCard({ profile, courses }) {
  return (
    <div className="space-y-4 rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-[#111827]">{profile.full_name || profile.email}</p>
          <AdminBadge tone="warning">Needs review</AdminBadge>
        </div>
        <p className="text-xs text-[#64748b]">{profile.email}</p>
        <span className="text-xs text-muted">
          Registro: {new Date(profile.created_at).toLocaleDateString()}
        </span>
      </div>
      <form action={promoteStudentToAdmin} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="profileId" value={profile.id} />
        <button
          type="submit"
          className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
        >
          Convertir en admin
        </button>
        <span className="text-xs text-[#64748b]">Mantiene el mismo usuario; solo cambia su acceso.</span>
      </form>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">Assigned courses</p>
        {profile.enrollments?.length ? (
          <ul className="space-y-1 text-sm">
            {profile.enrollments.map((enrollment) => (
              <li
                key={enrollment.id}
                className="flex items-center justify-between rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2"
              >
                <span className="text-sm text-[#111827]">{enrollment.course?.title || "Curso"}</span>
                <form action={removeEnrollment}>
                  <input type="hidden" name="enrollmentId" value={enrollment.id} />
                  <button className="text-xs font-semibold text-[#b91c1c]">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#64748b]">Sin cursos asignados.</p>
        )}
        <form action={assignCourseToUser} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="profileId" value={profile.id} />
          <select
            name="courseId"
            className="flex-1 rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-sm text-[#0f172a]"
          >
            <option value="">Selecciona curso</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <button className="rounded-2xl bg-[#103474] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0c295a]">
            Asignar
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function AdminPage({ searchParams }) {
  const { supabase } = await requireAdminPageAccess();

  const { data: coursesData } = await supabase
    .from("courses")
    .select(
      `
      id,
      title,
      level,
      description,
      created_at,
      units (
        id,
        lessons (
          id
        )
      )
    `
    )
    .order("created_at", { ascending: true });

  const { data: usersData } = await supabase
    .from("profiles")
    .select(
      `
      id,
      email,
      full_name,
      role,
      status,
      invited,
      password_set,
      created_at,
      commission_id,
      enrollments:course_enrollments (
        id,
        course_id,
        course:courses (
          id,
          title
        )
      )
    `
    )
    .order("created_at", { ascending: true });

  const courses = coursesData || [];
  const users = usersData || [];
  const usersNeedingCommission = users.filter((profile) => !profile.commission_id);
  const studentsCount = users.filter((profile) => {
    const resolvedRole = resolveProfileRole({ role: profile.role, status: profile.status });
    return resolvedRole === USER_ROLES.STUDENT;
  }).length;
  const nonStudentCount = users.filter((profile) => {
    const resolvedRole = resolveProfileRole({ role: profile.role, status: profile.status });
    return resolvedRole === USER_ROLES.NON_STUDENT;
  }).length;

  const { count: commissionsCount } = await supabase
    .from("course_commissions")
    .select("*", { count: "exact", head: true });

  const templatesResult = await supabase
    .from("course_templates")
    .select("*", { count: "exact", head: true });

  const templatesCount = templatesResult.error ? 0 : (templatesResult.count || 0);

  return (
    <AdminPageLayout className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-4 h-72 w-72 rounded-full bg-[rgba(16,52,116,0.08)] blur-[150px]" />
        <div className="absolute top-24 right-10 h-72 w-72 rounded-full bg-[rgba(148,163,184,0.14)] blur-[150px]" />
      </div>

      <div className="relative space-y-5">
        <AdminPageHeader
          eyebrow="Operations overview"
          title="Admin dashboard"
          description="Monitor the core academic operation, jump into the busiest tools, and resolve pending student setup tasks without changing any existing workflow."
          actions={
            <>
              <Link
                href="/admin/students"
                className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
              >
                Open students
              </Link>
              <Link
                href="/admin/commissions"
                className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
              >
                View commissions
              </Link>
            </>
          }
        />

        <AdminStatsGrid>
          <InfoCard label="Commissions" value={commissionsCount || 0} />
          <InfoCard label="Students" value={studentsCount} />
          <InfoCard label="Pre-enrollments" value={nonStudentCount} />
          <InfoCard label="Templates" value={templatesCount} />
        </AdminStatsGrid>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <AdminCard className="space-y-4">
            <AdminSectionHeader
              eyebrow="Priority shortcuts"
              title="Main work areas"
              description="These links keep the current routes and let you move faster between the sections used most often."
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Link
                href="/admin/students"
                className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-4 transition hover:border-[rgba(16,52,116,0.16)] hover:bg-[#f8fbff]"
              >
                <p className="text-sm font-semibold text-[#111827]">Students</p>
                <p className="mt-1 text-sm text-[#64748b]">Create, import, filter, and edit student records.</p>
              </Link>
              <Link
                href="/admin/commissions"
                className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-4 transition hover:border-[rgba(16,52,116,0.16)] hover:bg-[#f8fbff]"
              >
                <p className="text-sm font-semibold text-[#111827]">Commissions</p>
                <p className="mt-1 text-sm text-[#64748b]">Review schedules, statuses, and commission capacity.</p>
              </Link>
              <Link
                href="/admin/courses/templates"
                className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-4 transition hover:border-[rgba(16,52,116,0.16)] hover:bg-[#f8fbff]"
              >
                <p className="text-sm font-semibold text-[#111827]">Templates</p>
                <p className="mt-1 text-sm text-[#64748b]">Maintain reusable course structures and related content.</p>
              </Link>
              <Link
                href="/admin/teacher-dashboard"
                className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-4 transition hover:border-[rgba(16,52,116,0.16)] hover:bg-[#f8fbff]"
              >
                <p className="text-sm font-semibold text-[#111827]">Teacher dashboard</p>
                <p className="mt-1 text-sm text-[#64748b]">Track current student performance and recent progress.</p>
              </Link>
            </div>
          </AdminCard>

          <AdminCard className="space-y-4">
            <AdminSectionHeader
              eyebrow="Bulk operations"
              title="Student import"
              description="Use the existing CSV flow; this redesign only makes the entry point clearer."
              actions={
                <a
                  href="/api/admin/students/template"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
                >
                  CSV template
                </a>
              }
            />
            <form action={importStudentsCsv} className="space-y-3 rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
              <input
                type="file"
                name="csv"
                accept=".csv"
                className="w-full text-xs text-[#64748b] file:mr-3 file:rounded-2xl file:border-0 file:bg-[#103474] file:px-4 file:py-2.5 file:text-xs file:font-semibold file:text-white"
                required
              />
              <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
                Import CSV
              </button>
              <div className="space-y-1 text-[11px] text-[#64748b]">
                <p>Columns: `full_name,email,dni,phone,birth_date,course_level,start_month,enrollment_date,preferred_hour,modality`</p>
                <p>Modality: `Diaria`, `Interdiaria (Lunes, Miercoles y Viernes)`, `Interdiaria (Martes y Jueves)`, `Sabatinos`</p>
                <p>Course level: `BASICO A1`, `BASICO A2`, `INTERMEDIO B1`, `INTERMEDIO B2`, `AVANZADO C1`</p>
              </div>
            </form>
          </AdminCard>
        </div>

        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Pending setup"
            title="Students without commission"
            description="Keep the same promotion and assignment actions, but surface the pending records in a cleaner operational queue."
            meta={<AdminBadge tone={usersNeedingCommission.length ? "warning" : "success"}>{usersNeedingCommission.length} pending</AdminBadge>}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {usersNeedingCommission.map((profile) => (
              <UserCard key={profile.id} profile={profile} courses={courses} />
            ))}
            {!usersNeedingCommission.length ? (
              <div className="rounded-[22px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[#f8fafc] p-6 text-sm text-[#64748b]">
                No students are waiting for commission assignment.
              </div>
            ) : null}
          </div>
        </AdminCard>
      </div>
    </AdminPageLayout>
  );
}
