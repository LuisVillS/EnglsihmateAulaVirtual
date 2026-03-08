import Link from "next/link";
import { notFound } from "next/navigation";
import AdminLibraryBookEditor from "@/components/admin-library-book-editor";
import { requireAdminLibraryPageAccess } from "@/lib/library/page-access";
import { getAdminLibraryBookById } from "@/lib/library/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLibraryBookPage({ params: paramsPromise }) {
  const { supabase } = await requireAdminLibraryPageAccess();
  const params = await paramsPromise;

  const book = await getAdminLibraryBookById({
    db: supabase,
    id: params?.id,
  });

  if (!book?.id) {
    notFound();
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-12 left-12 h-72 w-72 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[170px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Library / Book</p>
            <h1 className="text-3xl font-semibold">{book.title}</h1>
            <p className="text-sm text-muted">
              {book.authorDisplay || "Unknown author"} · {book.slug}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/library"
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Back to Library
            </Link>
            <Link
              href={`/app/library/book/${book.slug}`}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Student preview
            </Link>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-center rounded-xl bg-surface-2 p-4">
              {book.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={book.coverUrl} alt={book.title} className="w-full rounded-xl object-cover shadow-lg shadow-black/10" />
              ) : (
                <div className="flex aspect-[4/5] w-full items-center justify-center rounded-xl border border-dashed border-border bg-white text-xs uppercase tracking-[0.28em] text-muted">
                  No cover
                </div>
              )}
            </div>

            <div className="grid gap-3 text-sm text-muted">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Work key</p>
                <p className="mt-1 text-foreground">{book.openlibraryWorkKey || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Edition key</p>
                <p className="mt-1 text-foreground">{book.openlibraryEditionKey || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Archive identifier</p>
                <p className="mt-1 text-foreground">{book.internetArchiveIdentifier || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted">Source sync</p>
                <p className="mt-1 text-foreground">{book.sourceSyncStatus || "pending"}</p>
              </div>
            </div>
          </aside>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <AdminLibraryBookEditor initialBook={book} />
          </div>
        </div>
      </div>
    </section>
  );
}
