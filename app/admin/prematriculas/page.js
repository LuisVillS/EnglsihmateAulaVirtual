import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { AdminBadge, AdminCard, AdminPage, AdminPageHeader, AdminSectionHeader } from "@/components/admin-page";
import PreEnrollmentDetailModalButton from "@/components/pre-enrollment-detail-modal-button";
import PreEnrollmentRowActions from "@/components/pre-enrollment-row-actions";
import ProofPreviewButton from "@/components/proof-preview-button";

export const metadata = {
  title: "Bandeja de Pre-matriculas | Aula Virtual",
};

const STATUS_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "PAYMENT_SUBMITTED", label: "Pago enviado" },
  { value: "PAID_AUTO", label: "Pago confirmado" },
  { value: "APPROVED", label: "Aprobado" },
  { value: "REJECTED", label: "Rechazado" },
  { value: "RESERVED", label: "Reserva activa" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "EMAIL_VERIFIED", label: "Correo verificado" },
  { value: "PENDING_EMAIL_VERIFICATION", label: "Pendiente verificacion" },
  { value: "EXPIRED", label: "Expirado" },
  { value: "ABANDONED", label: "Abandonado" },
];

const STEP_OPTIONS = [
  { value: "", label: "Todos los pasos" },
  { value: "ACCOUNT_CREATED", label: "Cuenta creada" },
  { value: "COURSE_SELECTION", label: "Seleccion" },
  { value: "TERMS", label: "Terminos" },
  { value: "PRECONFIRMATION", label: "Preconfirmacion" },
  { value: "PAYMENT", label: "Pago" },
];

function formatStatus(value) {
  const map = {
    PENDING_EMAIL_VERIFICATION: "Pendiente verificacion",
    EMAIL_VERIFIED: "Correo verificado",
    IN_PROGRESS: "En progreso",
    RESERVED: "Reserva activa",
    PAYMENT_SUBMITTED: "Pago enviado",
    PAID_AUTO: "Pago confirmado",
    APPROVED: "Aprobado",
    REJECTED: "Rechazado",
    EXPIRED: "Expirado",
    ABANDONED: "Abandonado",
  };
  return map[value] || value;
}

function formatStep(value) {
  const map = {
    ACCOUNT_CREATED: "Cuenta creada",
    COURSE_SELECTION: "Seleccion",
    TERMS: "Terminos",
    PRECONFIRMATION: "Preconfirmacion",
    PAYMENT: "Pago",
  };
  return map[value] || value;
}

function formatDateTime(value) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveStatusTone(value) {
  if (value === "APPROVED" || value === "PAID_AUTO") return "success";
  if (value === "REJECTED" || value === "EXPIRED" || value === "ABANDONED") return "danger";
  if (value === "PAYMENT_SUBMITTED" || value === "RESERVED") return "warning";
  return "neutral";
}

function resolvePaymentLabel(row) {
  if (row.payment_method) return row.payment_method;
  return row.payment_proof_url ? "Comprobante adjunto" : "Sin metodo";
}

function buildPreEnrollmentsHref({ status = "", step = "", period = "" }) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (step) params.set("step", step);
  if (period) params.set("period", period);
  const query = params.toString();
  return `/admin/prematriculas${query ? `?${query}` : ""}`;
}

