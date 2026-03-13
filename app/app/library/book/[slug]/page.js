import Link from "next/link";
import { notFound } from "next/navigation";
import LibraryBookCard from "@/components/library-book-card";
import LibraryMyLibraryButton from "@/components/library-my-library-button";
import LibrarySavedPageBadge from "@/components/library-saved-page-badge";
import { requireStudentLibraryPageAccess } from "@/lib/library/page-access";
import { buildLibraryResumeHint } from "@/lib/library/read-state";
import { getPublishedLibraryBookBySlug, listRelatedLibraryBooks } from "@/lib/library/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LibraryBookDetailPage({ params: paramsPromise }) {
  const { supabase, user } = await requireStudentLibraryPageAccess();
  const params = await paramsPromise;

  const book = await getPublishedLibraryBookBySlug({
    db: supabase,
    slug: params?.slug,
    userId: user.id,
  });

  if (!book?.id) {
    notFound();
  }

  const { data: sourceRows } = await supabase
    .from("library_book_sources")
    .select("id, source_format, source_status, readable, is_preferred_read, updated_at")
    .eq("library_book_id", book.id)
    .eq("source_status", "active")
    .eq("readable", true)
    .order("is_preferred_read", { ascending: false })
    .order("updated_at", { ascending: false });

  const hasPreferredEpubSource = (Array.isArray(sourceRows) ? sourceRows : []).some(
    (source) => source?.source_format === "epub"
  );
  const readHref = hasPreferredEpubSource ? `/app/library/epub/${book.slug}` : `/app/library/read/${book.slug}`;
  const flipbookHref = hasPreferredEpubSource ? `/app/library/flipbook/${book.slug}` : "";

  const relatedBooks = await listRelatedLibraryBooks({
    db: supabase,
    book,
    userId: user.id,
    limit: 4,
  });

  return (
    <section className="space-y-8 text-foreground">
      <div className="grid gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm lg:grid-cols-[280px_minmax(0,1fr)] lg:p-8">
        <div className="flex items-center justify-center rounded-xl bg-surface-2 p-5">
          {book.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.coverUrl} alt={book.title} className="w-full rounded-xl object-cover shadow-xl shadow-black/10" />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center rounded-xl border border-dashed border-border bg-white text-xs uppercase tracking-[0.3em] text-muted">
              EnglishMate
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="space-y-3">
            <Link href="/app/library" className="text-xs uppercase tracking-[0.28em] text-muted hover:text-primary">
              EnglishMate Library
            </Link>
            <div className="flex flex-wrap gap-2">
              {book.cefrLevel ? (
                <span className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {book.cefrLevel}
                </span>
              ) : null}
              {book.category ? (
                <span className="rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                  {book.category}
                </span>
              ) : null}
            </div>
            <div>
              <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{book.title}</h1>
              {book.subtitle ? <p className="mt-2 text-lg text-muted">{book.subtitle}</p> : null}
            </div>
            <p className="text-sm text-muted">by {book.authorDisplay || "Unknown author"}</p>
          </div>

          <p className="max-w-3xl text-sm leading-7 text-muted">
            {book.description || "This book was added to the curated library and is ready to read inside EnglishMate."}
          </p>

          <div className="flex flex-wrap gap-2">
            {book.tags.length ? (
              book.tags.map((tag) => (
                <span key={tag} className="rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs text-muted">
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-sm text-muted">No tags assigned yet.</span>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={readHref}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              {book.savedPageNumber || book.savedPageCode || book.startedReading ? "Continue Reading" : "Read now"}
            </Link>
            {hasPreferredEpubSource ? (
              <Link
                href={flipbookHref}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-surface-2 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                Open flipbook
              </Link>
            ) : null}
            <LibraryMyLibraryButton slug={book.slug} initialInMyLibrary={book.inMyLibrary} />
          </div>
          {book.savedPageNumber || book.savedPageCode ? (
            <div className="space-y-2">
              {book.savedPageNumber ? <LibrarySavedPageBadge pageNumber={book.savedPageNumber} /> : null}
              <p className="text-sm text-muted">
                {buildLibraryResumeHint(book.savedPageNumber, book.savedPageCode)} the next time you open this book.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Related books</p>
          <h2 className="mt-2 text-2xl font-semibold">More from the curated shelf</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {relatedBooks.map((relatedBook) => (
            <LibraryBookCard key={relatedBook.id} book={relatedBook} compact />
          ))}
        </div>
      </div>
    </section>
  );
}
