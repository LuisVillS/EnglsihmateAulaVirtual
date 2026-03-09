import Link from "next/link";
import { notFound } from "next/navigation";
import AdminLibraryBookEditor from "@/components/admin-library-book-editor";
import { requireAdminLibraryPageAccess } from "@/lib/library/page-access";
import { getAdminLibraryBookById } from "@/lib/library/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ADMIN_LIBRARY_SOURCE_FIELDS = [
  "id",
  "source_name",
  "source_role",
  "source_format",
  "source_status",
  "is_preferred_read",
  "readable",
].join(", ");

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

  const { data: sourceRows } = await supabase
    .from("library_book_sources")
    .select(ADMIN_LIBRARY_SOURCE_FIELDS)
    .eq("library_book_id", book.id)
    .order("created_at", { ascending: true });

  const sources = Array.isArray(sourceRows)
    ? sourceRows.map((source) => ({
        id: source.id,
        sourceName: source.source_name,
        sourceRole: source.source_role,
        sourceFormat: source.source_format,
        sourceStatus: source.source_status,
        isPreferredRead: Boolean(source.is_preferred_read),
        readable: Boolean(source.readable),
      }))
    : [];

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
              {book.authorDisplay || "Unknown author"} - {book.slug}
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

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">Sources</p>
              <div className="space-y-3 text-sm text-muted">
                {sources.map((source) => (
                  <div key={source.id || `${source.sourceName}-${source.sourceRole}`} className="rounded-xl border border-border bg-background px-3 py-3">
                    <p className="font-semibold text-foreground">
                      {source.sourceName} - {source.sourceRole}
                    </p>
                    <p className="mt-1">Status: {source.sourceStatus || "pending"}</p>
                    <p>Format: {source.sourceFormat || "n/a"}</p>
                    <p>Preferred read: {source.isPreferredRead ? "yes" : "no"}</p>
                    <p>Readable: {source.readable ? "yes" : "no"}</p>
                  </div>
                ))}
                {!sources.length ? <p>No linked source rows yet.</p> : null}
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
