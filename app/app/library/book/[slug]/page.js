import Link from "next/link";
import { notFound } from "next/navigation";
import LibraryMyLibraryButton from "@/components/library-my-library-button";
import { resolveFlipbookVisiblePageNumber } from "@/lib/flipbook-core/presentation";
import { loadFlipbookProgress } from "@/lib/flipbook-services/progress-store";
import { requireStudentLibraryPageAccess } from "@/lib/library/page-access";
import {
  getPublishedLibraryBookBySlug,
  isMissingLibraryTableError,
  listRelatedLibraryBooks,
} from "@/lib/library/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function ChevronRightIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path d="M7 4.75 12.25 10 7 15.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h11v16h-11A2.5 2.5 0 0 0 5 21.5v-16Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8.5 7.5h6M8.5 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckCircleIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8.75 12 2.25 2.25 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.75v4.5l3 1.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatInteger(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe <= 0) return "N/D";
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(Math.round(safe));
}

function formatThousandsShort(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe <= 0) return "N/D";
  if (safe >= 1000) {
    const inThousands = Math.round(safe / 100) / 10;
    return `${inThousands}k`;
  }
  return formatInteger(safe);
}

function formatReadingDuration(minutes) {
  const safe = Number(minutes);
  if (!Number.isFinite(safe) || safe <= 0) return "N/D";
  const totalMinutes = Math.max(1, Math.round(safe));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function estimateStats({ pageCount = null, metadataWordCount = null } = {}) {
  const safePages = Number(pageCount);
  const resolvedPages = Number.isFinite(safePages) && safePages > 0 ? Math.round(safePages) : null;

  const safeMetadataWords = Number(metadataWordCount);
  const resolvedWords =
    Number.isFinite(safeMetadataWords) && safeMetadataWords > 0
      ? Math.round(safeMetadataWords)
      : resolvedPages
        ? Math.round(resolvedPages * 320)
        : null;

  const resolvedMinutes = resolvedWords ? resolvedWords / 220 : null;

  return {
    pages: resolvedPages,
    words: resolvedWords,
    readingMinutes: resolvedMinutes,
  };
}

function parseMetadataWordCount(metadata = null) {
  if (!metadata || typeof metadata !== "object") return null;

  const directCandidates = [
    metadata.wordCount,
    metadata.words,
    metadata.word_count,
    metadata.totalWords,
    metadata.total_words,
    metadata.readingWords,
    metadata.reading_words,
  ];

  for (const candidate of directCandidates) {
    const safe = Number(candidate);
    if (Number.isFinite(safe) && safe > 0) {
      return Math.round(safe);
    }
  }

  return null;
}

function resolveStatusAction(book) {
  const savedPageRaw = Number(book?.savedPageNumber);
  const savedPageFromNumber = Number.isFinite(savedPageRaw) && savedPageRaw > 0 ? Math.round(savedPageRaw) : null;
  const savedPageCodeText = String(book?.savedPageCode || "").trim();
  const savedPageFromCodeMatch = savedPageCodeText.match(/\d+/);
  const savedPageFromCode = savedPageFromCodeMatch?.[0] ? Number(savedPageFromCodeMatch[0]) : null;
  const currentPage = savedPageFromNumber || (Number.isFinite(savedPageFromCode) && savedPageFromCode > 0 ? savedPageFromCode : null);

  if (book?.completed) {
    return {
      icon: <CheckCircleIcon className="h-5 w-5" />,
      label: "Completado",
    };
  }

  if (currentPage) {
    return {
      icon: null,
      label: `Pagina ${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(currentPage)}`,
    };
  }

  if (book?.startedReading) {
    return {
      icon: <ClockIcon className="h-5 w-5" />,
      label: "En progreso",
    };
  }

  return {
    icon: null,
    label: "Sin leer",
  };
}

function StatCell({ label, value }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#98a1b4]">{label}</p>
      <p className="text-[1.5rem] font-semibold tracking-[-0.03em] text-primary sm:text-[2.1rem]">{value}</p>
    </div>
  );
}

