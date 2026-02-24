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
    submitted: { label: "En revision", className: "border-primary/30 bg-primary/10 text-primary" },
    rejected: { label: "Rechazada", className: "border-danger/30 bg-danger/10 text-danger" },
    approved: { label: "Aprobada", className: "border-success/30 bg-success/10 text-success" },
    pending: { label: "Pendiente", className: "border-border bg-surface-2 text-muted" },
  };
  const copy = copyByStatus[normalized] || copyByStatus.pending;
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${copy.className}`}>{copy.label}</span>;
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

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!file) {
      setError("Adjunta un comprobante.");
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
      setMessage("Comprobante enviado correctamente. Tu pago quedo en revision.");
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
    <section className="space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-xl">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted">Mi matricula</p>
        <h2 className="text-2xl font-semibold text-foreground">
          {mode === "approvedOnce" ? "Matricula aprobada" : "Renovacion mensual"}
        </h2>
        <p className="text-sm text-muted">Mes: {monthLabel}</p>
      </header>

      {(mode === "renewalPay" || mode === "rejected") ? (
        <div className="rounded-2xl border border-success/40 bg-success/10 p-5">
          <p className="text-xs uppercase tracking-[0.25em] text-success">Monto mensual</p>
          <p className="mt-2 text-4xl font-black text-success">S/ {amount}</p>
        </div>
      ) : null}

      {mode === "approvedOnce" ? (
        <div className="space-y-4 rounded-2xl border border-success/35 bg-success/10 p-5">
          <p className="text-xl font-semibold text-foreground">Tu matricula fue aprobada correctamente.</p>
          <p className="text-sm text-muted">
            Ya puedes ingresar a tu curso. Esta pantalla solo se mostrara una vez.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGoToCourse}
              disabled={confirmingApproval}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {confirmingApproval ? "Cargando..." : "Ir a mi curso"}
            </button>
            <button
              type="button"
              onClick={handleDismissApprovedMessage}
              disabled={confirmingApproval}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cerrar
            </button>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Soporte
            </a>
          </div>
        </div>
      ) : null}

      {mode === "renewalLocked" ? (
        <div className="space-y-4 rounded-2xl border border-primary/35 bg-primary/10 p-5">
          <p className="text-xl font-semibold text-foreground">Aun no puedes realizar tu nueva matricula.</p>
          <p className="text-sm text-muted">Tu proxima renovacion se habilita el {enabledFrom}.</p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/app/curso"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              Ir a mi curso
            </a>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Soporte
            </a>
          </div>
        </div>
      ) : null}

      {mode === "submitted" ? (
        <div className="space-y-3 rounded-2xl border border-primary/35 bg-primary/10 p-5">
          <p className="text-xl font-semibold text-foreground">Matricula enviada</p>
          <p className="text-sm text-muted">
            Tu comprobante del siguiente mes fue enviado y esta en revision administrativa.
          </p>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <span>Estado:</span>
            <StatusBadge status={paymentRecord?.status || "submitted"} />
          </div>
        </div>
      ) : null}

      {mode === "rejected" ? (
        <div className="space-y-4 rounded-2xl border border-danger/35 bg-danger/10 p-5">
          <p className="text-xl font-semibold text-foreground">Tu pago fue rechazado</p>
          <p className="text-sm text-muted">
            Revisa tu comprobante y vuelve a enviarlo para completar la renovacion.
          </p>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <span>Estado:</span>
            <StatusBadge status={paymentRecord?.status || "rejected"} />
          </div>
        </div>
      ) : null}

      {(mode === "renewalPay" || mode === "rejected") && canPayNow ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Subiendo..." : "Subir comprobante"}
          </button>
        </form>
      ) : null}

      {(mode === "renewalPay" || mode === "rejected") && !canPayNow ? (
        <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          Tu pago se habilitara el {enabledFrom}.
        </div>
      ) : null}

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </section>
  );
}
