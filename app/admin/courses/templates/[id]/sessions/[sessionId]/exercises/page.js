import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { upsertTemplateSessionItem, deleteTemplateSessionItem } from "@/app/admin/actions";
import TemplateSessionExerciseBuilder from "@/components/template-session-exercise-builder";

export const metadata = {
  title: "Crear prueba | Plantilla",
};

const EXERCISE_TYPE_LABELS = {
  scramble: "Scrambled Sentence",
  audio_match: "Audio Match / Dictation",
  image_match: "Image-Word Association",
  pairs: "Pairs Game",
  cloze: "Fill in the blanks",
};

function formatExerciseType(value) {
  return EXERCISE_TYPE_LABELS[String(value || "").trim()] || value || "Ejercicio";
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

export default async function TemplateSessionExercisePage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const templateId = params?.id?.toString();
  const templateSessionId = params?.sessionId?.toString();
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
    .select("id, template_name, course_level")
    .eq("id", templateId)
    .maybeSingle();
  if (!template?.id) redirect("/admin/courses/templates");

  const { data: session } = await supabase
    .from("template_sessions")
    .select("id, template_id, title, month_index, session_in_month, session_in_cycle")
    .eq("id", templateSessionId)
    .eq("template_id", template.id)
    .maybeSingle();
  if (!session?.id) redirect(`/admin/courses/templates/${template.id}`);

  const [lessonsResult, exercisesResult] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, title, status")
      .in("status", ["draft", "published"])
      .order("created_at", { ascending: true }),
    supabase
      .from("exercises")
      .select("id, lesson_id, type, status, prompt, updated_at")
      .in("status", ["draft", "published"])
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);
  const lessons = lessonsResult.data || [];
  const exercises = exercisesResult.data || [];

  let itemRows = [];
  let missingExerciseColumn = false;
  let itemsError = null;

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
        prompt,
        lesson_id
      )
    `
    )
    .eq("template_session_id", session.id)
    .eq("type", "exercise")
    .order("created_at", { ascending: true });

  if (itemsResult.error && getMissingColumnFromError(itemsResult.error) === "exercise_id") {
    missingExerciseColumn = true;
    itemsResult = await supabase
      .from("template_session_items")
      .select("id, template_session_id, type, title, url")
      .eq("template_session_id", session.id)
      .eq("type", "exercise")
      .order("created_at", { ascending: true });
  }

  if (itemsResult.error) {
    itemsError = itemsResult.error.message || "No se pudieron cargar ejercicios de la clase.";
  } else {
    itemRows = itemsResult.data || [];
  }

  const activeItemRows = itemRows.filter((item) => {
    if (!item.exercise_id) return false;
    const status = String(item?.exercise?.status || "")
      .trim()
      .toLowerCase();
    return status === "draft" || status === "published";
  });
  const hiddenInactiveItems = Math.max(0, itemRows.length - activeItemRows.length);

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Admin / Plantillas / Clase</p>
            <h1 className="text-3xl font-semibold">Crear prueba</h1>
            <p className="text-sm text-muted">
              {template.template_name || template.course_level} - {session.title || "Clase sin titulo"}
            </p>
          </div>
          <Link
            href={`/admin/courses/templates/${template.id}`}
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            Volver a plantilla
          </Link>
        </header>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Clase</p>
          <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Mes</p>
              <p className="font-semibold">{session.month_index || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Sesion en mes</p>
              <p className="font-semibold">{session.session_in_month || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Indice global</p>
              <p className="font-semibold">{session.session_in_cycle || "-"}</p>
            </div>
          </div>
        </div>

        {missingExerciseColumn ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            Falta la columna `exercise_id` en `template_session_items`. Ejecuta el SQL actualizado antes de crear
            pruebas.
          </div>
        ) : null}

        {itemsError ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {itemsError}
          </div>
        ) : null}
        {hiddenInactiveItems ? (
          <div className="rounded-2xl border border-accent/45 bg-accent/12 px-4 py-3 text-sm text-accent">
            Se ocultaron {hiddenInactiveItems} ejercicio(s) archivados/eliminados. Solo se muestran ejercicios activos.
          </div>
        ) : null}

        {!missingExerciseColumn ? (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Editor de prueba</p>
            <h2 className="mt-1 text-xl font-semibold">Crea uno o varios ejercicios en una sola accion</h2>
            <p className="mt-1 text-sm text-muted">
              Crea la secuencia de la prueba para esta clase. Puedes dejarla en draft o publicarla.
            </p>
            <div className="mt-4">
              <TemplateSessionExerciseBuilder
                templateId={template.id}
                templateSessionId={session.id}
                lessonOptions={lessons}
              />
            </div>
          </div>
        ) : null}

        {!missingExerciseColumn ? (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Ejercicios ya asignados</p>
            <p className="mt-1 text-sm text-muted">
              Esta prueba contiene {activeItemRows.length} ejercicio{activeItemRows.length === 1 ? "" : "s"}.
            </p>
            <div className="mt-3 space-y-3">
              {activeItemRows.map((item) => {
                const linkedExercise = item.exercise || null;
                return (
                  <div key={item.id} className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3">
                    <form action={upsertTemplateSessionItem} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <input type="hidden" name="templateId" value={template.id} />
                      <input type="hidden" name="templateSessionId" value={session.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="type" value="exercise" />
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Ejercicio</label>
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
                              {formatExerciseType(exercise.type)} - {exercise.prompt || exercise.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted">Titulo visible</label>
                        <input
                          name="title"
                          defaultValue={item.title || ""}
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
                          placeholder="Prueba de clase"
                        />
                        <p className="text-xs text-muted">
                          {linkedExercise
                            ? `${formatExerciseType(linkedExercise.type)} - ${linkedExercise.status || "draft"}`
                            : "Sin metadatos del ejercicio"}
                        </p>
                      </div>
                      <button
                        type="submit"
                        className="self-end rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface"
                      >
                        Guardar
                      </button>
                    </form>
                    <div className="flex justify-end">
                      <form action={deleteTemplateSessionItem}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-danger/60 px-3 py-2 text-xs font-semibold text-danger transition hover:bg-danger/10"
                        >
                          Eliminar
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
              {!activeItemRows.length ? (
                <p className="text-sm text-muted">Aun no hay ejercicios activos asignados a esta clase.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
