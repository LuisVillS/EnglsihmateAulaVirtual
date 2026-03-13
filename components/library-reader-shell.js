"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LibraryBookCard from "@/components/library-book-card";
import LibraryEpubReader from "@/components/library-epub-reader";
import LibraryEpubToolbar from "@/components/library-epub-toolbar";
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
import {
  buildLibraryEpubProgressLabel,
  canUseLibraryReaderArrowKeys,
  playLibraryPageFlipSound,
  resolveLibraryEpubTheme,
  shouldShowLibraryBookmarkPanel,
} from "@/lib/library/epub-reader-ui";
import { normalizeLibraryLocation, resolveLibraryResumeTarget } from "@/lib/library/read-state";
import {
  applyLibrarySavedBookmarkState,
  isLibraryFullscreenSupported,
  isLibraryReaderFullscreen,
  toggleLibraryReaderFullscreen,
} from "@/lib/library/reader-ui";
import {
  buildLibraryTtsPlaybackQueue,
  LIBRARY_TTS_VOICE_OPTIONS,
  resolveLibraryTtsVoice,
} from "@/lib/library/tts";

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M11.75 4.75 6.5 10l5.25 5.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M8.25 4.75 13.5 10l-5.25 5.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LibraryReaderShell({
  initialBook,
  initialRelatedBooks = [],
  initialReaderPayload = null,
}) {
  const readerShellRef = useRef(null);
  const epubReaderRef = useRef(null);
  const epubTurnHandlerRef = useRef(null);
  const pageTurnTimeoutRef = useRef(null);
  const pageTurnAudioRef = useRef(null);
  const activityTimeoutRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const ttsObjectUrlsRef = useRef(new Set());
  const ttsAbortControllersRef = useRef(new Set());
  const ttsRunTokenRef = useRef(0);
  const ttsAutoAdvanceRef = useRef(false);
  const epubReaderStateRef = useRef({
    canGoNext: true,
    canGoPrev: false,
    currentHref: "",
    pageNumber: null,
  });
  const touchGestureRef = useRef({ x: 0, y: 0, active: false });
  const [payload, setPayload] = useState({
    book: initialBook,
    reader: initialReaderPayload?.reader || null,
    readState: initialReaderPayload?.readState || initialBook?.userState || null,
    relatedBooks: initialRelatedBooks,
  });
  const [loading, setLoading] = useState(!Boolean(initialReaderPayload?.reader));
  const [error, setError] = useState("");
  const [readerNotice, setReaderNotice] = useState("");
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showUnavailableHint, setShowUnavailableHint] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isShortViewport, setIsShortViewport] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [detectedReaderFragment, setDetectedReaderFragment] = useState("");
  const [detectedReaderPageNumber, setDetectedReaderPageNumber] = useState(null);
  const [usingFallbackReader, setUsingFallbackReader] = useState(false);
  const [epubChromeVisible, setEpubChromeVisible] = useState(true);
  const [epubReaderState, setEpubReaderState] = useState({
    toc: [],
    currentHref: "",
    chapterLabel: "",
    pageNumber: null,
    pageTotal: null,
    pageIndicator: "",
    visiblePageNumbers: { left: null, right: null },
    progressPercent: null,
    canGoPrev: false,
    canGoNext: true,
    lastAutoSavedAt: null,
    displayMode: "spread",
  });
  const [epubTheme, setEpubTheme] = useState("sepia");
  const [epubSoundEnabled, setEpubSoundEnabled] = useState(false);
  const [pageTurnDirection, setPageTurnDirection] = useState("");
  const [ttsVoiceId, setTtsVoiceId] = useState(LIBRARY_TTS_VOICE_OPTIONS[0].id);
  const [ttsStatus, setTtsStatus] = useState("idle");
  const [ttsMessage, setTtsMessage] = useState("");
  const [ttsSelectionMode, setTtsSelectionMode] = useState(false);
  const [ttsSelectedSegment, setTtsSelectedSegment] = useState(null);
  const [ttsHighlightMode, setTtsHighlightMode] = useState("paragraph");
  const [ttsControlsVisible, setTtsControlsVisible] = useState(false);
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
    if (initialReaderPayload?.reader) {
      setPayload({
        book: initialBook,
        reader: initialReaderPayload.reader || null,
        readState: initialReaderPayload.readState || initialBook?.userState || null,
        relatedBooks: initialRelatedBooks,
      });
      setReadState(initialReaderPayload.readState || initialBook?.userState || null);
      setLoading(false);
      return undefined;
    }

    let active = true;

    async function loadReader() {
      try {
        setLoading(true);
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
            reader: nextPayload.reader || null,
            readState: nextPayload.readState || null,
            relatedBooks: nextPayload.relatedBooks || initialRelatedBooks,
          });
          setReadState(nextPayload.readState || null);
          setError("");
          setReaderNotice("");
          setUsingFallbackReader(false);
          setDetectedReaderFragment("");
          setDetectedReaderPageNumber(null);
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
  }, [initialBook, initialReaderPayload, initialRelatedBooks, setReadState]);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem("library.epub.theme");
      const storedSound = window.localStorage.getItem("library.epub.sound");
      const storedTtsVoice = window.localStorage.getItem("library.epub.tts.voice");

      if (storedTheme) {
        setEpubTheme(resolveLibraryEpubTheme(storedTheme).id);
      }
      if (storedSound) {
        setEpubSoundEnabled(storedSound === "1");
      }
      if (storedTtsVoice) {
        setTtsVoiceId(resolveLibraryTtsVoice(storedTtsVoice).id);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("library.epub.theme", epubTheme);
      window.localStorage.removeItem("library.epub.zoom");
      window.localStorage.removeItem("library.epub.fontScale");
      window.localStorage.setItem("library.epub.sound", epubSoundEnabled ? "1" : "0");
      window.localStorage.setItem("library.epub.tts.voice", ttsVoiceId);
    } catch {
      return undefined;
    }
    return undefined;
  }, [epubSoundEnabled, epubTheme, ttsVoiceId]);

  useEffect(() => {
    const widthQuery = window.matchMedia("(max-width: 1000px)");
    const heightQuery = window.matchMedia("(max-height: 860px)");
    const syncViewport = () => {
      setIsMobile(widthQuery.matches);
      setIsShortViewport(heightQuery.matches);
    };
    syncViewport();
    widthQuery.addEventListener("change", syncViewport);
    heightQuery.addEventListener("change", syncViewport);
    return () => {
      widthQuery.removeEventListener("change", syncViewport);
      heightQuery.removeEventListener("change", syncViewport);
    };
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
    const activeReader = usingFallbackReader && payload?.reader?.fallback ? payload.reader.fallback : payload?.reader;
    if (activeReader?.type !== "archive_embed" || !activeReader?.embedUrl || iframeLoaded) {
      setShowUnavailableHint(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setShowUnavailableHint(true);
    }, 9000);

    return () => window.clearTimeout(timeoutId);
  }, [iframeLoaded, payload?.reader, usingFallbackReader]);

  useEffect(() => {
    setIframeLoaded(false);
    setShowUnavailableHint(false);
  }, [payload?.reader, usingFallbackReader]);

  useEffect(() => {
    return () => {
      if (pageTurnTimeoutRef.current) {
        window.clearTimeout(pageTurnTimeoutRef.current);
      }
      if (activityTimeoutRef.current) {
        window.clearTimeout(activityTimeoutRef.current);
      }
      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.currentTime = 0;
        } catch {
          // no-op
        }
      }
      ttsAbortControllersRef.current.forEach((controller) => controller.abort());
      ttsAbortControllersRef.current.clear();
      ttsObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      ttsObjectUrlsRef.current.clear();
    };
  }, []);

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
  const activeReader = usingFallbackReader && payload?.reader?.fallback ? payload.reader.fallback : payload?.reader;
  const isEpubReader = activeReader?.type === "epub";
  const ttsEnabled = isEpubReader && activeReader?.sourceName === "manual_epub";
  const showBookmarkPanel = shouldShowLibraryBookmarkPanel(activeReader);
  const readerTheme = resolveLibraryEpubTheme(epubTheme);
  const pageMode = resolveLibraryReaderMode({ isMobile });
  const resumeTarget = resolveLibraryResumeTarget(readState);
  const embedUrl = buildLibraryReaderEmbedUrl({
    embedUrl: activeReader?.embedUrl,
    identifier: activeReader?.internetArchiveIdentifier,
    pageMode,
    pageNumber: resumeTarget.pageNumber,
    location: resumeTarget.location,
  });
  const epubResumeLocation =
    normalizeLibraryLocation(readState?.lastLocation) || (isEpubReader ? readState?.savedPageCode || "" : "");
  const savedPage = readState?.savedPageNumber ?? null;
  const savedPageCode = readState?.savedPageCode || "";
  let progressText = isEpubReader ? "Opening reader" : "Reading in EnglishMate";
  if (isEpubReader) {
    progressText = buildLibraryEpubProgressLabel(epubReaderState) || "Reading stage";
  } else if (savedPage) {
    progressText = `Saved page ${savedPage}`;
  } else if (savedPageCode) {
    progressText = "Saved bookmark";
  } else if (readState?.progressPercent != null) {
    progressText = `${Math.round(Number(readState.progressPercent) || 0)}% read`;
  } else if (resumeTarget.pageNumber) {
    progressText = `Resume at page ${resumeTarget.pageNumber}`;
  } else if (activeReader?.type === "archive_embed") {
    progressText = pageMode === "1up" ? "1-page mobile view" : "2-page desktop view";
  }
  const leftVisiblePageNumber = epubReaderState.visiblePageNumbers?.left ?? epubReaderState.pageNumber ?? null;
  const rightVisiblePageNumber = epubReaderState.visiblePageNumbers?.right ?? null;
  const effectiveReaderState = epubReaderState;
  const epubPageChrome = {
    leftHeader: epubReaderState.chapterLabel || book.title,
    rightHeader: book.title,
    leftFooterLabel: "EnglishMate Library",
    leftFooterPage: leftVisiblePageNumber,
    rightFooterLabel: "",
    rightFooterPage: rightVisiblePageNumber,
    singleHeader: book.title,
    singleSubheader: epubReaderState.chapterLabel || "Reading stage",
    singleFooterLabel: "EnglishMate Library",
    singleFooterPage: leftVisiblePageNumber,
  };
  const showEpubPageChrome = !(
    effectiveReaderState.displayMode === "single" &&
    !effectiveReaderState.canGoPrev &&
    (!effectiveReaderState.pageNumber || effectiveReaderState.pageNumber <= 1)
  );
  const effectiveEpubDisplayMode = epubReaderState.displayMode;
  const effectiveCanGoPrev = epubReaderState.canGoPrev;
  const effectiveCanGoNext = epubReaderState.canGoNext;

  const registerReaderActivity = useCallback(({ immediate = false } = {}) => {
    if (!isEpubReader) return;
    setEpubChromeVisible(true);
    if (!isFullscreen) return;
    if (activityTimeoutRef.current) {
      window.clearTimeout(activityTimeoutRef.current);
    }
    activityTimeoutRef.current = window.setTimeout(() => {
      setEpubChromeVisible(false);
    }, immediate ? 3200 : 2400);
  }, [isEpubReader, isFullscreen]);

  const stopTtsPlayback = useCallback(
    ({ message = "", preserveSelection = true } = {}) => {
      ttsRunTokenRef.current += 1;
      ttsAutoAdvanceRef.current = false;

      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.currentTime = 0;
        } catch {
          // no-op
        }
        ttsAudioRef.current = null;
      }

      ttsAbortControllersRef.current.forEach((controller) => controller.abort());
      ttsAbortControllersRef.current.clear();
      ttsObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      ttsObjectUrlsRef.current.clear();

      epubReaderRef.current?.clearTtsHighlight?.();
      if (!preserveSelection) {
        setTtsSelectedSegment(null);
      }
      setTtsSelectionMode(false);
      setTtsStatus("idle");
      setTtsHighlightMode("paragraph");
      setTtsMessage(message);
    },
    []
  );

  const fetchTtsAudioUrl = useCallback(async (text, voiceId, token) => {
    const controller = new AbortController();
    ttsAbortControllersRef.current.add(controller);
    const response = await fetch(`/api/library/books/${book.slug}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        voiceId,
      }),
    });
    ttsAbortControllersRef.current.delete(controller);

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Read aloud is temporarily unavailable.");
    }

    const audioBlob = await response.blob();
    if (!audioBlob.size) {
      throw new Error("Read aloud returned an empty audio response.");
    }

    const objectUrl = URL.createObjectURL(audioBlob);
    ttsObjectUrlsRef.current.add(objectUrl);

    if (ttsRunTokenRef.current !== token) {
      URL.revokeObjectURL(objectUrl);
      ttsObjectUrlsRef.current.delete(objectUrl);
      return null;
    }

    return {
      url: objectUrl,
      release() {
        if (!objectUrl) return;
        URL.revokeObjectURL(objectUrl);
        ttsObjectUrlsRef.current.delete(objectUrl);
      },
    };
  }, [book.slug]);

  const playTtsAudioUrl = useCallback(async (audioChunk, token) => {
    if (typeof window === "undefined") return;
    if (!audioChunk?.url) return;
    const audio = new window.Audio(audioChunk.url);
    ttsAudioRef.current = audio;

    await new Promise((resolve, reject) => {
      let watchId = null;
      const cleanup = () => {
        if (watchId) {
          window.clearInterval(watchId);
        }
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("Read aloud audio could not be played."));
      };
      audio
        .play()
        .then(() => {
          if (ttsRunTokenRef.current !== token) {
            audio.pause();
            cleanup();
            resolve();
          } else {
            setTtsStatus("playing");
            watchId = window.setInterval(() => {
              if (ttsRunTokenRef.current !== token) {
                cleanup();
                resolve();
              }
            }, 120);
          }
        })
        .catch((error) => {
          cleanup();
          reject(new Error(error?.message || "Read aloud playback failed."));
        });
    });

    if (ttsAudioRef.current === audio) {
      ttsAudioRef.current = null;
    }
    audioChunk.release?.();
  }, []);

  const continueTtsPlayback = useCallback(async ({ startSegmentId = "" } = {}) => {
    if (!ttsEnabled) {
      setTtsMessage("Read aloud is available only for uploaded EPUB books.");
      return;
    }

    stopTtsPlayback({ message: "", preserveSelection: true });
    const voice = resolveLibraryTtsVoice(ttsVoiceId);
    const token = ttsRunTokenRef.current + 1;
    ttsRunTokenRef.current = token;
    setTtsControlsVisible(true);
    setTtsStatus("loading");
    setTtsMessage("");

    let nextStartSegmentId = startSegmentId;

    while (ttsRunTokenRef.current === token) {
      const visibleSegments = epubReaderRef.current?.getVisibleTtsSegments?.({
        startSegmentId: nextStartSegmentId,
      });
      nextStartSegmentId = "";

      if (!visibleSegments?.length) {
        stopTtsPlayback({
          message: "No readable text was found on this page.",
          preserveSelection: true,
        });
        return;
      }

      const queue = buildLibraryTtsPlaybackQueue(visibleSegments);
      if (!queue.length) {
        stopTtsPlayback({
          message: "No readable text was found on this page.",
          preserveSelection: true,
        });
        return;
      }

      let currentAudioChunk = null;
      let nextAudioPromise = null;

      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        if (ttsRunTokenRef.current !== token) return;

        const highlightResult = epubReaderRef.current?.highlightTtsChunk?.({
          segmentId: item.segmentId,
          text: "",
        });
        setTtsHighlightMode(highlightResult?.mode || "paragraph");
        setTtsStatus("loading");

        if (!currentAudioChunk) {
          try {
            currentAudioChunk = await fetchTtsAudioUrl(item.text, voice.id, token);
          } catch (error) {
            if (ttsRunTokenRef.current !== token) return;
            setTtsMessage(error?.message || "One paragraph could not be read aloud.");
            continue;
          }
        }

        if (ttsRunTokenRef.current !== token) return;
        if (!currentAudioChunk) {
          continue;
        }

        if (index + 1 < queue.length) {
          nextAudioPromise = fetchTtsAudioUrl(queue[index + 1].text, voice.id, token).catch((error) => {
            if (ttsRunTokenRef.current !== token) return null;
            setTtsMessage(error?.message || "One paragraph could not be read aloud.");
            return null;
          });
        } else {
          nextAudioPromise = null;
        }

        await playTtsAudioUrl(currentAudioChunk, token);
        currentAudioChunk = nextAudioPromise ? await nextAudioPromise : null;
      }

      if (ttsRunTokenRef.current !== token) return;
      if (!epubReaderStateRef.current.canGoNext) {
        stopTtsPlayback({
          message: `Reached the end of ${book.title}.`,
          preserveSelection: true,
        });
        return;
      }

      ttsAutoAdvanceRef.current = true;
      setTtsStatus("loading");
      const turned = await epubReaderRef.current?.goNextPage?.();
      ttsAutoAdvanceRef.current = false;
      if (!turned) {
        stopTtsPlayback({
          message: `Reached the end of ${book.title}.`,
          preserveSelection: true,
        });
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 260));
    }
  }, [book.title, epubReaderState.canGoNext, fetchTtsAudioUrl, playTtsAudioUrl, stopTtsPlayback, ttsEnabled, ttsVoiceId]);

  useEffect(() => {
    if (!isEpubReader || !isFullscreen) {
      if (activityTimeoutRef.current) {
        window.clearTimeout(activityTimeoutRef.current);
      }
      setEpubChromeVisible(true);
      return;
    }

    registerReaderActivity({ immediate: true });
  }, [isEpubReader, isFullscreen, registerReaderActivity]);

  useEffect(() => {
    if (!ttsEnabled) {
      stopTtsPlayback({ message: "", preserveSelection: false });
      setTtsControlsVisible(false);
    }
  }, [stopTtsPlayback, ttsEnabled]);

  useEffect(() => {
    if (!ttsEnabled || !ttsSelectionMode) return;
    setTtsMessage("Click a paragraph to start reading from there.");
  }, [ttsEnabled, ttsSelectionMode]);

  async function handleEpubTurn(direction) {
    if (!isEpubReader || loading || error) return;
    if (direction === "previous" && !epubReaderState.canGoPrev) return;
    if (direction === "next" && !epubReaderState.canGoNext) return;
    if (["playing", "paused", "loading"].includes(ttsStatus) && !ttsAutoAdvanceRef.current) {
      stopTtsPlayback({
        message: "Read aloud stopped because the page changed.",
        preserveSelection: true,
      });
    }
    registerReaderActivity();

    try {
      const turned =
        direction === "previous"
          ? await epubReaderRef.current?.goPreviousPage?.()
          : await epubReaderRef.current?.goNextPage?.();
      if (!turned) return;

      playLibraryPageFlipSound({
        enabled: epubSoundEnabled,
        audioContextRef: pageTurnAudioRef,
      });
      setPageTurnDirection(direction);
      if (pageTurnTimeoutRef.current) {
        window.clearTimeout(pageTurnTimeoutRef.current);
      }
      pageTurnTimeoutRef.current = window.setTimeout(() => {
        setPageTurnDirection("");
      }, 340);
    } catch {
      return undefined;
    }

    return undefined;
  }

  useEffect(() => {
    epubTurnHandlerRef.current = handleEpubTurn;
  });

  useEffect(() => {
    if (!isEpubReader || loading || error) return undefined;

    function handleKeydown(event) {
      if (!canUseLibraryReaderArrowKeys(event)) return;
      const activeElement = document.activeElement;
      if (
        activeElement &&
        activeElement !== document.body &&
        !readerShellRef.current?.contains(activeElement)
      ) {
        return;
      }

      registerReaderActivity();
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        epubTurnHandlerRef.current?.("previous");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        epubTurnHandlerRef.current?.("next");
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [error, isEpubReader, loading, registerReaderActivity]);

  async function handleToggleFullscreen() {
    try {
      const nextFullscreenState = await toggleLibraryReaderFullscreen({
        element: readerShellRef.current,
        documentRef: document,
      });
      setIsFullscreen(nextFullscreenState);
      setEpubChromeVisible(true);
      registerReaderActivity({ immediate: true });
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

  function handleEpubLocationChange(nextLocation = {}) {
    setDetectedReaderFragment(nextLocation.location || "");
    setDetectedReaderPageNumber(nextLocation.pageNumber ?? null);
  }

  function handleEpubReaderStateChange(nextState = {}) {
    setEpubReaderState((previous) => {
      const mergedState = {
        ...previous,
        ...nextState,
        toc: Array.isArray(nextState.toc) ? nextState.toc : previous.toc,
      };
      epubReaderStateRef.current = mergedState;
      return mergedState;
    });
  }

  function handleEpubProgressSaved(nextState) {
    if (!nextState) return;
    setReadState(nextState);
    setEpubReaderState((previous) => ({
      ...previous,
      lastAutoSavedAt: nextState.updatedAt || nextState.lastOpenedAt || previous.lastAutoSavedAt,
      progressPercent: nextState.progressPercent ?? previous.progressPercent,
      pageNumber: nextState.lastPageNumber ?? previous.pageNumber,
    }));
    setPayload((previous) => ({
      ...previous,
      readState: nextState,
      book: {
        ...previous.book,
        startedReading: Boolean(nextState.startedReading),
        completed: Boolean(nextState.completed),
        progressPercent: nextState.progressPercent ?? previous.book?.progressPercent ?? null,
        lastPageNumber: nextState.lastPageNumber ?? previous.book?.lastPageNumber ?? null,
        lastLocation: nextState.lastLocation || previous.book?.lastLocation || "",
      },
    }));
  }

  function handleEpubFatalError(message) {
    if (
      payload?.reader?.sourceName !== "manual_epub" &&
      payload?.reader?.fallback?.type === "archive_embed" &&
      payload?.reader?.fallback?.embedUrl
    ) {
      setUsingFallbackReader(true);
      setReaderNotice("Open Library fallback opened");
      setError("");
      return;
    }

    setError(message || "No se pudo abrir este EPUB.");
  }

  async function handleGoToChapter(href) {
    if (!href) return;
    if (["playing", "paused", "loading"].includes(ttsStatus)) {
      stopTtsPlayback({
        message: "Read aloud stopped because the chapter changed.",
        preserveSelection: true,
      });
    }
    registerReaderActivity();
    try {
      await epubReaderRef.current?.goToTarget?.(href);
    } catch {
      return undefined;
    }
    return undefined;
  }

  async function handleTtsParagraphSelect(segment) {
    if (!segment?.id || !segment?.text) return;
    setTtsControlsVisible(true);
    const nextSelection = {
      id: segment.id,
      text: segment.text,
      label: segment.text.slice(0, 88),
    };
    setTtsSelectedSegment(nextSelection);
    setTtsSelectionMode(false);
    try {
      await continueTtsPlayback({ startSegmentId: segment.id });
    } catch (error) {
      stopTtsPlayback({
        message: error?.message || "Read aloud is temporarily unavailable.",
        preserveSelection: true,
      });
    }
  }

  async function handleTtsPlay() {
    registerReaderActivity();
    setTtsControlsVisible(true);
    setTtsSelectedSegment(null);
    try {
      await continueTtsPlayback();
    } catch (error) {
      stopTtsPlayback({
        message: error?.message || "Read aloud is temporarily unavailable.",
        preserveSelection: true,
      });
    }
  }

  function handleTtsPause() {
    if (!ttsAudioRef.current) return;
    try {
      ttsAudioRef.current.pause();
      setTtsStatus("paused");
      setTtsMessage("Read aloud paused.");
    } catch {
      return;
    }
  }

  async function handleTtsResume() {
    if (!ttsAudioRef.current) return;
    try {
      await ttsAudioRef.current.play();
      setTtsStatus("playing");
      setTtsMessage("");
    } catch (error) {
      setTtsMessage(error?.message || "Read aloud could not resume.");
    }
  }

  function handleTouchStart(event) {
    if (!isEpubReader || !isMobile) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    touchGestureRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      active: true,
    };
    registerReaderActivity();
  }

  function handleTouchEnd(event) {
    if (!isEpubReader || !isMobile || !touchGestureRef.current.active) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchGestureRef.current.x;
    const deltaY = touch.clientY - touchGestureRef.current.y;
    touchGestureRef.current.active = false;

    if (Math.abs(deltaY) > 70 || Math.abs(deltaX) < 56) return;
    if (deltaX < 0) {
      handleEpubTurn("next");
    } else {
      handleEpubTurn("previous");
    }
  }

  const immersiveStageStyle = {
    backgroundColor: readerTheme.stageBackground,
    backgroundImage: readerTheme.stageSurface,
    "--reader-paper": readerTheme.paperBackground,
    "--reader-paper-edge": readerTheme.paperEdge,
    "--reader-paper-shadow": readerTheme.paperShadow,
    "--reader-stage-glow": readerTheme.stageGlow,
  };
  const epubToolbarNode = (
    <LibraryEpubToolbar
      readerState={effectiveReaderState}
      theme={epubTheme}
      soundEnabled={epubSoundEnabled}
      isMobile={isMobile}
      fullscreenSupported={fullscreenSupported}
      isFullscreen={isFullscreen}
      chromeVisible={epubChromeVisible || !isFullscreen}
      onGoToHref={handleGoToChapter}
      onThemeChange={(value) => setEpubTheme(resolveLibraryEpubTheme(value).id)}
      onToggleSound={() => setEpubSoundEnabled((previous) => !previous)}
      onToggleFullscreen={handleToggleFullscreen}
      ttsEnabled={ttsEnabled}
      tts={{
        voices: LIBRARY_TTS_VOICE_OPTIONS,
        voiceId: ttsVoiceId,
        voiceLabel: resolveLibraryTtsVoice(ttsVoiceId).label,
        status: ttsStatus,
        selectionMode: ttsSelectionMode,
        selectedSegmentLabel: ttsSelectedSegment?.label || "",
        message: ttsMessage,
        highlightMode: ttsHighlightMode,
        showControls: ttsControlsVisible,
      }}
      onTtsVoiceChange={(voiceId) => {
        setTtsControlsVisible(true);
        setTtsVoiceId(resolveLibraryTtsVoice(voiceId).id);
        if (["playing", "paused", "loading"].includes(ttsStatus)) {
          stopTtsPlayback({
            message: "Voice updated. Press play to continue with the new voice.",
            preserveSelection: true,
          });
        }
      }}
      onTtsPlay={handleTtsPlay}
      onTtsPause={handleTtsPause}
      onTtsResume={handleTtsResume}
      onTtsStop={() => {
        setTtsControlsVisible(false);
        stopTtsPlayback({ message: "Read aloud stopped.", preserveSelection: true });
      }}
      onTtsToggleSelectionMode={() => setTtsSelectionMode((previous) => !previous)}
    />
  );

  return (
    <section className="space-y-8 text-foreground">
      <div
        ref={readerShellRef}
        className={`relative mx-auto w-full ${isEpubReader ? "max-w-[1480px]" : "max-w-[1220px]"} ${
          isFullscreen ? "min-h-screen" : ""
        }`}
      >
        {isEpubReader ? (
          <div
            className={`relative overflow-hidden border border-white/6 ${isFullscreen ? "min-h-screen" : ""}`}
            style={{ ...immersiveStageStyle, borderRadius: "0px" }}
            onMouseMove={() => registerReaderActivity()}
            onPointerDown={() => registerReaderActivity()}
          >
            <div
              className={`absolute inset-x-2 top-2 z-20 transition duration-300 sm:inset-x-4 sm:top-4 ${
                epubChromeVisible || !isFullscreen ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
              }`}
            >
              <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-2">
                <Link
                  href={`/app/library/book/${book.slug}`}
                  className="inline-flex h-9 items-center gap-2 border border-white/12 bg-black/30 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/78 backdrop-blur-xl transition hover:bg-black/42 hover:text-white"
                  style={{ borderRadius: "0px" }}
                >
                  <ChevronLeftIcon />
                  Back
                </Link>
                <Link
                  href="/app/library"
                  className="inline-flex h-9 items-center border border-white/12 bg-black/30 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/78 backdrop-blur-xl transition hover:bg-black/42 hover:text-white"
                  style={{ borderRadius: "0px" }}
                >
                  Library
                </Link>
              </div>
            </div>

            <div
              className={`relative ${
                isFullscreen
                  ? isShortViewport
                    ? "min-h-screen px-2 pb-10 pt-10 sm:px-5 sm:pb-14 sm:pt-11"
                    : "min-h-screen px-2 pb-14 pt-10 sm:px-5 sm:pb-20 sm:pt-12"
                  : isShortViewport
                    ? "px-2 pb-10 pt-10 sm:px-5 sm:pb-14 sm:pt-11 lg:pt-[3.35rem]"
                    : "px-2 pb-14 pt-10 sm:px-5 sm:pb-20 sm:pt-12 lg:pt-[3.7rem]"
              }`}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="pointer-events-none absolute left-1/2 top-16 h-32 w-32 -translate-x-1/2 rounded-full blur-3xl sm:top-20 sm:h-36 sm:w-36"
                style={{ background: "var(--reader-stage-glow)" }}
              />

              <div className="relative mx-auto flex max-w-[1380px] items-center justify-center gap-2 lg:gap-6">
                {!isMobile ? (
                  <button
                    type="button"
                    onClick={() => handleEpubTurn("previous")}
                    disabled={!effectiveCanGoPrev}
                    className={`reader-stage-arrow hidden lg:inline-flex ${
                      epubChromeVisible || !isFullscreen ? "opacity-100" : "opacity-0"
                    }`}
                    aria-label="Previous spread"
                  >
                    <ChevronLeftIcon />
                  </button>
                ) : null}

                <div
                  className={`relative ${
                    !isMobile && effectiveEpubDisplayMode === "single"
                      ? "mx-auto w-[560px] max-w-full"
                      : "mx-auto w-[1120px] max-w-full"
                  }`}
                >
                  <div
                    className={`epub-book-shell ${effectiveEpubDisplayMode === "single" ? "single-leaf" : "spread-leaf"} ${
                      pageTurnDirection ? `turning-${pageTurnDirection}` : ""
                    }`}
                  >
                    {!isMobile && effectiveEpubDisplayMode !== "single" ? (
                      <div className="epub-book-spine" aria-hidden="true" />
                    ) : null}
                    {showEpubPageChrome && effectiveEpubDisplayMode === "single" ? (
                      <div className="epub-page-meta single" aria-hidden="true">
                        <div className="epub-page-meta-line top" />
                        <div className="epub-page-meta-row top single">
                          <span className="truncate">{epubPageChrome.singleSubheader}</span>
                          <span className="truncate">{epubPageChrome.singleHeader}</span>
                        </div>
                        <div className="epub-page-meta-line bottom" />
                        <div className="epub-page-meta-row bottom single">
                          <span>{epubPageChrome.singleFooterLabel}</span>
                          <span>{epubPageChrome.singleFooterPage || ""}</span>
                        </div>
                      </div>
                    ) : showEpubPageChrome ? (
                      <div className="epub-page-meta spread" aria-hidden="true">
                        <div className="epub-page-meta-line top left" />
                        <div className="epub-page-meta-line top right" />
                        <div className="epub-page-meta-row top left">
                          <span className="truncate">{epubPageChrome.leftHeader}</span>
                        </div>
                        <div className="epub-page-meta-row top right">
                          <span className="truncate">{epubPageChrome.rightHeader}</span>
                        </div>
                        <div className="epub-page-meta-line bottom left" />
                        <div className="epub-page-meta-line bottom right" />
                        <div className="epub-page-meta-row bottom left">
                          <span>{epubPageChrome.leftFooterPage || ""}</span>
                          <span>{epubPageChrome.leftFooterLabel}</span>
                        </div>
                        <div className="epub-page-meta-row bottom right">
                          <span>{epubPageChrome.rightFooterLabel}</span>
                          <span>{epubPageChrome.rightFooterPage || ""}</span>
                        </div>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => handleEpubTurn("previous")}
                      className="epub-tap-zone left"
                      aria-label="Previous page"
                      disabled={!effectiveCanGoPrev}
                      style={ttsSelectionMode ? { pointerEvents: "none" } : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => handleEpubTurn("next")}
                      className="epub-tap-zone right"
                      aria-label="Next page"
                      disabled={!effectiveCanGoNext}
                      style={ttsSelectionMode ? { pointerEvents: "none" } : undefined}
                    />

                    <LibraryEpubReader
                      ref={epubReaderRef}
                      key={`${book.slug}-${activeReader?.sourceId || activeReader?.sourceName || "epub"}`}
                      slug={book.slug}
                      assetUrl={activeReader?.assetUrl}
                      sourceFingerprint={activeReader?.assetFingerprint || activeReader?.sourceId || ""}
                      title={book.title}
                      authorDisplay={book.authorDisplay || ""}
                      coverUrl={book.coverUrl || ""}
                      initialLocation={epubResumeLocation}
                      initialPageNumber={readState?.lastPageNumber ?? null}
                      initialLocationUpdatedAt={readState?.updatedAt || readState?.lastOpenedAt || ""}
                      theme={epubTheme}
                      onLocationChange={handleEpubLocationChange}
                      onProgressSaved={handleEpubProgressSaved}
                      onReaderStateChange={handleEpubReaderStateChange}
                      onFatalError={handleEpubFatalError}
                      isFullscreen={isFullscreen}
                      ttsSelectionMode={ttsSelectionMode}
                      onTtsParagraphSelect={handleTtsParagraphSelect}
                    />

                    {pageTurnDirection ? <div className={`epub-page-turn-overlay ${pageTurnDirection}`} /> : null}
                  </div>
                </div>

                {!isMobile ? (
                  <button
                    type="button"
                    onClick={() => handleEpubTurn("next")}
                    disabled={!effectiveCanGoNext}
                    className={`reader-stage-arrow hidden lg:inline-flex ${
                      epubChromeVisible || !isFullscreen ? "opacity-100" : "opacity-0"
                    }`}
                    aria-label="Next spread"
                  >
                    <ChevronRightIcon />
                  </button>
                ) : null}
              </div>

              {epubToolbarNode}
            </div>
          </div>
        ) : (
          <div
            className={`relative w-full border border-border bg-surface shadow-[0_18px_50px_rgba(15,23,42,0.08)] ${
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
                <span>
                  {loading
                    ? "Loading reader..."
                    : error
                      ? "Reader unavailable"
                      : "Embedded reading experience"}
                </span>
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
                      {error || "We could not load the reader for this book right now."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showBookmarkPanel ? (
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
        ) : null}
      </div>

      <div className={`mx-auto w-full ${isEpubReader ? "max-w-[1380px]" : "max-w-[1220px]"} space-y-2`}>
        {readStateError ? <p className="text-sm text-danger">{readStateError}</p> : null}
        {readerNotice ? <p className="text-sm text-muted">{readerNotice}</p> : null}
        <p className={`text-xs ${isEpubReader ? "text-muted/75" : "text-muted"}`}>
          {isEpubReader
            ? "Uploaded EPUB books reopen from your last saved reading location automatically."
            : "Archive embeds keep the manual bookmark fallback when the upstream reader does not expose reliable state."}
        </p>
      </div>

      <div className={`mx-auto w-full ${isEpubReader ? "max-w-[1380px]" : "max-w-[1220px]"} space-y-6`}>
        <section
          className={`border p-5 shadow-[0_10px_28px_rgba(15,23,42,0.06)] ${isEpubReader ? "border-white/8 bg-[#16181d] text-white" : "border-border bg-surface"}`}
          style={{ borderRadius: "16px" }}
        >
          <p className={`text-xs uppercase tracking-[0.28em] ${isEpubReader ? "text-white/45" : "text-muted"}`}>Vocabulary Notes</p>
          <h2 className={`mt-2 text-xl font-semibold ${isEpubReader ? "text-white" : "text-foreground"}`}>Notes scaffold</h2>
          <p className={`mt-3 text-sm ${isEpubReader ? "text-white/62" : "text-muted"}`}>
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

      <style jsx>{`
        .epub-book-shell {
          position: relative;
          overflow: hidden;
          border: 1px solid var(--reader-paper-edge);
          border-radius: 0;
          perspective: 1800px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0)),
            var(--reader-paper);
          box-shadow: var(--reader-paper-shadow), 0 20px 38px rgba(0, 0, 0, 0.2);
          isolation: isolate;
          transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 220ms ease;
        }

        .epub-book-shell.single-leaf {
          max-width: 100%;
        }

        .epub-book-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 2;
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.05),
            inset 0 14px 24px rgba(255, 255, 255, 0.04),
            inset 0 -12px 22px rgba(0, 0, 0, 0.05);
        }

        .epub-book-shell::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 2;
          background:
            linear-gradient(90deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0) 4%, rgba(0, 0, 0, 0) 96%, rgba(0, 0, 0, 0.06)),
            linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0));
          mix-blend-mode: multiply;
        }

        .epub-book-shell.single-leaf::after {
          background:
            linear-gradient(90deg, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0) 7%, rgba(0, 0, 0, 0) 93%, rgba(0, 0, 0, 0.04)),
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0));
        }

        .epub-book-spine {
          position: absolute;
          inset: 0 auto 0 50%;
          width: 52px;
          transform: translateX(-50%);
          pointer-events: none;
          z-index: 3;
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255,255,255,0.34) 46%, rgba(255,255,255,0.08) 50%, rgba(0,0,0,0.08) 54%, rgba(0,0,0,0)),
            linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0) 16%, rgba(0,0,0,0.05) 82%, rgba(0,0,0,0.12));
          opacity: 0.5;
        }

        .epub-page-meta {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
          color: rgba(34, 28, 21, 0.62);
          font-family: "Iowan Old Style", "Baskerville Old Face", Georgia, serif;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .epub-page-meta-line {
          position: absolute;
          height: 1px;
          background: rgba(58, 45, 24, 0.12);
        }

        .epub-page-meta-line.top.left,
        .epub-page-meta-line.bottom.left,
        .epub-page-meta-row.left {
          left: 3.5%;
          width: 43%;
        }

        .epub-page-meta-line.top.right,
        .epub-page-meta-line.bottom.right,
        .epub-page-meta-row.right {
          right: 3.5%;
          width: 43%;
        }

        .epub-page-meta-row.top {
          top: 1.1rem;
        }

        .epub-page-meta-line.top {
          top: 1.72rem;
        }

        .epub-page-meta-line.bottom {
          bottom: 1.68rem;
        }

        .epub-page-meta-row.bottom {
          bottom: 0.95rem;
        }

        .epub-page-meta-row {
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          font-size: 11px;
          line-height: 1;
        }

        .epub-page-meta-row.bottom.left span:first-child,
        .epub-page-meta-row.bottom.right span:last-child,
        .epub-page-meta-row.bottom.single span:last-child {
          min-width: 2.4rem;
          color: rgba(34, 28, 21, 0.78);
        }

        .epub-page-meta.single .epub-page-meta-line,
        .epub-page-meta.single .epub-page-meta-row {
          left: 6%;
          right: 6%;
          width: auto;
        }

        .epub-page-meta-row.single.top {
          justify-content: space-between;
        }

        .epub-page-meta-row.single.bottom {
          justify-content: space-between;
        }

        .epub-tap-zone {
          position: absolute;
          inset: 0 auto 0 0;
          z-index: 6;
          width: 50%;
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
        }

        .epub-tap-zone:disabled {
          cursor: default;
        }

        .epub-tap-zone.right {
          left: auto;
          right: 0;
        }

        .reader-stage-arrow {
          align-items: center;
          justify-content: center;
          width: 2.5rem;
          height: 6.6rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          background: rgba(10, 12, 16, 0.3);
          color: rgba(255, 255, 255, 0.78);
          backdrop-filter: blur(16px);
          box-shadow: 0 14px 38px rgba(0, 0, 0, 0.26);
          transition:
            opacity 180ms ease,
            transform 180ms ease,
            background 180ms ease,
            border-color 180ms ease;
        }

        .reader-stage-arrow:hover:not(:disabled) {
          transform: scale(1.02);
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .reader-stage-arrow:disabled {
          cursor: not-allowed;
          opacity: 0.28;
        }

        .epub-page-turn-overlay {
          position: absolute;
          inset: 0 auto 0 0;
          width: 51%;
          pointer-events: none;
          z-index: 7;
          opacity: 0;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.05) 32%, rgba(0, 0, 0, 0.18) 100%);
          transform-origin: left center;
          filter: blur(0.25px);
        }

        .epub-page-turn-overlay.next {
          left: auto;
          right: 0;
          background: linear-gradient(270deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.04) 32%, rgba(0, 0, 0, 0.18) 100%);
          transform-origin: right center;
          animation: page-turn-next 460ms cubic-bezier(0.16, 0.8, 0.2, 1) forwards;
        }

        .epub-page-turn-overlay.previous {
          animation: page-turn-previous 460ms cubic-bezier(0.16, 0.8, 0.2, 1) forwards;
        }

        .epub-book-shell.turning-next {
          transform: perspective(1800px) rotateY(-1.6deg) translateX(-6px);
          box-shadow: var(--reader-paper-shadow), 0 24px 44px rgba(0, 0, 0, 0.22);
        }

        .epub-book-shell.turning-previous {
          transform: perspective(1800px) rotateY(1.6deg) translateX(6px);
          box-shadow: var(--reader-paper-shadow), 0 24px 44px rgba(0, 0, 0, 0.22);
        }

        @keyframes page-turn-next {
          0% {
            opacity: 0;
            transform: perspective(1800px) rotateY(0deg) translateX(0);
          }
          28% {
            opacity: 0.66;
          }
          100% {
            opacity: 0;
            transform: perspective(1800px) rotateY(-28deg) translateX(-12%);
          }
        }

        @keyframes page-turn-previous {
          0% {
            opacity: 0;
            transform: perspective(1800px) rotateY(0deg) translateX(0);
          }
          28% {
            opacity: 0.66;
          }
          100% {
            opacity: 0;
            transform: perspective(1800px) rotateY(28deg) translateX(12%);
          }
        }

        @media (max-width: 1000px) {
          .epub-tap-zone {
            width: 50%;
          }

          .epub-page-meta-row {
            font-size: 10px;
            letter-spacing: 0.12em;
          }

          .epub-page-meta-row.top {
            top: 0.88rem;
          }

          .epub-page-meta-line.top {
            top: 1.34rem;
          }

          .epub-page-meta-line.bottom {
            bottom: 1.28rem;
          }

          .epub-page-meta-row.bottom {
            bottom: 0.72rem;
          }
        }
      `}</style>
    </section>
  );
}
