import AdminLibraryDuplicatesManager from "@/components/admin-library-duplicates-manager";
import { requireAdminLibraryPageAccess } from "@/lib/library/page-access";
import { loadAdminDuplicateGroups } from "@/lib/library/repository";

export const metadata = {
  title: "Library Duplicates | Admin",
};

export default async function AdminLibraryDuplicatesPage() {
  const { supabase } = await requireAdminLibraryPageAccess();
  const groups = await loadAdminDuplicateGroups({ db: supabase });

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-12 left-12 h-72 w-72 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[170px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header>
          <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Library / Duplicates</p>
          <h1 className="text-3xl font-semibold">Duplicate resolution</h1>
          <p className="text-sm text-muted">
            Choose a canonical record for each duplicate group and archive or merge the rest.
          </p>
        </header>

        <AdminLibraryDuplicatesManager initialGroups={groups} />
      </div>
    </section>
  );
}

