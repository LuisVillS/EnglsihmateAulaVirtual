import StudentLibraryBrowser from "@/components/student-library-browser";
import { requireStudentLibraryPageAccess } from "@/lib/library/page-access";
import {
  isMissingLibraryTableError,
  loadStudentLibraryHome,
  loadStudentLibraryProfile,
} from "@/lib/library/repository";

export const metadata = {
  title: "Biblioteca | Aula Virtual",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryPage() {
  const { supabase, user } = await requireStudentLibraryPageAccess();

  let homePayload = {
    filters: {
      cefrOptions: [],
      categoryOptions: [],
      tagOptions: [],
    },
    myLibrary: {
      currentlyReading: [],
      saved: [],
      completed: [],
    },
    levelMatchedRows: [],
  };
  let studentLevel = "";
  let errorMessage = "";

  try {
    const profile = await loadStudentLibraryProfile({
      db: supabase,
      userId: user.id,
    });
    studentLevel = profile?.cefrLevel || "";
    homePayload = await loadStudentLibraryHome({
      db: supabase,
      userId: user.id,
      profileLevel: profile?.courseLevel || profile?.cefrLevel || "",
    });
  } catch (error) {
    if (isMissingLibraryTableError(error, "library_books")) {
      errorMessage = "Las tablas de biblioteca todavía no están disponibles. Ejecuta primero la migración más reciente de Supabase.";
    } else {
      errorMessage = error?.message || "No se pudo cargar la biblioteca.";
    }
  }

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <div className="rounded-[12px] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}
      <StudentLibraryBrowser homePayload={homePayload} studentLevel={studentLevel} />
    </div>
  );
}
