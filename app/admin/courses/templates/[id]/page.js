import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  upsertTemplateSession,
  upsertTemplateSessionItem,
  deleteTemplateSessionItem,
} from "@/app/admin/actions";
import { getFrequencyReference } from "@/lib/course-sessions";
import TemplateForm from "../template-form";

export const metadata = {
  title: "Editar plantilla | Admin",
};

const MATERIAL_TYPE_OPTIONS = [
  { value: "slides", label: "Google Slides" },
  { value: "link", label: "Enlace" },
  { value: "file", label: "Archivo" },
  { value: "video", label: "Video" },
];

const EXERCISE_TYPE_LABELS = {
  scramble: "Scrambled Sentence",
  audio_match: "Audio Match / Dictation",
  image_match: "Image-Word Association",
  pairs: "Pairs Game",
  cloze: "Cloze Test",
};

function formatExerciseType(value) {
  return EXERCISE_TYPE_LABELS[String(value || "").trim()] || value || "Ejercicio";
}

function formatFrequencyLabel(value) {
  const map = {
    DAILY: "Daily (L-V)",
    MWF: "Interdiario 1 (LMV)",
    TT: "Interdiario 2 (MJ)",
    SAT: "Sabatinos (Sabados)",
  };
  return map[value] || value || "-";
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

function resolveSessionPosition(row, sessionsPerMonth) {
  const monthIndex = Number(row?.month_index);
  const sessionInMonth = Number(row?.session_in_month);
  if (Number.isInteger(monthIndex) && monthIndex >= 1 && Number.isInteger(sessionInMonth) && sessionInMonth >= 1) {
    return { monthIndex, sessionInMonth };
  }

  const cycleIndex = Number(row?.session_in_cycle);
  if (!Number.isInteger(cycleIndex) || cycleIndex < 1 || sessionsPerMonth < 1) {
    return { monthIndex: null, sessionInMonth: null };
  }
  return {
    monthIndex: Math.floor((cycleIndex - 1) / sessionsPerMonth) + 1,
    sessionInMonth: ((cycleIndex - 1) % sessionsPerMonth) + 1,
  };
}

function buildSessionNumber(monthIndex, sessionInMonth, sessionsPerMonth) {
  if (!sessionsPerMonth) return null;
  return ((monthIndex - 1) * sessionsPerMonth) + sessionInMonth;
}

function buildSessionBadge(monthIndex, sessionInMonth, sessionsPerMonth) {
  const sessionNumber = buildSessionNumber(monthIndex, sessionInMonth, sessionsPerMonth);
  if (sessionNumber) {
    return `Clase ${String(sessionNumber).padStart(2, "0")}`;
  }
  return `Mes ${monthIndex} / Clase ${sessionInMonth}`;
}

function formatMaterialTypeLabel(type) {
  const value = String(type || "").trim();
  if (value === "exercise") return "Ejercicio";
  const row = MATERIAL_TYPE_OPTIONS.find((option) => option.value === value);
  return row?.label || "Material";
}

export default async function CourseTemplateDetailPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const templateId = params?.id?.toString();
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

  const { data: template } = await supabase
    .from("course_templates")
    .select("id, course_level, frequency, template_name")
    .eq("id", templateId)
    .maybeSingle();
  if (!template?.id) redirect("/admin/courses/templates");

  const frequencyReference = getFrequencyReference(template.frequency);
  const durationMonths = frequencyReference?.months || 1;
  const sessionsPerMonth = frequencyReference?.sessionsPerMonth || 0;
  const totalSessions = sessionsPerMonth * durationMonths;

  const { data: sessionsRows, error: sessionsError } = await supabase
    .from("template_sessions")
    .select("id, month_index, session_in_month, session_in_cycle, title")
    .eq("template_id", template.id)
    .order("month_index", { ascending: true })
    .order("session_in_month", { ascending: true });

  const missingSessionColumn = getMissingColumnFromError(sessionsError);
  const needsSchemaUpdate =
    missingSessionColumn === "month_index" || missingSessionColumn === "session_in_month";

  const sessions = (sessionsRows || [])
    .map((row) => {
      const position = resolveSessionPosition(row, sessionsPerMonth);
      if (!position.monthIndex || !position.sessionInMonth) return null;
      return {
        ...row,
        monthIndex: position.monthIndex,
        sessionInMonth: position.sessionInMonth,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.monthIndex !== b.monthIndex) return a.monthIndex - b.monthIndex;
      return a.sessionInMonth - b.sessionInMonth;
    });

  const sessionIds = sessions.map((row) => row.id);
  let itemsBySession = new Map();
  let missingExerciseColumn = false;
  let itemsErrorMessage = null;

  if (sessionIds.length) {
    let itemsResult = await supabase
      .from("template_session_items")
      .select(
        `
        id,
        template_session_id,
        type,
        title,
        url,
        exercise_id,
        exercise:exercises (
          id,
          type,
          status,
          prompt
        ),
        created_at
      `
      )
      .in("template_session_id", sessionIds)
      .order("created_at", { ascending: true });

    if (itemsResult.error && getMissingColumnFromError(itemsResult.error) === "exercise_id") {
      missingExerciseColumn = true;
      itemsResult = await supabase
        .from("template_session_items")
        .select("id, template_session_id, type, title, url, created_at")
        .in("template_session_id", sessionIds)
        .order("created_at", { ascending: true });
    }

    if (itemsResult.error) {
      itemsErrorMessage = itemsResult.error.message || "No se pudieron cargar materiales de plantilla.";
    } else {
      const itemRows = itemsResult.data || [];
      itemsBySession = itemRows.reduce((acc, item) => {
        const current = acc.get(item.template_session_id) || [];
        current.push(item);
        acc.set(item.template_session_id, current);
        return acc;
      }, new Map());
    }
  }

  const { data: exercisesRows } = await supabase
    .from("exercises")
    .select("id, type, status, prompt, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  const exercises = exercisesRows || [];

  const monthIndexes = Array.from({ length: durationMonths }, (_, idx) => idx + 1);
  const sessionsByMonth = sessions.reduce((acc, session) => {
    const current = acc.get(session.monthIndex) || [];
    current.push(session);
    acc.set(session.monthIndex, current);
    return acc;
  }, new Map());

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Plantillas</p>
            <h1 className="text-3xl font-semibold">{template.template_name || "Plantilla"}</h1>
            <p className="text-sm text-muted">
              {template.course_level} - {formatFrequencyLabel(template.frequency)} - {sessionsPerMonth} clases/mes -{" "}
              {durationMonths} meses
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/courses/templates"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Volver
            </Link>
            <Link
              href="/admin/commissions"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Comisiones
            </Link>
          </div>
        </header>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <TemplateForm key={template.id} template={template} />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Total esperado de clases:{" "}
          <span className="font-semibold text-foreground">{totalSessions || sessions.length}</span>. Los ejercicios son
          materiales de clase y pueden aportar hasta el 50% de la nota final del curso.
        </div>

        {needsSchemaUpdate ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            Falta actualizar template_sessions con month_index/session_in_month. Ejecuta el SQL actualizado.
          </div>
        ) : null}
        {itemsErrorMessage ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {itemsErrorMessage}
          </div>
        ) : null}
        {missingExerciseColumn ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            Falta la columna exercise_id en template_session_items. Ejecuta el SQL actualizado.
          </div>
        ) : null}

        <div className="space-y-4">
          {monthIndexes.map((monthIndex) => {
            const monthSessions = sessionsByMonth.get(monthIndex) || [];
            return (
              <details
                key={monthIndex}
                open={monthIndex === 1}
                className="rounded-2xl border border-border bg-surface p-4"
              >
                <summary className="cursor-pointer text-base font-semibold text-foreground">
                  Mes {monthIndex} - {monthSessions.length || sessionsPerMonth} clases
                </summary>
                <div className="mt-4 space-y-4">
                  {monthSessions.map((session) => {
                    const items = itemsBySession.get(session.id) || [];
                    const exerciseItems = items.filter((item) => item.type === "exercise" && item.exercise_id);
                    const sessionBadge = buildSessionBadge(monthIndex, session.sessionInMonth, sessionsPerMonth);

                    return (
                      <article key={session.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.22em] text-muted">{sessionBadge}</p>
                            <h3 className="text-lg font-semibold text-foreground">{session.title || "Clase sin titulo"}</h3>
                            <p className="text-xs text-muted">
                              {items.length} materiales, {exerciseItems.length} ejercicios
                            </p>
                          </div>
                          <Link
                            href={`/admin/courses/templates/${template.id}/sessions/${session.id}/exercises`}
                            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                          >
                            Crear prueba para esta clase
                          </Link>
                        </div>

                        <form action={upsertTemplateSession} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                          <input type="hidden" name="templateId" value={template.id} />
                          <input type="hidden" name="templateSessionId" value={session.id} />
                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo de clase</label>
                            <input
                              name="title"
                              defaultValue={session.title || ""}
                              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                              required
                            />
                          </div>
                          <button
                            type="submit"
                            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                          >
                            Guardar titulo
                          </button>
                        </form>

                        <div className="mt-4 grid gap-4 xl:grid-cols-[1.8fr_1fr]">
                          <div className="rounded-2xl border border-border bg-surface p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Materiales de clase</p>
                            <div className="mt-3 space-y-3">
                              {items.map((item) => {
                                const isExercise = item.type === "exercise" && !missingExerciseColumn;
                                const linkedExercise = item.exercise || null;

                                if (isExercise) {
                                  return (
                                    <div key={item.id} className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3">
                                      <form action={upsertTemplateSessionItem} className="grid gap-2 sm:grid-cols-2">
                                        <input type="hidden" name="templateId" value={template.id} />
                                        <input type="hidden" name="templateSessionId" value={session.id} />
                                        <input type="hidden" name="itemId" value={item.id} />
                                        <input type="hidden" name="type" value="exercise" />
                                        <div className="space-y-1 sm:col-span-2">
                                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                                            Ejercicio vinculado
                                          </p>
                                          <select
                                            name="exerciseId"
                                            defaultValue={item.exercise_id || ""}
                                            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                            required
                                          >
                                            <option value="" disabled>
                                              Selecciona ejercicio
                                            </option>
                                            {exercises.map((exercise) => (
                                              <option key={exercise.id} value={exercise.id}>
                                                {formatExerciseType(exercise.type)} -{" "}
                                                {exercise.prompt || exercise.id.slice(0, 8)}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                                            Titulo visible
                                          </label>
                                          <input
                                            name="title"
                                            defaultValue={item.title || ""}
                                            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                            placeholder="Prueba de clase"
                                          />
                                        </div>
                                        <div className="flex items-end gap-2">
                                          <button
                                            type="submit"
                                            className="w-full rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                                          >
                                            Guardar
                                          </button>
                                        </div>
                                      </form>
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                                        <span>
                                          {linkedExercise
                                            ? `${formatExerciseType(linkedExercise.type)} (${linkedExercise.status || "draft"})`
                                            : "Sin metadatos"}
                                        </span>
                                        <form action={deleteTemplateSessionItem}>
                                          <input type="hidden" name="templateId" value={template.id} />
                                          <input type="hidden" name="itemId" value={item.id} />
                                          <button
                                            type="submit"
                                            className="rounded-full border border-danger/60 px-3 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                                          >
                                            Eliminar
                                          </button>
                                        </form>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={item.id} className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3">
                                    <form action={upsertTemplateSessionItem} className="grid gap-2 sm:grid-cols-2">
                                      <input type="hidden" name="templateId" value={template.id} />
                                      <input type="hidden" name="templateSessionId" value={session.id} />
                                      <input type="hidden" name="itemId" value={item.id} />
                                      <div className="space-y-1">
                                        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Tipo</label>
                                        <select
                                          name="type"
                                          defaultValue={item.type || "link"}
                                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                        >
                                          {MATERIAL_TYPE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo</label>
                                        <input
                                          name="title"
                                          defaultValue={item.title || ""}
                                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                          placeholder="Material de clase"
                                          required
                                        />
                                      </div>
                                      <div className="space-y-1 sm:col-span-2">
                                        <label className="text-xs font-semibold uppercase tracking-wide text-muted">URL</label>
                                        <input
                                          name="url"
                                          defaultValue={item.url || ""}
                                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                          placeholder="https://..."
                                          required
                                        />
                                      </div>
                                      <button
                                        type="submit"
                                        className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface sm:col-span-2"
                                      >
                                        Guardar
                                      </button>
                                    </form>
                                    <div className="flex items-center justify-between gap-2 text-xs text-muted">
                                      <span>{formatMaterialTypeLabel(item.type)}</span>
                                      <form action={deleteTemplateSessionItem}>
                                        <input type="hidden" name="templateId" value={template.id} />
                                        <input type="hidden" name="itemId" value={item.id} />
                                        <button
                                          type="submit"
                                          className="rounded-full border border-danger/60 px-3 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                                        >
                                          Eliminar
                                        </button>
                                      </form>
                                    </div>
                                  </div>
                                );
                              })}

                              {!items.length ? <p className="text-sm text-muted">Sin materiales en esta clase.</p> : null}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="rounded-2xl border border-dashed border-border bg-surface p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Agregar material</p>
                              <form action={upsertTemplateSessionItem} className="mt-2 space-y-2">
                                <input type="hidden" name="templateId" value={template.id} />
                                <input type="hidden" name="templateSessionId" value={session.id} />
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Tipo</label>
                                  <select
                                    name="type"
                                    defaultValue="slides"
                                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                  >
                                    {MATERIAL_TYPE_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo</label>
                                  <input
                                    name="title"
                                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    placeholder="Nuevo material"
                                    required
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold uppercase tracking-wide text-muted">URL</label>
                                  <input
                                    name="url"
                                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                    placeholder="https://..."
                                    required
                                  />
                                </div>
                                <button
                                  type="submit"
                                  className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                                >
                                  Agregar material
                                </button>
                              </form>
                            </div>

                            <div className="rounded-2xl border border-dashed border-primary/35 bg-primary/5 p-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Pruebas y ejercicios</p>
                              <p className="mt-1 text-xs text-muted">
                                Crea una prueba completa para esta clase o asigna un ejercicio existente.
                              </p>
                              {missingExerciseColumn ? (
                                <p className="mt-2 text-xs text-muted">
                                  Actualiza el SQL para habilitar ejercicios por clase.
                                </p>
                              ) : (
                                <div className="mt-3 space-y-2">
                                  <Link
                                    href={`/admin/courses/templates/${template.id}/sessions/${session.id}/exercises`}
                                    className="inline-flex w-full justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
                                  >
                                    Crear prueba (1 o varios ejercicios)
                                  </Link>
                                  <form action={upsertTemplateSessionItem} className="space-y-2">
                                    <input type="hidden" name="templateId" value={template.id} />
                                    <input type="hidden" name="templateSessionId" value={session.id} />
                                    <input type="hidden" name="type" value="exercise" />
                                    <div className="space-y-1">
                                      <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                                        Asignar ejercicio existente
                                      </label>
                                      <select
                                        name="exerciseId"
                                        defaultValue=""
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                        required
                                      >
                                        <option value="" disabled>
                                          Selecciona ejercicio
                                        </option>
                                        {exercises.map((exercise) => (
                                          <option key={exercise.id} value={exercise.id}>
                                            {formatExerciseType(exercise.type)} -{" "}
                                            {exercise.prompt || exercise.id.slice(0, 8)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                                        Titulo visible (opcional)
                                      </label>
                                      <input
                                        name="title"
                                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                                        placeholder="Prueba de clase"
                                      />
                                    </div>
                                    <button
                                      type="submit"
                                      className="w-full rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                                    >
                                      Asignar ejercicio
                                    </button>
                                  </form>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
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
