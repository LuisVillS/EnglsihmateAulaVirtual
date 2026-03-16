"use client";

import { useMemo, useState } from "react";

const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_WA_URL || "https://wa.me/";

function formatMonthLabel(value) {
  if (!value) return "-";
  const [yearRaw, monthRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value;
  const date = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  return date.toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "UTC" });
}

function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();
  const copyByStatus = {
    submitted: { label: "En revisión", className: "border-primary/30 bg-primary/10 text-primary" },
    rejected: { label: "Rechazada", className: "border-danger/30 bg-danger/10 text-danger" },
    approved: { label: "Aprobada", className: "border-success/30 bg-success/10 text-success" },
    locked: { label: "Bloqueada", className: "border-border bg-surface-2 text-muted" },
    pending: { label: "Pendiente", className: "border-border bg-surface-2 text-muted" },
  };
  const copy = copyByStatus[normalized] || copyByStatus.pending;
  return <span className={`rounded-[999px] border px-2.5 py-1 text-xs font-semibold uppercase ${copy.className}`}>{copy.label}</span>;
}

function getModeMeta(mode, enabledFrom) {
  switch (mode) {
    case "approvedOnce":
      return {
        title: "Matrícula aprobada",
        description: "Tu matrícula fue aprobada correctamente. Esta confirmación solo aparece una vez.",
        panelTone: "border-success/35 bg-success/10",
        eyebrow: "Mi matrícula",
        helper: "Ya puedes continuar directamente a tu curso.",
      };
    case "renewalLocked":
      return {
        title: "Renovación no disponible todavía",
        description: `Tu próxima ventana de renovación se habilita el ${enabledFrom}.`,
        panelTone: "border-primary/35 bg-primary/10",
        eyebrow: "Mi matrícula",
        helper: "Mientras tanto, tu curso actual sigue siendo tu espacio principal.",
      };
    case "submitted":
      return {
        title: "Comprobante enviado",
        description: "Tu comprobante fue enviado y está en revisión administrativa.",
        panelTone: "border-primary/35 bg-primary/10",
        eyebrow: "Mi matrícula",
        helper: "No necesitas enviar otro comprobante salvo que soporte te lo solicite.",
      };
    case "rejected":
      return {
        title: "Tu pago necesita un nuevo envío",
        description: "Revisa tu comprobante y vuelve a subirlo para completar tu renovación.",
        panelTone: "border-danger/35 bg-danger/10",
        eyebrow: "Mi matrícula",
        helper: "Usa un archivo claro para que la revisión se complete más rápido.",
      };
    case "renewalPay":
    default:
      return {
        title: "Renovación mensual",
        description: "Completa la renovación del mes desde el flujo actual sin salir del portal del estudiante.",
        panelTone: "border-[rgba(15,23,42,0.08)] bg-white",
        eyebrow: "Mi matrícula",
        helper: "Sube tu comprobante cuando la ventana de renovación ya esté habilitada.",
      };
  }
}

