"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { upsertStudent } from "@/app/admin/actions";

const DAY_LABELS = {
  1: "Lun",
  2: "Mar",
  3: "Mie",
  4: "Jue",
  5: "Vie",
  6: "Sab",
  7: "Dom",
};

const INITIAL_STATE = { success: false, error: null, message: null };
const MIN_STUDENT_AGE = 14;
const MAX_STUDENT_AGE = 100;
const MONTH_OPTIONS = [
  { value: "1", label: "Enero" },
  { value: "2", label: "Febrero" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Mayo" },
  { value: "6", label: "Junio" },
  { value: "7", label: "Julio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseDateParts(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { year: "", month: "", day: "" };
  }
  const [year, month, day] = value.split("-");
  return {
    year,
    month: String(Number(month)),
    day: String(Number(day)),
  };
}

function getDaysInMonth(year, month) {
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    return 31;
  }
  return new Date(parsedYear, parsedMonth, 0).getDate();
}

function getBirthDateBounds() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const month = pad2(today.getMonth() + 1);
  const day = pad2(today.getDate());
  return {
    minYear: currentYear - MAX_STUDENT_AGE,
    maxYear: currentYear - MIN_STUDENT_AGE,
    minDate: `${currentYear - MAX_STUDENT_AGE}-${month}-${day}`,
    maxDate: `${currentYear - MIN_STUDENT_AGE}-${month}-${day}`,
  };
}

