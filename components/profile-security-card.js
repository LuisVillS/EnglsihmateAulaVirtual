"use client";

import { useActionState } from "react";
import {
  changeStudentPasswordAction,
  changeStudentEmailAction,
  profileActionInitialState,
} from "@/app/profile/security-actions";

function StatusBanner({ state }) {
  if (!state?.message) return null;
  const isSuccess = state.status === "success";
  return (
    <div
      className={`rounded-2xl border px-4 py-2 text-sm ${
        isSuccess
          ? "border-success/40 bg-success/10 text-success"
          : "border-danger/40 bg-danger/10 text-danger"
      }`}
    >
      {state.message}
    </div>
  );
}

export default function ProfileSecurityCard({ email }) {
  const [passwordState, passwordFormAction] = useActionState(
    changeStudentPasswordAction,
    profileActionInitialState
  );
  const [emailState, emailFormAction] = useActionState(
    changeStudentEmailAction,
    profileActionInitialState
  );

  return (
    <div className="space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-xl shadow-black/25">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-muted">Seguridad</p>
        <h3 className="mt-2 text-2xl font-semibold text-foreground">Acceso y contrasenas</h3>
        <p className="text-sm text-muted">
          Actualiza tu contrasena y el correo de acceso. Siempre validamos con tu contrasena actual antes de guardar.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={passwordFormAction} className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
          <p className="text-sm font-semibold text-foreground">Cambiar contrasena</p>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Contrasena actual
            </label>
            <input
              type="password"
              name="currentPassword"
              required
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="********"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Nueva contrasena
            </label>
            <input
              type="password"
              name="newPassword"
              minLength={6}
              required
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="********"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Repite nueva contrasena
            </label>
            <input
              type="password"
              name="confirmPassword"
              minLength={6}
              required
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="********"
            />
          </div>
          <StatusBanner state={passwordState} />
          <button
            type="submit"
            className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
          >
            Guardar nueva contrasena
          </button>
        </form>

        <form action={emailFormAction} className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
          <p className="text-sm font-semibold text-foreground">Actualizar correo</p>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Nuevo correo
            </label>
            <input
              type="email"
              name="newEmail"
              defaultValue={email}
              required
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="correo@institucion.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Contrasena actual
            </label>
            <input
              type="password"
              name="emailPassword"
              required
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="********"
            />
          </div>
          <StatusBanner state={emailState} />
          <button
            type="submit"
            className="w-full rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface"
          >
            Guardar nuevo correo
          </button>
        </form>
      </div>
    </div>
  );
}
