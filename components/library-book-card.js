import Link from "next/link";

export default function LibraryBookCard({ book, compact = false }) {
  if (!book) return null;

  return (
    <article className="group flex h-full flex-col bg-transparent transition">
      <Link href={`/app/library/book/${book.slug}`} className="flex flex-1 flex-col">
        <div
          className={`overflow-hidden border border-border/70 bg-surface-2 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.45)] transition duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.55)] ${
            compact ? "aspect-[7/10]" : "aspect-[7/10]"
          }`}
          style={{ borderRadius: "8px" }}
        >
          {book.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverUrl}
              alt={book.title}
              className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center border border-dashed border-border bg-[#f7f3ea] text-center text-xs font-semibold uppercase tracking-[0.25em] text-muted transition duration-500 ease-out group-hover:scale-[1.04]">
              EnglishMate
            </div>
          )}
        </div>

        <div className={`${compact ? "px-1 pb-1 pt-4" : "px-1 pb-1 pt-5"} space-y-1.5`}>
          <h3 className="line-clamp-2 text-[1.02rem] font-semibold leading-[1.28] tracking-[0.01em] text-foreground transition duration-300 ease-out group-hover:text-primary">
            {book.title}
          </h3>
          <p className="text-[0.82rem] leading-6 tracking-[0.03em] text-muted transition duration-300 ease-out group-hover:text-foreground/80">
            {book.authorDisplay || "Autor desconocido"}
          </p>
        </div>
      </Link>
    </article>
  );
}