function BirthDatePicker({ defaultValue }) {
  const initialParts = parseDateParts(defaultValue);
  const [year, setYear] = useState(() => initialParts.year);
  const [month, setMonth] = useState(() => initialParts.month);
  const [day, setDay] = useState(() => initialParts.day);
  const bounds = useMemo(() => getBirthDateBounds(), []);

  const yearOptions = useMemo(() => {
    const options = [];
    for (let y = bounds.maxYear; y >= bounds.minYear; y -= 1) {
      options.push(String(y));
    }
    if (year && !options.includes(year)) {
      options.unshift(year);
    }
    return options;
  }, [bounds.maxYear, bounds.minYear, year]);

  const maxDay = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const normalizedDay = day && Number(day) <= maxDay ? day : "";

  const dayOptions = useMemo(
    () => Array.from({ length: maxDay }, (_, idx) => String(idx + 1)),
    [maxDay]
  );

  const hasPartial = Boolean(year || month || normalizedDay) && !(year && month && normalizedDay);
  const birthDateValue = year && month && normalizedDay ? `${year}-${pad2(month)}-${pad2(normalizedDay)}` : "";
  const outOfRange = Boolean(birthDateValue) && (birthDateValue < bounds.minDate || birthDateValue > bounds.maxDate);
  const errorMessage = hasPartial
    ? "Completa dia, mes y ano o deja la fecha vacia."
    : outOfRange
      ? `Edad permitida: ${MIN_STUDENT_AGE} a ${MAX_STUDENT_AGE} anos.`
      : "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Fecha de nacimiento (opcional)
        </label>
        <span className="rounded-full border border-border bg-surface px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {MIN_STUDENT_AGE}-{MAX_STUDENT_AGE} anos
        </span>
      </div>
      <div className="rounded-2xl border border-border bg-surface-2 p-3">
        <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_0.9fr]">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted">Ano</label>
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Selecciona ano</option>
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mes</label>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Selecciona mes</option>
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted">Dia</label>
            <select
              value={normalizedDay}
              onChange={(event) => setDay(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Dia</option>
              {dayOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted">
            Solo se permiten nacimientos entre {bounds.minDate} y {bounds.maxDate}.
          </p>
          {(year || month || day) ? (
            <button
              type="button"
              onClick={() => {
                setYear("");
                setMonth("");
                setDay("");
              }}
              className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:bg-surface"
            >
              Limpiar fecha
            </button>
          ) : null}
        </div>
      </div>
      <input type="hidden" name="birthDate" value={errorMessage ? "" : birthDateValue} />
      {errorMessage ? (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{errorMessage}</p>
      ) : null}
    </div>
  );
}

function formatCommissionLabel(commission) {
  if (!commission) return "Sin comision";
  const days = Array.isArray(commission.days_of_week)
    ? commission.days_of_week.map((day) => DAY_LABELS[day] || day).join("/")
    : "";
  const schedule = commission.start_time && commission.end_time
    ? `${commission.start_time}-${commission.end_time}`
    : "";
  const extras = [schedule ? `(${schedule})` : "", days ? `(${days})` : ""].filter(Boolean).join(" ");
  const base = `${commission.course_level} - Comision ${commission.commission_number}`;
  return extras ? `${base} ${extras}` : base;
}

export default function StudentForm({
  student,
  redirectTo,
  commissions = [],
  onSuccess,
  showBackLink = true,
  embedded = false,
}) {
  const [state, formAction] = useActionState(upsertStudent, INITIAL_STATE);
  const title = student ? "Editar alumno" : "Registrar alumno";
  const buttonLabel = student ? "Guardar cambios" : "Crear alumno";
  const defaultType = student?.is_premium ? "premium" : "regular";
  const redirectTarget = redirectTo ?? (student ? "/admin/students" : "");
  const filteredCommissions = student?.course_level
    ? commissions.filter((commission) => commission.course_level === student.course_level)
    : commissions;
  const currentCommission = student?.commission || null;
  const commissionOptions = currentCommission
    ? [currentCommission, ...filteredCommissions.filter((item) => item.id !== currentCommission.id)]
    : filteredCommissions;

  useEffect(() => {
    if (!state?.success || typeof onSuccess !== "function") return;
    onSuccess(state);
  }, [state, onSuccess]);

  const content = (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Alumnos</p>
          <h2 className="text-2xl font-semibold">{title}</h2>
        </div>
        {student && showBackLink ? (
          <Link href="/admin/students" className="text-xs font-semibold text-muted underline-offset-4 hover:underline">
            Volver
          </Link>
        ) : null}
      </div>
      {student?.student_code ? (
        <p className="mt-3 rounded-2xl border border-border bg-surface-2 px-4 py-2 text-sm text-muted">
          Codigo de alumno: <span className="font-semibold text-foreground">{student.student_code}</span>
        </p>
      ) : null}
      <form action={formAction} className="mt-6 space-y-4">
        {redirectTarget ? <input type="hidden" name="redirectTo" value={redirectTarget} /> : null}
        {student ? <input type="hidden" name="profileId" value={student.id} /> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nombre completo</label>
            <input
              name="fullName"
              defaultValue={student?.full_name || ""}
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="Nombre y apellido"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Email</label>
            <input
              type="email"
              name="email"
              required
              defaultValue={student?.email || ""}
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="correo@institucion.com"
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">DNI (opcional)</label>
            <input
              name="dni"
              defaultValue={student?.dni || ""}
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="Documento"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Celular (opcional)</label>
            <input
              name="phone"
              defaultValue={student?.phone || ""}
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="51999999999"
            />
          </div>
        </div>
        <div className="grid gap-4">
          <BirthDatePicker defaultValue={student?.birth_date || ""} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Tipo de curso</label>
            <select
              name="courseType"
              defaultValue={defaultType}
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option className="text-foreground" value="regular">
                Regular
              </option>
              <option className="text-foreground" value="premium">
                Premium
              </option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Nota admin (0-100)
            </label>
            <input
              type="number"
              name="studentGrade"
              min="0"
              max="100"
              step="0.1"
              defaultValue={student?.student_grade ?? ""}
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="Ej: 85.5"
            />
            <p className="text-[11px] text-muted">
              Esta nota representa el 50% de la nota final del curso.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Comision</label>
          <select
            name="commissionId"
            defaultValue={student?.commission_id || ""}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          >
            <option className="text-foreground" value="">
              Selecciona una comision
            </option>
            {commissionOptions.map((commission) => (
              <option key={commission.id} className="text-foreground" value={commission.id}>
                {formatCommissionLabel(commission)}
              </option>
            ))}
          </select>
        </div>

        {state?.error ? (
          <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">
            {state.error}
          </p>
        ) : null}
        {state?.success && !onSuccess ? (
          <p className="rounded-2xl border border-success/40 bg-success/10 px-4 py-2 text-xs text-success">
            {state.message || "Alumno guardado correctamente."}
          </p>
        ) : null}

        <button
          type="submit"
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/30 transition hover:bg-primary-2"
        >
          {buttonLabel}
        </button>
      </form>
    </>
  );

  if (embedded) {
    return <div className="text-foreground">{content}</div>;
  }

  return <div className="rounded-3xl border border-border bg-surface p-6 text-foreground shadow-xl backdrop-blur">{content}</div>;
}
