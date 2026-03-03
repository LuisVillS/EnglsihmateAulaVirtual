import Link from "next/link";
import { redirect } from "next/navigation";
import SessionExerciseLibraryEditor from "@/components/session-exercise-library-editor";
import {
  mapExerciseCategoryRow,
  mapExerciseLibraryRow,
  sortExerciseLibrary,
} from "@/lib/exercise-library";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const metadata = {
  title: "Editar prueba | Comision",
};

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch?.[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

function sortAssignmentRows(rows = []) {
  return [...rows].sort((left, right) => {
    const leftOrder = Number(left?.exercise_order || 0);
    const rightOrder = Number(right?.exercise_order || 0);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left?.created_at || "").localeCompare(String(right?.created_at || ""));
  });
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

  let initialAssignments = [];
  let initialQuizTitle = "Prueba de clase";
  let libraryExercises = [];
  let libraryCategories = [];
  let itemsError = "";
  let libraryError = "";
  let hiddenInactiveItems = 0;

  const itemsResult = await supabase
    .from("session_items")
    .select("id, title, exercise_id, exercise_points, exercise_order, created_at")
    .eq("session_id", session.id)
    .eq("type", "exercise");

  if (itemsResult.error) {
    const missingColumn = getMissingColumnFromError(itemsResult.error);
    itemsError =
      missingColumn === "exercise_points" || missingColumn === "exercise_order" || missingColumn === "exercise_id"
        ? "Faltan columnas de Exercise Library en session_items. Ejecuta el SQL actualizado."
        : (itemsResult.error.message || "No se pudieron cargar los ejercicios asignados.");
  } else {
    const itemRows = sortAssignmentRows(itemsResult.data || []);
    const exerciseIds = Array.from(
      new Set(itemRows.map((item) => String(item?.exercise_id || "").trim()).filter(Boolean))
    );

    const exerciseById = new Map();
    if (exerciseIds.length) {
      const { data: exerciseRows, error: exerciseRowsError } = await supabase
        .from("exercises")
        .select(`
          id,
          title,
          prompt,
          type,
          status,
          skill_tag,
          cefr_level,
          category_id,
          content_json,
          category:exercise_categories (
            id,
            name,
            skill,
            cefr_level
          )
        `)
        .in("id", exerciseIds);

      if (exerciseRowsError) {
        itemsError = exerciseRowsError.message || "No se pudieron cargar los ejercicios de la biblioteca.";
      } else {
        (exerciseRows || []).forEach((row) => {
          exerciseById.set(String(row.id || "").trim(), mapExerciseLibraryRow(row));
        });
      }
    }

    const activeAssignments = itemRows
      .map((item) => {
        const exercise = exerciseById.get(String(item?.exercise_id || "").trim()) || null;
        if (!exercise?.id) return null;
        if (exercise.status !== "draft" && exercise.status !== "published") return null;
        return {
          itemId: String(item.id || "").trim(),
          exerciseId: exercise.id,
          points: Number(item.exercise_points || 10) || 10,
          ...exercise,
        };
      })
      .filter(Boolean);

    hiddenInactiveItems = Math.max(0, itemRows.length - activeAssignments.length);
    initialAssignments = activeAssignments;
    initialQuizTitle = String(itemRows[0]?.title || "Prueba de clase").trim() || "Prueba de clase";
  }

  const libraryResult = await supabase
    .from("exercises")
    .select(`
      id,
      title,
      prompt,
      type,
      status,
      skill_tag,
      cefr_level,
      category_id,
      content_json,
      updated_at,
      created_at,
      category:exercise_categories (
        id,
        name,
        skill,
        cefr_level
      )
    `)
    .in("status", ["draft", "published"])
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (libraryResult.error) {
    const missingTable = getMissingTableName(libraryResult.error);
    libraryError = missingTable?.endsWith("exercise_categories")
      ? "Falta crear la tabla exercise_categories. Ejecuta el SQL actualizado."
      : (libraryResult.error.message || "No se pudo cargar la Exercise Library.");
  } else {
    libraryExercises = sortExerciseLibrary((libraryResult.data || []).map((row) => mapExerciseLibraryRow(row)));
  }

  const categoriesResult = await supabase
    .from("exercise_categories")
    .select("id, name, skill, cefr_level")
    .order("skill", { ascending: true })
    .order("cefr_level", { ascending: true })
    .order("name", { ascending: true });

  if (categoriesResult.error && !libraryError) {
    libraryError = categoriesResult.error.message || "No se pudieron cargar las categorias.";
  } else if (!categoriesResult.error) {
    libraryCategories = (categoriesResult.data || []).map((row) => mapExerciseCategoryRow(row));
  }

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

        {itemsError ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {itemsError}
          </div>
        ) : null}

        {hiddenInactiveItems ? (
          <div className="rounded-2xl border border-accent/45 bg-accent/12 px-4 py-3 text-sm text-accent">
            Se ocultaron {hiddenInactiveItems} ejercicio(s) archivados o eliminados. Solo se muestran referencias activas.
          </div>
        ) : null}

        {!itemsError ? (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Editor de prueba</p>
            <h2 className="mt-1 text-xl font-semibold">Selecciona ejercicios desde la biblioteca</h2>
            <p className="mt-1 text-sm text-muted">
              El contenido se administra en Exercise Library. Aqui solo eliges referencias, orden y puntos por instancia.
            </p>
            <div className="mt-4">
              <SessionExerciseLibraryEditor
                scope="commission"
                commissionId={commission.id}
                courseSessionId={session.id}
                initialAssignments={initialAssignments}
                initialQuizTitle={initialQuizTitle}
                libraryExercises={libraryExercises}
                libraryCategories={libraryCategories}
                libraryError={libraryError}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
