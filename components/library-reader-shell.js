"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LibraryBookCard from "@/components/library-book-card";
import LibraryFloatingBookmarkPanel from "@/components/library-floating-bookmark-panel";
import LibraryReaderFullscreenButton from "@/components/library-reader-fullscreen-button";
import LibraryReaderTopBar from "@/components/library-reader-top-bar";
import { useBookReadState } from "@/hooks/use-book-read-state";
import {
  buildLibraryReaderEmbedUrl,
  extractLibraryPageNumber,
  extractLibraryReaderFragmentMessage,
  isAllowedLibraryEmbedOrigin,
  resolveLibraryReaderMode,
} from "@/lib/library/embed";
import { resolveLibraryResumeTarget } from "@/lib/library/read-state";
import {
  applyLibrarySavedBookmarkState,
  isLibraryFullscreenSupported,
  isLibraryReaderFullscreen,
  toggleLibraryReaderFullscreen,
} from "@/lib/library/reader-ui";

export default function LibraryReaderShell({ initialBook, initialRelatedBooks = [] }) {
  const readerShellRef = useRef(null);
  const [payload, setPayload] = useState({
    book: initialBook,
    reader: {
      embedUrl: initialBook?.embedUrl || "",
      internetArchiveIdentifier: initialBook?.internetArchiveIdentifier || "",
    },
    readState: initialBook?.userState || null,
    relatedBooks: initialRelatedBooks,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showUnavailableHint, setShowUnavailableHint] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [detectedReaderFragment, setDetectedReaderFragment] = useState("");
  const [detectedReaderPageNumber, setDetectedReaderPageNumber] = useState(null);
  const {
    readState,
    setReadState,
    saving,
    error: readStateError,
    refreshReadState,
    savePlace,
    clearPlace,
  } = useBookReadState(initialBook.slug, payload.readState || null);

  useEffect(() => {
    let active = true;

    async function loadReader() {
      try {
        const response = await fetch(`/api/library/books/${initialBook.slug}/read`, {
          cache: "no-store",
        });
        const nextPayload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(nextPayload?.error || "No se pudo abrir el lector.");
        }
        if (active) {
          setPayload({
            book: nextPayload.book || initialBook,
            reader: nextPayload.reader || {
              embedUrl: initialBook?.embedUrl || "",
              internetArchiveIdentifier: initialBook?.internetArchiveIdentifier || "",
            },
            readState: nextPayload.readState || null,
            relatedBooks: nextPayload.relatedBooks || initialRelatedBooks,
          });
          setReadState(nextPayload.readState || null);
          setError("");
        }
      } catch (requestError) {
        if (active) {
          setError(requestError?.message || "No se pudo abrir el lector.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadReader();
    return () => {
      active = false;
    };
  }, [initialBook, initialRelatedBooks, setReadState]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsMobile(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(
        isLibraryReaderFullscreen({
          element: readerShellRef.current,
          documentRef: document,
        })
      );
    };

    syncFullscreen();
    setFullscreenSupported(
      isLibraryFullscreenSupported({
        element: readerShellRef.current,
        documentRef: document,
      })
    );

    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (!payload?.reader?.embedUrl || iframeLoaded) {
      setShowUnavailableHint(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setShowUnavailableHint(true);
    }, 9000);

    return () => window.clearTimeout(timeoutId);
  }, [iframeLoaded, payload?.reader?.embedUrl]);

  useEffect(() => {
    function handleReaderMessage(event) {
      if (!isAllowedLibraryEmbedOrigin(event.origin)) return;
      const fragment = extractLibraryReaderFragmentMessage(event.data);
      if (!fragment) return;

      setDetectedReaderFragment(fragment);
      setDetectedReaderPageNumber(extractLibraryPageNumber(fragment));
    }

    window.addEventListener("message", handleReaderMessage);
    return () => window.removeEventListener("message", handleReaderMessage);
  }, []);

  const book = payload?.book || initialBook;
  const relatedBooks = useMemo(() => payload?.relatedBooks || initialRelatedBooks, [initialRelatedBooks, payload]);
  const pageMode = resolveLibraryReaderMode({ isMobile });
  const resumeTarget = resolveLibraryResumeTarget(readState);
  const embedUrl = buildLibraryReaderEmbedUrl({
    embedUrl: payload?.reader?.embedUrl,
    identifier: payload?.reader?.internetArchiveIdentifier,
    pageMode,
    pageNumber: resumeTarget.pageNumber,
    location: resumeTarget.location,
  });
  const savedPage = readState?.savedPageNumber ?? null;
  const savedPageCode = readState?.savedPageCode || "";
  const progressText = savedPage
    ? `Saved page ${savedPage}`
    : savedPageCode
      ? "Saved bookmark"
    : resumeTarget.pageNumber
      ? `Resume at page ${resumeTarget.pageNumber}`
      : pageMode === "1up"
        ? "1-page mobile view"
        : "2-page desktop view";

  async function handleToggleFullscreen() {
    try {
      const nextFullscreenState = await toggleLibraryReaderFullscreen({
        element: readerShellRef.current,
        documentRef: document,
      });
      setIsFullscreen(nextFullscreenState);
    } catch {
      setFullscreenSupported(false);
      setIsFullscreen(false);
    }
  }

  async function handleSavePlace(pageNumber, options = {}) {
    const nextState = await savePlace(pageNumber, options);
    const optimisticState = applyLibrarySavedBookmarkState(nextState, {
      pageNumber,
      pageCode: options?.pageCode || "",
    });

    setReadState(optimisticState);
    setPayload((previous) => ({
      ...previous,
      readState: optimisticState,
      book: {
        ...previous.book,
        startedReading: true,
        savedPageNumber: optimisticState?.savedPageNumber ?? null,
      },
    }));
  }

  async function handleClearPlace() {
    const nextState = await clearPlace();

    setReadState(nextState);
    setPayload((previous) => ({
      ...previous,
      readState: nextState,
      book: {
        ...previous.book,
        savedPageNumber: nextState?.savedPageNumber ?? null,
      },
    }));
  }

  return (
    <section className="space-y-8 text-foreground">
      <div
        ref={readerShellRef}
        className={`relative mx-auto w-full max-w-[1220px] border border-border bg-surface shadow-[0_18px_50px_rgba(15,23,42,0.08)] ${
          isFullscreen ? "flex min-h-screen flex-col bg-background" : ""
        }`}
        style={{ borderRadius: isFullscreen ? "0px" : "18px" }}
      >
        <LibraryReaderTopBar
          slug={book.slug}
          title={book.title}
          progressText={progressText}
          inMyLibrary={book.inMyLibrary}
        />

        <div className={`relative ${isFullscreen ? "flex-1 p-4 sm:p-5" : "p-4 sm:p-5"}`}>
          <div className="mb-4 flex items-center justify-between gap-3 px-1 text-sm text-muted">
            <span>{loading ? "Loading reader..." : error ? "Reader unavailable" : "Embedded reading experience"}</span>
            <LibraryReaderFullscreenButton
              supported={fullscreenSupported}
              isFullscreen={isFullscreen}
              onToggle={handleToggleFullscreen}
            />
          </div>

          <div
            className="overflow-hidden border border-border bg-background shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
            style={{ borderRadius: "16px" }}
          >
            {embedUrl && !error ? (
              <div className="space-y-0">
                <iframe
                  key={embedUrl}
                  src={embedUrl}
                  title={`${book.title} reader`}
                  className={`w-full bg-white ${isFullscreen ? "h-[calc(100vh-11rem)]" : "min-h-[72vh] lg:min-h-[80vh]"}`}
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                  referrerPolicy="strict-origin-when-cross-origin"
                  onLoad={() => {
                    setIframeLoaded(true);
                    setShowUnavailableHint(false);
                    refreshReadState();
                  }}
                />
                {showUnavailableHint ? (
                  <div className="border-t border-border bg-surface-2 px-5 py-4 text-sm text-muted">
                    This title is temporarily unavailable inside the embedded reader right now.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4 px-6 py-10">
                <p className="text-lg font-semibold text-foreground">This title is temporarily unavailable</p>
                <p className="text-sm text-muted">
                  {error || "We could not load the embedded reader for this book right now."}
                </p>
              </div>
            )}
          </div>
        </div>

        <LibraryFloatingBookmarkPanel
          savedPageNumber={savedPage}
          savedPageCode={savedPageCode}
          detectedPageNumber={detectedReaderPageNumber}
          detectedPageCode={detectedReaderFragment}
          saving={saving}
          isMobile={isMobile}
          isFullscreen={isFullscreen}
          onSavePlace={handleSavePlace}
          onClearPlace={handleClearPlace}
        />
      </div>

      <div className="mx-auto w-full max-w-[1220px] space-y-2">
        {readStateError ? <p className="text-sm text-danger">{readStateError}</p> : null}
        <p className="text-xs text-muted">
          Auto-resume may vary by title. EnglishMate saves your bookmark and will use the reader state directly when the embedded book exposes it.
        </p>
      </div>

      <div className="mx-auto w-full max-w-[1220px] space-y-6">
        <section
          className="border border-border bg-surface p-5 shadow-[0_10px_28px_rgba(15,23,42,0.06)]"
          style={{ borderRadius: "16px" }}
        >
          <p className="text-xs uppercase tracking-[0.28em] text-muted">Vocabulary Notes</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">Notes scaffold</h2>
          <p className="mt-3 text-sm text-muted">
            Keep this area ready for saved words, page-linked notes, and future vocabulary tools.
          </p>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-muted">Related Books</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">Keep reading inside EnglishMate</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {relatedBooks.map((relatedBook) => (
              <LibraryBookCard key={relatedBook.id} book={relatedBook} compact />
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
