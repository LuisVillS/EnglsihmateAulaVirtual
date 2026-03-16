import Link from "next/link";
import { requireAdminPageAccess } from "@/lib/admin/access";
import { AdminBadge, AdminCard, AdminPage, AdminPageHeader, AdminSectionHeader } from "@/components/admin-page";
import AdminStudentCreateModal from "@/components/admin-student-create-modal";
import AdminStudentImportModal from "@/components/admin-student-import-modal";
import AdminStudentsRoster from "@/components/admin-students-roster";
import { ADMIN_STUDENTS_PAGE_SIZE, loadAdminStudentsPage } from "@/lib/admin-students";
import { STUDENT_LEVELS } from "@/lib/student-constants";

export const metadata = {
  title: "Gestion de alumnos | Aula Virtual",
};

const HOUR_OPTIONS = Array.from({ length: ((1410 - 360) / 30) + 1 }, (_, idx) => 360 + idx * 30);

function formatHourLabel(hour) {
  const hours = Math.floor(hour / 60);
  const minutes = hour % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes === 0 ? "00" : "30"}`;
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

function FiltersBar({ course, search, hour, downloadHref, commissions }) {
  const activeFilters = [
    course ? `Curso: ${course}` : null,
    hour ? `Horario: ${formatHourLabel(Number(hour))}` : null,
    search ? `Busqueda: ${search}` : null,
  ].filter(Boolean);

  return (
    <AdminCard className="sticky top-3 z-10 space-y-4 border-[rgba(16,52,116,0.1)] bg-[rgba(255,255,255,0.94)] backdrop-blur">
      <AdminSectionHeader
        eyebrow="Filtro operativo"
        title="Buscar y accionar"
        description="Mantiene los mismos filtros, importacion, exportacion y creacion de alumnos en una sola franja de trabajo."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={downloadHref}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Exportar lista
            </a>
            <a
              href="/api/admin/students/template"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Plantilla CSV
            </a>
            <AdminStudentImportModal />
            <AdminStudentCreateModal commissions={commissions} />
          </div>
        }
      />

      <form className="grid gap-3 lg:grid-cols-[0.95fr_0.85fr_1.2fr_auto]" method="get">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Curso</label>
          <select
            name="course"
            defaultValue={course}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
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
          <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Horario</label>
          <select
            name="hour"
            defaultValue={hour}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
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
          <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Busqueda</label>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Nombre, email, DNI o codigo"
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          />
        </div>

        <div className="flex flex-col justify-end gap-2">
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
          >
            Aplicar filtros
          </button>
          <Link
            href="/admin/students"
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
          >
            Limpiar
          </Link>
        </div>
      </form>

      {activeFilters.length ? (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((item) => (
            <AdminBadge key={item} tone="accent">
              {item}
            </AdminBadge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#64748b]">Sin filtros activos. La lista completa de alumnos esta visible.</p>
      )}
    </AdminCard>
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
  const currentPage = parsePositiveInteger(typeof searchParams?.page === "string" ? searchParams.page : "", 1);

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
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="Gestion de alumnos"
        title="Alumnos"
        description="Busca, filtra, importa y revisa alumnos con una vista mas rapida para la operacion diaria, sin cambiar el flujo existente."
        actions={
          <Link
            href="/admin"
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
          >
            Volver al panel
          </Link>
        }
      />

      <FiltersBar
        course={courseFilter}
        search={searchTerm}
        hour={hourFilter != null ? String(hourFilter) : ""}
        downloadHref={downloadHref}
        commissions={activeCommissionsResult.data || []}
      />

      <AdminStudentsRoster
        students={paginatedStudents}
        totalCount={totalStudents}
        page={safeCurrentPage}
        totalPages={totalPages}
      />

      {totalPages > 1 ? (
        <AdminCard className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <p className="text-[#64748b]">Mostrando {paginatedStudents.length} alumnos en esta pagina.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={buildStudentsPageHref({
                course: courseFilter,
                search: searchTerm,
                hour: hourFilter,
                page: Math.max(1, safeCurrentPage - 1),
              })}
              aria-disabled={safeCurrentPage <= 1}
              className={`inline-flex min-h-10 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition ${
                safeCurrentPage <= 1
                  ? "pointer-events-none border-[rgba(15,23,42,0.08)] text-[#cbd5e1]"
                  : "border-[rgba(15,23,42,0.1)] bg-white text-[#0f172a] hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
              }`}
            >
              Anterior
            </Link>
            <AdminBadge tone="neutral">
              {safeCurrentPage} / {totalPages}
            </AdminBadge>
            <Link
              href={buildStudentsPageHref({
                course: courseFilter,
                search: searchTerm,
                hour: hourFilter,
                page: Math.min(totalPages, safeCurrentPage + 1),
              })}
              aria-disabled={safeCurrentPage >= totalPages}
              className={`inline-flex min-h-10 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition ${
                safeCurrentPage >= totalPages
                  ? "pointer-events-none border-[rgba(15,23,42,0.08)] text-[#cbd5e1]"
                  : "border-[rgba(15,23,42,0.1)] bg-white text-[#0f172a] hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
              }`}
            >
              Siguiente
            </Link>
          </div>
        </AdminCard>
      ) : null}
    </AdminPage>
  );
}
