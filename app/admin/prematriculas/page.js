import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import ProofPreviewButton from "@/components/proof-preview-button";
import PreEnrollmentDetailModalButton from "@/components/pre-enrollment-detail-modal-button";
import PreEnrollmentRowActions from "@/components/pre-enrollment-row-actions";

export const metadata = {
  title: "Bandeja de Pre-matriculas | Aula Virtual",
};

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

  let query = supabase
    .from("pre_enrollments")
    .select("id, user_id, period, status, step, selected_schedule_id, payment_method, payment_proof_url, payment_submitted_at, reservation_expires_at, created_at")
    .order("created_at", { ascending: false });

  const status = resolvedSearchParams?.status?.toString() || "";
  const step = resolvedSearchParams?.step?.toString() || "";
  const period = resolvedSearchParams?.period?.toString() || "";

  if (status) query = query.eq("status", status);
  if (step) query = query.eq("step", step);
  if (period) query = query.eq("period", period);

  const { data: rows } = await query;
  const preEnrollments = rows || [];

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

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const scheduleMap = new Map((schedules || []).map((schedule) => [schedule.id, schedule]));

  return (
    <section className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-muted">Panel admin</p>
            <h1 className="text-3xl font-semibold">Bandeja de Pre-matriculas</h1>
            <p className="text-sm text-muted">Monitorea el avance y valida pagos.</p>
          </div>
          <Link
            href="/admin"
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            Volver al panel
          </Link>
        </header>

        <div className="rounded-3xl border border-border bg-surface p-6 text-sm text-muted">
          Usa filtros en la URL: ?status=PAYMENT_SUBMITTED&step=PAYMENT&period=202602
        </div>

        <div className="overflow-hidden rounded-3xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Alumno</th>
                <th className="px-4 py-3">Curso/Horario</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paso</th>
                <th className="px-4 py-3">Pago</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {preEnrollments.map((row) => {
                const profile = profileMap.get(row.user_id);
                const schedule = scheduleMap.get(row.selected_schedule_id);
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{profile?.full_name || "Sin nombre"}</div>
                      <div className="text-xs text-muted">{profile?.email}</div>
                      <div className="text-xs text-muted">{profile?.phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-foreground">{schedule?.course_level || "-"}</div>
                      <div className="text-xs text-muted">
                        {schedule ? `Comision ${schedule.commission_number}` : "-"}
                      </div>
                      <div className="text-xs text-muted">
                        {schedule?.start_time ? `${schedule.start_time} - ${schedule.end_time}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">{formatStatus(row.status)}</td>
                    <td className="px-4 py-3">{formatStep(row.step)}</td>
                    <td className="px-4 py-3">{row.payment_method || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <PreEnrollmentDetailModalButton preEnrollmentId={row.id} />
                          {row.payment_proof_url ? (
                            <ProofPreviewButton preEnrollmentId={row.id} />
                          ) : null}
                        </div>
                        <PreEnrollmentRowActions preEnrollmentId={row.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!preEnrollments.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    No hay pre-matriculas registradas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
