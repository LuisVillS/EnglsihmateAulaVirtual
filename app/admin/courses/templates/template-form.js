"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { upsertCourseTemplate } from "@/app/admin/actions";
import { STUDENT_LEVELS } from "@/lib/student-constants";
import { FREQUENCY_REFERENCE } from "@/lib/course-sessions";

const FREQUENCY_OPTIONS = [
  { value: "DAILY", label: "Daily (L-V)" },
  { value: "MWF", label: "Interdiario 1 (LMV)" },
  { value: "TT", label: "Interdiario 2 (MJ)" },
  { value: "SAT", label: "Sabatinos (Sabados)" },
];

const INITIAL_STATE = { success: false, error: null, message: null, templateId: null };

function formatHours(value) {
  if (!Number.isFinite(Number(value))) return "-";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? `${numeric}` : `${numeric.toFixed(1)}`;
}

export default function TemplateForm({ template, redirectOnSuccess = false }) {
  const [state, formAction] = useActionState(upsertCourseTemplate, INITIAL_STATE);
  const router = useRouter();
  const isEditing = Boolean(template?.id);
  const [selectedFrequency, setSelectedFrequency] = useState(() => template?.frequency || "");

  useEffect(() => {
    if (!state?.success || !state?.templateId) return;
    if (redirectOnSuccess) {
      router.replace(`/admin/courses/templates/${state.templateId}`);
      return;
    }
    router.refresh();
  }, [state, router, redirectOnSuccess]);

  const frequencyMetrics = useMemo(() => {
    const key = String(selectedFrequency || "").toUpperCase();
    const reference = FREQUENCY_REFERENCE[key];
    if (!reference) return null;
    const totalHours = Number(reference.hoursPerMonth || 0) * Number(reference.months || 0);
    return {
      hoursPerClass: reference.hoursPerClass,
      sessionsPerMonth: reference.sessionsPerMonth,
      hoursPerMonth: reference.hoursPerMonth,
      months: reference.months,
      totalHours,
      totalSessions: Number(reference.sessionsPerMonth || 0) * Number(reference.months || 0),
    };
  }, [selectedFrequency]);

  return (
    <form action={formAction} className="space-y-4">
      {template?.id ? <input type="hidden" name="templateId" value={template.id} /> : null}
      {isEditing ? <input type="hidden" name="courseLevel" value={template.course_level || ""} /> : null}
      {isEditing ? <input type="hidden" name="frequency" value={template.frequency || ""} /> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nivel</label>
          <select
            name="courseLevel"
            defaultValue={template?.course_level || ""}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70"
            required
            disabled={isEditing}
          >
            <option value="" disabled>
              Selecciona nivel
            </option>
            {STUDENT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          {isEditing ? (
            <p className="text-xs text-muted">Bloqueado: el nivel no se puede cambiar despues de crear la plantilla.</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Frecuencia</label>
          <select
            name="frequency"
            defaultValue={template?.frequency || ""}
            onChange={(event) => setSelectedFrequency(event.target.value)}
            className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-70"
            required
            disabled={isEditing}
          >
            <option value="" disabled>
              Selecciona frecuencia
            </option>
            {FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {isEditing ? (
            <p className="text-xs text-muted">Bloqueado: la frecuencia no se puede cambiar despues de crear la plantilla.</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 rounded-2xl border border-border bg-surface-2 p-4 md:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Horas/clase</p>
          <p className="mt-1 text-base font-semibold text-foreground">{formatHours(frequencyMetrics?.hoursPerClass)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Sesiones/mes</p>
          <p className="mt-1 text-base font-semibold text-foreground">{frequencyMetrics?.sessionsPerMonth || "-"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Horas/mes</p>
          <p className="mt-1 text-base font-semibold text-foreground">{formatHours(frequencyMetrics?.hoursPerMonth)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Meses</p>
          <p className="mt-1 text-base font-semibold text-foreground">{frequencyMetrics?.months || "-"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Horas totales</p>
          <p className="mt-1 text-base font-semibold text-foreground">{formatHours(frequencyMetrics?.totalHours)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Sesiones totales</p>
          <p className="mt-1 text-base font-semibold text-foreground">{frequencyMetrics?.totalSessions || "-"}</p>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nombre de plantilla (opcional)</label>
        <input
          name="templateName"
          defaultValue={template?.template_name || ""}
          className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          placeholder="Basico A1 - Interdiario 1"
        />
      </div>

      {state?.error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{state.error}</p>
      ) : null}
      {state?.success ? (
        <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          {state.message || "Plantilla guardada."}
        </p>
      ) : null}

      <button
        type="submit"
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
      >
        {template?.id ? "Guardar plantilla" : "Crear plantilla"}
      </button>
    </form>
  );
}
