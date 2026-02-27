"use client";

import { useState } from "react";
import AppModal from "@/components/app-modal";

function pluralizeIntento(value) {
  return Number(value) === 1 ? "intento" : "intentos";
}

export default function RestartLessonQuizButton({
  action,
  lessonId,
  canRepeat,
  remainingAttempts,
  attemptsUsed,
  maxAttempts,
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={!canRepeat}
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center rounded-2xl border border-border bg-surface px-5 py-3 text-base font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {canRepeat ? "Repetir test" : "Intentos agotados"}
      </button>

      <AppModal open={open} onClose={() => (!submitting ? setOpen(false) : null)} title="Confirmar repeticion" widthClass="max-w-lg">
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Ya usaste {attemptsUsed}/{maxAttempts} {pluralizeIntento(maxAttempts)}.
          </p>
          <p className="text-sm text-muted">
            Te queda {remainingAttempts} {pluralizeIntento(remainingAttempts)}. Al confirmar, reiniciaras el test desde el inicio.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <form
              action={action}
              onSubmit={() => {
                setSubmitting(true);
              }}
              className="w-full sm:w-auto"
            >
              <input type="hidden" name="lessonId" value={lessonId} />
              <button
                type="submit"
                disabled={!canRepeat || submitting}
                className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Reiniciando..." : "Si, repetir test"}
              </button>
            </form>
          </div>
        </div>
      </AppModal>
    </>
  );
}
