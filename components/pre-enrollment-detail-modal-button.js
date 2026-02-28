"use client";

import { useEffect, useState } from "react";
import AppModal from "@/components/app-modal";
import ProofPreviewButton from "@/components/proof-preview-button";
import { formatEnrollmentFrequencyLabel } from "@/lib/frequency-labels";

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
  return map[value] || value || "-";
}

function formatStep(value) {
  const map = {
    ACCOUNT_CREATED: "Cuenta creada",
    COURSE_SELECTION: "Seleccion",
    TERMS: "Terminos",
    PRECONFIRMATION: "Preconfirmacion",
    PAYMENT: "Pago",
  };
  return map[value] || value || "-";
}

function formatDateTime(value) {
  if (!value) return "-";
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

function DetailCard({ title, children }) {
  return (
    <section className="rounded-3xl border border-border bg-background/60 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">{title}</h3>
      <div className="mt-4 space-y-2 text-sm text-foreground">{children}</div>
    </section>
  );
}

export default function PreEnrollmentDetailModalButton({
  preEnrollmentId,
  label = "Ver detalle",
  className = "rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary",
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!open || detail || error) return undefined;
    const controller = new AbortController();

    async function loadDetail() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/prematriculas/${encodeURIComponent(preEnrollmentId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "No se pudo cargar el detalle.");
        }
        setDetail(payload.detail || null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err.message || "No se pudo cargar el detalle.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      controller.abort();
    };
  }, [detail, error, open, preEnrollmentId]);

  const preEnrollment = detail?.preEnrollment || null;
  const profile = detail?.profile || null;
  const schedule = detail?.schedule || null;
  const paymentMeta = detail?.paymentMeta || null;
  const frequencyLabel = formatEnrollmentFrequencyLabel(
    preEnrollment?.selected_frequency || preEnrollment?.modality || schedule?.modality_key || null
  );

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {label}
      </button>

      <AppModal open={open} onClose={() => setOpen(false)} title="Detalle de pre-matricula" widthClass="max-w-5xl">
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface-2 px-4 py-6 text-sm text-muted">
            Cargando detalle...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-4 text-sm text-foreground">
            {error}
          </div>
        ) : null}

        {!loading && !error && detail ? (
          <div className="space-y-5">
            <header className="rounded-3xl border border-border bg-surface-2 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Registro</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{profile?.full_name || "Sin nombre"}</h2>
              <p className="mt-1 text-sm text-muted">{profile?.email || "-"}</p>
              <p className="mt-1 text-sm text-muted">{profile?.phone || "-"}</p>
            </header>

            <div className="grid gap-5 md:grid-cols-2">
              <DetailCard title="Estado">
                <p>ID: <span className="font-semibold">{preEnrollment?.id || "-"}</span></p>
                <p>Status: <span className="font-semibold">{formatStatus(preEnrollment?.status)}</span></p>
                <p>Paso: <span className="font-semibold">{formatStep(preEnrollment?.step)}</span></p>
                <p>Periodo: <span className="font-semibold">{preEnrollment?.period || "-"}</span></p>
                <p>Creado: <span className="font-semibold">{formatDateTime(preEnrollment?.created_at)}</span></p>
                <p>Actualizado: <span className="font-semibold">{formatDateTime(preEnrollment?.updated_at)}</span></p>
                <p>Reserva hasta: <span className="font-semibold">{formatDateTime(preEnrollment?.reservation_expires_at)}</span></p>
                <p>Terminos aceptados: <span className="font-semibold">{formatDateTime(preEnrollment?.terms_accepted_at)}</span></p>
              </DetailCard>

              <DetailCard title="Alumno">
                <p>Usuario: <span className="font-semibold">{preEnrollment?.user_id || "-"}</span></p>
                <p>Nombre: <span className="font-semibold">{profile?.full_name || "-"}</span></p>
                <p>Email: <span className="font-semibold">{profile?.email || "-"}</span></p>
                <p>Celular: <span className="font-semibold">{profile?.phone || "-"}</span></p>
                <p>Codigo alumno: <span className="font-semibold">{profile?.student_code || "-"}</span></p>
              </DetailCard>

              <DetailCard title="Seleccion academica">
                <p>Nivel: <span className="font-semibold">{preEnrollment?.selected_level || schedule?.course_level || "-"}</span></p>
                <p>Frecuencia: <span className="font-semibold">{frequencyLabel}</span></p>
                <p>Tipo de curso: <span className="font-semibold">{preEnrollment?.selected_course_type || "-"}</span></p>
                <p>Mes de inicio: <span className="font-semibold">{preEnrollment?.start_month || "-"}</span></p>
                <p>Curso: <span className="font-semibold">{preEnrollment?.selected_course_id || "-"}</span></p>
                <p>Horario elegido: <span className="font-semibold">{preEnrollment?.selected_start_time || "-"}</span></p>
                <p>Comision: <span className="font-semibold">{schedule?.commission_number || "-"}</span></p>
                <p>ID horario: <span className="font-semibold">{preEnrollment?.selected_schedule_id || "-"}</span></p>
                <p>Rango: <span className="font-semibold">{schedule?.start_time ? `${schedule.start_time} - ${schedule?.end_time || ""}` : "-"}</span></p>
                <p>Inicio: <span className="font-semibold">{schedule?.start_date || "-"}</span></p>
                <p>Fin: <span className="font-semibold">{schedule?.end_date || "-"}</span></p>
              </DetailCard>

              <DetailCard title="Pago">
                <p>Metodo: <span className="font-semibold">{preEnrollment?.payment_method || "-"}</span></p>
                <p>Modo confirmacion: <span className="font-semibold">{paymentMeta?.confirmationMode || "-"}</span></p>
                <p>Monto: <span className="font-semibold">{preEnrollment?.price_total ?? "-"}</span></p>
                <p>Estado MP: <span className="font-semibold">{preEnrollment?.mp_status || "-"}</span></p>
                <p>ID MP: <span className="font-semibold">{preEnrollment?.mp_payment_id || "-"}</span></p>
                <p>Operacion reportada: <span className="font-semibold">{paymentMeta?.operationCode || "-"}</span></p>
                <p>Nombre pagador: <span className="font-semibold">{paymentMeta?.payerName || "-"}</span></p>
                <p>Telefono pagador: <span className="font-semibold">{paymentMeta?.payerPhone || "-"}</span></p>
                <p>Pago enviado: <span className="font-semibold">{formatDateTime(preEnrollment?.payment_submitted_at)}</span></p>
                <p>Revision: <span className="font-semibold">{preEnrollment?.review_notes || "-"}</span></p>
                {preEnrollment?.payment_proof_url ? (
                  <div className="pt-2">
                    <ProofPreviewButton preEnrollmentId={preEnrollment.id} />
                  </div>
                ) : (
                  <p>Comprobante: <span className="font-semibold">No adjunto</span></p>
                )}
              </DetailCard>
            </div>
          </div>
        ) : null}
      </AppModal>
    </>
  );
}
