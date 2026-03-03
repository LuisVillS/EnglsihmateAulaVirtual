import Link from "next/link";
import { redirect } from "next/navigation";
import ExerciseLibraryManager from "@/components/exercise-library-manager";
import {
  mapExerciseCategoryRow,
  mapExerciseLibraryRow,
  sortExerciseLibrary,
} from "@/lib/exercise-library";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const metadata = {
  title: "Exercise Library | Admin",
};

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch?.[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

export default async function AdminExercisesPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const initialEditId = String(searchParams?.edit || "").trim();

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

  let exercises = [];
  let categories = [];
  let errorMessage = "";

  const exercisesResult = await supabase
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
      created_at,
      updated_at,
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

  if (exercisesResult.error) {
    const missingTable = getMissingTableName(exercisesResult.error);
    const missingColumn = getMissingColumnFromError(exercisesResult.error);
    if (missingTable?.endsWith("exercise_categories")) {
      errorMessage = "Falta crear la tabla exercise_categories. Ejecuta el SQL actualizado de Exercise Library.";
    } else if (missingColumn === "title" || missingColumn === "cefr_level" || missingColumn === "category_id") {
      errorMessage = "Faltan columnas nuevas en exercises. Ejecuta el SQL actualizado de Exercise Library.";
    } else {
      errorMessage = exercisesResult.error.message || "No se pudo cargar la biblioteca de ejercicios.";
    }
  } else {
    exercises = sortExerciseLibrary((exercisesResult.data || []).map((row) => mapExerciseLibraryRow(row)));
  }

  const categoriesResult = await supabase
    .from("exercise_categories")
    .select("id, name, skill, cefr_level")
    .order("skill", { ascending: true })
    .order("cefr_level", { ascending: true })
    .order("name", { ascending: true });

  if (categoriesResult.error && !errorMessage) {
    const missingTable = getMissingTableName(categoriesResult.error);
    errorMessage = missingTable?.endsWith("exercise_categories")
      ? "Falta crear la tabla exercise_categories. Ejecuta el SQL actualizado de Exercise Library."
      : (categoriesResult.error.message || "No se pudieron cargar las categorías.");
  } else if (!categoriesResult.error) {
    categories = (categoriesResult.data || []).map((row) => mapExerciseCategoryRow(row));
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Exercises</p>
            <h1 className="text-3xl font-semibold">Exercise Library</h1>
            <p className="text-sm text-muted">
              Biblioteca central reusable para tests de plantillas y comisiones.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Panel
            </Link>
            <Link
              href="/admin/courses/templates"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Plantillas
            </Link>
            <Link
              href="/admin/commissions"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Comisiones
            </Link>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <ExerciseLibraryManager
          initialExercises={exercises}
          initialCategories={categories}
          initialEditId={initialEditId}
        />
      </div>
    </section>
  );
}
