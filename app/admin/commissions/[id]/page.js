import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPageAccess } from "@/lib/admin/access";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { formatSessionDateLabel, getFrequencyReference } from "@/lib/course-sessions";
import {
  deleteCourseSessionExerciseBatch,
  deleteSessionItem,
  ensureCommissionSessions,
  sendManualZoomReminderForSession,
  upsertCommission,
  upsertCourseSessionLinks,
  upsertSessionItem,
} from "@/app/admin/actions";
import CourseForm from "@/app/admin/courses/course-form";
import StudentsManager from "./students-manager";

export const metadata = {
  title: "Editar comision | Admin",
};

const MATERIAL_TYPE_OPTIONS = [
  { value: "slides", label: "Google Slides" },
  { value: "link", label: "Enlace" },
  { value: "video", label: "Video" },
];

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

function getSessionMonthKey(session) {
  const byCycle = normalizeMonthKey(session?.cycle_month);
  if (byCycle) return byCycle;
  const byStart = normalizeMonthKey(session?.starts_at);
  if (byStart) return byStart;
  return normalizeMonthKey(session?.session_date);
}

function formatMonthLabel(value) {
  if (!value) return "Mes";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Mes";
  return new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatModalityLabel(key) {
  const map = {
    DAILY: "Diaria (L-V)",
    MWF: "LMV (Lunes, Miercoles y Viernes)",
    LMV: "LMV (Lunes, Miercoles y Viernes)",
    TT: "Martes y Jueves",
    SAT: "Sabatinos",
  };
  return map[key] || key || "-";
}

export default async function CommissionDetailPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const commissionId = params?.id?.toString();
  const { supabase } = await requireAdminPageAccess();

  await autoDeactivateExpiredCommissions();

  const { data: commission } = await supabase
    .from("course_commissions")
    .select("id, course_level, commission_number, start_date, end_date, start_month, duration_months, modality_key, days_of_week, start_time, end_time, status, is_active")
    .eq("id", commissionId)
    .maybeSingle();

  if (!commission?.id) redirect("/admin/commissions");

  const status = resolveCommissionStatus(commission, getLimaTodayISO());
  const frequencyRef = getFrequencyReference(commission.modality_key);

  let sessions = [];
  let sessionItemsBySession = new Map();
  let sessionTableAvailable = true;
  let sessionError = "";

  const sessionColumns = [
    "id",
    "cycle_month",
    "session_in_cycle",
    "session_date",
    "starts_at",
    "ends_at",
    "day_label",
    "zoom_link",
    "live_link",
    "recording_link",
    "recording_passcode",
    "recording_published_at",
    "status",
  ];
  let selectedColumns = [...sessionColumns];
  let sessionsResult = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await supabase
      .from("course_sessions")
      .select(selectedColumns.join(","))
      .eq("commission_id", commissionId)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("session_date", { ascending: true });
    sessionsResult = result;
    if (!result.error) break;
    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !selectedColumns.includes(missingColumn)) break;
    selectedColumns = selectedColumns.filter((column) => column !== missingColumn);
  }

  if (sessionsResult?.error) {
    const missingTable = String(sessionsResult.error?.message || "").includes("course_sessions");
    sessionTableAvailable = !missingTable;
    sessionError = missingTable
      ? "Falta crear la tabla course_sessions en Supabase."
      : sessionsResult.error.message || "No se pudo cargar sesiones.";
  } else {
    sessions = sessionsResult?.data || [];
  }

  const sessionIds = sessions.map((session) => session.id);
  let flashcardsBySession = new Map();
  let flashcardsTableError = "";
  if (sessionIds.length) {
    let itemColumns = ["id", "session_id", "type", "title", "url", "created_at", "note", "exercise_id"];
    let itemsResult = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase
        .from("session_items")
        .select(itemColumns.join(","))
        .in("session_id", sessionIds)
        .order("created_at", { ascending: true });
      itemsResult = result;
      if (!result.error) break;
      const missingColumn = getMissingColumnFromError(result.error);
      if (!missingColumn || !itemColumns.includes(missingColumn)) break;
      itemColumns = itemColumns.filter((column) => column !== missingColumn);
    }

    const itemRows = itemsResult?.error ? [] : itemsResult?.data || [];
    sessionItemsBySession = itemRows.reduce((acc, item) => {
      const current = acc.get(item.session_id) || [];
      current.push(item);
      acc.set(item.session_id, current);
      return acc;
    }, new Map());

    const flashcardsResult = await supabase
      .from("session_flashcards")
      .select("id, session_id")
      .in("session_id", sessionIds)
      .order("card_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (flashcardsResult.error) {
      const missingTable = getMissingTableName(flashcardsResult.error);
      flashcardsTableError = missingTable?.endsWith("session_flashcards")
        ? "Falta crear la tabla session_flashcards."
        : (flashcardsResult.error.message || "No se pudo cargar el conteo de flashcards.");
    } else {
      flashcardsBySession = (flashcardsResult.data || []).reduce((acc, row) => {
        const current = acc.get(row.session_id) || [];
        current.push(row);
        acc.set(row.session_id, current);
        return acc;
      }, new Map());
    }
  }

  const monthMap = new Map();
  sessions.forEach((session) => {
    const key = getSessionMonthKey(session) || "unknown";
    const current = monthMap.get(key) || [];
    current.push(session);
    monthMap.set(key, current);
  });
  const monthKeys = Array.from(monthMap.keys()).filter((key) => key !== "unknown").sort();
  if (monthMap.has("unknown")) monthKeys.push("unknown");

  const { data: enrolledStudents } = await supabase
    .from("profiles")
    .select("id, full_name, email, commission_assigned_at")
    .eq("commission_id", commissionId)
    .order("full_name", { ascending: true });

  const { data: candidates } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, course_level, commission_id, commission:course_commissions(id, status, is_active, end_date, course_level)")
    .eq("role", "student")
    .order("full_name", { ascending: true });

  const todayIso = getLimaTodayISO();
  const eligibleStudents = (candidates || []).filter((student) => {
    if (!student?.id || student.role !== "student") return false;
    const currentCommission = student.commission;
    if (student.commission_id && resolveCommissionStatus(currentCommission, todayIso) === "active") {
      return false;
    }
    if (student.course_level && commission.course_level && student.course_level !== commission.course_level) {
      return false;
    }
    return true;
  });

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Comisiones</p>
            <h1 className="text-3xl font-semibold">
              {commission.course_level} - Comision #{commission.commission_number}
            </h1>
            <p className="text-sm text-muted">
              {formatModalityLabel(commission.modality_key)} - {commission.start_time} - {commission.end_time}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/commissions"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Volver
            </Link>
            <Link
              href="/admin/courses/templates"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Plantillas
            </Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <StudentsManager
            commissionId={commission.id}
            enrolledStudents={enrolledStudents || []}
            eligibleStudents={eligibleStudents}
          />

          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Editar comision</p>
            <CourseForm course={commission} action={upsertCommission} submitLabel="Guardar comision" />
            <form action={ensureCommissionSessions} className="mt-4">
              <input suppressHydrationWarning type="hidden" name="commissionId" value={commission.id} />
              <button suppressHydrationWarning
                type="submit"
                className="w-full rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
              >
                Regenerar clases
              </button>
            </form>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Resumen</p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                status === "active" ? "bg-success/20 text-success" : "bg-white/10 text-white/70"
              }`}
            >
              {status === "active" ? "Activa" : "Desactivada"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted">Inicio</p>
              <p className="text-base font-medium">{formatSessionDateLabel(commission.start_date)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted">Fin</p>
              <p className="text-base font-medium">{formatSessionDateLabel(commission.end_date)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted">Mes de inicio</p>
              <p className="text-base font-medium">{commission.start_month || "-"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted">Duracion</p>
              <p className="text-base font-medium">{commission.duration_months || frequencyRef?.months || "-"} meses</p>
            </div>
          </div>
        </div>

        {!sessionTableAvailable ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {sessionError}
          </div>
        ) : null}

        <div className="space-y-4">
          {monthKeys.map((monthKey, index) => {
            const monthSessions = monthMap.get(monthKey) || [];
            const monthLabel = monthKey === "unknown" ? `Mes ${index + 1}` : formatMonthLabel(monthKey);
            return (
              <details key={monthKey} open={index === 0} className="rounded-2xl border border-border bg-surface p-4">
                <summary className="cursor-pointer text-base font-semibold text-foreground">
                  {monthLabel} - {monthSessions.length} clases
                </summary>
                <div className="mt-4 space-y-4">
                  {monthSessions.map((session) => {
                    const items = sessionItemsBySession.get(session.id) || [];
                    const primarySlideItem =
                      items.find((item) => item.type === "slides" && item.note === "primary_slide") ||
                      items.find((item) => item.type === "slides") ||
                      null;
                    const flashcardsItem = items.find((item) => item.type === "flashcards") || null;
                    const flashcards = flashcardsBySession.get(session.id) || [];
                    const exerciseItems = items.filter(
                      (item) => item.type === "exercise" || Boolean(item.exercise_id)
                    );
                    const materialItems = items.filter((item) => {
                      if (primarySlideItem?.id && item.id === primarySlideItem.id) return false;
                      if (flashcardsItem?.id && item.id === flashcardsItem.id) return false;
                      if (item.type === "exercise" || item.exercise_id) return false;
                      return true;
                    });
                    const hasQuiz = exerciseItems.length > 0;
                    return (
                      <div key={session.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                        <form action={upsertCourseSessionLinks} className="space-y-3">
                          <input suppressHydrationWarning type="hidden" name="sessionId" value={session.id} />
                          <input suppressHydrationWarning type="hidden" name="commissionId" value={commission.id} />
                          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                                {formatSessionDateLabel(session.session_date)} - Titulo
                              </label>
                              <input suppressHydrationWarning
                                name="dayLabel"
                                defaultValue={session.day_label || ""}
                                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                required
                              />
                            </div>
                            <button suppressHydrationWarning
                              type="submit"
                              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                            >
                              Guardar clase
                            </button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Link Zoom / Live</label>
                              <input suppressHydrationWarning
                                name="liveLink"
                                defaultValue={session.zoom_link || session.live_link || ""}
                                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                placeholder="https://zoom.us/..."
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Grabacion</label>
                              <input suppressHydrationWarning
                                name="recordingLink"
                                defaultValue={session.recording_link || ""}
                                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                placeholder="https://..."
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Codigo de acceso (grabacion)
                            </label>
                            <input suppressHydrationWarning
                              name="recordingPasscode"
                              defaultValue={session.recording_passcode || ""}
                              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                              placeholder="Codigo de acceso"
                              required={Boolean(session.recording_link)}
                            />
                          </div>
                        </form>
                        <form action={sendManualZoomReminderForSession} className="mt-3 flex justify-end">
                          <input suppressHydrationWarning type="hidden" name="sessionId" value={session.id} />
                          <input suppressHydrationWarning type="hidden" name="commissionId" value={commission.id} />
                          <button suppressHydrationWarning
                            type="submit"
                            disabled={!session.zoom_link && !session.live_link}
                            className="rounded-xl border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Enviar correo Unirse a la clase
                          </button>
                        </form>

                        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                          <div className="space-y-4">
                            <div className="rounded-2xl border border-border bg-surface p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">
                                Slide principal de clase
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                Este material se muestra como archivo principal para el alumno. Los demas slides quedan como
                                materiales adicionales.
                              </p>
                              <form action={upsertSessionItem} className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                                <input suppressHydrationWarning type="hidden" name="sessionId" value={session.id} />
                                <input suppressHydrationWarning type="hidden" name="commissionId" value={commission.id} />
                                {primarySlideItem?.id ? (
                                  <input suppressHydrationWarning type="hidden" name="itemId" value={primarySlideItem.id} />
                                ) : null}
                                <input suppressHydrationWarning type="hidden" name="type" value="slides" />
                                <input suppressHydrationWarning type="hidden" name="note" value="primary_slide" />
                                <input suppressHydrationWarning
                                  name="title"
                                  defaultValue={primarySlideItem?.title || "Slide de clase"}
                                  className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                                  placeholder="Slide de clase"
                                  required
                                />
                                <input suppressHydrationWarning
                                  name="url"
                                  defaultValue={primarySlideItem?.url || ""}
                                  className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
                                  placeholder="https://docs.google.com/presentation/..."
                                />
                                <button suppressHydrationWarning
                                  type="submit"
                                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                                >
                                  Guardar
                                </button>
                              </form>
                            </div>

                            <div className="rounded-2xl border border-border bg-surface p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">
                                Materiales adicionales
                              </p>
                              <div className="mt-3 space-y-3">
                                {materialItems.map((item) => (
                                  <div key={item.id} className="flex flex-wrap items-start gap-2">
                                    <form
                                      action={upsertSessionItem}
                                      className="grid flex-1 gap-2 rounded-xl border border-border bg-surface-2 p-3 md:grid-cols-[140px_1fr_1fr_auto]"
                                    >
                                      <input suppressHydrationWarning type="hidden" name="sessionId" value={session.id} />
                                      <input suppressHydrationWarning type="hidden" name="commissionId" value={commission.id} />
                                      <input suppressHydrationWarning type="hidden" name="itemId" value={item.id} />
                                      <input suppressHydrationWarning type="hidden" name="note" value={item.note || ""} />
                                      <select suppressHydrationWarning
                                        name="type"
                                        defaultValue={item.type || "link"}
                                        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                      >
                                        {MATERIAL_TYPE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                      <input suppressHydrationWarning
                                        name="title"
                                        defaultValue={item.title || ""}
                                        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                        placeholder="Titulo"
                                        required
                                      />
                                      <input suppressHydrationWarning
                                        name="url"
                                        defaultValue={item.url || ""}
                                        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                        placeholder="https://..."
                                      />
                                      <button suppressHydrationWarning
                                        type="submit"
                                        className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                                      >
                                        Guardar
                                      </button>
                                    </form>
                                    <form action={deleteSessionItem}>
                                      <input suppressHydrationWarning type="hidden" name="itemId" value={item.id} />
                                      <input suppressHydrationWarning type="hidden" name="commissionId" value={commission.id} />
                                      <button suppressHydrationWarning
                                        type="submit"
                                        className="rounded-xl border border-danger/60 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10"
                                      >
                                        Eliminar
                                      </button>
                                    </form>
                                  </div>
                                ))}
                                {!materialItems.length ? (
                                  <p className="text-sm text-muted">Sin materiales adicionales en esta clase.</p>
                                ) : null}

                                <form
                                  action={upsertSessionItem}
                                  className="grid gap-2 rounded-xl border border-dashed border-border bg-surface-2 p-3 md:grid-cols-[140px_1fr_1fr_auto]"
                                >
                                  <input suppressHydrationWarning type="hidden" name="sessionId" value={session.id} />
                                  <input suppressHydrationWarning type="hidden" name="commissionId" value={commission.id} />
                                  <select suppressHydrationWarning
                                    name="type"
                                    defaultValue="slides"
                                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                  >
                                    {MATERIAL_TYPE_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  <input suppressHydrationWarning
                                    name="title"
                                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    placeholder="Nuevo material"
                                    required
                                  />
                                  <input suppressHydrationWarning
                                    name="url"
                                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    placeholder="https://..."
                                  />
                                  <button suppressHydrationWarning
                                    type="submit"
                                    className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                                  >
                                    Agregar
                                  </button>
                                </form>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="rounded-2xl border border-primary/30 bg-primary/8 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Prueba / Test</p>
                              <p className="mt-1 text-sm text-foreground">{hasQuiz ? "Creada" : "No creada"}</p>
                              <p className="text-xs text-muted">
                                {exerciseItems.length} ejercicio{exerciseItems.length === 1 ? "" : "s"}
                              </p>
                              <p className="mt-2 text-xs text-muted">
                                Los ejercicios de esta clase se editan juntos desde un solo editor.
                              </p>
                              <div className="mt-3 flex items-center gap-2">
                                <Link
                                  href={`/admin/commissions/${commission.id}/sessions/${session.id}/exercises`}
                                  className="inline-flex flex-1 justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                                >
                                  {hasQuiz ? "Editar prueba" : "Crear prueba para esta clase"}
                                </Link>
                                {hasQuiz ? (
                                  <form action={deleteCourseSessionExerciseBatch}>
                                    <input suppressHydrationWarning type="hidden" name="commissionId" value={commission.id} />
                                    <input suppressHydrationWarning type="hidden" name="courseSessionId" value={session.id} />
                                    <button suppressHydrationWarning
                                      type="submit"
                                      title="Eliminar prueba completa"
                                      aria-label="Eliminar prueba completa"
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-danger/60 text-danger transition hover:bg-danger/10"
                                    >
                                      <TrashIcon />
                                    </button>
                                  </form>
                                ) : null}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-border bg-surface p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Flashcards</p>
                              <p className="mt-1 text-sm text-foreground">
                                {flashcards.length ? "Set creado" : flashcardsItem ? "Material creado" : "No creado"}
                              </p>
                              <p className="text-xs text-muted">
                                {flashcards.length} tarjeta{flashcards.length === 1 ? "" : "s"}
                              </p>
                              <p className="mt-2 text-xs text-muted">
                                Editor dedicado con reorder, preview y carga de imagen.
                              </p>
                              {flashcardsTableError ? (
                                <p className="mt-2 text-xs text-danger">{flashcardsTableError}</p>
                              ) : null}
                              <Link
                                href={`/admin/commissions/${commission.id}/sessions/${session.id}/flashcards`}
                                className="mt-3 inline-flex w-full justify-center rounded-xl border border-primary/35 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                              >
                                {flashcards.length || flashcardsItem ? "Editar flashcards" : "Agregar flashcards"}
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!monthSessions.length ? (
                    <div className="rounded-xl border border-dashed border-border bg-surface-2 px-3 py-3 text-sm text-muted">
                      Aun no hay clases cargadas para este mes.
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
