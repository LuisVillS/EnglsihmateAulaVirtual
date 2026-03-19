import Link from "next/link";
import { AdminCard, AdminPage, AdminPageHeader } from "@/components/admin-page";
import ExerciseLibraryManager from "@/components/exercise-library-manager";
import { requireAdminPageAccess } from "@/lib/admin/access";
import {
  mapExerciseCategoryRow,
  mapExerciseLibraryRow,
  sortExerciseLibrary,
} from "@/lib/exercise-library";

export const metadata = {
  title: "Biblioteca de ejercicios | Admin",
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

  const { supabase } = await requireAdminPageAccess();

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
      errorMessage = "Falta crear la tabla de categorias de ejercicios. Ejecuta el SQL actualizado de la biblioteca de ejercicios.";
    } else if (missingColumn === "title" || missingColumn === "cefr_level" || missingColumn === "category_id") {
      errorMessage = "Faltan columnas nuevas en ejercicios. Ejecuta el SQL actualizado de la biblioteca de ejercicios.";
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
      ? "Falta crear la tabla de categorias de ejercicios. Ejecuta el SQL actualizado de la biblioteca de ejercicios."
      : (categoriesResult.error.message || "No se pudieron cargar las categorias.");
  } else if (!categoriesResult.error) {
    categories = (categoriesResult.data || []).map((row) => mapExerciseCategoryRow(row));
  }

  return (
    <AdminPage className="mx-auto w-full max-w-7xl">
      <AdminPageHeader
        eyebrow="Contenido academico"
        title="Biblioteca de ejercicios"
        description="Inventario reutilizable para plantillas y comisiones, con el mismo guardado actual y una vista CMS mas consistente."
        actions={
          <>
            <Link
              href="/admin/courses/templates"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Plantillas
            </Link>
            <Link
              href="/admin/commissions"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Comisiones
            </Link>
          </>
        }
      />

      {errorMessage ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}

      <AdminCard className="p-4 sm:p-5">
        <ExerciseLibraryManager
          initialExercises={exercises}
          initialCategories={categories}
          initialEditId={initialEditId}
        />
      </AdminCard>
    </AdminPage>
  );
}
