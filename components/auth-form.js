"use client";

import { useEffect, useMemo, useRef, startTransition, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { privateAuthAction } from "@/app/(auth)/auth-actions";
import { authInitialState } from "@/lib/auth-state";

const copyByContext = {
  student: {
    badge: "Aula privada",
    titles: {
      email: "Acceso privado",
      login: "Bienvenido de vuelta",
      reset_request: "Recupera tu acceso",
      reset_code: "Ingresa el codigo",
      set_password: "Crea tu contrasena",
    },
    descriptions: {
      email: "Ingresa el correo o el codigo que te asigno el administrador para verificar tu acceso.",
      login: "Confirma la contrasena que recibiste por correo para entrar al aula virtual.",
      reset_request: "Te enviaremos un codigo unico para restablecer tu contrasena.",
      reset_code: "Escribe el codigo recibido y crea una nueva contrasena.",
      set_password: "Este es tu primer acceso. Define tu contrasena para ingresar.",
    },
  },
  admin: {
    badge: "Panel administrativo",
    titles: {
      email: "Acceso de administracion",
      login: "Valida tu identidad",
      reset_request: "Recupera tu acceso",
      reset_code: "Ingresa el codigo",
      set_password: "Crea tu contrasena",
    },
    descriptions: {
      email: "Ingresa el correo o codigo autorizado para acceder al panel.",
      login: "Introduce la contrasena temporal enviada y luego actualizala en tu perfil de admin.",
      reset_request: "Te enviaremos un codigo para actualizar tu contrasena de admin.",
      reset_code: "Introduce el codigo recibido y define una nueva clave.",
      set_password: "Define una contrasena para continuar.",
    },
  },
};

function SubmitButton({ label, variant = "primary" }) {
  const { pending } = useFormStatus();
  const baseClasses =
    variant === "ghost"
      ? "w-full rounded-2xl border border-border bg-transparent px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary"
      : "w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-foreground shadow-lg shadow-black/30 transition hover:brightness-110 disabled:opacity-60";

  return (
    <button type="submit" className={baseClasses} disabled={pending}>
      {pending ? "Procesando..." : label}
    </button>
  );
}

function EmailForm({ formAction, context, state }) {
  const requireOtp = Boolean(state?.requireOtp);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpError, setOtpError] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);

  async function handleResendOtp() {
    setOtpError("");
    setOtpMessage("");
    const identifier = (state?.identifier || state?.email || "").trim();
    if (!identifier) {
      setOtpError("Primero ingresa tu codigo de alumno o correo.");
      return;
    }

    setSendingOtp(true);
    try {
      const response = await fetch("/api/account/request-login-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo reenviar OTP.");
      }
      setOtpMessage("OTP reenviado a tu correo.");
    } catch (error) {
      setOtpError(error?.message || "No se pudo reenviar OTP.");
    } finally {
      setSendingOtp(false);
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="intent" value="lookup" />
      <input type="hidden" name="requireOtp" value={requireOtp ? "true" : "false"} />
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Correo institucional o código
        </label>
        <input
          type="text"
          name="email"
          required
          autoComplete="email"
          defaultValue={state?.identifier || state?.email || ""}
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          placeholder="correo@institucion.com o E20261234"
        />
      </div>
      {requireOtp ? (
        <>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">OTP de correo</label>
            <input
              type="text"
              name="otp"
              required
              maxLength={6}
              inputMode="numeric"
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
              placeholder="######"
            />
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={sendingOtp}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-surface-2 disabled:opacity-50"
            >
              {sendingOtp ? "Reenviando OTP..." : "Reenviar OTP"}
            </button>
            {otpMessage ? <p className="text-xs text-success">{otpMessage}</p> : null}
            {otpError ? <p className="text-xs text-danger">{otpError}</p> : null}
          </div>
        </>
      ) : null}
      <SubmitButton label="Continuar" />
    </form>
  );
}

function SetPasswordForm({ formAction, state }) {
  const context = state.context || "student";
  const requireOtp = Boolean(state?.requireOtp);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="intent" value="set_password" />
      <input type="hidden" name="requireOtp" value={requireOtp ? "true" : "false"} />
      <input type="hidden" name="email" value={state.email} />
      <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
        Codigo: <span className="font-semibold text-foreground">{state.identifier || "N/A"}</span>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nueva contrasena</label>
        <input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={6}
          required
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          placeholder="******"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Confirmar contrasena</label>
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={6}
          required
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          placeholder="******"
        />
      </div>
      <SubmitButton label="Crear contrasena e ingresar" />
    </form>
  );
}

function PasswordForm({ formAction, state }) {
  const context = state.context || "student";
  const requireOtp = Boolean(state?.requireOtp);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="intent" value="login" />
      <input type="hidden" name="requireOtp" value={requireOtp ? "true" : "false"} />
      <input type="hidden" name="email" value={state.email} />
      <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">
        Acceso para <span className="font-semibold text-foreground">{state.fullName || state.email}</span>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Contrasena</label>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          minLength={6}
          required
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          placeholder="******"
        />
      </div>
      <SubmitButton label="Ingresar" />
    </form>
  );
}