export default function MonthlyPaymentCard({
  mode = "renewalPay",
  amount,
  billingMonth,
  enabledFrom,
  canPayNow = false,
  paymentRecord = null,
}) {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingApproval, setConfirmingApproval] = useState(false);

  const monthLabel = useMemo(() => formatMonthLabel(billingMonth), [billingMonth]);
  const modeMeta = useMemo(() => getModeMeta(mode, enabledFrom), [enabledFrom, mode]);
  const statusValue =
    paymentRecord?.status || (mode === "renewalPay" ? "pending" : mode === "renewalLocked" ? "locked" : mode);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!file) {
      setError("Adjunta un comprobante antes de continuar.");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/payments/upload-proof", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo subir el comprobante.");
      }
      setMessage("Comprobante subido correctamente. Tu renovación ya quedó en revisión.");
      setFile(null);
      window.location.reload();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  async function markApprovalSeen() {
    try {
      const response = await fetch("/api/payments/mark-approval-seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingMonth }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo confirmar el estado.");
      }
      return true;
    } catch (confirmError) {
      setError(confirmError.message || "No se pudo continuar.");
      return false;
    }
  }

  async function handleGoToCourse() {
    setError("");
    setConfirmingApproval(true);
    const ok = await markApprovalSeen();
    if (ok) {
      window.location.href = "/app/curso";
    }
    setConfirmingApproval(false);
  }

  async function handleDismissApprovedMessage() {
    setError("");
    setConfirmingApproval(true);
    const ok = await markApprovalSeen();
    if (ok) {
      window.location.reload();
    }
    setConfirmingApproval(false);
  }

  return (
    <section className="space-y-6 text-foreground">
      <header className="student-panel px-5 py-5 sm:px-6">
        <p className="text-xs uppercase tracking-[0.38em] text-muted">{modeMeta.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Mi matrícula</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Revisa tu estado actual de renovación, entiende qué sigue y usa el flujo de pago existente cuando lo necesites.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <article className={`student-panel space-y-5 px-5 py-5 sm:px-6 ${modeMeta.panelTone}`}>
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Estado actual</p>
            <h2 className="mt-2 text-3xl font-semibold text-foreground">{modeMeta.title}</h2>
            <p className="mt-2 text-sm text-muted">{modeMeta.description}</p>
          </div>

          {(mode === "renewalPay" || mode === "rejected") ? (
            <div className="student-panel-soft border-success/35 bg-success/10 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-success">Monto del mes</p>
              <p className="mt-2 text-4xl font-black leading-none text-success">S/ {amount}</p>
            </div>
          ) : null}

          {mode === "approvedOnce" ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGoToCourse}
                disabled={confirmingApproval}
                className="student-button-primary px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {confirmingApproval ? "Cargando..." : "Ir a mi curso"}
              </button>
              <button
                type="button"
                onClick={handleDismissApprovedMessage}
                disabled={confirmingApproval}
                className="student-button-secondary px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cerrar
              </button>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="student-button-secondary px-5 py-2.5 text-sm"
              >
                Soporte
              </a>
            </div>
          ) : null}

          {mode === "renewalLocked" ? (
            <div className="flex flex-wrap items-center gap-3">
              <a href="/app/curso" className="student-button-primary px-5 py-2.5 text-sm">
                Ir a mi curso
              </a>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="student-button-secondary px-5 py-2.5 text-sm"
              >
                Soporte
              </a>
            </div>
          ) : null}

          {(mode === "submitted" || mode === "rejected") ? (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <span>Estado:</span>
              <StatusBadge status={statusValue} />
            </div>
          ) : null}

          {(mode === "renewalPay" || mode === "rejected") && canPayNow ? (
            <form onSubmit={handleSubmit} className="space-y-3 border-t border-[rgba(15,23,42,0.08)] pt-5">
              <label className="block text-xs font-semibold uppercase tracking-[0.24em] text-muted">
                Comprobante de pago
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="w-full rounded-[12px] border border-border bg-surface-2 px-3 py-3 text-sm text-foreground file:mr-3 file:rounded-[10px] file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
              />
              <button
                type="submit"
                disabled={saving}
                className="student-button-primary px-5 py-2.5 text-sm disabled:opacity-60"
              >
                {saving ? "Subiendo..." : "Subir comprobante"}
              </button>
            </form>
          ) : null}

          {(mode === "renewalPay" || mode === "rejected") && !canPayNow ? (
            <div className="student-panel-soft px-4 py-3 text-sm text-muted">
              Este pago se habilita el {enabledFrom}.
            </div>
          ) : null}

          {message ? <p className="text-sm text-success">{message}</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </article>

        <aside className="student-panel px-5 py-5 sm:px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Contexto de renovación</p>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Mes de facturación</p>
              <p className="mt-1 text-sm font-medium text-foreground">{monthLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Estado actual</p>
              <div className="mt-2">
                <StatusBadge status={statusValue} />
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Siguiente paso</p>
              <p className="mt-1 text-sm text-foreground">{modeMeta.helper}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Ayuda</p>
              <p className="mt-1 text-sm text-foreground">
                Contacta soporte si tu estado de renovación no coincide con lo esperado o si necesitas ayuda con tu comprobante.
              </p>
            </div>
          </div>

          <div className="mt-6 border-t border-[rgba(15,23,42,0.08)] pt-5">
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="student-button-secondary w-full justify-center px-5 py-2.5 text-sm"
            >
              Contactar soporte
            </a>
          </div>
        </aside>
      </div>
    </section>
  );
}
