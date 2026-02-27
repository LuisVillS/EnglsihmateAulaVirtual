import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import TemplateSessionExerciseBuilder from "@/components/template-session-exercise-builder";

export const metadata = {
  title: "Editar prueba | Comision",
};

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function readEstimatedTimeMinutes(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const candidate = content.estimated_time_minutes ?? content.estimatedTimeMinutes;
  const parsed = Number.parseInt(String(candidate ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, parsed);
}

export default async function CommissionSessionExercisePage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const commissionId = params?.id?.toString();
  const sessionId = params?.sessionId?.toString();
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

  const { data: commission } = await supabase
    .from("course_commissions")
    .select("id, course_level, commission_number")
    .eq("id", commissionId)
    .maybeSingle();
  if (!commission?.id) redirect("/admin/commissions");

  const { data: session } = await supabase
    .from("course_sessions")
    .select("id, commission_id, session_date, session_in_cycle, day_label, cycle_month")
    .eq("id", sessionId)
    .eq("commission_id", commission.id)
    .maybeSingle();
  if (!session?.id) redirect(`/admin/commissions/${commission.id}`);

  let itemRows = [];
  let itemsError = null;
  let missingExerciseColumn = false;

  const itemsResult = await supabase
    .from("session_items")
    .select("id, session_id, type, title, url, exercise_id")
    .eq("session_id", session.id)
    .eq("type", "exercise")
    .order("created_at", { ascending: true });

  if (itemsResult.error) {
    if (getMissingColumnFromError(itemsResult.error) === "exercise_id") {
      missingExerciseColumn = true;
    } else {
      itemsError = itemsResult.error.message || "No se pudieron cargar ejercicios de la clase.";
    }
  } else {
    itemRows = itemsResult.data || [];
  }

  const exerciseIds = Array.from(
    new Set(itemRows.map((item) => String(item?.exercise_id || "").trim()).filter(Boolean))
  );
  const exerciseById = new Map();
  if (!missingExerciseColumn && !itemsError && exerciseIds.length) {
    const { data: exercises, error: exercisesError } = await supabase
      .from("exercises")
      .select("id, lesson_id, type, status, skill_tag, ordering, content_json")
      .in("id", exerciseIds);

    if (exercisesError) {
      itemsError = exercisesError.message || "No se pudieron cargar los ejercicios guardados.";
    } else {
      (exercises || []).forEach((exercise) => {
        exerciseById.set(String(exercise.id), exercise);
      });
    }
  }

  const activeItemRows = itemRows.filter((item) => {
    const exercise = exerciseById.get(String(item?.exercise_id || "").trim());
    const status = String(exercise?.status || "").trim().toLowerCase();
    return exercise?.id && (status === "draft" || status === "published");
  });
  const orderedActiveItemRows = [...activeItemRows].sort((left, right) => {
    const leftOrder = Number(exerciseById.get(String(left?.exercise_id || "").trim())?.ordering || 0);
    const rightOrder = Number(exerciseById.get(String(right?.exercise_id || "").trim())?.ordering || 0);
    return leftOrder - rightOrder;
  });
  const hiddenInactiveItems = Math.max(0, itemRows.length - activeItemRows.length);

  const initialItems = orderedActiveItemRows
    .map((item) => {
      const exercise = exerciseById.get(String(item?.exercise_id || "").trim());
      if (!exercise?.id) return null;
      return {
        itemId: item.id,
        exerciseId: exercise.id,
        type: exercise.type,
        status: exercise.status,
        title: item.title || "",
        lessonId: exercise.lesson_id || "",
        skillTag: exercise.skill_tag || "",
        contentJson: exercise.content_json || {},
      };
    })
    .filter(Boolean);

  const initialQuizTitle = orderedActiveItemRows[0]?.title || "Prueba de clase";
  const initialEstimatedTimeMinutes = readEstimatedTimeMinutes(initialItems[0]?.contentJson);

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Admin / Comisiones / Clase</p>
            <h1 className="text-3xl font-semibold">Editar prueba</h1>
            <p className="text-sm text-muted">
              {commission.course_level} - Comision #{commission.commission_number} - {session.day_label || "Clase sin titulo"}
            </p>
          </div>
          <Link
            href={`/admin/commissions/${commission.id}`}
            className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
          >
            Volver a comision
          </Link>
        </header>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Clase</p>
          <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Fecha</p>
              <p className="font-semibold">{session.session_date || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Indice global</p>
              <p className="font-semibold">{session.session_in_cycle || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Mes</p>
              <p className="font-semibold">{session.cycle_month || "-"}</p>
            </div>
          </div>
        </div>

        {missingExerciseColumn ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            Falta la columna `exercise_id` en `session_items`. Ejecuta el SQL actualizado antes de editar pruebas.
          </div>
        ) : null}

        {itemsError ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {itemsError}
          </div>
        ) : null}

        {hiddenInactiveItems ? (
          <div className="rounded-2xl border border-accent/45 bg-accent/12 px-4 py-3 text-sm text-accent">
            Se ocultaron {hiddenInactiveItems} ejercicio(s) archivados o eliminados. Solo se editan ejercicios activos.
          </div>
        ) : null}

        {!missingExerciseColumn ? (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Editor de prueba</p>
            <h2 className="mt-1 text-xl font-semibold">La prueba de esta clase se edita como un bloque</h2>
            <p className="mt-1 text-sm text-muted">
              Usa el mismo flujo del editor de plantillas, pero guardando especificamente para esta comision.
            </p>
            <div className="mt-4">
              <TemplateSessionExerciseBuilder
                scope="commission"
                commissionId={commission.id}
                courseSessionId={session.id}
                initialItems={initialItems}
                initialQuizTitle={initialQuizTitle}
                initialEstimatedTimeMinutes={initialEstimatedTimeMinutes}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