function ResetRequestForm({ formAction, context, requireOtp = false }) {
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="intent" value="reset_request" />
      <input type="hidden" name="requireOtp" value={requireOtp ? "true" : "false"} />
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Correo (no código)
        </label>
        <input
          type="email"
          name="email"
          required
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          placeholder="correo@institucion.com"
        />
      </div>
      <SubmitButton label="Enviar codigo" />
    </form>
  );
}

function ResetCodeForm({ formAction, state }) {
  const context = state.context || "student";
  const requireOtp = Boolean(state?.requireOtp);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="context" value={context} />
      <input type="hidden" name="intent" value="reset_verify" />
      <input type="hidden" name="requireOtp" value={requireOtp ? "true" : "false"} />
      <input type="hidden" name="email" value={state.resetEmail || state.email} />
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Codigo</label>
        <input
          type="text"
          name="resetCode"
          maxLength={6}
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          placeholder="######"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nueva contrasena</label>
        <input
          type="password"
          name="newPassword"
          minLength={6}
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          placeholder="******"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Confirma contrasena</label>
        <input
          type="password"
          name="confirmPassword"
          minLength={6}
          className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          placeholder="******"
        />
      </div>
      <SubmitButton label="Actualizar contrasena" />
    </form>
  );
}

export default function PrivateLoginCard({
  initialError = null,
  context = "student",
  copyOverrides,
  initialIdentifier = "",
  autoLookup = false,
  requireOtp = false,
  allowGoogle = true,
}) {
  const initialState = useMemo(
    () => ({
      ...authInitialState,
      context,
      email: initialIdentifier || "",
      identifier: initialIdentifier || "",
      requireOtp,
      error: initialError,
    }),
    [context, initialError, initialIdentifier, requireOtp]
  );
  const [state, formAction] = useActionState(privateAuthAction, initialState);
  const autoLookupSent = useRef(false);
  const activeContext = state.context || context || "student";
  const copySet = copyByContext[activeContext] || copyByContext.student;
  const stepKey = state.step || "email";
  const currentCopy = {
    badge: copyOverrides?.badge ?? copySet.badge,
    title: copyOverrides?.title?.[stepKey] ?? copySet.titles[stepKey],
    description: copyOverrides?.description?.[stepKey] ?? copySet.descriptions[stepKey],
  };

  useEffect(() => {
    if (!autoLookup || requireOtp || autoLookupSent.current || state.step !== "email") return;
    const identifier = (state.identifier || state.email || "").trim();
    if (!identifier) return;
    autoLookupSent.current = true;
    const lookupForm = new FormData();
    lookupForm.set("context", activeContext);
    lookupForm.set("intent", "lookup");
    lookupForm.set("email", identifier);
    startTransition(() => {
      formAction(lookupForm);
    });
  }, [autoLookup, requireOtp, state.step, state.identifier, state.email, activeContext, formAction]);

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 rounded-[2rem] border border-border bg-surface p-10 text-foreground shadow-2xl shadow-black/30 backdrop-blur">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-muted">{currentCopy.badge}</p>
        <h1 className="text-3xl font-semibold">{currentCopy.title}</h1>
        <p className="text-sm text-muted">{currentCopy.description}</p>
        {state.message ? <p className="text-sm text-foreground">{state.message}</p> : null}
      </header>

      {state.error ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.error}
        </div>
      ) : null}

      {state.step === "email" && <EmailForm context={activeContext} formAction={formAction} state={state} />}
      {state.step === "login" && <PasswordForm formAction={formAction} state={state} />}
      {state.step === "set_password" && <SetPasswordForm formAction={formAction} state={state} />}
      {state.step === "reset_request" && (
        <ResetRequestForm context={activeContext} formAction={formAction} requireOtp={Boolean(state.requireOtp)} />
      )}
      {state.step === "reset_code" && <ResetCodeForm formAction={formAction} state={state} />}

      {state.step !== "email" ? (
        <form action={formAction} className="text-center">
          <input type="hidden" name="context" value={activeContext} />
          <input type="hidden" name="intent" value="reset" />
          <input type="hidden" name="requireOtp" value={state.requireOtp ? "true" : "false"} />
          <button type="submit" className="text-xs font-semibold text-muted underline-offset-4 hover:underline">
            Usar otro correo
          </button>
        </form>
      ) : null}

      <div className="space-y-3">
        <div className="h-px w-full bg-surface-2" />
        {allowGoogle ? (
          <form action={formAction}>
            <input type="hidden" name="context" value={activeContext} />
            <input type="hidden" name="intent" value="google" />
            <input type="hidden" name="requireOtp" value={state.requireOtp ? "true" : "false"} />
            <SubmitButton label="Ingresar con Google" variant="ghost" />
          </form>
        ) : null}
        {state.step !== "reset_request" && state.step !== "reset_code" ? (
          <form action={formAction} className="text-center">
            <input type="hidden" name="context" value={activeContext} />
            <input type="hidden" name="intent" value="reset_request" />
            <input type="hidden" name="requireOtp" value={state.requireOtp ? "true" : "false"} />
            <button type="submit" className="text-xs font-semibold text-muted underline-offset-4 hover:underline">
              ¿Olvidaste tu contrasena?
            </button>
          </form>
        ) : null}
        <p className="text-center text-xs text-muted">
          Solo los correos pre-registrados por el administrador pueden iniciar sesion.
        </p>
      </div>
    </div>
  );
}



