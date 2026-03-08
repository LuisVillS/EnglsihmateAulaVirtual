import Link from "next/link";
import LibrarySavedPageBadge from "@/components/library-saved-page-badge";
import { buildLibraryBookProgressLabel } from "@/lib/library/read-state";

function BookChip({ children, tone = "neutral" }) {
  const toneClass =
    tone === "primary"
      ? "border-primary/25 bg-primary/10 text-primary"
      : "border-border bg-surface-2 text-muted";

  return (
    <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

export default function LibraryBookCard({ book, compact = false }) {
  if (!book) return null;

  const ctaLabel = book.savedPageNumber || book.savedPageCode || book.startedReading ? "Continue reading" : "Read now";
  const progressLabel = buildLibraryBookProgressLabel(book);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-xl">
      <Link href={`/app/library/book/${book.slug}`} className="flex flex-1 flex-col">
        <div className={`flex items-center justify-center bg-surface-2 ${compact ? "aspect-[4/5] p-4" : "aspect-[4/5] p-5"}`}>
          {book.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverUrl}
              alt={book.title}
              className="h-full w-full rounded-xl object-cover shadow-lg shadow-black/10"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border bg-white text-center text-xs font-semibold uppercase tracking-[0.25em] text-muted">
              EnglishMate
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-4 border-t border-border px-5 py-5">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {book.cefrLevel ? <BookChip tone="primary">{book.cefrLevel}</BookChip> : null}
              {book.category ? <BookChip>{book.category}</BookChip> : null}
              {book.inMyLibrary ? <BookChip>My Library</BookChip> : null}
              {compact && book.savedPageNumber ? <LibrarySavedPageBadge pageNumber={book.savedPageNumber} compact /> : null}
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-tight text-foreground">{book.title}</h3>
              {book.subtitle ? <p className="mt-1 text-sm text-muted">{book.subtitle}</p> : null}
            </div>
            <p className="text-sm text-muted">{book.authorDisplay || "Unknown author"}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {book.tags.slice(0, compact ? 2 : 3).map((tag) => (
              <BookChip key={tag}>{tag}</BookChip>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.24em] text-muted">{progressLabel}</span>
            <span className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition group-hover:bg-primary-2">
              {ctaLabel}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
