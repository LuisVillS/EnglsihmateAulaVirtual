"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEnrollmentFrequencyLabel } from "@/lib/frequency-labels";

const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_WA_URL || "https://wa.me/";

const TERMS_TEXT = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
`;

const STEPS = [
  { key: "selection", label: "Seleccion" },
  { key: "terms", label: "Terminos" },
  { key: "summary", label: "Preconfirmacion" },
  { key: "payment", label: "Pago" },
];

const PAYMENT_OPTIONS = [
  { value: "MERCADOPAGO", label: "Mercado Pago - Credito/Debito", subtitle: "Pago con tarjeta" },
  { value: "YAPE_PLIN", label: "Yape / Plin - Transferencia", subtitle: "Pago por transferencia" },
];

const PAYMENT_CONFIRMATION_OPTIONS = [
  { value: "OPERATION", label: "Confirmar con numero de operacion" },
  { value: "PROOF", label: "Confirmar con captura del pago" },
];

const PRICE_CARD_CLASS = "rounded-2xl border border-success/40 bg-success/10 p-5";
const PRICE_LABEL_CLASS = "text-xs uppercase tracking-[0.24em] text-success";
const PRICE_VALUE_CLASS = "mt-2 text-5xl font-black leading-none text-success";

const MONTH_LABELS = [
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

function formatSchedule(schedule) {
  if (!schedule) return "-";
  const days = schedule.days_of_week ? `${schedule.days_of_week}` : "";
  const hours = [schedule.start_time, schedule.end_time].filter(Boolean).join(" - ");
  return `${days} ${hours}`.trim();
}

function formatTimer(expiresAt) {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "00:00";
  const min = Math.floor(remaining / 60000)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}`;
}

