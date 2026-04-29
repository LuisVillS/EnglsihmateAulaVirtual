"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

function buildSearchParams({ query, cefrLevel, category, tag }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (cefrLevel) params.set("cefr", cefrLevel);
  if (category) params.set("category", category);
  if (tag) params.set("tag", tag);
  return params.toString();
}

function SearchIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </svg>
  );
}

function ArrowRightIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}

function PlayCircleIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.75l5 3.25-5 3.25V8.75z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function formatLevelBadge(level) {
  return level ? `NIVEL ${String(level).toUpperCase()}` : "LECTURA";
}

function normalizeProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function getBookCover(book) {
  return book?.coverUrl || book?.thumbnailUrl || "";
}

function getBookAuthor(book) {
  return book?.authorDisplay || "Autor desconocido";
}

function getBookHref(book) {
  return `/app/library/book/${book.slug}`;
}

function getContinueHref(book) {
  return `/app/library/flipbook/${book.slug}`;
}

function dedupeBooks(books = []) {
  const seen = new Set();
  return books.filter((book) => {
    const id = String(book?.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function flattenRowBooks(levelMatchedRows = []) {
  return dedupeBooks(levelMatchedRows.flatMap((row) => row?.books || []));
}

function pickFeaturedBooks(myLibrary, levelMatchedRows) {
  const pool = dedupeBooks([
    ...(myLibrary?.currentlyReading || []),
    ...(myLibrary?.saved || []),
    ...(myLibrary?.completed || []),
    ...flattenRowBooks(levelMatchedRows),
  ]);

  return pool.slice(0, 2);
}

function pickShelfRows(levelMatchedRows = []) {
  const nonEmptyRows = (levelMatchedRows || []).filter((row) => Array.isArray(row?.books) && row.books.length);
  const primary = nonEmptyRows[0] || null;
  const secondary =
    nonEmptyRows.find((row) => row?.category && row.category !== primary?.category) ||
    nonEmptyRows[1] ||
    primary ||
    null;

  return {
    recommendedRow: primary,
    categoryRow: secondary,
  };
}

function SectionHeading({ eyebrow, title, action = null }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted/80">{eyebrow}</p>
        <h2 className="mt-2 text-[1.95rem] font-semibold leading-none tracking-[-0.03em] text-primary sm:text-[2.15rem]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function LibraryCover({ book, alt, className = "", fallbackClassName = "" }) {
  const coverUrl = getBookCover(book);

  if (!coverUrl) {
    return (
      <div
        className={`flex items-center justify-center rounded-[18px] bg-[#17386f] px-5 text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-white/82 ${fallbackClassName}`}
      >
        EnglishMate
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverUrl}
      alt={alt}
      className={`rounded-[18px] object-cover shadow-[0_24px_50px_rgba(0,0,0,0.18)] ${className}`}
    />
  );
}

function FeaturedReadingCard({ book }) {
  if (!book) {
    return (
      <article className="relative overflow-hidden rounded-[34px] border border-[rgba(16,52,116,0.08)] bg-white p-6 shadow-[0px_18px_46px_rgba(0,25,67,0.06)] sm:p-7">
        <div className="absolute -right-14 -top-14 h-36 w-36 rounded-full bg-[#dbe6ff]/70 blur-3xl" />
        <div className="relative flex min-h-[250px] flex-col items-start justify-center rounded-[26px] border border-dashed border-border/90 bg-[#f8fbff] px-6 py-8">
          <p className="text-sm font-semibold text-primary">Aún no tienes una segunda lectura activa</p>
          <p className="mt-2 max-w-[26ch] text-sm leading-6 text-muted">
            Abre otro título de la biblioteca y aparecerá aquí para continuar desde el último avance.
          </p>
        </div>
      </article>
    );
  }

  const progress = normalizeProgress(book.progressPercent);

  return (
    <article className="group relative overflow-hidden rounded-[34px] border border-[rgba(16,52,116,0.08)] bg-white p-6 shadow-[0px_18px_46px_rgba(0,25,67,0.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0px_24px_56px_rgba(0,25,67,0.1)] sm:p-7">
      <div className="absolute -right-14 -top-14 h-36 w-36 rounded-full bg-[#dbe6ff]/70 blur-3xl transition group-hover:bg-[#d2ddff]" />
      <div className="relative grid gap-6 min-[460px]:grid-cols-[132px_minmax(0,1fr)] min-[460px]:items-center md:grid-cols-[148px_minmax(0,1fr)]">
        <div className="flex justify-center min-[460px]:justify-start">
          <LibraryCover
            book={book}
            alt={book.title}
            className="h-[190px] w-[128px] bg-[#eff4ff] transition duration-500 group-hover:scale-[1.03] min-[460px]:h-[198px] min-[460px]:w-[132px] sm:h-[210px] sm:w-[142px]"
            fallbackClassName="h-[190px] w-[128px] min-[460px]:h-[198px] min-[460px]:w-[132px] sm:h-[210px] sm:w-[142px]"
          />
        </div>

        <div className="flex min-w-0 flex-col justify-between">
          <div>
            <span className="inline-flex rounded-full bg-[#dfe6ff] px-3 py-1 text-[10px] font-bold tracking-[0.08em] text-[#51638c]">
              {formatLevelBadge(book.cefrLevel)}
            </span>
            <h3 className="mt-5 max-w-[12ch] text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-primary">
              {book.title}
            </h3>
            <p className="mt-2 text-[1.05rem] leading-7 text-[#4f5564]">{getBookAuthor(book)}</p>
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between text-[11px] font-semibold text-[#626a7a]">
              <span>Progreso</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#dbe4f6]">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>

            <Link
              href={getContinueHref(book)}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 self-start rounded-[14px] bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-2 min-[460px]:w-auto"
            >
              <PlayCircleIcon className="h-4 w-4" />
              <span>Leer ahora</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function ShelfBookCard({ book, compact = false }) {
  if (!book) return null;

  const coverWidth = compact ? "w-[140px] sm:w-[164px]" : "w-[146px] sm:w-[172px]";
  const coverHeight = compact ? "h-[208px] sm:h-[244px]" : "h-[216px] sm:h-[254px]";

  return (
    <article className={`group shrink-0 snap-start ${coverWidth} transition duration-300 hover:-translate-y-2`}>
      <Link href={getBookHref(book)} className="block">
        <div
          className={`relative overflow-hidden rounded-[22px] border border-[rgba(16,52,116,0.06)] bg-white shadow-[0px_14px_34px_rgba(0,25,67,0.08)]`}
        >
          <LibraryCover
            book={book}
            alt={book.title}
            className={`w-full ${coverHeight} rounded-none bg-[#eff4ff] shadow-none transition duration-500 group-hover:scale-[1.04]`}
            fallbackClassName={`w-full ${coverHeight} rounded-none`}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(16,52,116,0.74)] opacity-0 transition duration-300 group-hover:opacity-100">
            <span className="rounded-[12px] bg-white px-4 py-2 text-sm font-semibold text-primary shadow-lg">Ver detalles</span>
          </div>
        </div>
      </Link>

      <div className="px-1 pb-1 pt-4">
        <Link href={getBookHref(book)} className="block">
          <h3 className="line-clamp-2 text-[1.05rem] font-semibold leading-[1.22] tracking-[-0.02em] text-primary">
            {book.title}
          </h3>
          <p className="mt-1.5 text-[0.92rem] leading-6 text-[#656d7d]">{getBookAuthor(book)}</p>
        </Link>
      </div>
    </article>
  );
}

function HorizontalShelf({ eyebrow, title, books = [] }) {
  return (
    <section className="space-y-8">
      <SectionHeading eyebrow={eyebrow} title={title} />

      {books.length ? (
        <div className="-mx-1 overflow-x-auto pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max snap-x snap-proximity gap-5 px-1 sm:gap-6">
            {books.map((book) => (
              <ShelfBookCard key={book.id} book={book} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyPanel
          title="No hay libros disponibles en esta fila"
          description="Cuando haya más lecturas publicadas para esta selección, aparecerán aquí."
        />
      )}
    </section>
  );
}

function EmptyPanel({ title, description }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[rgba(16,52,116,0.16)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-6 py-10 text-center shadow-[0px_12px_28px_rgba(0,25,67,0.03)]">
      <p className="text-lg font-semibold text-primary">{title}</p>
      <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

function HistoryGroup({ title, books = [] }) {
  if (!books.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-primary">{title}</h3>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">{books.length} libros</p>
      </div>
      <div className="-mx-1 overflow-x-auto pb-3">
        <div className="flex min-w-max gap-4 px-1">
          {books.map((book) => (
            <ShelfBookCard key={book.id} book={book} compact />
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchResultsSection({ loading, error, results }) {
  return (
    <section className="space-y-8">
      <SectionHeading
        eyebrow="RESULTADOS"
        title={loading ? "Buscando en tu biblioteca" : `${results.length} resultado${results.length === 1 ? "" : "s"}`}
        action={error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      />

      {results.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((book) => (
            <ShelfBookCard key={book.id} book={book} />
          ))}
        </div>
      ) : loading ? (
        <EmptyPanel title="Consultando el catálogo interno" description="Estamos cargando títulos, autores y etiquetas desde la biblioteca real." />
      ) : (
        <EmptyPanel title="No encontramos libros con esos filtros" description="Prueba una búsqueda más amplia o limpia alguno de los filtros." />
      )}
    </section>
  );
}

export default function StudentLibraryBrowser({ homePayload, studentLevel = "" }) {
  const [query, setQuery] = useState("");
  const [cefrLevel, setCefrLevel] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const deferredQuery = useDeferredValue(query.trim());

  const filters = useMemo(
    () =>
      homePayload?.filters || {
        cefrOptions: [],
        categoryOptions: [],
        tagOptions: [],
      },
    [homePayload]
  );
  const myLibrary = useMemo(
    () =>
      homePayload?.myLibrary || {
        currentlyReading: [],
        saved: [],
        completed: [],
      },
    [homePayload]
  );
  const levelMatchedRows = useMemo(() => homePayload?.levelMatchedRows || [], [homePayload]);
  const hasActiveSearch = Boolean(deferredQuery || cefrLevel || category || tag);

  useEffect(() => {
    if (!hasActiveSearch) {
      setResults([]);
      setError("");
      setLoading(false);
      return undefined;
    }

    let active = true;
    const controller = new AbortController();

    async function loadResults() {
      setLoading(true);
      setError("");

      try {
        const params = buildSearchParams({
          query: deferredQuery,
          cefrLevel,
          category,
          tag,
        });
        const response = await fetch(`/api/library/books?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo buscar en la biblioteca.");
        }

        if (active) {
          startTransition(() => {
            setResults(Array.isArray(payload?.books) ? payload.books : []);
          });
        }
      } catch (requestError) {
        if (active && requestError?.name !== "AbortError") {
          setError(requestError?.message || "No se pudo buscar en la biblioteca.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadResults();
    return () => {
      active = false;
      controller.abort();
    };
  }, [category, cefrLevel, deferredQuery, hasActiveSearch, tag]);

  const featuredBooks = useMemo(() => pickFeaturedBooks(myLibrary, levelMatchedRows), [levelMatchedRows, myLibrary]);
  const { recommendedRow, categoryRow } = useMemo(() => pickShelfRows(levelMatchedRows), [levelMatchedRows]);
  const historyCount =
    (myLibrary.currentlyReading?.length || 0) + (myLibrary.saved?.length || 0) + (myLibrary.completed?.length || 0);

  return (
    <section className="space-y-12 pb-4 text-foreground sm:space-y-16">
      <section className="max-w-3xl space-y-5 pt-2">
        <h1 className="text-[2.45rem] font-semibold leading-none tracking-[-0.05em] text-primary sm:text-[3.1rem]">
          Biblioteca
        </h1>
        <p className="text-[1.08rem] leading-[1.75] text-[#5d6575] sm:text-[1.15rem]">
          Encuentra lecturas y retoma lo que dejaste pendiente. Todos los títulos están aprobados y listos para leerse dentro de{" "}
          <span className="font-semibold text-primary">EnglishMate.</span>
        </p>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)] p-5 shadow-[0px_18px_48px_rgba(0,25,67,0.08)] sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7c8494]">
              <SearchIcon className="h-5 w-5" />
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-12 w-full rounded-[16px] border border-transparent bg-[#f2f4f8] px-12 py-3 text-sm text-foreground outline-none transition focus:border-primary/15 focus:bg-white focus:ring-2 focus:ring-primary/8"
              placeholder="Buscar por título, autor o etiqueta..."
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:flex xl:w-auto xl:flex-wrap xl:justify-end">
            <select
              value={cefrLevel}
              onChange={(event) => setCefrLevel(event.target.value)}
              className="min-h-12 min-w-0 rounded-[16px] border border-transparent bg-[#f2f4f8] px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary/15 focus:bg-white focus:ring-2 focus:ring-primary/8 xl:min-w-[146px]"
            >
              <option value="">Nivel CEFR</option>
              {filters.cefrOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="min-h-12 min-w-0 rounded-[16px] border border-transparent bg-[#f2f4f8] px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary/15 focus:bg-white focus:ring-2 focus:ring-primary/8 xl:min-w-[146px]"
            >
              <option value="">Categoría</option>
              {filters.categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              className="min-h-12 min-w-0 rounded-[16px] border border-transparent bg-[#f2f4f8] px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary/15 focus:bg-white focus:ring-2 focus:ring-primary/8 xl:min-w-[146px]"
            >
              <option value="">Etiqueta</option>
              {filters.tagOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {hasActiveSearch ? (
        <SearchResultsSection loading={loading} error={error} results={results} />
      ) : (
        <>
          <section className="space-y-8">
            <SectionHeading
              eyebrow="RECIENTE"
              title="Continuar Lectura"
              action={
                <button
                  type="button"
                  onClick={() => setShowHistory((current) => !current)}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:opacity-80"
                >
                  <span>{showHistory ? "Ocultar historial" : "Ver todo el historial"}</span>
                  <ArrowRightIcon className={`h-4 w-4 transition ${showHistory ? "rotate-90" : ""}`} />
                </button>
              }
            />

            <div className="grid gap-6 xl:grid-cols-2">
              <FeaturedReadingCard book={featuredBooks[0] || null} />
              <FeaturedReadingCard book={featuredBooks[1] || null} />
            </div>

            {showHistory ? (
              <div className="rounded-[30px] border border-[rgba(16,52,116,0.08)] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-[0px_14px_36px_rgba(0,25,67,0.05)] sm:p-6">
                {historyCount ? (
                  <div className="space-y-8">
                    <HistoryGroup title="Leyendo ahora" books={myLibrary.currentlyReading || []} />
                    <HistoryGroup title="Guardados" books={myLibrary.saved || []} />
                    <HistoryGroup title="Completados" books={myLibrary.completed || []} />
                  </div>
                ) : (
                  <EmptyPanel
                    title="Todavía no hay historial de lectura"
                    description="Cuando abras o guardes libros, tu historial aparecerá aquí sin alterar la composición principal."
                  />
                )}
              </div>
            ) : null}
          </section>

          <HorizontalShelf
            eyebrow="PERSONALIZADO"
            title={studentLevel ? `Recomendado para tu nivel (${studentLevel})` : "Recomendado para ti"}
            books={recommendedRow?.books || []}
          />

          <HorizontalShelf
            eyebrow="GÉNERO"
            title={categoryRow?.category ? `Categoría: ${categoryRow.category}` : "Categoría destacada"}
            books={categoryRow?.books || []}
          />

          {!featuredBooks.length && !(recommendedRow?.books || []).length && !(categoryRow?.books || []).length ? (
            <EmptyPanel
              title="La biblioteca todavía no tiene lecturas listas para mostrar"
              description="Cuando Supabase devuelva títulos publicados y legibles, esta superficie editorial se poblará automáticamente."
            />
          ) : null}
        </>
      )}
    </section>
  );
}