function RelatedBookCard({ book }) {
  if (!book?.id) return null;

  return (
    <article className="group rounded-[20px] border border-[rgba(16,52,116,0.06)] bg-[#f4f6fb] p-4 transition hover:bg-white hover:shadow-[0px_14px_36px_rgba(0,25,67,0.08)]">
      <Link href={`/app/library/book/${book.slug}`} className="block">
        <div className="overflow-hidden rounded-[14px] bg-[#e8edf7]">
          {book.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverUrl}
              alt={book.title}
              className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-[#16366e] text-xs font-semibold uppercase tracking-[0.24em] text-white/80">
              EnglishMate
            </div>
          )}
        </div>
        <div className="pt-4">
          <h3 className="line-clamp-2 text-[1.25rem] font-semibold leading-[1.12] tracking-[-0.03em] text-primary sm:text-[1.45rem]">
            {book.title}
          </h3>
          <p className="mt-1 text-[0.95rem] text-[#4b5d86]">{book.authorDisplay || "Autor desconocido"}</p>
        </div>
      </Link>
    </article>
  );
}

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

  let flipbookState = null;
  try {
    flipbookState = await loadFlipbookProgress({
      db: supabase,
      userId: user.id,
      libraryBookId: book.id,
    });
  } catch {
    flipbookState = null;
  }

  const fallbackFlipbookPage = resolveFlipbookVisiblePageNumber(
    flipbookState?.savedPageIndex ?? flipbookState?.currentPageIndex
  );
  const statusBook = {
    ...book,
    completed: Boolean(book.completed || flipbookState?.completed),
    startedReading: Boolean(book.startedReading || flipbookState?.startedReading),
    savedPageNumber: book.savedPageNumber || fallbackFlipbookPage || null,
  };

  let manifestPageCount = null;
  let manifestWordCount = null;
  try {
    const { data: latestManifest, error: latestManifestError } = await supabase
      .from("library_flipbook_manifests")
      .select("page_count, metadata_json, generated_at")
      .eq("library_book_id", book.id)
      .order("generated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (latestManifestError) throw latestManifestError;
    manifestPageCount = Number(latestManifest?.page_count) || null;
    manifestWordCount = parseMetadataWordCount(latestManifest?.metadata_json || null);
  } catch (error) {
    if (!isMissingLibraryTableError(error, "library_flipbook_manifests")) {
      console.error("book detail manifest stats failed", error);
    }
  }

  const readHref = `/app/library/flipbook/${book.slug}`;
  const relatedBooks = await listRelatedLibraryBooks({
    db: supabase,
    book,
    userId: user.id,
    limit: 6,
  });

  const stats = estimateStats({
    pageCount: manifestPageCount,
    metadataWordCount: manifestWordCount,
  });
  const categoryLabel = book.category || "Biblioteca";
  const shortRelated = relatedBooks.slice(0, 3);
  const isRecommended = Boolean(book.featured);
  const statusAction = resolveStatusAction(statusBook);
  const primaryCtaLabel =
    statusBook.savedPageNumber || statusBook.savedPageCode || statusBook.startedReading ? "Continuar" : "Leer ahora";

  return (
    <section className="space-y-10 pb-2 text-foreground sm:space-y-12">
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-6 text-[#5e6576] sm:text-sm">
        <Link href="/app/library" className="transition hover:text-primary">
          Mi Biblioteca
        </Link>
        <ChevronRightIcon className="h-3.5 w-3.5 text-[#8f96a5]" />
        <span>{categoryLabel}</span>
        <ChevronRightIcon className="h-3.5 w-3.5 text-[#8f96a5]" />
        <span className="font-semibold text-primary">{book.title}</span>
      </nav>

      <article className="rounded-[16px] border border-white/70 bg-white px-5 py-5 shadow-[0px_16px_44px_rgba(0,25,67,0.08)] sm:px-8 sm:py-8 lg:px-10 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="w-full max-w-[360px] justify-self-center lg:max-w-none">
            <div className="relative">
              <div className="absolute -inset-1 rounded-[18px] bg-gradient-to-r from-primary/18 to-accent/15 blur-lg" />
              <div className="relative overflow-hidden rounded-[18px] border border-[rgba(16,52,116,0.08)] bg-[#eaf0fb] shadow-[0_30px_70px_rgba(0,0,0,0.2)]">
                {book.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={book.coverUrl} alt={book.title} className="aspect-[2/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[2/3] w-full items-center justify-center bg-[#183a70] text-xs font-semibold uppercase tracking-[0.26em] text-white/80">
                    EnglishMate
                  </div>
                )}
                {book.featured ? (
                  <span className="absolute bottom-4 right-4 rounded-full bg-white/92 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary shadow-sm">
                    Edicion especial
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-6 sm:space-y-7">
            <div className="flex flex-wrap gap-2">
              {book.cefrLevel ? (
                <span className="rounded-full bg-[#dbe5ff] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#334f84]">
                  Nivel {book.cefrLevel}
                </span>
              ) : null}
              {book.category ? (
                <span className="rounded-full bg-[#eef0f4] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#5e6576]">
                  {book.category}
                </span>
              ) : null}
              {isRecommended ? (
                <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#c0181f]">
                  Recomendado
                </span>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <h1 className="text-[2.35rem] font-semibold leading-[0.98] tracking-[-0.04em] text-primary sm:text-[3rem] lg:text-[3.6rem]">
                {book.title}
              </h1>
              <p className="text-[1.45rem] font-semibold text-[#304f88] sm:text-[1.7rem] lg:text-[2.2rem]">
                {book.authorDisplay || "Autor desconocido"}
              </p>
              {book.subtitle ? <p className="text-base text-[#6b7280]">{book.subtitle}</p> : null}
            </div>

            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#545d70]">Sinopsis del libro</h2>
              <p className="max-w-3xl text-[1rem] leading-[1.72] text-[#4b5161] sm:text-[1.08rem] lg:text-[1.12rem]">
                {book.description || "Este libro ya forma parte de la biblioteca y esta listo para leerse dentro de EnglishMate."}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 border-y border-[rgba(16,52,116,0.1)] py-5 sm:gap-4 sm:py-6">
              <StatCell label="Paginas" value={formatInteger(stats.pages)} />
              <StatCell label="Lectura" value={formatReadingDuration(stats.readingMinutes)} />
              <StatCell label="Palabras" value={formatThousandsShort(stats.words)} />
            </div>

            <div className="grid gap-3 pt-2 md:grid-cols-3 md:items-stretch">
              <Link
                href={readHref}
                className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-[14px] bg-gradient-to-br from-[#001f5a] to-[#123673] px-5 text-sm font-semibold tracking-normal text-white shadow-[0px_14px_34px_rgba(0,25,67,0.2)] transition hover:brightness-110 md:text-[0.95rem]"
              >
                <BookIcon className="h-5 w-5" />
                <span>{primaryCtaLabel}</span>
              </Link>

              <LibraryMyLibraryButton
                slug={book.slug}
                initialInMyLibrary={book.inMyLibrary}
                showBookmarkIcon
                labelIn="En biblioteca"
                labelOut="Agregar"
                className="w-full"
                buttonClassName="h-12 w-full rounded-[14px] px-5 py-0 !text-sm font-semibold normal-case tracking-normal md:!text-[0.95rem]"
                activeButtonClassName="border-[rgba(16,52,116,0.12)] bg-[#eef1f6] text-[#222b39] hover:bg-[#e8ecf4]"
                inactiveButtonClassName="border-[rgba(16,52,116,0.12)] bg-[#eef1f6] text-[#222b39] hover:bg-[#e8ecf4]"
              />

              <span className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[rgba(16,52,116,0.12)] bg-[#eef1f6] px-5 text-sm font-semibold text-[#222b39] md:text-[0.95rem]">
                {statusAction.icon}
                <span>{statusAction.label}</span>
              </span>
            </div>
          </div>
        </div>
      </article>

      <section className="space-y-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#525a6d]">Continuar leyendo</p>
            <h2 className="mt-1 text-[2.15rem] font-semibold leading-[1.02] tracking-[-0.04em] text-primary sm:text-[2.6rem] lg:text-[3.2rem]">
              Libros Relacionados
            </h2>
          </div>
          <Link href="/app/library" className="inline-flex items-center gap-2 text-base font-semibold text-primary transition hover:underline sm:text-lg">
            <span>Ver catalogo completo</span>
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>

        {shortRelated.length ? (
          <div className="grid gap-6 md:grid-cols-3">
            {shortRelated.map((relatedBook) => (
              <RelatedBookCard key={relatedBook.id} book={relatedBook} />
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-[rgba(16,52,116,0.16)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-6 py-10 text-center">
            <p className="text-lg font-semibold text-primary">Aun no hay libros relacionados</p>
            <p className="mt-2 text-sm text-[#5f6780]">Cuando haya mas titulos compatibles con este libro, apareceran aqui.</p>
          </div>
        )}
      </section>
    </section>
  );
}
