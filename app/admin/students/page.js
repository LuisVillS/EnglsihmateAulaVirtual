import Link from "next/link";
import { requireAdminPageAccess } from "@/lib/admin/access";
import { ADMIN_STUDENTS_PAGE_SIZE, loadAdminStudentsPage } from "@/lib/admin-students";
import { STUDENT_LEVELS } from "@/lib/student-constants";
import StudentRowActions from "@/components/student-row-actions";
import AdminStudentCreateModal from "@/components/admin-student-create-modal";
import AdminStudentImportModal from "@/components/admin-student-import-modal";

export const metadata = {
  title: "Gestion de alumnos | Aula Virtual",
};

const HOUR_OPTIONS = Array.from({ length: ((1410 - 360) / 30) + 1 }, (_, idx) => 360 + idx * 30);

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

function parsePositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildStudentsPageHref({ course = "", search = "", hour = null, page = 1 }) {
  const params = new URLSearchParams();
  if (course) params.set("course", course);
  if (search) params.set("q", search);
  if (hour != null) params.set("hour", String(hour));
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/students${query ? `?${query}` : ""}`;
}

function FiltersBar({ course, search, hour }) {
  return (
    <form className="rounded-2xl border border-border bg-surface p-4 text-foreground shadow-sm" method="get">
      <div className="grid gap-3 md:grid-cols-3">
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

function StudentsTable({ students, totalCount, page, totalPages }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-6 text-foreground shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Listado</p>
          <h3 className="text-xl font-semibold">Alumnos registrados</h3>
        </div>
        <p className="text-sm text-muted">
          Pagina {page} de {totalPages} · {students.length} visibles / {totalCount} registros
        </p>
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
  const { supabase } = await requireAdminPageAccess();

  const rawCourse = typeof searchParams?.course === "string" ? searchParams.course : "";
  const courseFilter = STUDENT_LEVELS.includes(rawCourse) ? rawCourse : "";
  const searchTerm = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const rawHour = typeof searchParams?.hour === "string" ? searchParams.hour : "";
  const parsedHour = Number(rawHour);
  const hourFilter = rawHour !== "" && Number.isFinite(parsedHour) && parsedHour >= 360 && parsedHour <= 1410
    ? parsedHour
    : null;
  const currentPage = parsePositiveInteger(
    typeof searchParams?.page === "string" ? searchParams.page : "",
    1
  );
  const [studentsResult, activeCommissionsResult] = await Promise.all([
    loadAdminStudentsPage({
      supabase,
      courseFilter,
      searchTerm,
      hourFilter,
      page: currentPage,
      pageSize: ADMIN_STUDENTS_PAGE_SIZE,
    }),
    supabase
      .from("course_commissions")
      .select("id, course_level, commission_number, start_time, end_time, modality_key, days_of_week, is_active")
      .eq("is_active", true)
      .order("course_level", { ascending: true })
      .order("commission_number", { ascending: true }),
  ]);

  let effectiveStudentsResult = studentsResult;
  if (
    currentPage > 1 &&
    !studentsResult.error &&
    studentsResult.students.length === 0 &&
    studentsResult.totalCount === 0
  ) {
    effectiveStudentsResult = await loadAdminStudentsPage({
      supabase,
      courseFilter,
      searchTerm,
      hourFilter,
      page: 1,
      pageSize: ADMIN_STUDENTS_PAGE_SIZE,
    });
  }

  if (effectiveStudentsResult.error) {
    console.error("No se pudo listar alumnos", effectiveStudentsResult.error);
  }

  const totalStudents = effectiveStudentsResult.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalStudents / ADMIN_STUDENTS_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  let paginatedStudents = effectiveStudentsResult.students;

  if (safeCurrentPage !== currentPage) {
    const adjustedPageResult = await loadAdminStudentsPage({
      supabase,
      courseFilter,
      searchTerm,
      hourFilter,
      page: safeCurrentPage,
      pageSize: ADMIN_STUDENTS_PAGE_SIZE,
    });
    if (adjustedPageResult.error) {
      console.error("No se pudo cargar pagina ajustada de alumnos", adjustedPageResult.error);
    } else {
      paginatedStudents = adjustedPageResult.students;
    }
  }

  const params = new URLSearchParams();
  if (courseFilter) params.set("course", courseFilter);
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
          <AdminStudentCreateModal commissions={activeCommissionsResult.data || []} />
        </div>

        <StudentsTable
          students={paginatedStudents}
          totalCount={totalStudents}
          page={safeCurrentPage}
          totalPages={totalPages}
        />

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground shadow-sm">
            <p className="text-muted">
              Mostrando {paginatedStudents.length} alumnos en esta pagina.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={buildStudentsPageHref({
                  course: courseFilter,
                  search: searchTerm,
                  hour: hourFilter,
                  page: Math.max(1, safeCurrentPage - 1),
                })}
                aria-disabled={safeCurrentPage <= 1}
                className={`rounded-xl border px-4 py-2 font-semibold transition ${
                  safeCurrentPage <= 1
                    ? "pointer-events-none border-border/60 text-muted/60"
                    : "border-border text-foreground hover:border-primary hover:bg-surface-2"
                }`}
              >
                Anterior
              </Link>
              <span className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-semibold text-muted">
                {safeCurrentPage} / {totalPages}
              </span>
              <Link
                href={buildStudentsPageHref({
                  course: courseFilter,
                  search: searchTerm,
                  hour: hourFilter,
                  page: Math.min(totalPages, safeCurrentPage + 1),
                })}
                aria-disabled={safeCurrentPage >= totalPages}
                className={`rounded-xl border px-4 py-2 font-semibold transition ${
                  safeCurrentPage >= totalPages
                    ? "pointer-events-none border-border/60 text-muted/60"
                    : "border-border text-foreground hover:border-primary hover:bg-surface-2"
                }`}
              >
                Siguiente
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
