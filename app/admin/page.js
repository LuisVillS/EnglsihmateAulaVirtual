import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
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
  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-6 text-center text-foreground shadow-lg shadow-black/30">
      <p className="text-xs uppercase tracking-[0.3em] text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function UserCard({ profile, courses }) {
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 text-foreground shadow">
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">{profile.full_name || profile.email}</p>
        <p className="text-xs text-muted">{profile.email}</p>
        <span className="text-xs text-muted">
          Registro: {new Date(profile.created_at).toLocaleDateString()}
        </span>
      </div>
      <form action={promoteStudentToAdmin} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="profileId" value={profile.id} />
        <button
          type="submit"
          className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
        >
          Convertir en admin
        </button>
        <span className="text-xs text-muted">Moveras este perfil al registro de administradores.</span>
      </form>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cursos asignados</p>
        {profile.enrollments?.length ? (
          <ul className="space-y-1 text-sm">
            {profile.enrollments.map((enrollment) => (
              <li key={enrollment.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-1.5">
                <span>{enrollment.course?.title || "Curso"}</span>
                <form action={removeEnrollment}>
                  <input type="hidden" name="enrollmentId" value={enrollment.id} />
                  <button className="text-xs text-danger">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">Sin cursos asignados.</p>
        )}
        <form action={assignCourseToUser} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="profileId" value={profile.id} />
          <select name="courseId" className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">
            <option value="">Selecciona curso</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2">
            Asignar
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function AdminPage({ searchParams }) {
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
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-12 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-16 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-10 h-96 w-96 rounded-full bg-accent/15 blur-[200px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10">
        <div className="rounded-[2.5rem] border border-border bg-gradient-to-br from-surface via-surface to-surface-2 p-10 shadow-2xl shadow-black/35">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <p className="inline-flex items-center gap-2 rounded-full bg-primary/18 px-4 py-1 text-xs uppercase tracking-[0.4em] text-primary">
                Admin CMS
              </p>
              <h1 className="text-4xl font-semibold leading-tight">
                Orquesta cursos y alumnos en un solo tablero.
              </h1>
              <p className="text-base text-muted">
                Gestiona usuarios, asigna cursos e importa alumnos via CSV desde un panel central.
              </p>
              <div className="flex flex-wrap gap-3 text-xs">
                <Link
                  href="/admin/students"
                  className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary-2"
                >
                  Ir a Gestion de alumnos
                </Link>
                <Link
                  href="/admin/commissions"
                  className="rounded-full border border-border px-4 py-2 font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Ir a Comisiones
                </Link>
                <Link
                  href="/admin/courses/templates"
                  className="rounded-full border border-border px-4 py-2 font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Plantillas + Ejercicios
                </Link>
                <Link
                  href="/admin/flashcards"
                  className="rounded-full border border-border px-4 py-2 font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Flashcards Library
                </Link>
                <Link
                  href="/admin/teacher-dashboard"
                  className="rounded-full border border-border px-4 py-2 font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Teacher Dashboard
                </Link>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
              <InfoCard label="Comisiones" value={commissionsCount || 0} />
              <InfoCard label="Alumnos" value={studentsCount} />
              <InfoCard label="Pre-matriculas" value={nonStudentCount} />
              <InfoCard label="Plantillas" value={templatesCount} />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-[2rem] border border-border bg-surface p-6 text-foreground shadow-xl backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Gestion de alumnos</h2>
              <p className="text-sm text-muted">
                Convierte alumnos en administradores, asigna cursos manualmente o abre la vista avanzada para editar datos academicos.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <Link
                  href="/admin/students"
                  className="rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary-2"
                >
                  Ir a gestion avanzada
                </Link>
                <a
                  href="/api/admin/students/template"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-border px-4 py-2 font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                >
                  Plantilla CSV
                </a>
              </div>
            </div>
            <form action={importStudentsCsv} className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                name="csv"
                accept=".csv"
                className="text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:text-primary-foreground"
                required
              />
              <button className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2">
                Importar CSV
              </button>
              <p className="text-[11px] text-muted">
                Columnas: full_name,email,dni,phone,birth_date,course_level,is_premium,start_month,enrollment_date,preferred_hour,modality
              </p>
              <p className="text-[11px] text-muted/85">
                Modalidad valida: Diaria | Interdiaria (Lunes, Miercoles y Viernes) | Interdiaria (Martes y Jueves) | Sabatinos
              </p>
              <p className="text-[11px] text-muted/85">
                Course level valido: BASICO A1 | BASICO A2 | INTERMEDIO B1 | INTERMEDIO B2 | AVANZADO C1
              </p>
            </form>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {usersNeedingCommission.map((profile) => (
              <UserCard key={profile.id} profile={profile} courses={courses} />
            ))}
            {!usersNeedingCommission.length ? (
              <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted">
                No hay alumnos pendientes de comision.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
