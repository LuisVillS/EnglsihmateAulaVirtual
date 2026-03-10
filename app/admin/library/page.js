import Link from "next/link";
import { requireAdminLibraryPageAccess } from "@/lib/library/page-access";
import { isMissingLibraryTableError, loadAdminLibraryOverview } from "@/lib/library/repository";

export const metadata = {
  title: "Library | Admin",
};

export default async function AdminLibraryPage() {
  const { supabase } = await requireAdminLibraryPageAccess();

  let overview = null;
  let errorMessage = "";

  try {
    overview = await loadAdminLibraryOverview({ db: supabase });
  } catch (error) {
    if (isMissingLibraryTableError(error, "library_books")) {
      errorMessage = "Run the EnglishMate Library migration in Supabase before using this section.";
    } else {
      errorMessage = error?.message || "No se pudo cargar Library admin.";
    }
  }

  const counts = overview?.counts || {
    published: 0,
    archived: 0,
    staging: 0,
    pendingReview: 0,
    duplicates: 0,
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-12 left-12 h-72 w-72 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[170px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Library</p>
            <h1 className="text-3xl font-semibold">EnglishMate Library</h1>
            <p className="text-sm text-muted">
              Curated student catalog powered by Gutenberg metadata and EnglishMate’s internal EPUB reading flow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/library/import"
              className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              Publish books
            </Link>
            <Link
              href="/admin/library/duplicates"
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Resolve duplicates
            </Link>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { label: "Published", value: counts.published, helper: "Visible to students" },
            { label: "Archived", value: counts.archived, helper: "Kept for history, hidden from students" },
            { label: "Duplicate groups", value: counts.duplicates, helper: "Potential conflicts to resolve" },
          ].map((card) => (
            <article key={card.label} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">{card.label}</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{card.value}</p>
              <p className="mt-2 text-sm text-muted">{card.helper}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted">Recent published books</p>
                <h2 className="mt-2 text-2xl font-semibold">Catalog snapshot</h2>
              </div>
              <Link
                href="/admin/library/import"
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
              >
                Publish more
              </Link>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Author</th>
                    <th className="px-3 py-2">CEFR</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.books || []).slice(0, 8).map((book) => (
                    <tr key={book.id} className="border-t border-border text-foreground">
                      <td className="px-3 py-2">{book.title}</td>
                      <td className="px-3 py-2">{book.authorDisplay || "-"}</td>
                      <td className="px-3 py-2">{book.cefrLevel || "-"}</td>
                      <td className="px-3 py-2">{book.active ? book.publishStatus : "archived"}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/admin/library/books/${book.id}`}
                          className="rounded-xl border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!overview?.books?.length ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                        No published books yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Operational focus</p>
            <h2 className="mt-2 text-2xl font-semibold">What needs attention</h2>
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <p className="text-sm font-semibold text-foreground">Direct publishing flow</p>
                <p className="mt-1 text-sm text-muted">
                  Search Gutenberg, optionally attach an EPUB, and publish straight to the student catalog.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <p className="text-sm font-semibold text-foreground">Duplicate resolution queue</p>
                <p className="mt-1 text-sm text-muted">
                  {counts.duplicates} duplicate group(s) detected across published records.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <p className="text-sm font-semibold text-foreground">Reader source priority</p>
                <p className="mt-1 text-sm text-muted">
                  Uploaded EPUBs stay the primary readable source, with Gutenberg used only for catalog metadata.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
