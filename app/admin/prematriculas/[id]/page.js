import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { approvePreEnrollment, rejectPreEnrollment } from "../actions";
import ProofPreviewButton from "@/components/proof-preview-button";

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

export default async function PreEnrollmentDetailPage({ params }) {
  const resolvedParams = await params;
  const preEnrollmentId = resolvedParams?.id?.toString();
  if (!preEnrollmentId) {
    redirect("/admin/prematriculas");
  }

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

  const { data: preEnrollment } = await supabase
    .from("pre_enrollments")
    .select("*")
    .eq("id", preEnrollmentId)
    .maybeSingle();

  if (!preEnrollment) {
    redirect("/admin/prematriculas");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, student_code")
    .eq("id", preEnrollment.user_id)
    .maybeSingle();

  const { data: schedule } = preEnrollment.selected_schedule_id
    ? await supabase
        .from("course_commissions")
        .select("course_level, commission_number, start_date, end_date, start_time, end_time, modality_key")
        .eq("id", preEnrollment.selected_schedule_id)
        .maybeSingle()
    : { data: null };

  const paymentMeta =
    preEnrollment?.payment_proof_meta && typeof preEnrollment.payment_proof_meta === "object"
      ? preEnrollment.payment_proof_meta
      : {};
  const operationCode = paymentMeta.operation_code || preEnrollment.mp_payment_id || "-";
  const payerName = paymentMeta.payer_name || "-";
  const payerPhone = paymentMeta.payer_phone || "-";

  return (
    <section className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-muted">Pre-matricula</p>
            <h1 className="text-3xl font-semibold">{profile?.full_name || "Detalle"}</h1>
            <p className="text-sm text-muted">{profile?.email}</p>
          </div>
          <Link
            href="/admin/prematriculas"
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            Volver a la bandeja
          </Link>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Resumen</h2>
            <div className="mt-4 space-y-2 text-sm text-muted">
              <p>Status: {formatStatus(preEnrollment.status)}</p>
              <p>Paso: {preEnrollment.step}</p>
              <p>Periodo: {preEnrollment.period}</p>
              <p>Celular: {profile?.phone || "-"}</p>
              <p>Codigo alumno: {profile?.student_code || "-"}</p>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold">Curso / Horario</h2>
            <div className="mt-4 space-y-2 text-sm text-muted">
              <p>Nivel: {preEnrollment.selected_level || schedule?.course_level || "-"}</p>
              <p>Tipo: {preEnrollment.selected_course_type || "-"}</p>
              <p>Mes inicio: {preEnrollment.start_month || "-"}</p>
              <p>Modalidad: {preEnrollment.modality || schedule?.modality_key || "-"}</p>
              <p>Comision: {schedule?.commission_number || "-"}</p>
              <p>Horario: {schedule?.start_time ? `${schedule.start_time} - ${schedule.end_time}` : "-"}</p>
              <p>Inicio: {schedule?.start_date || "-"}</p>
              <p>Fin: {schedule?.end_date || "-"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Pago</h2>
          <div className="mt-4 space-y-2 text-sm text-muted">
            <p>Metodo: {preEnrollment.payment_method || "-"}</p>
            <p>Estado MP: {preEnrollment.mp_status || "-"}</p>
            <p>Operacion reportada: {operationCode}</p>
            <p>Nombre pagador: {payerName}</p>
            <p>Telefono pagador: {payerPhone}</p>
            <p>Pago enviado: {preEnrollment.payment_submitted_at || "-"}</p>
          </div>
          {preEnrollment.payment_proof_url ? (
            <div className="mt-4">
              <ProofPreviewButton preEnrollmentId={preEnrollment.id} />
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Acciones</h2>
          <div className="mt-4 flex flex-wrap gap-4">
            <form action={approvePreEnrollment}>
              <input type="hidden" name="preEnrollmentId" value={preEnrollment.id} />
              <button className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2">
                Aprobar
              </button>
            </form>
            <form action={rejectPreEnrollment} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="preEnrollmentId" value={preEnrollment.id} />
              <input
                type="text"
                name="reviewNotes"
                placeholder="Motivo de rechazo"
                className="rounded-full border border-border bg-surface-2 px-3 py-2 text-xs text-foreground"
              />
              <button className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2">
                Rechazar
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
