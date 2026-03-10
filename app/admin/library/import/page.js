import AdminLibraryImportManager from "@/components/admin-library-import-manager";
import { requireAdminLibraryPageAccess } from "@/lib/library/page-access";

export const metadata = {
  title: "Import Library Books | Admin",
};

export default async function AdminLibraryImportPage() {
  await requireAdminLibraryPageAccess();

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-12 left-12 h-72 w-72 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[170px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header>
          <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Library / Import</p>
          <h1 className="text-3xl font-semibold">Import from Gutenberg</h1>
          <p className="text-sm text-muted">
            Search Gutenberg metadata, preview candidates, attach an EPUB, and publish directly into the library.
          </p>
        </header>

        <AdminLibraryImportManager />
      </div>
    </section>
  );
}