function StatusTabs({ currentStatus, step, period, countsByStatus, totalCount }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-2">
        {STATUS_OPTIONS.map((option) => {
          const isActive = option.value === currentStatus;
          const count = option.value ? countsByStatus.get(option.value) || 0 : totalCount;
          return (
            <Link
              key={option.value || "all"}
              href={buildPreEnrollmentsHref({ status: option.value, step, period })}
              className={`inline-flex min-h-10 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition ${
                isActive
                  ? "border-transparent bg-[#103474] text-white shadow-[0_10px_24px_rgba(16,52,116,0.18)]"
                  : "border-[rgba(15,23,42,0.1)] bg-white text-[#334155] hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff] hover:text-[#0f172a]"
              }`}
            >
              <span>{option.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${isActive ? "bg-white/14 text-white" : "bg-[#f1f5f9] text-[#64748b]"}`}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function PreEnrollmentsPage({ searchParams }) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
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

  const status = resolvedSearchParams?.status?.toString() || "";
  const step = resolvedSearchParams?.step?.toString() || "";
  const period = resolvedSearchParams?.period?.toString() || "";

  let query = supabase
    .from("pre_enrollments")
    .select("id, user_id, period, status, step, selected_schedule_id, payment_method, payment_proof_url, payment_submitted_at, reservation_expires_at, created_at")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (step) query = query.eq("step", step);
  if (period) query = query.eq("period", period);

  let queueCountsQuery = supabase.from("pre_enrollments").select("status");
  if (step) queueCountsQuery = queueCountsQuery.eq("step", step);
  if (period) queueCountsQuery = queueCountsQuery.eq("period", period);

  const [{ data: rows }, { data: periodsRows }, { data: countRows }] = await Promise.all([
    query,
    supabase.from("pre_enrollments").select("period").order("period", { ascending: false }),
    queueCountsQuery,
  ]);

  const preEnrollments = rows || [];
  const countsByStatus = new Map();
  (countRows || []).forEach((row) => {
    const currentStatus = String(row?.status || "");
    if (!currentStatus) return;
    countsByStatus.set(currentStatus, (countsByStatus.get(currentStatus) || 0) + 1);
  });
  const totalCount = (countRows || []).length;

  const userIds = preEnrollments.map((row) => row.user_id);
  const scheduleIds = preEnrollments.map((row) => row.selected_schedule_id).filter(Boolean);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: schedules } = await supabase
    .from("course_commissions")
    .select("id, course_level, commission_number, start_time, end_time")
    .in("id", scheduleIds.length ? scheduleIds : ["00000000-0000-0000-0000-000000000000"]);

  const availablePeriods = Array.from(new Set((periodsRows || []).map((row) => row.period).filter(Boolean)));
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const scheduleMap = new Map((schedules || []).map((schedule) => [schedule.id, schedule]));
  const activeFilters = [
    status ? `Estado: ${formatStatus(status)}` : null,
    step ? `Paso: ${formatStep(step)}` : null,
    period ? `Periodo: ${period}` : null,
  ].filter(Boolean);

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="Revision de pagos"
        title="Pre-matriculas"
        description="La aprobacion y el rechazo mantienen exactamente la misma logica. Esta fase solo ordena mejor la cola para revisar mas rapido."
        actions={
          <Link
            href="/admin"
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
          >
            Volver al panel
          </Link>
        }
      />

      <AdminCard className="sticky top-3 z-10 space-y-4 border-[rgba(16,52,116,0.1)] bg-[rgba(255,255,255,0.94)] backdrop-blur">
        <AdminSectionHeader
          eyebrow="Cola de revision"
          title="Estado de la bandeja"
          description="Las pestanas cambian el parametro status actual; los filtros visibles mantienen los parametros step y period."
        />

        <StatusTabs
          currentStatus={status}
          step={step}
          period={period}
          countsByStatus={countsByStatus}
          totalCount={totalCount}
        />

        <form method="get" className="grid gap-3 lg:grid-cols-[1fr_0.95fr_auto]">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <select
            name="step"
            defaultValue={step}
            className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          >
            {STEP_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            name="period"
            defaultValue={period}
            className="rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          >
            <option value="">Todos los periodos</option>
            {availablePeriods.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
              Aplicar
            </button>
            <Link
              href={status ? buildPreEnrollmentsHref({ status }) : "/admin/prematriculas"}
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
          <p className="text-xs text-[#64748b]">Sin filtros activos. La bandeja muestra todos los registros.</p>
        )}
      </AdminCard>

      <AdminCard className="overflow-hidden p-0">
        <div className="border-b border-[rgba(15,23,42,0.08)] px-5 py-4">
          <AdminSectionHeader
            eyebrow="Revision"
            title="Bandeja de pre-matriculas"
            description="Consulta el detalle, valida el comprobante y conserva las mismas acciones de aprobacion y rechazo."
            meta={<AdminBadge tone="neutral">{preEnrollments.length} registro(s)</AdminBadge>}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-[#0f172a]">
            <thead>
              <tr className="bg-[#f8fafc] text-left text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
                <th className="px-4 py-3 font-semibold">Alumno</th>
                <th className="px-4 py-3 font-semibold">Curso y horario</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Pago</th>
                <th className="px-4 py-3 font-semibold">Seguimiento</th>
                <th className="px-4 py-3 text-right font-semibold">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {preEnrollments.map((row) => {
                const profile = profileMap.get(row.user_id);
                const schedule = scheduleMap.get(row.selected_schedule_id);
                return (
                  <tr key={row.id} className="border-t border-[rgba(15,23,42,0.08)] align-top">
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="font-medium text-[#111827]">{profile?.full_name || "Sin nombre"}</div>
                        <div className="text-xs text-[#64748b]">{profile?.email || "Sin email"}</div>
                        <div className="text-xs text-[#64748b]">{profile?.phone || "Sin celular"}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="font-medium text-[#111827]">{schedule?.course_level || "Sin curso"}</div>
                        <div className="text-xs text-[#64748b]">
                          {schedule ? `Comision ${schedule.commission_number}` : "Sin comision"}
                        </div>
                        <div className="text-xs text-[#64748b]">
                          {schedule?.start_time ? `${schedule.start_time} - ${schedule.end_time}` : "Horario pendiente"}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <AdminBadge tone={resolveStatusTone(row.status)}>{formatStatus(row.status)}</AdminBadge>
                        <p className="text-xs text-[#64748b]">
                          Reserva: {row.reservation_expires_at ? formatDateTime(row.reservation_expires_at) : "No aplica"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <p className="font-medium text-[#111827]">{resolvePaymentLabel(row)}</p>
                        <div className="flex flex-wrap gap-2">
                          {row.payment_proof_url ? <AdminBadge tone="accent">Comprobante adjunto</AdminBadge> : null}
                          {row.payment_submitted_at ? <AdminBadge tone="neutral">Enviado</AdminBadge> : null}
                        </div>
                        <p className="text-xs text-[#64748b]">
                          {row.payment_submitted_at ? formatDateTime(row.payment_submitted_at) : "Sin envio registrado"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <AdminBadge tone="neutral">{formatStep(row.step)}</AdminBadge>
                          {row.period ? <AdminBadge tone="neutral">{row.period}</AdminBadge> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <PreEnrollmentDetailModalButton
                            preEnrollmentId={row.id}
                            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
                          />
                          {row.payment_proof_url ? (
                            <ProofPreviewButton
                              preEnrollmentId={row.id}
                              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
                            />
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PreEnrollmentRowActions preEnrollmentId={row.id} />
                    </td>
                  </tr>
                );
              })}
              {!preEnrollments.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#64748b]">
                    No hay pre-matriculas que coincidan con la bandeja actual.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
