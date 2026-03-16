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
  const readHref = `/app/library/flipbook/${book.slug}`;
  const relatedBooks = await listRelatedLibraryBooks({
    db: supabase,
    book,
    userId: user.id,
    limit: 4,
  });

  return (
    <section className="space-y-8 text-foreground">
      <div className="student-panel grid gap-6 p-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-7">
        <div className="student-panel-soft flex items-center justify-center p-5 lg:p-6">
          {book.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.coverUrl} alt={book.title} className="w-full max-w-[300px] rounded-[12px] object-cover shadow-[0_28px_64px_rgba(0,0,0,0.18)]" />
          ) : (
            <div className="flex aspect-[4/5] w-full items-center justify-center rounded-[12px] border border-dashed border-border bg-white text-xs uppercase tracking-[0.3em] text-muted">
              EnglishMate
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <Link href="/app/library" className="text-xs uppercase tracking-[0.28em] text-muted hover:text-primary">
              Biblioteca
            </Link>
            <LibraryMyLibraryButton
              slug={book.slug}
              initialInMyLibrary={book.inMyLibrary}
              compact
              showBookmarkIcon
              labelIn="En mi biblioteca"
              labelOut="Agregar a mi biblioteca"
              className="shrink-0"
              buttonClassName="rounded-[999px] px-4 py-2 text-[11px] uppercase tracking-[0.18em]"
              activeButtonClassName="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
              inactiveButtonClassName="border-border bg-surface-2 text-muted hover:border-primary/35 hover:bg-primary/5 hover:text-primary"
            />
          </div>

          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Lectura seleccionada</p>
            <div className="flex flex-wrap gap-2">
              {book.cefrLevel ? (
                <span className="rounded-[10px] border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {book.cefrLevel}
                </span>
              ) : null}
              {book.category ? (
                <span className="rounded-[10px] border border-border bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                  {book.category}
                </span>
              ) : null}
            </div>
            <div>
              <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{book.title}</h1>
              {book.subtitle ? <p className="mt-2 text-lg text-muted">{book.subtitle}</p> : null}
            </div>
            <p className="text-sm text-muted">Por {book.authorDisplay || "Autor desconocido"}</p>
          </div>

          <p className="max-w-3xl text-sm leading-7 text-muted">
            {book.description || "Este libro ya forma parte de la biblioteca y está listo para leerse dentro de EnglishMate."}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={readHref}
              className="student-button-primary inline-flex min-w-[180px] items-center justify-center px-6 py-3.5 text-sm font-semibold"
            >
              {book.savedPageNumber || book.savedPageCode || book.startedReading ? "Continuar lectura" : "Leer libro"}
            </Link>
            {hasPreferredEpubSource ? <span className="text-sm text-muted">Abrir en el lector premium tipo flipbook.</span> : null}
          </div>
          {book.savedPageNumber || book.savedPageCode ? (
            <div className="student-panel-soft px-4 py-3">
              {book.savedPageNumber ? <LibrarySavedPageBadge pageNumber={book.savedPageNumber} /> : null}
              <p className="mt-2 text-sm text-muted">
                {buildLibraryResumeHint(book.savedPageNumber, book.savedPageCode)} la próxima vez que abras este libro.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Libros relacionados</p>
          <h2 className="mt-2 text-2xl font-semibold">Más títulos para seguir leyendo</h2>
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
