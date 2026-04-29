"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importStudentsCsv } from "@/app/admin/actions";
import AppModal from "@/components/app-modal";

const INITIAL_STATE = { success: false, error: null, message: null };

export default function AdminStudentImportModal() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(importStudentsCsv, INITIAL_STATE);
  const timerRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (!state?.success) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setOpen(false);
      router.refresh();
    }, 1800);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
      >
        Importar CSV
      </button>

      <AppModal open={open} onClose={() => setOpen(false)} title="Importacion masiva de alumnos" widthClass="max-w-2xl">
        <form action={formAction} className="space-y-4">
          <input
            type="file"
            name="csv"
            accept=".csv"
            required
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
          />
          <button
            type="submit"
            className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
          >
            Importar alumnos
          </button>
          <p className="text-xs text-muted">
            Columnas: full_name, email, dni, phone, birth_date, course_level, start_month, enrollment_date,
            preferred_hour, modality
          </p>
          {state?.error ? (
            <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">
              {state.error}
            </p>
          ) : null}
          {state?.success ? (
            <p className="rounded-2xl border border-success/40 bg-success/10 px-4 py-2 text-xs text-success">
              {state.message || "Importacion completada."}
            </p>
          ) : null}
        </form>
      </AppModal>
    </>
  );
}
