import AdminLibraryStagingManager from "@/components/admin-library-staging-manager";
import { requireAdminLibraryPageAccess } from "@/lib/library/page-access";
import { isMissingLibraryTableError, listLibraryStagingCandidates } from "@/lib/library/repository";

export const metadata = {
  title: "Library Staging | Admin",
};

export default async function AdminLibraryStagingPage() {
  const { supabase } = await requireAdminLibraryPageAccess();

  let stagingCandidates = [];
  let errorMessage = "";

  try {
    stagingCandidates = await listLibraryStagingCandidates({ db: supabase });
  } catch (error) {
    if (isMissingLibraryTableError(error, "library_book_staging")) {
      errorMessage = "Run the library staging migration before reviewing imported books.";
    } else {
      errorMessage = error?.message || "No se pudo cargar staging.";
    }
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-12 left-12 h-72 w-72 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[170px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header>
          <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Library / Staging</p>
          <h1 className="text-3xl font-semibold">Staging review</h1>
          <p className="text-sm text-muted">
            Edit metadata, publish or reject in bulk, and keep duplicate editions out of the student UI.
          </p>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <AdminLibraryStagingManager initialCandidates={stagingCandidates} />
      </div>
    </section>
  );
}
