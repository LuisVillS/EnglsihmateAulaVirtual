"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { STUDENT_LEVELS } from "@/lib/student-constants";
import { buildFrequencySessionDrafts, formatSessionDateLabel } from "@/lib/course-sessions";

const COURSE_LABELS = {
  "BASICO A1": "Basico A1",
  "BASICO A2": "Basico A2",
  "INTERMEDIO B1": "Intermedio B1",
  "INTERMEDIO B2": "Intermedio B2",
  "AVANZADO C1": "Avanzado C1",
};

const MODALITY_OPTIONS = [
  { value: "DAILY", label: "Diaria (Lunes a Viernes)" },
  { value: "MWF", label: "LMV (Lunes, Miercoles y Viernes)" },
  { value: "TT", label: "Interdiaria (Martes y Jueves)" },
  { value: "SAT", label: "Sabatinos (Sabados)" },
];

const TIME_OPTIONS = Array.from({ length: 33 }, (_, idx) => {
  const minutes = 360 + idx * 30;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const label = `${hours.toString().padStart(2, "0")}:${mins === 0 ? "00" : "30"}`;
  return { value: label, label };
});

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function normalizeMonthInput(value) {
  if (!value) return "";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 7);
  }
  return "";
}

function buildPreviewRange({ startMonth, durationMonths, modalityKey, startTime, endTime }) {
  if (!startMonth || !durationMonths || !modalityKey || !startTime || !endTime) return null;
  const monthStart = /^\d{4}-\d{2}$/.test(startMonth) ? `${startMonth}-01` : startMonth;
  const rows = buildFrequencySessionDrafts({
    commissionId: null,
    frequency: modalityKey,
    startMonth: monthStart,
    durationMonths: Number(durationMonths || 1),
    startTime,
    endTime,
    status: "scheduled",
  });
  if (!rows?.length) return null;
  const startDate = rows[0]?.session_date || null;
  const endDate = rows[rows.length - 1]?.session_date || null;
  if (!startDate || !endDate) return null;
  return { startDate, endDate, total: rows.length };
}

function SubmitButton({ label }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="w-full rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={pending}
    >
      {pending ? "Guardando..." : label}
    </button>
  );
}

export default function CourseForm({ course, action, onSuccess, submitLabel }) {
  const [state, formAction] = useActionState(action, { success: false, error: null, message: null });
  const [startMonth, setStartMonth] = useState(normalizeMonthInput(course?.start_month || course?.start_date));
  const [durationMonths, setDurationMonths] = useState(String(course?.duration_months || 4));
  const [modalityKey, setModalityKey] = useState(course?.modality_key || "");
  const [startTime, setStartTime] = useState(course?.start_time || "");
  const [endTime, setEndTime] = useState(course?.end_time || "");
  const selectedLevel = course?.course_level || "";

  const previewRange = useMemo(
    () =>
      buildPreviewRange({
        startMonth,
        durationMonths,
        modalityKey,
        startTime,
        endTime,
      }),
    [startMonth, durationMonths, modalityKey, startTime, endTime]
  );

  useEffect(() => {
    if (!state?.success || typeof onSuccess !== "function") return;
    onSuccess(state);
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="space-y-4" suppressHydrationWarning>
      <input type="hidden" name="commissionId" defaultValue={course?.id || ""} />
      <input type="hidden" name="start_date" value={startMonth ? `${startMonth}-01` : ""} />

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">Curso</label>
        <select
          name="course_level"
          defaultValue={selectedLevel}
          className="mt-1 w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          required
        >
          <option value="" disabled>
            Selecciona un nivel
          </option>
          {STUDENT_LEVELS.map((level) => (
            <option key={level} value={level} className="text-foreground">
              {COURSE_LABELS[level] || level}
            </option>
          ))}
        </select>
        {course?.commission_number ? (
          <p className="mt-1 text-xs text-muted">Comision: {course.commission_number}</p>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">Mes de inicio</label>
          <input
            type="month"
            name="start_month"
            value={startMonth}
            onChange={(event) => setStartMonth(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">Duracion (meses)</label>
          <select
            name="duration_months"
            value={durationMonths}
            onChange={(event) => setDurationMonths(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          >
            {DURATION_OPTIONS.map((months) => (
              <option key={months} value={months}>
                {months} {months === 1 ? "mes" : "meses"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">Modalidad / Frecuencia</label>
        <select
          name="modality_key"
          value={modalityKey}
          onChange={(event) => setModalityKey(event.target.value)}
          className="mt-1 w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          required
        >
          <option value="" disabled>
            Selecciona modalidad
          </option>
          {MODALITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="text-foreground">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">Hora inicio</label>
          <select
            name="start_time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          >
            <option value="" disabled>
              Selecciona hora
            </option>
            {TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="text-foreground">
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">Hora fin</label>
          <select
            name="end_time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          >
            <option value="" disabled>
              Selecciona hora
            </option>
            {TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="text-foreground">
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
        {previewRange ? (
          <>
            Inicio (primera clase): {formatSessionDateLabel(previewRange.startDate)}. Fin (ultima clase):{" "}
            {formatSessionDateLabel(previewRange.endDate)}. Total: {previewRange.total} clases.
          </>
        ) : (
          <>Completa mes, duracion, modalidad y horas para previsualizar fechas reales de clases.</>
        )}
      </div>

      {state?.error ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="rounded-2xl border border-success/40 bg-success/10 px-4 py-2 text-xs text-success">
          {state.message || "Comision guardada."}
        </p>
      ) : null}

      <SubmitButton label={submitLabel || (course ? "Guardar cambios" : "Crear comision")} />
    </form>
  );
}
