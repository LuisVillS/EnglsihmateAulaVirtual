import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { STUDENT_LEVELS, LEVEL_NUMBERS } from "@/lib/student-constants";
import StudentRowActions from "@/components/student-row-actions";
import AdminStudentCreateModal from "@/components/admin-student-create-modal";
import AdminStudentImportModal from "@/components/admin-student-import-modal";
import { USER_ROLES, resolveProfileRole } from "@/lib/roles";

export const metadata = {
  title: "Gestion de alumnos | Aula Virtual",
};

const LEVEL_STRINGS = LEVEL_NUMBERS.map((level) => String(level));
const HOUR_OPTIONS = Array.from({ length: ((1410 - 360) / 30) + 1 }, (_, idx) => 360 + idx * 30);
const NON_APPROVED_PRE_ENROLLMENT_STATUSES = new Set([
  "PENDING_EMAIL_VERIFICATION",
  "EMAIL_VERIFIED",
  "IN_PROGRESS",
  "RESERVED",
  "PAYMENT_SUBMITTED",
  "PAID_AUTO",
  "REJECTED",
  "EXPIRED",
  "ABANDONED",
]);

function formatHourLabel(hour) {
  const hours = Math.floor(hour / 60);
  const minutes = hour % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes === 0 ? "00" : "30"}`;
}

function formatHourRange(hour) {
  if (hour == null) return "Sin horario";
  return formatHourLabel(hour);
}

function formatCommissionLabel(commission) {
  if (!commission) return "Sin comision";
  return `${commission.course_level} - Comision ${commission.commission_number}`;
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const quotedMatch = message.match(/'([^']+)'/);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function FiltersBar({ course, level, search, hour }) {
  return (
    <form className="rounded-2xl border border-border bg-surface p-4 text-foreground shadow-sm" method="get">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Curso</label>
          <select
            name="course"
            defaultValue={course}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Todos</option>
            {STUDENT_LEVELS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nivel</label>
          <select
            name="level"
            defaultValue={level}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Todos</option>
            {LEVEL_NUMBERS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Horario</label>
          <select
            name="hour"
            defaultValue={hour}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Todos</option>
            {HOUR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatHourLabel(option)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Buscar</label>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Nombre, email, DNI o codigo"
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground transition hover:bg-primary-2"
        >
          Aplicar filtros
        </button>
        <Link
          href="/admin/students"
          className="rounded-xl border border-border px-4 py-2 font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}

function StudentsTable({ students }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-6 text-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Listado</p>
          <h3 className="text-xl font-semibold">Alumnos registrados</h3>
        </div>
        <p className="text-sm text-muted">{students.length} registros</p>
      </div>
      <div className="relative mt-4 overflow-visible">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Codigo</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Celular</th>
                <th className="px-3 py-2">Email verificado</th>
                <th className="px-3 py-2">Curso</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Horario</th>
                <th className="px-3 py-2 text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-t border-border text-foreground">
                  <td className="px-3 py-2 font-semibold">{student.student_code || ""}</td>
                  <td className="px-3 py-2">{student.full_name || ""}</td>
                  <td className="px-3 py-2">{student.email}</td>
                  <td className="px-3 py-2">
                    {student.phone || <span className="rounded-full bg-danger/12 px-2 py-0.5 text-xs text-danger">Falta</span>}
                  </td>
                  <td className="px-3 py-2">
                    {student.email_verified_at ? (
                      <span className="rounded-full bg-success/12 px-2 py-0.5 text-xs text-success">Verificado</span>
                    ) : (
                      <span className="rounded-full bg-danger/12 px-2 py-0.5 text-xs text-danger">Falta</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {student.commission ? formatCommissionLabel(student.commission) : student.course_level || "Sin curso"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        student.is_premium ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
                      }`}
                    >
                      {student.is_premium ? "Premium" : "Regular"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-muted">{formatHourRange(student.preferred_hour)}</td>
                  <td className="px-3 py-2">
                    <StudentRowActions studentId={student.id} />
                  </td>
                </tr>
              ))}
              {!students.length ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted">
                    Aun no hay alumnos registrados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default async function StudentsPage({ searchParams: searchParamsPromise }) {
  const searchParams = (await searchParamsPromise) || {};
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: adminRecord } = await supabase.from("admin_profiles").select("id").eq("id", user.id).maybeSingle();
  if (!adminRecord?.id) {
    redirect("/admin/login");
  }

  const rawCourse = typeof searchParams?.course === "string" ? searchParams.course : "";
  const courseFilter = STUDENT_LEVELS.includes(rawCourse) ? rawCourse : "";
  const rawLevel = typeof searchParams?.level === "string" ? searchParams.level : "";
  const levelFilter = LEVEL_STRINGS.includes(rawLevel) ? Number(rawLevel) : null;
  const searchTerm = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const rawHour = typeof searchParams?.hour === "string" ? searchParams.hour : "";
  const parsedHour = Number(rawHour);
  const hourFilter = rawHour !== "" && Number.isFinite(parsedHour) && parsedHour >= 360 && parsedHour <= 1410
    ? parsedHour
    : null;

  const baseColumns = [
    "id",
    "full_name",
    "email",
    "dni",
    "phone",
    "birth_date",
    "email_verified_at",
    "student_code",
    "course_level",
    "level_number",
    "is_premium",
    "start_month",
    "enrollment_date",
    "role",
    "password_set",
    "created_at",
    "preferred_hour",
    "status",
    "commission_id",
  ];
  let selectColumns = [...baseColumns];
  let hasStatusColumn = true;
  let hasCommissionColumn = true;
  let hasEmailVerifiedAtColumn = true;
  let studentsData = null;
  let studentsError = null;

  const runStudentsQuery = async () => {
    let query = supabase.from("profiles").select(selectColumns.join(","));

    if (courseFilter) {
      query = query.eq("course_level", courseFilter);
    }
    if (levelFilter) {
      query = query.eq("level_number", levelFilter);
    }
    if (hourFilter != null) {
      query = query.eq("preferred_hour", hourFilter);
    }
    if (searchTerm) {
      const sanitized = searchTerm.replace(/%/g, "\\%").replace(/,/g, "\\,");
      query = query.or(
        `full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,dni.ilike.%${sanitized}%,student_code.ilike.%${sanitized}%`
      );
    }
    return query.order("created_at", { ascending: false });
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await runStudentsQuery();
    studentsData = result.data;
    studentsError = result.error;
    if (!studentsError) break;

    const missingColumn = getMissingColumnFromError(studentsError);
    if (!missingColumn) break;

    if (missingColumn === "status") {
      hasStatusColumn = false;
      selectColumns = selectColumns.filter((col) => col !== "status");
      continue;
    }
    if (missingColumn === "commission_id") {
      hasCommissionColumn = false;
      selectColumns = selectColumns.filter((col) => col !== "commission_id");
      continue;
    }
    if (missingColumn === "email_verified_at") {
      hasEmailVerifiedAtColumn = false;
      selectColumns = selectColumns.filter((col) => col !== "email_verified_at");
      continue;
    }
    break;
  }

  if (studentsError) {
    console.error("No se pudo listar alumnos", studentsError);
  }

  const unresolvedStudents = studentsData || [];
  const unresolvedUserIds = unresolvedStudents.map((student) => student.id).filter(Boolean);

  let enrolledUserIds = new Set();
  if (unresolvedUserIds.length) {
    const { data: enrollmentsRows } = await supabase
      .from("course_enrollments")
      .select("user_id")
      .in("user_id", unresolvedUserIds);
    enrolledUserIds = new Set((enrollmentsRows || []).map((row) => row.user_id));
  }

  const latestPreEnrollmentStatusByUserId = new Map();
  if (unresolvedUserIds.length) {
    const preEnrollmentResult = await supabase
      .from("pre_enrollments")
      .select("user_id, status, created_at")
      .in("user_id", unresolvedUserIds)
      .order("created_at", { ascending: false });
    if (!preEnrollmentResult.error) {
      for (const row of preEnrollmentResult.data || []) {
        if (!row?.user_id || latestPreEnrollmentStatusByUserId.has(row.user_id)) continue;
        latestPreEnrollmentStatusByUserId.set(row.user_id, row.status || null);
      }
    }
  }

  const resolvedStudents = unresolvedStudents.filter((student) => {
    const effectiveRole = resolveProfileRole({
      role: student.role,
      status: hasStatusColumn ? student.status : undefined,
    });
    if (effectiveRole === USER_ROLES.ADMIN) return false;

    const hasEnrollment = enrolledUserIds.has(student.id);
    const latestPreStatus = latestPreEnrollmentStatusByUserId.get(student.id) || null;
    const hasActivePreEnrollment =
      latestPreStatus &&
      latestPreStatus !== "APPROVED" &&
      NON_APPROVED_PRE_ENROLLMENT_STATUSES.has(latestPreStatus);
    const hasStudentSignals =
      effectiveRole === USER_ROLES.STUDENT ||
      hasEnrollment ||
      Boolean(student.commission_id) ||
      Boolean(student.course_level) ||
      latestPreStatus === "APPROVED";

    if (hasStudentSignals) return true;
    if (!hasStatusColumn) return !hasActivePreEnrollment;
    if (hasActivePreEnrollment) return false;
    return true;
  });

  const commissionIds = hasCommissionColumn
    ? Array.from(new Set(resolvedStudents.map((student) => student.commission_id).filter(Boolean)))
    : [];

  let commissionsById = new Map();
  if (commissionIds.length) {
    const { data: linkedCommissions } = await supabase
      .from("course_commissions")
      .select("id, course_level, commission_number")
      .in("id", commissionIds);
    commissionsById = new Map((linkedCommissions || []).map((item) => [item.id, item]));
  }

  const hydratedStudents = resolvedStudents.map((student) => ({
    ...student,
    email_verified_at: hasEmailVerifiedAtColumn ? student.email_verified_at : null,
    commission: student.commission_id ? commissionsById.get(student.commission_id) || null : null,
  }));

  const { data: commissionsData } = await supabase
    .from("course_commissions")
    .select("id, course_level, commission_number, start_time, end_time, modality_key, days_of_week, is_active")
    .eq("is_active", true)
    .order("course_level", { ascending: true })
    .order("commission_number", { ascending: true });

  const params = new URLSearchParams();
  if (courseFilter) params.set("course", courseFilter);
  if (levelFilter) params.set("level", String(levelFilter));
  if (searchTerm) params.set("q", searchTerm);
  if (hourFilter != null) params.set("hour", String(hourFilter));
  const downloadHref = `/api/admin/students/export${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 text-foreground">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-muted">Panel admin</p>
            <h1 className="text-3xl font-semibold">Gestion de alumnos</h1>
            <p className="text-sm text-muted">Registra, importa y edita alumnos desde un unico tablero.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={downloadHref}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Descargar lista
            </a>
            <Link
              href="/admin"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Volver al panel
            </Link>
          </div>
        </div>

        <FiltersBar
          course={courseFilter}
          level={levelFilter ? String(levelFilter) : ""}
          search={searchTerm}
          hour={hourFilter != null ? String(hourFilter) : ""}
        />

        <div className="flex flex-wrap items-center justify-end gap-2">
          <a
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            href="/api/admin/students/template"
            target="_blank"
            rel="noopener noreferrer"
          >
            Descargar plantilla CSV
          </a>
          <AdminStudentImportModal />
          <AdminStudentCreateModal commissions={commissionsData || []} />
        </div>

        <StudentsTable students={hydratedStudents} />
      </div>
    </section>
  );
}
