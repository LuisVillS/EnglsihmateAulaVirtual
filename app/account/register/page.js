"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function getTodayIsoLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value) {
  if (!value || typeof value !== "string") return null;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatIsoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function weekdayOffset(year, month) {
  const jsDay = new Date(year, month - 1, 1).getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function formatBirthDateLabel(value) {
  const parsed = parseIsoDate(value);
  if (!parsed) return "Selecciona fecha";
  return `${String(parsed.day).padStart(2, "0")} ${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

function getDayRange(year, month, parsedMinDate, parsedMaxDate) {
  let minDay = 1;
  let maxDay = daysInMonth(year, month);

  if (parsedMinDate && year === parsedMinDate.year && month === parsedMinDate.month) {
    minDay = parsedMinDate.day;
  }
  if (parsedMaxDate && year === parsedMaxDate.year && month === parsedMaxDate.month) {
    maxDay = Math.min(maxDay, parsedMaxDate.day);
  }

  return { minDay, maxDay };
}

function clampDay(day, minDay, maxDay) {
  const numeric = Number(day) || minDay;
  return Math.min(Math.max(numeric, minDay), maxDay);
}

function BirthDateDropdown({ value, onChange, maxDate }) {
  const wrapperRef = useRef(null);
  const parsedValue = parseIsoDate(value);
  const parsedMaxDate = parseIsoDate(maxDate);
  const currentYear = parsedMaxDate?.year || new Date().getFullYear();

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(parsedValue?.year || currentYear);
  const [viewMonth, setViewMonth] = useState(parsedValue?.month || (parsedMaxDate?.month || 1));

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const yearOptions = useMemo(() => {
    const minYear = 1940;
    const length = Math.max(1, currentYear - minYear + 1);
    return Array.from({ length }, (_, index) => currentYear - index);
  }, [currentYear]);

  const monthDays = daysInMonth(viewYear, viewMonth);
  const offset = weekdayOffset(viewYear, viewMonth);
  const displayLabel = parsedValue
    ? `${String(parsedValue.day).padStart(2, "0")} ${MONTH_NAMES[parsedValue.month - 1]} ${parsedValue.year}`
    : "Selecciona fecha";
  const cells = Array.from({ length: offset + monthDays }, (_, index) => {
    if (index < offset) return null;
    return index - offset + 1;
  });

  function isFutureDate(day) {
    if (!parsedMaxDate) return false;
    const candidate = formatIsoDate(viewYear, viewMonth, day);
    return candidate > maxDate;
  }

  function handlePickDay(day) {
    if (isFutureDate(day)) return;
    onChange(formatIsoDate(viewYear, viewMonth, day));
    setOpen(false);
  }

  function shiftMonth(direction) {
    const next = new Date(viewYear, viewMonth - 1 + direction, 1);
    const nextYear = next.getFullYear();
    const nextMonth = next.getMonth() + 1;
    if (parsedMaxDate) {
      if (nextYear > parsedMaxDate.year) return;
      if (nextYear === parsedMaxDate.year && nextMonth > parsedMaxDate.month) return;
    }
    if (nextYear < 1940) return;
    setViewYear(nextYear);
    setViewMonth(nextMonth);
  }

  const canGoNext = !parsedMaxDate
    ? true
    : viewYear < parsedMaxDate.year || (viewYear === parsedMaxDate.year && viewMonth < parsedMaxDate.month);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open) {
            if (parsedValue) {
              setViewYear(parsedValue.year);
              setViewMonth(parsedValue.month);
            } else if (parsedMaxDate) {
              setViewYear(parsedMaxDate.year);
              setViewMonth(parsedMaxDate.month);
            }
          }
          setOpen((prev) => !prev);
        }}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-3 text-left text-sm text-foreground transition hover:border-primary"
      >
        <span className={parsedValue ? "text-foreground" : "text-muted"}>{displayLabel}</span>
        <span className={`text-xs text-muted transition ${open ? "rotate-180" : ""}`}>v</span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full min-w-[18rem] rounded-2xl border border-border bg-surface p-4 shadow-em">
          <div className="mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-xl border border-border px-2 py-1 text-sm text-foreground transition hover:border-primary"
            >
              {"<"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={viewMonth}
                onChange={(event) => {
                  const nextMonth = Number(event.target.value);
                  if (
                    parsedMaxDate &&
                    viewYear === parsedMaxDate.year &&
                    nextMonth > parsedMaxDate.month
                  ) {
                    setViewMonth(parsedMaxDate.month);
                    return;
                  }
                  setViewMonth(nextMonth);
                }}
                className="rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
              >
                {MONTH_NAMES.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(event) => {
                  const nextYear = Number(event.target.value);
                  setViewYear(nextYear);
                  if (
                    parsedMaxDate &&
                    nextYear === parsedMaxDate.year &&
                    viewMonth > parsedMaxDate.month
                  ) {
                    setViewMonth(parsedMaxDate.month);
                  }
                }}
                className="rounded-xl border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              disabled={!canGoNext}
              className="rounded-xl border border-border px-2 py-1 text-sm text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {">"}
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-muted">
            {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} className="h-8" />;
              const selected =
                parsedValue?.year === viewYear &&
                parsedValue?.month === viewMonth &&
                parsedValue?.day === day;
              const disabled = isFutureDate(day);
              return (
                <button
                  key={`${viewYear}-${viewMonth}-${day}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePickDay(day)}
                  className={`h-8 rounded-lg text-xs font-semibold transition ${
                    selected
                      ? "bg-primary text-primary-foreground"
                      : disabled
                        ? "cursor-not-allowed bg-surface-2 text-muted/60"
                        : "bg-surface-2 text-foreground hover:border hover:border-primary/50"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BirthDateField({ value, onChange, maxDate }) {
  const minDate = "1940-01-01";

  return (
    <div className="space-y-2">
      <div className="hidden md:block">
        <BirthDateDropdown value={value} onChange={onChange} maxDate={maxDate} />
        <input type="hidden" name="birthDate" value={value} required />
      </div>
      <div className="md:hidden">
        <MobileBirthDatePicker value={value} onChange={onChange} minDate={minDate} maxDate={maxDate} />
        <input type="hidden" name="birthDate" value={value} required />
      </div>
    </div>
  );
}

function MobileBirthDatePicker({ value, onChange, minDate, maxDate }) {
  const parsedValue = parseIsoDate(value);
  const parsedMinDate = parseIsoDate(minDate);
  const parsedMaxDate = parseIsoDate(maxDate);
  const fallbackYear = parsedMaxDate ? Math.max(parsedMinDate?.year || 1940, parsedMaxDate.year - 18) : 2005;

  const [open, setOpen] = useState(false);
  const [draftYear, setDraftYear] = useState(parsedValue?.year || fallbackYear);
  const [draftMonth, setDraftMonth] = useState(parsedValue?.month || 1);
  const [draftDay, setDraftDay] = useState(parsedValue?.day || 1);

  const dayRange = getDayRange(draftYear, draftMonth, parsedMinDate, parsedMaxDate);
  const safeDraftDay = clampDay(draftDay, dayRange.minDay, dayRange.maxDay);

  const yearOptions = useMemo(() => {
    const minYear = parsedMinDate?.year || 1940;
    const maxYear = parsedMaxDate?.year || new Date().getFullYear();
    const years = [];
    for (let year = maxYear; year >= minYear; year -= 1) {
      years.push(year);
    }
    return years;
  }, [parsedMinDate?.year, parsedMaxDate?.year]);

  const monthOptions = useMemo(() => {
    let minMonth = 1;
    let maxMonth = 12;
    if (parsedMinDate && draftYear === parsedMinDate.year) minMonth = parsedMinDate.month;
    if (parsedMaxDate && draftYear === parsedMaxDate.year) maxMonth = parsedMaxDate.month;
    const months = [];
    for (let month = minMonth; month <= maxMonth; month += 1) {
      months.push(month);
    }
    return months;
  }, [draftYear, parsedMinDate, parsedMaxDate]);

  const dayOptions = useMemo(() => {
    const days = [];
    for (let day = dayRange.minDay; day <= dayRange.maxDay; day += 1) {
      days.push(day);
    }
    return days;
  }, [dayRange.minDay, dayRange.maxDay]);

  function openPicker() {
    const parsed = parseIsoDate(value);
    const nextYear = parsed?.year || fallbackYear;
    const nextMonth = parsed?.month || 1;
    const nextDayRange = getDayRange(nextYear, nextMonth, parsedMinDate, parsedMaxDate);
    const nextDay = clampDay(parsed?.day || nextDayRange.minDay, nextDayRange.minDay, nextDayRange.maxDay);
    setDraftYear(nextYear);
    setDraftMonth(nextMonth);
    setDraftDay(nextDay);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-3 text-left text-sm text-foreground transition"
      >
        <span className={parsedValue ? "text-foreground" : "text-muted"}>{formatBirthDateLabel(value)}</span>
        <span className="text-xs text-muted">v</span>
      </button>

      <p className="text-xs text-muted">Selecciona tu fecha en 3 pasos: dia, mes y anio.</p>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50">
          <div className="w-full rounded-t-3xl border border-border bg-surface p-4 shadow-em">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Fecha de nacimiento</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">Dia</span>
                <select
                  value={safeDraftDay}
                  onChange={(event) => setDraftDay(Number(event.target.value))}
                  className="w-full rounded-xl border border-border bg-surface-2 px-2 py-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  {dayOptions.map((day) => (
                    <option key={day} value={day}>
                      {String(day).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">Mes</span>
                <select
                  value={draftMonth}
                  onChange={(event) => {
                    const nextMonth = Number(event.target.value);
                    const nextRange = getDayRange(draftYear, nextMonth, parsedMinDate, parsedMaxDate);
                    setDraftMonth(nextMonth);
                    setDraftDay((prev) => clampDay(prev, nextRange.minDay, nextRange.maxDay));
                  }}
                  className="w-full rounded-xl border border-border bg-surface-2 px-2 py-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  {monthOptions.map((month) => (
                    <option key={month} value={month}>
                      {MONTH_NAMES[month - 1]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">Anio</span>
                <select
                  value={draftYear}
                  onChange={(event) => {
                    const nextYear = Number(event.target.value);
                    let nextMonth = draftMonth;
                    if (parsedMinDate && nextYear === parsedMinDate.year && nextMonth < parsedMinDate.month) {
                      nextMonth = parsedMinDate.month;
                    }
                    if (parsedMaxDate && nextYear === parsedMaxDate.year && nextMonth > parsedMaxDate.month) {
                      nextMonth = parsedMaxDate.month;
                    }
                    const nextRange = getDayRange(nextYear, nextMonth, parsedMinDate, parsedMaxDate);
                    setDraftYear(nextYear);
                    setDraftMonth(nextMonth);
                    setDraftDay((prev) => clampDay(prev, nextRange.minDay, nextRange.maxDay));
                  }}
                  className="w-full rounded-xl border border-border bg-surface-2 px-2 py-3 text-sm text-foreground outline-none focus:border-primary"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">
              Seleccionado: {formatBirthDateLabel(formatIsoDate(draftYear, draftMonth, safeDraftDay))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(formatIsoDate(draftYear, draftMonth, safeDraftDay));
                  setOpen(false);
                }}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                Confirmar fecha
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function PreEnrollmentRegisterPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    birthDate: "",
  });
  const [emailSuggestions, setEmailSuggestions] = useState([]);

  const maxBirthDate = useMemo(() => getTodayIsoLocal(), []);

  useEffect(() => {
    const cached = window.localStorage.getItem("pre_enroll_email_history");
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        setEmailSuggestions(parsed.filter((email) => typeof email === "string"));
      }
    } catch {
      // Ignore invalid cached values.
    }
  }, []);

  async function handleRegister(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    if (!formData.birthDate) {
      setError("Selecciona tu fecha de nacimiento.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          birthDate: formData.birthDate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo registrar.");
      }
      const normalizedEmail = formData.email.trim().toLowerCase();
      const merged = Array.from(new Set([normalizedEmail, ...emailSuggestions])).filter(Boolean).slice(0, 8);
      setEmailSuggestions(merged);
      window.localStorage.setItem("pre_enroll_email_history", JSON.stringify(merged));
      const nextUrl =
        payload.loginUrl ||
        `/pre/login?code=${encodeURIComponent(payload.studentCode || normalizedEmail)}`;
      window.location.href = nextUrl;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative min-h-screen bg-background px-6 py-12 text-foreground">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="absolute left-6 top-6 z-20">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-primary/60 hover:text-foreground"
          >
            <span aria-hidden>{"<"}</span>
            Volver
          </Link>
        </div>
        <header className="space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-muted">Registro de Pre-matricula</p>
          <h1 className="text-3xl font-semibold">Completa tus datos y verifica tu correo</h1>
          <p className="text-sm text-muted">
            Este proceso te permitira reservar tu vacante y continuar con el pago.
          </p>
        </header>

        <div className="rounded-3xl border border-border bg-surface p-8 shadow-xl">
          {error ? (
            <div className="mb-4 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nombre completo</label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(event) => setFormData({ ...formData, fullName: event.target.value })}
                className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Correo</label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                list="known-emails"
                required
                value={formData.email}
                onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
              />
              <datalist id="known-emails">
                {emailSuggestions.map((email) => (
                  <option key={email} value={email} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">Celular</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                  className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Fecha de nacimiento
                </label>
                <BirthDateField
                  value={formData.birthDate}
                  maxDate={maxBirthDate}
                  onChange={(nextValue) => setFormData({ ...formData, birthDate: nextValue })}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-60"
            >
              {loading ? "Creando acceso..." : "Enviar pre-matricula"}
            </button>
            <div className="text-center text-sm text-muted">
              Ya registre mis datos.{" "}
              <Link href="/login/access" className="font-semibold text-primary hover:underline">
                Iniciar sesion
              </Link>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