function Field({ label, children }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function SelectField(props) {
  return (
    <select
      {...props}
      className={`w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none ring-0 transition placeholder:text-muted focus:border-primary ${
        props.className || ""
      }`}
    />
  );
}

function parseMonthValue(value) {
  if (!value) return null;
  const [yearRaw, monthRaw] = value.toString().slice(0, 7).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function formatMonthValue(year, month) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function formatMonthLabel(value) {
  const parsed = parseMonthValue(value);
  if (!parsed) return "-";
  const label = MONTH_LABELS[parsed.month - 1] || String(parsed.month).padStart(2, "0");
  return `${label} ${parsed.year}`;
}

function formatCourseType(value) {
  const normalized = (value || "").toString().toUpperCase();
  if (normalized === "PREMIUM") return "Premium";
  if (normalized === "REGULAR") return "Regular";
  if (normalized === "premium") return "Premium";
  if (normalized === "regular") return "Regular";
  return "-";
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StartMonthPicker({ value, onChange, options = [] }) {
  const parsed = parseMonthValue(value);
  const [open, setOpen] = useState(false);
  const selectedValue = parsed ? formatMonthValue(parsed.year, parsed.month) : "";
  const selectedOption = options.find((option) => option.value === selectedValue) || null;
  const firstOption = options[0] || null;
  const lastOption = options[options.length - 1] || null;
  const hasOptions = options.length > 0;

  useEffect(() => {
    if (!value) return;
    if (options.some((option) => option.value === value)) return;
    onChange("");
  }, [value, options, onChange]);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        disabled={!hasOptions}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Mes de inicio</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">
            {selectedOption?.label || (hasOptions ? "Selecciona" : "Sin meses disponibles")}
          </p>
        </div>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-2 text-foreground transition ${
            open ? "rotate-180" : ""
          }`}
        >
          v
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">
          <p className="text-xs text-muted">
            Disponible desde <span className="font-semibold text-foreground">{firstOption?.label || "-"}</span> hasta{" "}
            <span className="font-semibold text-foreground">{lastOption?.label || "-"}</span>
          </p>

          <div className="max-h-[13.75rem] overflow-y-auto pr-1 md:max-h-none">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {options.map((option) => {
                const selected = option.value === selectedValue;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface-2 text-foreground hover:border-primary/60"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function MatriculaPage() {
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resettingExpiredReservation, setResettingExpiredReservation] = useState(false);
  const [error, setError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [centerNotice, setCenterNotice] = useState(null);
  const [reservationExpiredNotice, setReservationExpiredNotice] = useState(false);
  const [step, setStep] = useState("selection");
  const [preEnrollment, setPreEnrollment] = useState(null);
  const [levels, setLevels] = useState([]);
  const [startMonths, setStartMonths] = useState([]);
  const [frequencies, setFrequencies] = useState([]);
  const [courses, setCourses] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [summary, setSummary] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [paymentFile, setPaymentFile] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentConfirmationMode, setPaymentConfirmationMode] = useState("");
  const [operationCode, setOperationCode] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [openingCheckout, setOpeningCheckout] = useState(false);
  const [reserveCountdown, setReserveCountdown] = useState(null);
  const optionsCacheRef = useRef(new Map());
  const optionsRequestIdRef = useRef(0);

  const [selection, setSelection] = useState({
    level: "",
    frequency: "",
    courseId: "",
    startTime: "",
    courseType: "regular",
    startMonth: "",
  });

  const amount = useMemo(() => {
    if (summary?.price_total != null) return Number(summary.price_total) || 0;
    if (preEnrollment?.price_total != null) return Number(preEnrollment.price_total) || 0;
    return selection.courseType === "premium" ? 139 : 99;
  }, [summary?.price_total, preEnrollment?.price_total, selection.courseType]);
  const activeStepIndex = Math.max(
    0,
    STEPS.findIndex((item) => item.key === step)
  );

  const applyOptionsPayload = useCallback((payload, { preservePreEnrollment = false } = {}) => {
    if (!preservePreEnrollment) {
      setPreEnrollment(payload.preEnrollment || null);
    }
    setStartMonths(payload.startMonths || []);
    setLevels(payload.levels || []);
    setFrequencies(payload.frequencies || []);
    setCourses(payload.courses || []);
    setSchedules(payload.schedules || []);
  }, []);

  function buildOptionsQuery({
    startMonth = selection.startMonth,
    level = selection.level,
    frequency = selection.frequency,
    courseId = selection.courseId,
  } = {}) {
    const params = new URLSearchParams();
    if (startMonth) params.set("startMonth", startMonth);
    if (level) params.set("level", level);
    if (frequency) params.set("frequency", frequency);
    if (courseId) params.set("courseId", courseId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }

  const loadOptions = useCallback(async (params = "") => {
    if (params && optionsCacheRef.current.has(params)) {
      const cachedPayload = optionsCacheRef.current.get(params);
      applyOptionsPayload(cachedPayload, { preservePreEnrollment: true });
      setOptionsLoading(false);
      return cachedPayload;
    }

    const requestId = optionsRequestIdRef.current + 1;
    optionsRequestIdRef.current = requestId;
    setOptionsLoading(true);

    try {
      const response = await fetch(`/api/matricula/options${params}`);
      const payload = await response.json();
      if (!response.ok) {
        if (requestId !== optionsRequestIdRef.current) {
          return null;
        }
        throw new Error(payload.error || "No se pudieron cargar opciones.");
      }
      if (params) {
        optionsCacheRef.current.set(params, {
          startMonths: payload.startMonths || [],
          levels: payload.levels || [],
          frequencies: payload.frequencies || [],
          courses: payload.courses || [],
          schedules: payload.schedules || [],
        });
      }
      if (requestId === optionsRequestIdRef.current) {
        applyOptionsPayload(payload);
      }
      return payload;
    } catch (err) {
      if (requestId !== optionsRequestIdRef.current) {
        return null;
      }
      throw err;
    } finally {
      if (requestId === optionsRequestIdRef.current) {
        setOptionsLoading(false);
      }
    }
  }, [applyOptionsPayload]);

  useEffect(() => {
    loadOptions()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadOptions]);

  useEffect(() => {
    if (!preEnrollment?.reservation_expires_at) {
      setReserveCountdown(null);
      return;
    }

    const update = () => setReserveCountdown(formatTimer(preEnrollment.reservation_expires_at));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [preEnrollment?.reservation_expires_at]);

  useEffect(() => {
    if (resettingExpiredReservation) {
      return;
    }

    const hasExpiredStatus = preEnrollment?.status === "EXPIRED";
    const hasExpiredReservation =
      preEnrollment?.reservation_expires_at &&
      new Date(preEnrollment.reservation_expires_at).getTime() <= Date.now();

    if (hasExpiredStatus || hasExpiredReservation) {
      setReservationExpiredNotice(true);
      setCenterNotice(null);
      return;
    }

    setReservationExpiredNotice(false);
  }, [preEnrollment?.status, preEnrollment?.reservation_expires_at, reserveCountdown, resettingExpiredReservation]);

  useEffect(() => {
    if (!preEnrollment) return;
    if (preEnrollment.payment_method) {
      setPaymentMethod(preEnrollment.payment_method);
    }
    const meta =
      preEnrollment.payment_proof_meta && typeof preEnrollment.payment_proof_meta === "object"
        ? preEnrollment.payment_proof_meta
        : {};
    if (meta.confirmation_mode) {
      setPaymentConfirmationMode(meta.confirmation_mode);
    }
    setOperationCode(meta.operation_code || preEnrollment.mp_payment_id || "");
    setPayerName(meta.payer_name || "");
    setPayerPhone(meta.payer_phone || "");
  }, [preEnrollment]);

  async function handleLevelChange(value) {
    setError("");
    setSelection((prev) => ({ ...prev, level: value, frequency: "", courseId: "", startTime: "" }));
    setFrequencies([]);
    setCourses([]);
    setSchedules([]);
    try {
      await loadOptions(
        buildOptionsQuery({
          startMonth: selection.startMonth,
          level: value,
          frequency: "",
          courseId: "",
        })
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFrequencyChange(value) {
    setError("");
    setSelection((prev) => ({ ...prev, frequency: value, courseId: "", startTime: "" }));
    setCourses([]);
    setSchedules([]);
    try {
      await loadOptions(
        buildOptionsQuery({
          startMonth: selection.startMonth,
          level: selection.level,
          frequency: value,
          courseId: "",
        })
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCourseChange(value) {
    setError("");
    setSelection((prev) => ({ ...prev, courseId: value, startTime: "" }));
    setSchedules([]);

    if (!value) {
      return;
    }

    try {
      await loadOptions(
        buildOptionsQuery({
          startMonth: selection.startMonth,
          level: selection.level,
          frequency: selection.frequency,
          courseId: value,
        })
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStartMonthChange(value) {
    setError("");
    setSelection((prev) => ({
      ...prev,
      startMonth: value,
      level: "",
      frequency: "",
      courseId: "",
      startTime: "",
    }));
    setLevels([]);
    setFrequencies([]);
    setCourses([]);
    setSchedules([]);

    if (!value) {
      try {
        await loadOptions();
      } catch (err) {
        setError(err.message);
      }
      return;
    }

    try {
      await loadOptions(buildOptionsQuery({ startMonth: value, level: "", frequency: "", courseId: "" }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSelectionContinue() {
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/matricula/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: selection.level,
          frequency: selection.frequency,
          courseId: selection.courseId || null,
          startTime: selection.startTime || null,
          courseType: selection.courseType,
          startMonth: selection.startMonth || null,
          startReservation: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo guardar la seleccion.");
      setPreEnrollment(payload.preEnrollment || null);
      setStep("terms");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTermsContinue() {
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/matricula/accept-terms", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo aceptar terminos.");
      setPreEnrollment(payload.preEnrollment || null);
      setSummary(payload.summary || null);
      setStep("summary");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenMercadoPago() {
    setError("");
    setUploadMessage("");
    setOpeningCheckout(true);
    try {
      const response = await fetch("/api/matricula/payment/create-mercadopago", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo abrir Mercado Pago.");
      if (payload.preEnrollment) {
        setPreEnrollment(payload.preEnrollment);
      }
      if (!payload.checkoutUrl) {
        throw new Error("No se encontro el enlace de Mercado Pago.");
      }

      const popup = window.open(payload.checkoutUrl, "mercadopago_checkout", "width=540,height=760");
      if (!popup) {
        window.open(payload.checkoutUrl, "_blank", "noopener,noreferrer");
      }

      setUploadMessage("Mercado Pago abierto. Completa el pago y luego registra el numero de operacion.");
    } catch (err) {
      setError(err.message);
    } finally {
      setOpeningCheckout(false);
    }
  }

  async function handleSubmitPayment(event) {
    event.preventDefault();
    setError("");
    setUploadMessage("");
    const cleanOperationCode = operationCode.trim();
    const cleanPayerName = payerName.trim();
    const cleanPayerPhone = payerPhone.trim();

    if (!paymentMethod) {
      setError("Selecciona un metodo de pago para continuar.");
      return;
    }

    if (!paymentConfirmationMode) {
      setError("Selecciona como vas a confirmar el pago.");
      return;
    }

    if (
      paymentMethod === "YAPE_PLIN" &&
      paymentConfirmationMode === "OPERATION" &&
      (!cleanPayerName || !cleanPayerPhone)
    ) {
      setError("En Yape/Plin el nombre y telefono del pagador son obligatorios.");
      return;
    }

    if (paymentConfirmationMode === "OPERATION" && paymentMethod === "MERCADOPAGO" && !cleanOperationCode) {
      setError("Ingresa el numero de operacion para confirmar el pago.");
      return;
    }
    if (paymentConfirmationMode === "PROOF" && !paymentFile && !preEnrollment?.payment_proof_url) {
      setError("Adjunta una captura para confirmar el pago.");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("paymentMethod", paymentMethod);
      formData.append("paymentConfirmationMode", paymentConfirmationMode);
      formData.append("operationCode", cleanOperationCode);
      formData.append("payerName", cleanPayerName);
      formData.append("payerPhone", cleanPayerPhone);
      if (paymentFile) {
        formData.append("file", paymentFile);
      }
      const response = await fetch("/api/matricula/payment/upload-proof", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo subir el comprobante.");
      setPreEnrollment(payload.preEnrollment || null);
      setUploadMessage("");
      setCenterNotice({
        title: "Tu reserva fue realizada correctamente",
        description: "Tu pago fue enviado y quedo pendiente de revision del equipo.",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestartMatricula() {
    setError("");
    setResettingExpiredReservation(true);
    setReservationExpiredNotice(false);
    setCenterNotice(null);
    try {
      const response = await fetch("/api/matricula/reset-expired", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo reiniciar la matricula.");
      }

      setPreEnrollment(payload.preEnrollment || null);
      optionsCacheRef.current.clear();
      setStep("selection");
      setSummary(null);
      setTermsAccepted(false);
      setPaymentMethod("");
      setPaymentConfirmationMode("");
      setOperationCode("");
      setPayerName("");
      setPayerPhone("");
      setPaymentFile(null);

      await loadOptions();
    } catch (err) {
      setError(err.message || "No se pudo reiniciar la matricula.");
      setReservationExpiredNotice(true);
    } finally {
      setResettingExpiredReservation(false);
    }
  }

  const isStartMonthAllowed = startMonths.some((month) => month.value === selection.startMonth);
  const canContinueSelection =
    Boolean(selection.level) &&
    Boolean(selection.frequency) &&
    Boolean(selection.courseId) &&
    Boolean(selection.startTime) &&
    Boolean(selection.startMonth) &&
    isStartMonthAllowed;
  const canSubmitPayment =
    !paymentMethod
      ? false
      : !paymentConfirmationMode
      ? false
      : paymentMethod === "YAPE_PLIN" &&
        paymentConfirmationMode === "OPERATION" &&
        (!payerName.trim() || !payerPhone.trim())
      ? false
      : paymentConfirmationMode === "OPERATION"
      ? paymentMethod === "MERCADOPAGO"
        ? Boolean(operationCode.trim())
        : true
      : Boolean(paymentFile || preEnrollment?.payment_proof_url);

  const summaryCourseTypeLabel = formatCourseType(
    summary?.course_type || preEnrollment?.selected_course_type || selection.courseType
  );
  const summaryFrequencyLabel = formatEnrollmentFrequencyLabel(
    summary?.frequency || preEnrollment?.selected_frequency || selection.frequency
  );
  const summaryStartMonthLabel = formatMonthLabel(
    summary?.start_month || preEnrollment?.start_month || selection.startMonth
  );
  const isPendingReview = ["PAYMENT_SUBMITTED", "PAID_AUTO"].includes(preEnrollment?.status);
  const selectionHint = useMemo(() => {
    if (!startMonths.length) {
      return "No hay meses con comisiones activas disponibles.";
    }
    if (!selection.startMonth) {
      return "Primero elige el mes de inicio para mostrar niveles, frecuencia y horarios disponibles.";
    }
    if (!levels.length) {
      return "No hay niveles disponibles para el mes seleccionado.";
    }
    if (!selection.level) {
      return "Selecciona un nivel para ver las frecuencias disponibles.";
    }
    if (!frequencies.length) {
      return "No hay frecuencias disponibles para ese nivel en el mes elegido.";
    }
    if (!selection.frequency) {
      return "Selecciona una frecuencia para ver los cursos disponibles.";
    }
    if (!selection.courseId) {
      return "Selecciona un curso para ver horarios disponibles.";
    }
    if (!schedules.length) {
      return "No hay horarios disponibles para ese nivel/frecuencia en el mes seleccionado. Prueba otra combinacion.";
    }
    return "";
  }, [
    startMonths,
    selection.startMonth,
    levels,
    selection.level,
    frequencies,
    selection.frequency,
    selection.courseId,
    schedules,
  ]);

  if (loading) {
    return <div className="min-h-screen bg-background px-6 py-12 text-foreground">Cargando...</div>;
  }

  if (isPendingReview) {
    return (
      <section className="relative min-h-screen overflow-hidden bg-background px-6 py-12 text-foreground">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-20 h-80 w-80 rounded-full bg-primary/20 blur-[130px]" />
          <div className="absolute bottom-0 right-0 h-[26rem] w-[26rem] rounded-full bg-primary/12 blur-[150px]" />
        </div>
        <div className="relative mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center">
          <div className="w-full rounded-3xl border border-primary/35 bg-surface p-8 text-center shadow-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-primary">Estado de matricula</p>
            <h1 className="mt-3 text-3xl font-semibold text-foreground">Matricula enviada</h1>
            <p className="mt-3 text-sm text-muted">
              No puedes realizar otro registro hasta que el equipo revise tu pago.
            </p>
            <p className="mt-4 text-sm text-muted">
              Fecha de envio:{" "}
              <span className="font-semibold text-foreground">
                {formatDateTime(preEnrollment?.payment_submitted_at)}
              </span>
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
              >
                Soporte
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-12 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-20 h-80 w-80 rounded-full bg-primary/20 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[26rem] w-[26rem] rounded-full bg-primary/12 blur-[150px]" />
      </div>

      {reservationExpiredNotice ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-primary/40 bg-surface p-8 text-center shadow-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-primary">Aviso</p>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">Tu tiempo de reserva termino</h2>
            <p className="mt-3 text-sm text-muted">
              Para continuar, debes iniciar nuevamente tu matricula y elegir tu horario otra vez.
            </p>
            <button
              type="button"
              onClick={handleRestartMatricula}
              disabled={resettingExpiredReservation}
              className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              {resettingExpiredReservation ? "Reiniciando..." : "Volver a empezar mi matricula"}
            </button>
          </div>
        </div>
      ) : null}

      {centerNotice && !reservationExpiredNotice ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-success/40 bg-surface p-8 text-center shadow-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-success">Notificacion</p>
            <h2 className="mt-3 text-3xl font-semibold text-foreground">{centerNotice.title}</h2>
            <p className="mt-3 text-sm text-muted">{centerNotice.description}</p>
            <button
              type="button"
              onClick={() => setCenterNotice(null)}
              className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative mx-auto w-full max-w-5xl space-y-5">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.42em] text-muted">Matricula</p>
          <h1 className="text-3xl font-semibold text-foreground">Completa tu matricula</h1>
          <p className="text-sm text-muted">Selecciona tu horario, acepta terminos y sube tu comprobante.</p>
        </header>

        {preEnrollment?.reservation_expires_at ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-xs text-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            Reserva activa
            <span className="font-bold">{reserveCountdown || "--:--"}</span>
          </div>
        ) : null}
        {preEnrollment?.status === "REJECTED" ? (
          <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
            Tu envio no fue aprobado. Puedes volver a completar los pasos de matricula.
            <button
              type="button"
              onClick={handleRestartMatricula}
              disabled={resettingExpiredReservation}
              className="ml-3 rounded-full border border-border px-4 py-1.5 text-xs font-semibold transition hover:border-primary"
            >
              {resettingExpiredReservation ? "Reiniciando..." : "Volver a intentar"}
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-foreground">{error}</div>
        ) : null}
        {uploadMessage ? (
          <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
            {uploadMessage}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-2 md:grid-cols-4">
          {STEPS.map((item, index) => {
            const isActive = item.key === step;
            const isDone = index < activeStepIndex;
            return (
              <div
                key={item.key}
                className={`rounded-xl px-3 py-2 text-xs transition ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-primary/15 text-primary"
                      : "bg-surface-2 text-muted"
                }`}
              >
                <p className="font-bold">{index + 1}</p>
                <p>{item.label}</p>
              </div>
            );
          })}
        </div>

        <div className="min-h-[590px] rounded-3xl border border-border bg-surface p-6 shadow-2xl shadow-black/30 md:p-8">
          {step === "selection" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Paso 1: Seleccion</h2>
                <p className="text-sm text-muted">El sistema asigna la comision automaticamente.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Mes de inicio">
                  <StartMonthPicker
                    value={selection.startMonth}
                    options={startMonths}
                    onChange={handleStartMonthChange}
                  />
                </Field>

                <Field label="Nivel">
                  <SelectField
                    value={selection.level}
                    onChange={(event) => handleLevelChange(event.target.value)}
                    disabled={!selection.startMonth || !levels.length || optionsLoading}
                  >
                    <option value="">Selecciona</option>
                    {levels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </SelectField>
                </Field>

                <Field label="Frecuencia">
                  <SelectField
                    value={selection.frequency}
                    onChange={(event) => handleFrequencyChange(event.target.value)}
                    disabled={!selection.startMonth || !selection.level || !frequencies.length || optionsLoading}
                  >
                    <option value="">Selecciona</option>
                    {frequencies.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </SelectField>
                </Field>

                <Field label="Curso">
                  <SelectField
                    value={selection.courseId}
                    onChange={(event) => handleCourseChange(event.target.value)}
                    disabled={
                      !selection.startMonth || !selection.level || !selection.frequency || !courses.length || optionsLoading
                    }
                  >
                    <option value="">Selecciona</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.label}
                      </option>
                    ))}
                  </SelectField>
                </Field>

                <Field label="Horario">
                  <SelectField
                    value={selection.startTime}
                    onChange={(event) => setSelection((prev) => ({ ...prev, startTime: event.target.value }))}
                    disabled={
                      !selection.startMonth ||
                      !selection.level ||
                      !selection.frequency ||
                      !selection.courseId ||
                      !schedules.length ||
                      optionsLoading
                    }
                  >
                    <option value="">Selecciona</option>
                    {schedules.map((schedule) => (
                      <option key={schedule.id} value={schedule.start_time}>
                        {schedule.label}
                      </option>
                    ))}
                  </SelectField>
                  {selection.frequency && !selection.courseId ? (
                    <p className="text-xs text-muted">Selecciona un curso para ver horarios disponibles.</p>
                  ) : null}
                </Field>

                <Field label="Tipo de curso">
                  <SelectField
                    value={selection.courseType}
                    onChange={(event) => setSelection((prev) => ({ ...prev, courseType: event.target.value }))}
                  >
                    <option value="regular">Regular</option>
                    <option value="premium">Premium</option>
                  </SelectField>
                </Field>
              </div>

              {optionsLoading ? (
                <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
                  Actualizando opciones disponibles...
                </div>
              ) : null}

              {selectionHint ? (
                <div className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-xs text-foreground">
                  {selectionHint}
                </div>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!canContinueSelection || saving}
                  onClick={handleSelectionContinue}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Continuar"}
                </button>
              </div>
            </div>
          ) : null}

          {step === "terms" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Paso 2: Terminos y condiciones</h2>
                <p className="text-sm text-muted">Debes aceptar los terminos para continuar.</p>
              </div>

              <div className="h-72 overflow-y-auto rounded-2xl border border-border bg-background/70 p-4 text-sm leading-7 text-foreground whitespace-pre-line">
                {TERMS_TEXT}
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Acepto terminos y condiciones
              </label>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep("selection")}
                  className="rounded-full border border-border px-5 py-2.5 text-sm text-foreground hover:border-primary"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={!termsAccepted || saving}
                  onClick={handleTermsContinue}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Procesando..." : "Continuar"}
                </button>
              </div>
            </div>
          ) : null}

          {step === "summary" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Paso 3: Preconfirmacion</h2>
                <p className="text-sm text-muted">Revisa la informacion antes de pagar.</p>
              </div>

              <div className={PRICE_CARD_CLASS}>
                <p className={PRICE_LABEL_CLASS}>Monto a pagar</p>
                <p className={PRICE_VALUE_CLASS}>S/ {amount}</p>
              </div>

              <div className="grid gap-3 rounded-2xl border border-border bg-background/60 p-4 text-sm text-foreground md:grid-cols-2">
                <p>Nivel: <span className="font-semibold text-foreground">{summary?.level || preEnrollment?.selected_level || "-"}</span></p>
                <p>Frecuencia: <span className="font-semibold text-foreground">{summaryFrequencyLabel}</span></p>
                <p>Horario: <span className="font-semibold text-foreground">{formatSchedule(summary?.schedule)}</span></p>
                <p>Tipo: <span className="font-semibold text-foreground">{summaryCourseTypeLabel}</span></p>
                <p>Mes de inicio: <span className="font-semibold text-foreground">{summaryStartMonthLabel}</span></p>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep("terms")}
                  className="rounded-full border border-border px-5 py-2.5 text-sm text-foreground hover:border-primary"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={() => setStep("payment")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-2"
                >
                  Continuar a pago
                </button>
              </div>
            </div>
          ) : null}

          {step === "payment" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Paso 4: Pago</h2>
                <p className="text-sm text-muted">Elige metodo de pago y registra la operacion para revision.</p>
              </div>

              <div className={PRICE_CARD_CLASS}>
                <p className={PRICE_LABEL_CLASS}>Monto a pagar</p>
                <p className={PRICE_VALUE_CLASS}>S/ {amount}</p>
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Metodo de pago</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {PAYMENT_OPTIONS.map((option) => {
                    const checked = paymentMethod === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`cursor-pointer rounded-2xl border p-4 text-left transition ${
                          checked
                            ? "border-primary bg-primary/10"
                            : "border-border bg-surface hover:border-primary/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment-method"
                          value={option.value}
                          checked={checked}
                          onChange={(event) => {
                            const nextMethod = event.target.value;
                            setPaymentMethod(nextMethod);
                            setPaymentFile(null);
                            setError("");
                            if (nextMethod === "MERCADOPAGO") {
                              void handleOpenMercadoPago();
                            }
                          }}
                          className="sr-only"
                        />
                        <p className="text-xs uppercase tracking-[0.22em] text-muted">{option.subtitle}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{option.label}</p>
                      </label>
                    );
                  })}
                </div>
              </div>

              {!paymentMethod ? (
                <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
                  Debes elegir uno de los dos metodos de pago.
                </div>
              ) : null}

              {paymentMethod ? (
                <div className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Confirmacion de pago</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {PAYMENT_CONFIRMATION_OPTIONS.map((option) => {
                      const checked = paymentConfirmationMode === option.value;
                      return (
                        <label
                          key={option.value}
                          className={`cursor-pointer rounded-2xl border p-4 text-left transition ${
                            checked
                              ? "border-primary bg-primary/10"
                              : "border-border bg-surface hover:border-primary/50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="payment-confirmation-mode"
                            value={option.value}
                            checked={checked}
                            onChange={(event) => {
                              setPaymentConfirmationMode(event.target.value);
                              setError("");
                            }}
                            className="sr-only"
                          />
                          <p className="text-sm font-semibold text-foreground">{option.label}</p>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {paymentMethod === "MERCADOPAGO" ? (
                <div className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
                  <p className="text-sm text-muted">
                    Mercado Pago se abre automaticamente al seleccionarlo. Completa el pago y pega aqui el numero de operacion.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenMercadoPago}
                    disabled={openingCheckout}
                    className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {openingCheckout ? "Abriendo..." : "No pudiste realizar el pago? Abre este Mercado Pago"}
                  </button>
                </div>
              ) : null}

              <form onSubmit={handleSubmitPayment} className="space-y-4">
                {paymentConfirmationMode === "OPERATION" ? (
                  <>
                    <Field label="Numero de operacion">
                      <input
                        type="text"
                        value={operationCode}
                        onChange={(event) => setOperationCode(event.target.value)}
                        placeholder={
                          paymentMethod === "YAPE_PLIN" ? "Ejemplo: 123456789 (opcional)" : "Ejemplo: 123456789"
                        }
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary"
                      />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label={paymentMethod === "YAPE_PLIN" ? "Nombre del pagador (obligatorio)" : "Nombre del pagador (opcional)"}>
                        <input
                          type="text"
                          value={payerName}
                          onChange={(event) => setPayerName(event.target.value)}
                          placeholder="Nombre completo"
                          required={paymentMethod === "YAPE_PLIN"}
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary"
                        />
                      </Field>
                      <Field label={paymentMethod === "YAPE_PLIN" ? "Telefono del pagador (obligatorio)" : "Telefono del pagador (opcional)"}>
                        <input
                          type="tel"
                          value={payerPhone}
                          onChange={(event) => setPayerPhone(event.target.value)}
                          placeholder="9xxxxxxxx"
                          required={paymentMethod === "YAPE_PLIN"}
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary"
                        />
                      </Field>
                    </div>
                  </>
                ) : null}

                {paymentConfirmationMode === "PROOF" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Nombre del pagador (opcional)">
                      <input
                        type="text"
                        value={payerName}
                        onChange={(event) => setPayerName(event.target.value)}
                        placeholder="Nombre completo"
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary"
                      />
                    </Field>
                    <Field label="Telefono del pagador (opcional)">
                      <input
                        type="tel"
                        value={payerPhone}
                        onChange={(event) => setPayerPhone(event.target.value)}
                        placeholder="9xxxxxxxx"
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary"
                      />
                    </Field>
                  </div>
                ) : null}

                {paymentConfirmationMode === "PROOF" ? (
                  <Field label="Captura del pago (obligatoria)">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(event) => setPaymentFile(event.target.files?.[0] || null)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
                    />
                  </Field>
                ) : null}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep("summary")}
                    className="rounded-full border border-border px-5 py-2.5 text-sm text-foreground hover:border-primary"
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !canSubmitPayment}
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Enviando..." : "Enviar pago para revision"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
