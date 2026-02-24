"use client";

import { useActionState, useMemo, useState } from "react";
import { updateStudentPassword } from "@/app/admin/actions";

const INITIAL_STATE = { success: false, error: null, message: null };

export default function AdminStudentPasswordForm({ studentId, redirectTo = "" }) {
  const [state, formAction] = useActionState(updateStudentPassword, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);
  const statusClassName = useMemo(() => {
    if (state?.error) return "border-danger/40 bg-danger/10 text-danger";
    if (state?.success) return "border-success/40 bg-success/10 text-success";
    return "";
  }, [state]);

  return (
    <section className="rounded-3xl border border-border bg-surface p-6 text-foreground shadow-xl">
      <p className="text-xs uppercase tracking-[0.35em] text-muted">Seguridad</p>
      <h3 className="mt-2 text-xl font-semibold">Contraseña del alumno</h3>
      <p className="mt-1 text-sm text-muted">
        Puedes establecer una nueva contraseña para este alumno.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="profileId" value={studentId} />
        {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nueva contraseña</label>
          <div className="flex gap-2">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              minLength={8}
              required
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="Minimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="rounded-2xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              {showPassword ? "Ocultar" : "Ver"}
            </button>
          </div>
        </div>

        {state?.error || state?.success ? (
          <p className={`rounded-2xl border px-3 py-2 text-xs ${statusClassName}`}>
            {state.error || state.message}
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
        >
          Guardar contraseña
        </button>
      </form>
    </section>
  );
}
