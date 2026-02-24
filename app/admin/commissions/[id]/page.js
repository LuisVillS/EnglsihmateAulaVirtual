import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { formatSessionDateLabel, getFrequencyReference } from "@/lib/course-sessions";
import { ensureCommissionSessions, upsertCommission, upsertCourseSessionLinks, upsertSessionItem, deleteSessionItem } from "@/app/admin/actions";
import CourseForm from "@/app/admin/courses/course-form";
import StudentsManager from "./students-manager";

export const metadata = {
  title: "Editar comision | Admin",
};

const MATERIAL_TYPE_OPTIONS = [
  { value: "slides", label: "Google Slides" },
  { value: "link", label: "Enlace" },
  { value: "exercise", label: "Ejercicio" },
  { value: "video", label: "Video" },
];

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!adminRecord?.id) redirect("/admin/login");

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
    "live_link",
    "recording_link",
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
  if (sessionIds.length) {
    const { data: itemRows } = await supabase
      .from("session_items")
      .select("id, session_id, type, title, url, created_at")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: true });
    sessionItemsBySession = (itemRows || []).reduce((acc, item) => {
      const current = acc.get(item.session_id) || [];
      current.push(item);
      acc.set(item.session_id, current);
      return acc;
    }, new Map());
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
            <div className="mt-4 grid gap-3 text-sm text-foreground sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Inicio</p>
                <p>{formatSessionDateLabel(commission.start_date)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Fin</p>
                <p>{formatSessionDateLabel(commission.end_date)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Mes de inicio</p>
                <p>{commission.start_month || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Duracion</p>
                <p>{commission.duration_months || frequencyRef?.months || "-"} meses</p>
              </div>
            </div>
          </div>

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

        <StudentsManager
          commissionId={commission.id}
          enrolledStudents={enrolledStudents || []}
          eligibleStudents={eligibleStudents}
        />

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
                                defaultValue={session.live_link || ""}
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
                        </form>

                        <div className="mt-4 rounded-2xl border border-border bg-surface p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted">Materiales</p>
                          <div className="mt-3 space-y-3">
                            {items.map((item) => (
                              <div key={item.id} className="flex flex-wrap items-start gap-2">
                                <form
                                  action={upsertSessionItem}
                                  className="grid flex-1 gap-2 rounded-xl border border-border bg-surface-2 p-3 md:grid-cols-[140px_1fr_1fr_auto]"
                                >
                                  <input suppressHydrationWarning type="hidden" name="sessionId" value={session.id} />
                                  <input suppressHydrationWarning type="hidden" name="commissionId" value={commission.id} />
                                  <input suppressHydrationWarning type="hidden" name="itemId" value={item.id} />
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
                            {!items.length ? (
                              <p className="text-sm text-muted">Sin materiales en esta clase.</p>
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

