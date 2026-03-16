"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import LibraryBookCard from "@/components/library-book-card";

function buildSearchParams({ query, cefrLevel, category, tag }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (cefrLevel) params.set("cefr", cefrLevel);
  if (category) params.set("category", category);
  if (tag) params.set("tag", tag);
  return params.toString();
}

function HorizontalBookRow({ title, books = [], subtitle = "" }) {
  if (!books.length) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-muted">{subtitle || "Fila sugerida"}</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">{title}</h2>
        </div>
        <p className="text-sm text-muted">{books.length} libros</p>
      </div>

      <div className="-mx-1 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4 px-1">
          {books.map((book) => (
            <div key={book.id} className="w-[240px] shrink-0">
              <LibraryBookCard book={book} compact />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function EmptyPanel({ title, description }) {
  return (
    <div className="student-empty-panel px-6 py-10 text-center">
      <p className="text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted">{description}</p>
    </div>
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
  const deferredQuery = useDeferredValue(query.trim());

  const filters = homePayload?.filters || {
    cefrOptions: [],
    categoryOptions: [],
    tagOptions: [],
  };
  const myLibrary = homePayload?.myLibrary || {
    currentlyReading: [],
    saved: [],
    completed: [],
  };
  const levelMatchedRows = homePayload?.levelMatchedRows || [];
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

  const myLibraryCount =
    (myLibrary.currentlyReading?.length || 0) +
    (myLibrary.saved?.length || 0) +
    (myLibrary.completed?.length || 0);

  return (
    <section className="space-y-8 text-foreground">
      <header className="student-panel overflow-hidden">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Biblioteca</p>
            <div className="space-y-2">
              <h1 className="max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
                Encuentra lecturas y retoma lo que dejaste pendiente
              </h1>
              <p className="max-w-2xl text-sm text-muted sm:text-base">
                Todos los títulos disponibles ya están aprobados y listos para leerse dentro de EnglishMate.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.24em] text-muted">
              <span>Mi biblioteca: {myLibraryCount}</span>
              <span>{studentLevel || "Todos los niveles"} por defecto</span>
              <span>Catálogo interno</span>
            </div>
          </div>

          <div className="student-panel-soft p-5">
            <div className="grid gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Buscar</label>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="mt-2 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm text-foreground"
                  placeholder="Título, autor o tag"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">CEFR</label>
                  <select
                    value={cefrLevel}
                    onChange={(event) => setCefrLevel(event.target.value)}
                    className="mt-2 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm text-foreground"
                  >
                    <option value="">Todos los niveles</option>
                    {filters.cefrOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Categoría</label>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="mt-2 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm text-foreground"
                  >
                    <option value="">Todas las categorías</option>
                    {filters.categoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Tag</label>
                  <select
                    value={tag}
                    onChange={(event) => setTag(event.target.value)}
                    className="mt-2 w-full rounded-[12px] border border-border bg-surface px-4 py-3 text-sm text-foreground"
                  >
                    <option value="">Todos los tags</option>
                    {filters.tagOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {hasActiveSearch ? (
        <section className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-muted">Search results</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                {loading ? "Buscando en biblioteca..." : `${results.length} resultado${results.length === 1 ? "" : "s"}`}
              </h2>
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </div>

          {results.length ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((book) => (
                <LibraryBookCard key={book.id} book={book} />
              ))}
            </div>
          ) : loading ? (
            <EmptyPanel title="Buscando en el catálogo" description="Se consultará solo el catálogo interno del campus." />
          ) : (
            <EmptyPanel title="No hay libros con esos filtros" description="Prueba una búsqueda más amplia o limpia uno de los filtros." />
          )}
        </section>
      ) : (
        <>
          <section className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-muted">Mi biblioteca</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">Tu colección de lectura</h2>
            </div>

            {myLibraryCount ? (
              <div className="space-y-8">
                <HorizontalBookRow
                  title="Leyendo ahora"
                  subtitle="Retoma desde tu último avance"
                  books={myLibrary.currentlyReading || []}
                />
                <HorizontalBookRow
                  title="Guardados"
                  subtitle="Libros que apartaste para después"
                  books={myLibrary.saved || []}
                />
                <HorizontalBookRow
                  title="Completados"
                  subtitle="Libros que ya terminaste"
                  books={myLibrary.completed || []}
                />
              </div>
            ) : (
              <EmptyPanel
                title="Tu biblioteca está vacía"
                description="Agrega un libro a tu biblioteca o abre una lectura para empezar tu estantería."
              />
            )}
          </section>

          <section className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-muted">Filas sugeridas</p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                {studentLevel ? `Categorías para ${studentLevel}` : "Explorar por categoría"}
              </h2>
            </div>

            {levelMatchedRows.length ? (
              <div className="space-y-8">
                {levelMatchedRows.map((row) => (
                  <HorizontalBookRow
                    key={row.category}
                    title={row.category}
                    subtitle={studentLevel ? `Coincidencia por nivel ${studentLevel}` : "Categoría sugerida"}
                    books={row.books}
                  />
                ))}
              </div>
            ) : (
              <EmptyPanel
                title="Aún no hay filas personalizadas"
                description="Completa más datos de nivel y categoría para enriquecer esta vista."
              />
            )}
          </section>
        </>
      )}
    </section>
  );
}
