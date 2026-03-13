"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FlipbookBookFrame from "@/components/flipbook/book-frame";
import FlipbookControlsBar from "@/components/flipbook/controls-bar";
import FlipbookHeader from "@/components/flipbook/header";
import { buildFlipbookStageStyle } from "@/components/flipbook/theme-layer";
import { resolveSinglePage } from "@/components/flipbook/single-page-view";
import { resolveSpreadPages } from "@/components/flipbook/spread-view";
import {
  buildFlipbookPageChrome,
  FLIPBOOK_VISUAL_STATE_CLOSED_BOOK,
  FLIPBOOK_VISUAL_STATE_OPENING_BOOK,
  FLIPBOOK_VISUAL_STATE_READING,
  resolveFlipbookInitialVisualState,
  resolveFlipbookPresentationMode,
  resolveInitialCanonicalPageIndex,
  resolvePrimaryReadingPage,
  resolveFlipbookVisiblePageNumber,
  resolveFlipbookVisiblePageTotal,
  resolveSpreadLeftPageIndex,
} from "@/lib/flipbook-core/presentation";
import {
  buildFlipbookVisualWindowKey,
  buildFlipbookPlaceholderPages,
  canFlipbookAdapterAcceptNavigation,
  expandFlipbookVisualWindowForTts,
  globalToLocalPageIndex,
  isPageIndexInsideVisualWindow,
  localToGlobalPageIndex,
  mergeFlipbookPages,
  resolveFlipbookNeighborPrefetchRange,
  resolveFlipbookVisualWindow,
  resolveInitialFlipbookPageWindow,
  shouldIgnoreFlipbookAdapterEvent,
  shouldShiftFlipbookVisualWindow,
} from "@/lib/flipbook-core/page-loading";
import { DEFAULT_FLIPBOOK_LAYOUT_PROFILE } from "@/lib/flipbook-core/layout-profile";
import { resolveFlipbookChapterLabel } from "@/lib/flipbook-core/page-paginator";
import { canUseLibraryReaderArrowKeys, playLibraryPageFlipSound } from "@/lib/library/epub-reader-ui";
import {
  buildLibraryTtsPlaybackQueue,
  LIBRARY_TTS_VOICE_OPTIONS,
  resolveLibraryTtsVoice,
} from "@/lib/library/tts";

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Flipbook request failed.");
  }
  return payload;
}

const FLIPBOOK_JUMP_LOAD_RADIUS = 10;
const FULL_STAGE_HEIGHT = "calc(100dvh - 4.5rem)";
const FULL_STAGE_FRAME_STYLE = {
  width: "100vw",
  maxWidth: "100vw",
  marginLeft: "calc(50% - 50vw)",
  marginRight: "calc(50% - 50vw)",
};
const FLIPBOOK_EDITORIAL_CONTENT_TOP_INSET = 54;
const FLIPBOOK_EDITORIAL_CONTENT_BOTTOM_INSET = 92;

function debugFlipbookEvent(label, payload = {}) {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const event = {
    label,
    payload,
    at: Date.now(),
  };
  const previousEvents = Array.isArray(window.__flipbookEvents) ? window.__flipbookEvents : [];
  window.__flipbookEvents = [...previousEvents.slice(-19), event];
  window.__flipbookLastEvent = event;
  console.info("[flipbook-debug]", label, payload);
}

function readPageIndexFromLocation() {
  if (typeof window === "undefined") return null;

  const fromSearch = new URLSearchParams(window.location.search).get("p");
  if (fromSearch != null && fromSearch !== "") {
    return Math.max(0, Number(fromSearch) || 0);
  }

  const rawHash = String(window.location.hash || "").replace(/^#/, "");
  const fromHash = new URLSearchParams(rawHash).get("p");
  if (fromHash != null && fromHash !== "") {
    return Math.max(0, Number(fromHash) || 0);
  }

  return null;
}

function buildFlipbookManifestUrl(slug) {
  const pageIndex = readPageIndexFromLocation();
  if (pageIndex == null) {
    return `/api/library/books/${slug}/flipbook-manifest`;
  }
  return `/api/library/books/${slug}/flipbook-manifest?p=${pageIndex}`;
}

function replaceCanonicalPageUrl(pageIndex) {
  if (typeof window === "undefined") return;

  const safePageIndex = Math.max(0, Number(pageIndex) || 0);
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("p", String(safePageIndex));
  nextUrl.hash = `p=${safePageIndex}`;
  window.history.replaceState(window.history.state, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

function isSkippedTocItem(item = null) {
  const href = String(item?.href || "");
  const label = String(item?.label || "").trim().toLowerCase();
  const fileName = href.split("#")[0].split("/").pop()?.toLowerCase() || "";
  return (
    /titlepage/i.test(fileName) ||
    /imprint/i.test(fileName) ||
    label === "titlepage" ||
    label === "title page" ||
    label === "imprint"
  );
}

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function canEnterFullscreen(element) {
  return Boolean(
    element?.requestFullscreen ||
      element?.webkitRequestFullscreen ||
      element?.msRequestFullscreen
  );
}

async function requestElementFullscreen(element) {
  const requestFullscreenMethod =
    element?.requestFullscreen ||
    element?.webkitRequestFullscreen ||
    element?.msRequestFullscreen;

  if (!requestFullscreenMethod) return;
  await requestFullscreenMethod.call(element);
}

async function exitDocumentFullscreen() {
  const exitFullscreenMethod =
    document.exitFullscreen ||
    document.webkitExitFullscreen ||
    document.msExitFullscreen;

  if (!exitFullscreenMethod) return;
  await exitFullscreenMethod.call(document);
}

export default function FlipbookShell({ initialBook }) {
  const adapterRef = useRef(null);
  const saveTimerRef = useRef(null);
  const activityTimeoutRef = useRef(null);
  const pageTurnAudioRef = useRef(null);
  const rootRef = useRef(null);
  const currentPageIndexRef = useRef(0);
  const visibleSegmentsRef = useRef([]);
  const renderPagesRef = useRef([]);
  const isSinglePageViewRef = useRef(false);
  const spreadAnchorPageIndexRef = useRef(0);
  const visualWindowRef = useRef({ start: 0, end: -1, size: 0, key: "0:-1", mode: "spread" });
  const ttsSegmentRegistryRef = useRef(new Map());
  const explicitSelectedPageIndexRef = useRef(null);
  const ttsStatusRef = useRef("idle");
  const ttsAudioRef = useRef(null);
  const ttsObjectUrlsRef = useRef(new Set());
  const ttsAbortControllersRef = useRef(new Set());
  const ttsRunTokenRef = useRef(0);
  const ttsAutoAdvanceRef = useRef(false);
  const pendingFlipReasonRef = useRef("");
  const pendingFlipWaitRef = useRef({ resolve: null, timeoutId: null });
  const loadedPageIndexesRef = useRef(new Set());
  const loadingRangesRef = useRef(new Set());
  const sessionTokenRef = useRef("");
  const currentRequestedWindowKeyRef = useRef("");
  const adapterReadyWindowKeyRef = useRef("");
  const isAdapterWindowSettlingRef = useRef(true);
  const adapterReadyWaitersRef = useRef(new Map());
  const pendingNavigationRef = useRef(null);
  const pendingGoToPageRef = useRef(null);
  const [bookPayload, setBookPayload] = useState(initialBook);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manifest, setManifest] = useState(null);
  const [pages, setPages] = useState([]);
  const [, setState] = useState(null);
  const [sessionToken, setSessionToken] = useState("");
  const [isSinglePageView, setIsSinglePageView] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [spreadPageIndex, setSpreadPageIndex] = useState(0);
  const [theme, setTheme] = useState("paper-cream");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsVoiceId, setTtsVoiceId] = useState(LIBRARY_TTS_VOICE_OPTIONS[0].id);
  const [ttsStatus, setTtsStatus] = useState("idle");
  const [ttsMessage, setTtsMessage] = useState("");
  const [ttsSelectionMode, setTtsSelectionMode] = useState(false);
  const [ttsSelectedSegment, setTtsSelectedSegment] = useState(null);
  const [ttsHighlightMode, setTtsHighlightMode] = useState("paragraph");
  const [ttsControlsVisible, setTtsControlsVisible] = useState(false);
  const [ttsActiveSegmentId, setTtsActiveSegmentId] = useState("");
  const [ttsActivePageIndex, setTtsActivePageIndex] = useState(null);
  const [explicitSelectedPageIndex, setExplicitSelectedPageIndex] = useState(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [bookVisualState, setBookVisualState] = useState(FLIPBOOK_VISUAL_STATE_READING);
  const [visualWindow, setVisualWindow] = useState({ start: 0, end: -1, size: 0, key: "0:-1", mode: "spread" });
  const [navigationLocked, setNavigationLocked] = useState(true);

  useEffect(() => {
    sessionTokenRef.current = sessionToken;
  }, [sessionToken]);

  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

  useEffect(() => {
    ttsStatusRef.current = ttsStatus;
  }, [ttsStatus]);

  useEffect(() => {
    explicitSelectedPageIndexRef.current = explicitSelectedPageIndex;
  }, [explicitSelectedPageIndex]);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem("library.flipbook.theme");
      const storedSound = window.localStorage.getItem("library.flipbook.sound");
      const storedVoice = window.localStorage.getItem("library.flipbook.tts.voice");
      if (storedTheme) setTheme(storedTheme);
      if (storedSound) setSoundEnabled(storedSound === "1");
      if (storedVoice) setTtsVoiceId(resolveLibraryTtsVoice(storedVoice).id);
    } catch {
      return undefined;
    }
    return undefined;
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("library.flipbook.theme", theme);
      window.localStorage.setItem("library.flipbook.sound", soundEnabled ? "1" : "0");
      window.localStorage.setItem("library.flipbook.tts.voice", ttsVoiceId);
    } catch {
      return undefined;
    }
    return undefined;
  }, [soundEnabled, theme, ttsVoiceId]);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => setIsMobile(mobileQuery.matches);
    syncViewport();
    mobileQuery.addEventListener("change", syncViewport);
    return () => mobileQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => setPrefersReducedMotion(motionQuery.matches);
    syncMotionPreference();
    motionQuery.addEventListener("change", syncMotionPreference);
    return () => motionQuery.removeEventListener("change", syncMotionPreference);
  }, []);

  const mergeWindowIntoPages = useCallback((incomingPages = [], pageCount = 0) => {
    if (!Array.isArray(incomingPages) || !incomingPages.length) return;
    incomingPages.forEach((page) => {
      loadedPageIndexesRef.current.add(Math.max(0, Number(page?.pageIndex) || 0));
    });
    setPages((previousPages) =>
      mergeFlipbookPages({
        pageCount,
        existingPages: previousPages,
        incomingPages,
      })
    );
  }, []);

  const loadPageWindow = useCallback(
    async ({ slug, manifestId, from, to, pageCount, nextSessionToken = sessionTokenRef.current }) => {
      const safeFrom = Math.max(0, Number(from) || 0);
      const safeTo = Math.min(Math.max(safeFrom, Number(to) || safeFrom), Math.max(0, Number(pageCount) - 1));
      if (!manifestId || safeFrom > safeTo) {
        return [];
      }

      let hasMissingPage = false;
      for (let index = safeFrom; index <= safeTo; index += 1) {
        if (!loadedPageIndexesRef.current.has(index)) {
          hasMissingPage = true;
          break;
        }
      }
      if (!hasMissingPage) {
        return [];
      }

      const rangeKey = `${safeFrom}:${safeTo}`;
      if (loadingRangesRef.current.has(rangeKey)) {
        return [];
      }

      loadingRangesRef.current.add(rangeKey);
      try {
        const pagePayload = await fetchJson(
          `/api/library/books/${slug}/flipbook-pages?manifestId=${encodeURIComponent(manifestId)}&from=${safeFrom}&to=${safeTo}`,
          {
            headers: nextSessionToken
              ? {
                  "X-Flipbook-Session": nextSessionToken,
                }
              : undefined,
          }
        );
        const incomingPages = Array.isArray(pagePayload.pages) ? pagePayload.pages : [];
        mergeWindowIntoPages(incomingPages, pageCount);
        return incomingPages;
      } finally {
        loadingRangesRef.current.delete(rangeKey);
      }
    },
    [mergeWindowIntoPages]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        const requestedPageIndex = readPageIndexFromLocation();
        const manifestPayload = await fetchJson(buildFlipbookManifestUrl(initialBook.slug));
        if (!active) return;
        setBookPayload((previous) => ({
          ...previous,
          ...(manifestPayload.book || {}),
        }));
        setManifest(manifestPayload.manifest);
        setState(manifestPayload.state || null);
        setTtsEnabled(Boolean(manifestPayload.ttsEnabled));
        setSessionToken(String(manifestPayload.session?.token || ""));

        const pageCount = Math.max(0, Number(manifestPayload.manifest.pageCount) || 0);
        const startIndex = resolveInitialCanonicalPageIndex({
          requestedPageIndex,
          savedPageIndex: manifestPayload.initialPageIndex,
          currentPageIndex: manifestPayload.state?.currentPageIndex,
          pageCount,
        });
        const normalizedStartIndex = Math.max(0, Number(startIndex) || 0);
        const initialPresentationMode =
          typeof window !== "undefined"
            ? resolveFlipbookPresentationMode({ viewportWidth: window.innerWidth || 0 })
            : "spread";
        const normalizedVisualStartIndex =
          initialPresentationMode === "single"
            ? normalizedStartIndex
            : resolveSpreadLeftPageIndex(normalizedStartIndex, pageCount);
        const initialVisualWindow = {
          ...resolveFlipbookVisualWindow({
            pageCount,
            anchorPageIndex: normalizedVisualStartIndex,
            isSinglePageView: initialPresentationMode === "single",
          }),
          mode: initialPresentationMode,
        };
        currentRequestedWindowKeyRef.current = buildFlipbookVisualWindowKey({
          mode: initialPresentationMode,
          start: initialVisualWindow.start,
          end: initialVisualWindow.end,
        });
        adapterReadyWindowKeyRef.current = "";
        isAdapterWindowSettlingRef.current = true;
        const hasSavedState =
          normalizedStartIndex > 0 ||
          manifestPayload.state?.savedPageIndex != null ||
          manifestPayload.state?.currentPageIndex != null;
        const initialRange = resolveInitialFlipbookPageWindow({
          pageCount,
          startPageIndex: normalizedStartIndex,
          hasSavedState,
        });

        loadedPageIndexesRef.current = new Set();
        loadingRangesRef.current = new Set();
        spreadAnchorPageIndexRef.current = normalizedVisualStartIndex;
        visualWindowRef.current = initialVisualWindow;
        setPages(buildFlipbookPlaceholderPages(pageCount));

        await loadPageWindow({
          slug: initialBook.slug,
          manifestId: manifestPayload.manifest.id,
          from: initialRange.from,
          to: initialRange.to,
          pageCount,
          nextSessionToken: String(manifestPayload.session?.token || ""),
        });
        if (!active) return;
        setCurrentPageIndex(normalizedStartIndex);
        setSpreadPageIndex(normalizedVisualStartIndex);
        setVisualWindow(initialVisualWindow);
        currentPageIndexRef.current = normalizedStartIndex;
        setBookVisualState(
          resolveFlipbookInitialVisualState({
            initialPageIndex: normalizedStartIndex,
            requestedPageIndex,
            savedPageIndex: manifestPayload.state?.savedPageIndex,
            currentPageIndex: manifestPayload.state?.currentPageIndex,
            startedReading: manifestPayload.state?.startedReading,
          })
        );
        setError("");
        setLoading(false);
      } catch (requestError) {
        if (active) {
          setError(requestError?.message || "No se pudo abrir el flipbook.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [initialBook.slug, loadPageWindow]);

  useEffect(() => {
    if (!bookPayload?.assetUrl) return undefined;
    let active = true;
    let bookInstance = null;

    async function warmEngine() {
      try {
        const epubModule = await import("@intity/epub-js");
        if (!active) return;
        const epubFactory = epubModule.default || epubModule.Book || epubModule;
        if (typeof epubFactory === "function") {
          bookInstance = epubFactory(bookPayload.assetUrl);
        }
      } catch {
        return undefined;
      }
      return undefined;
    }

    warmEngine();
    return () => {
      active = false;
      try {
        bookInstance?.destroy?.();
      } catch {
        return undefined;
      }
      return undefined;
    };
  }, [bookPayload?.assetUrl]);

  useEffect(() => {
    function syncFullscreen() {
      setIsFullscreen(Boolean(getFullscreenElement()));
      setFullscreenSupported(
        canEnterFullscreen(rootRef.current) ||
          canEnterFullscreen(document.documentElement) ||
          Boolean(
            document.exitFullscreen ||
              document.webkitExitFullscreen ||
              document.msExitFullscreen
          )
      );
    }

    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    document.addEventListener("MSFullscreenChange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
      document.removeEventListener("MSFullscreenChange", syncFullscreen);
    };
  }, []);

  const registerReaderActivity = useCallback(({ immediate = false } = {}) => {
    setChromeVisible(true);
    if (!isFullscreen) return;
    if (activityTimeoutRef.current) {
      window.clearTimeout(activityTimeoutRef.current);
    }
    activityTimeoutRef.current = window.setTimeout(() => {
      setChromeVisible(false);
    }, immediate ? 3200 : 2400);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) {
      if (activityTimeoutRef.current) {
        window.clearTimeout(activityTimeoutRef.current);
      }
      setChromeVisible(true);
      return undefined;
    }

    registerReaderActivity({ immediate: true });
    return () => {
      if (activityTimeoutRef.current) {
        window.clearTimeout(activityTimeoutRef.current);
      }
    };
  }, [isFullscreen, registerReaderActivity]);

  const stageStyle = useMemo(() => buildFlipbookStageStyle(theme), [theme]);
  const visibleToc = useMemo(
    () => (Array.isArray(manifest?.toc) ? manifest.toc : []).filter((item) => !isSkippedTocItem(item)),
    [manifest?.toc]
  );
  const renderPages = useMemo(
    () =>
      pages.map((page) => ({
        ...page,
        chrome: buildFlipbookPageChrome({
          page,
          bookTitle: bookPayload?.title || "",
          chapterLabel: resolveFlipbookChapterLabel(visibleToc, page.pageIndex),
        }),
      })),
    [bookPayload?.title, pages, visibleToc]
  );
  const visualPresentationMode = isSinglePageView ? "single" : "spread";
  const chapterLabel = useMemo(
    () => resolveFlipbookChapterLabel(visibleToc, currentPageIndex),
    [currentPageIndex, visibleToc]
  );
  const spreadAnchorPageIndex = useMemo(
    () =>
      isSinglePageView
        ? currentPageIndex
        : resolveSpreadLeftPageIndex(spreadPageIndex, renderPages.length),
    [currentPageIndex, isSinglePageView, renderPages.length, spreadPageIndex]
  );
  const readingFocusPageIndex = currentPageIndex;
  const ttsFocusPageIndex = ttsActivePageIndex ?? readingFocusPageIndex;
  const visualWindowPages = useMemo(
    () =>
      renderPages.slice(
        Math.max(0, visualWindow.start),
        visualWindow.end >= visualWindow.start ? visualWindow.end + 1 : visualWindow.start
      ),
    [renderPages, visualWindow.end, visualWindow.start]
  );
  const localVisualPageIndex = useMemo(
    () => globalToLocalPageIndex(spreadAnchorPageIndex, visualWindow.start),
    [spreadAnchorPageIndex, visualWindow.start]
  );
  const localTtsFocusPageIndex = useMemo(() => {
    if (ttsActivePageIndex == null || ttsActivePageIndex === "") return null;
    if (!isPageIndexInsideVisualWindow(ttsActivePageIndex, visualWindow.start, visualWindow.end)) {
      return null;
    }
    return globalToLocalPageIndex(ttsActivePageIndex, visualWindow.start);
  }, [ttsActivePageIndex, visualWindow.end, visualWindow.start]);
  const visualWindowKey = useMemo(
    () =>
      buildFlipbookVisualWindowKey({
        mode: visualPresentationMode,
        start: visualWindow.start,
        end: visualWindow.end,
      }),
    [visualPresentationMode, visualWindow.end, visualWindow.start]
  );
  const showCoverInVisualWindow = visualWindow.start === 0;
  const spreadPages = useMemo(
    () => resolveSpreadPages(renderPages, spreadAnchorPageIndex),
    [renderPages, spreadAnchorPageIndex]
  );
  const singlePage = useMemo(() => resolveSinglePage(renderPages, readingFocusPageIndex), [readingFocusPageIndex, renderPages]);
  const visualPageIndex = isSinglePageView ? readingFocusPageIndex : spreadAnchorPageIndex;
  const visiblePages = useMemo(
    () =>
      isSinglePageView || spreadAnchorPageIndex === 0
        ? [singlePage].filter(Boolean)
        : [spreadPages.left, spreadPages.right].filter(Boolean),
    [isSinglePageView, singlePage, spreadAnchorPageIndex, spreadPages.left, spreadPages.right]
  );
  const visibleSegments = useMemo(() => visiblePages.flatMap((page) => page?.textSegments || []), [visiblePages]);
  const ttsSegmentPageIndexMap = useMemo(() => {
    const segmentToPage = new Map();
    renderPages.forEach((page) => {
      (page?.textSegments || []).forEach((segment) => {
        segmentToPage.set(segment.id, page.pageIndex);
      });
    });
    return segmentToPage;
  }, [renderPages]);
  const ttsSegmentRegistry = useMemo(() => {
    const segmentRegistry = new Map();
    renderPages.forEach((page) => {
      (page?.textSegments || []).forEach((segment) => {
        segmentRegistry.set(segment.id, {
          ...segment,
          pageIndex: page.pageIndex,
        });
      });
    });
    return segmentRegistry;
  }, [renderPages]);

  useEffect(() => {
    visibleSegmentsRef.current = visibleSegments;
  }, [visibleSegments]);

  useEffect(() => {
    ttsSegmentRegistryRef.current = ttsSegmentRegistry;
  }, [ttsSegmentRegistry]);

  useEffect(() => {
    renderPagesRef.current = renderPages;
  }, [renderPages]);

  useEffect(() => {
    isSinglePageViewRef.current = isSinglePageView;
  }, [isSinglePageView]);

  useEffect(() => {
    spreadAnchorPageIndexRef.current = spreadAnchorPageIndex;
  }, [spreadAnchorPageIndex]);

  useEffect(() => {
    visualWindowRef.current = {
      ...visualWindow,
      mode: visualPresentationMode,
    };
  }, [visualPresentationMode, visualWindow]);

  useEffect(() => {
    currentRequestedWindowKeyRef.current = visualWindowKey;
    if (adapterReadyWindowKeyRef.current !== visualWindowKey) {
      isAdapterWindowSettlingRef.current = true;
      setNavigationLocked(true);
    }
  }, [visualWindowKey]);

  const setAdapterWindowSettling = useCallback((settling, requestedWindowKey = currentRequestedWindowKeyRef.current) => {
    isAdapterWindowSettlingRef.current = Boolean(settling);
    if (requestedWindowKey) {
      currentRequestedWindowKeyRef.current = requestedWindowKey;
    }
    if (settling && requestedWindowKey !== adapterReadyWindowKeyRef.current) {
      adapterReadyWindowKeyRef.current = "";
    }
    setNavigationLocked(Boolean(settling));
  }, []);

  const waitForAdapterWindowReady = useCallback((windowKey) => {
    const safeWindowKey = String(windowKey || "");
    if (!safeWindowKey) {
      return Promise.resolve(false);
    }
    if (
      adapterReadyWindowKeyRef.current === safeWindowKey &&
      !isAdapterWindowSettlingRef.current
    ) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const waiters = adapterReadyWaitersRef.current.get(safeWindowKey) || [];
      waiters.push(resolve);
      adapterReadyWaitersRef.current.set(safeWindowKey, waiters);
    });
  }, []);

  const resolveAdapterWindowReadyWaiters = useCallback((windowKey, result = true) => {
    const safeWindowKey = String(windowKey || "");
    if (!safeWindowKey) return;
    const waiters = adapterReadyWaitersRef.current.get(safeWindowKey) || [];
    adapterReadyWaitersRef.current.delete(safeWindowKey);
    waiters.forEach((resolve) => resolve(Boolean(result)));
  }, []);

  const syncVisualWindow = useCallback(
    ({
      anchorPageIndex = 0,
      targetPageIndex = null,
      ttsPageIndex = null,
      force = false,
      includeTtsBuffer = false,
      presentationMode = isSinglePageViewRef.current ? "single" : "spread",
    } = {}) => {
      const pageCount = Math.max(0, renderPagesRef.current.length || 0);
      if (!pageCount) {
        return {
          start: 0,
          end: -1,
          size: 0,
          key: "0:-1",
          mode: presentationMode,
        };
      }

      const nextIsSinglePageView = presentationMode === "single";
      const safeAnchorPageIndex = nextIsSinglePageView
        ? Math.max(0, Math.min(pageCount - 1, Number(anchorPageIndex) || 0))
        : resolveSpreadLeftPageIndex(anchorPageIndex, pageCount);
      const pinnedPageIndexes = [
        safeAnchorPageIndex,
        targetPageIndex,
      ].filter((value) => value != null && value !== "");
      const currentVisualWindow = visualWindowRef.current;
      const modeChanged = currentVisualWindow.mode !== presentationMode;
      const shouldResolveNextWindow =
        force ||
        modeChanged ||
        pinnedPageIndexes.some(
          (pageIndex) =>
            !isPageIndexInsideVisualWindow(pageIndex, currentVisualWindow.start, currentVisualWindow.end)
        ) ||
        shouldShiftFlipbookVisualWindow({
          pageIndex: safeAnchorPageIndex,
          windowStart: currentVisualWindow.start,
          windowEnd: currentVisualWindow.end,
          isSinglePageView: nextIsSinglePageView,
        });

      let nextVisualWindow = shouldResolveNextWindow
        ? resolveFlipbookVisualWindow({
            pageCount,
            anchorPageIndex: safeAnchorPageIndex,
            isSinglePageView: nextIsSinglePageView,
            pinnedPageIndexes,
          })
        : {
            start: currentVisualWindow.start,
            end: currentVisualWindow.end,
            size: currentVisualWindow.size,
            key: currentVisualWindow.key,
          };

      if (includeTtsBuffer) {
        nextVisualWindow = expandFlipbookVisualWindowForTts({
          pageCount,
          windowStart: nextVisualWindow.start,
          windowEnd: nextVisualWindow.end,
          visualAnchorPageIndex: safeAnchorPageIndex,
          ttsPageIndex,
          isSinglePageView: nextIsSinglePageView,
        });
      }

      const nextWindowState = {
        ...nextVisualWindow,
        mode: presentationMode,
      };
      const nextRequestedWindowKey = buildFlipbookVisualWindowKey({
        mode: presentationMode,
        start: nextWindowState.start,
        end: nextWindowState.end,
      });

      if (
        currentVisualWindow.start !== nextWindowState.start ||
        currentVisualWindow.end !== nextWindowState.end ||
        currentVisualWindow.mode !== nextWindowState.mode
      ) {
        if (!pendingFlipReasonRef.current) {
          pendingFlipReasonRef.current = "window-sync";
        }
        setAdapterWindowSettling(true, nextRequestedWindowKey);
        visualWindowRef.current = nextWindowState;
        setVisualWindow(nextWindowState);
      }

      return nextWindowState;
    },
    [setAdapterWindowSettling]
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    window.__flipbookDebug = {
      currentPageIndex,
      spreadPageIndex,
      readingFocusPageIndex,
      spreadAnchorPageIndex,
      visualWindow,
      visualWindowKey,
      localVisualPageIndex,
      navigationLocked,
      requestedWindowKey: currentRequestedWindowKeyRef.current,
      readyWindowKey: adapterReadyWindowKeyRef.current,
      isSettling: isAdapterWindowSettlingRef.current,
      adapterLocalPageIndex: adapterRef.current?.getCurrentPageIndex?.() ?? null,
      pendingNavigation: pendingNavigationRef.current,
      pendingGoToPage: pendingGoToPageRef.current,
      bookVisualState,
    };
  }, [
    bookVisualState,
    currentPageIndex,
    localVisualPageIndex,
    navigationLocked,
    readingFocusPageIndex,
    spreadAnchorPageIndex,
    spreadPageIndex,
    visualWindow,
    visualWindowKey,
  ]);

  useEffect(() => {
    if (!renderPages.length) return;
    syncVisualWindow({
      anchorPageIndex: spreadAnchorPageIndex,
      targetPageIndex: readingFocusPageIndex,
      ttsPageIndex: ttsActivePageIndex,
      includeTtsBuffer:
        ttsActivePageIndex != null || ["playing", "paused", "loading"].includes(ttsStatus),
      presentationMode: visualPresentationMode,
    });
  }, [
    readingFocusPageIndex,
    renderPages.length,
    spreadAnchorPageIndex,
    syncVisualWindow,
    ttsActivePageIndex,
    ttsStatus,
    visualPresentationMode,
  ]);

  useEffect(() => {
    if (!manifest?.id || visualWindow.end < visualWindow.start || !renderPages.length) return;
    const timeoutId = window.setTimeout(() => {
      void loadPageWindow({
        slug: initialBook.slug,
        manifestId: manifest.id,
        from: visualWindow.start,
        to: visualWindow.end,
        pageCount: renderPages.length,
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialBook.slug, loadPageWindow, manifest?.id, renderPages.length, visualWindow.end, visualWindow.start]);

  const preloadTargetPageRange = useCallback(
    async ({
      targetPageIndex = 0,
      backwardRadius = 2,
      forwardRadius = FLIPBOOK_JUMP_LOAD_RADIUS,
    } = {}) => {
      if (!manifest?.id) return [];
      const pageCount = Math.max(0, renderPagesRef.current.length || 0);
      if (!pageCount) return [];

      const safeTargetPageIndex = Math.max(0, Math.min(pageCount - 1, Number(targetPageIndex) || 0));
      return loadPageWindow({
        slug: initialBook.slug,
        manifestId: manifest.id,
        from: Math.max(0, safeTargetPageIndex - Math.max(0, Number(backwardRadius) || 0)),
        to: Math.min(pageCount - 1, safeTargetPageIndex + Math.max(0, Number(forwardRadius) || 0)),
        pageCount,
      });
    },
    [initialBook.slug, loadPageWindow, manifest?.id]
  );

  const resolveVisualTurnTarget = useCallback((direction = "next") => {
    const pageCount = Math.max(0, renderPagesRef.current.length || 0);
    if (!pageCount) return 0;

    const currentVisualPageIndex = isSinglePageViewRef.current
      ? Math.max(0, Number(currentPageIndexRef.current) || 0)
      : resolveSpreadLeftPageIndex(spreadAnchorPageIndexRef.current, pageCount);

    if (direction === "previous") {
      if (isSinglePageViewRef.current) {
        return Math.max(0, currentVisualPageIndex - 1);
      }
      return resolveSpreadLeftPageIndex(Math.max(0, currentVisualPageIndex - 2), pageCount);
    }

    if (isSinglePageViewRef.current) {
      return Math.min(pageCount - 1, currentVisualPageIndex + 1);
    }
    return resolveSpreadLeftPageIndex(Math.min(pageCount - 1, currentVisualPageIndex + 2), pageCount);
  }, []);

  const canTurnInDirection = useCallback((direction = "next") => {
    const pageCount = Math.max(0, renderPagesRef.current.length || 0);
    if (!pageCount) return false;
    const currentVisualPageIndex = isSinglePageViewRef.current
      ? Math.max(0, Number(currentPageIndexRef.current) || 0)
      : resolveSpreadLeftPageIndex(spreadAnchorPageIndexRef.current, pageCount);

    if (direction === "previous") {
      return currentVisualPageIndex > 0;
    }

    return currentVisualPageIndex < pageCount - 1;
  }, []);

  const adapterCanNavigate = useCallback(() => {
    return canFlipbookAdapterAcceptNavigation({
      isSettling: isAdapterWindowSettlingRef.current,
      requestedWindowKey: currentRequestedWindowKeyRef.current,
      readyWindowKey: adapterReadyWindowKeyRef.current,
    });
  }, []);

  const dispatchManualPageTurn = useCallback(
    (direction = "next") => {
      debugFlipbookEvent("dispatch-manual-turn", {
        direction,
        canNavigate: adapterCanNavigate(),
        canTurn: canTurnInDirection(direction),
        adapterLocalPageIndex: adapterRef.current?.getCurrentPageIndex?.() ?? null,
      });
      if (!adapterCanNavigate()) return false;
      if (!canTurnInDirection(direction)) return false;

      const adapter = adapterRef.current;
      if (!adapter) return false;

      pendingFlipReasonRef.current = direction === "previous" ? "manual-previous" : "manual-next";
      void preloadTargetPageRange({
        targetPageIndex: resolveVisualTurnTarget(direction),
        backwardRadius: isSinglePageViewRef.current ? 1 : 2,
        forwardRadius: FLIPBOOK_JUMP_LOAD_RADIUS,
      }).catch(() => undefined);

      if (direction === "previous") {
        adapter.flipPrev?.();
      } else {
        adapter.flipNext?.();
      }

      return true;
    },
    [adapterCanNavigate, canTurnInDirection, preloadTargetPageRange, resolveVisualTurnTarget]
  );

  const flushPendingNavigation = useCallback(() => {
    if (!adapterCanNavigate()) return;
    const queuedNavigation = pendingNavigationRef.current;
    if (!queuedNavigation?.direction) return;
    pendingNavigationRef.current = null;
    dispatchManualPageTurn(queuedNavigation.direction);
  }, [adapterCanNavigate, dispatchManualPageTurn]);

  const prefetchTriggerPageIndex = useMemo(() => {
    if (isSinglePageView) {
      return readingFocusPageIndex;
    }
    const rightVisiblePageIndex = spreadPages.right?.pageIndex ?? spreadAnchorPageIndex;
    return Math.max(rightVisiblePageIndex, ttsFocusPageIndex ?? 0);
  }, [isSinglePageView, readingFocusPageIndex, spreadAnchorPageIndex, spreadPages.right?.pageIndex, ttsFocusPageIndex]);

  const visiblePageNumber = resolveFlipbookVisiblePageNumber(readingFocusPageIndex);
  const visiblePageTotal = resolveFlipbookVisiblePageTotal(renderPages.length);
  const progressPercent =
    visiblePageNumber != null && visiblePageTotal > 0
      ? Math.max(0, Math.min(100, (visiblePageNumber / visiblePageTotal) * 100))
      : 0;
  const canGoPrev = visualPageIndex > 0;
  const canGoNext = visualPageIndex < renderPages.length - 1;

  useEffect(() => {
    if (!manifest?.id || !renderPages.length) return undefined;
    const nextRange = resolveFlipbookNeighborPrefetchRange({
      pageCount: renderPages.length,
      currentPageIndex: prefetchTriggerPageIndex,
      loadedPageIndexes: loadedPageIndexesRef.current,
      prefetchRadius: FLIPBOOK_JUMP_LOAD_RADIUS,
    });
    if (!nextRange) return undefined;
    const timeoutId = window.setTimeout(() => {
      void loadPageWindow({
        slug: initialBook.slug,
        manifestId: manifest.id,
        from: nextRange.from,
        to: nextRange.to,
        pageCount: renderPages.length,
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialBook.slug, loadPageWindow, manifest?.id, pages, prefetchTriggerPageIndex, renderPages.length]);

  useEffect(() => {
    if (!manifest?.id || !renderPages.length) return;
    replaceCanonicalPageUrl(readingFocusPageIndex);
  }, [manifest?.id, readingFocusPageIndex, renderPages.length]);

  useEffect(() => {
    if (!manifest?.id || !pages.length) return undefined;
    const currentPage = pages.find((page) => page.pageIndex === readingFocusPageIndex);
    if (!currentPage || currentPage.flags?.isPlaceholder) return undefined;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const internalProgressPercent =
          pages.length > 1 ? (readingFocusPageIndex / Math.max(1, pages.length - 1)) * 100 : 0;
        const payload = await fetchJson(`/api/library/books/${initialBook.slug}/flipbook-progress`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            layoutProfileId: manifest.layoutProfileId,
            manifestId: manifest.id,
            sessionToken,
            currentPageId: currentPage.pageId,
            currentPageIndex: readingFocusPageIndex,
            progressPercent: internalProgressPercent,
            chapterId: chapterLabel,
            completed: internalProgressPercent >= 99,
          }),
        });
        setState(payload.state || null);
      } catch {
        return undefined;
      }
      return undefined;
    }, 1800);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [chapterLabel, initialBook.slug, manifest, pages, readingFocusPageIndex, sessionToken]);

  const clearTtsHighlight = useCallback(() => {
    rootRef.current?.querySelectorAll(".flipbook-tts-active").forEach((element) => {
      element.classList.remove("flipbook-tts-active");
    });
  }, []);

  const highlightTtsChunk = useCallback(({ segmentId = "" } = {}) => {
    if (!segmentId) return { mode: "paragraph" };
    clearTtsHighlight();
    rootRef.current
      ?.querySelectorAll(`[data-block-id="${segmentId}"]`)
      .forEach((element) => element.classList.add("flipbook-tts-active"));
    const nextPageIndex = ttsSegmentPageIndexMap.get(segmentId) ?? null;
    setTtsActiveSegmentId(segmentId);
    setTtsActivePageIndex(nextPageIndex);
    if (nextPageIndex != null) {
      setCurrentPageIndex(nextPageIndex);
      currentPageIndexRef.current = nextPageIndex;
    }
    return { mode: "paragraph" };
  }, [clearTtsHighlight, ttsSegmentPageIndexMap]);

  const clearPendingFlipWait = useCallback((didFlip = false) => {
    if (pendingFlipWaitRef.current.timeoutId) {
      window.clearTimeout(pendingFlipWaitRef.current.timeoutId);
    }
    const resolver = pendingFlipWaitRef.current.resolve;
    pendingFlipWaitRef.current = { resolve: null, timeoutId: null };
    if (resolver) {
      resolver(Boolean(didFlip));
    }
  }, []);

  const stopTtsPlayback = useCallback(
    ({ message = "", preserveSelection = true } = {}) => {
      ttsRunTokenRef.current += 1;
      ttsAutoAdvanceRef.current = false;
      clearPendingFlipWait(false);
      pendingFlipReasonRef.current = "";

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

      clearTtsHighlight();
      if (!preserveSelection) {
        setTtsSelectedSegment(null);
        setExplicitSelectedPageIndex(null);
      }
      setTtsActiveSegmentId("");
      setTtsActivePageIndex(null);
      setTtsSelectionMode(false);
      setTtsStatus("idle");
      setTtsHighlightMode("paragraph");
      setTtsMessage(message);
    },
    [clearPendingFlipWait, clearTtsHighlight]
  );

  const resolveTtsPagesInView = useCallback(({ startPageIndex = null } = {}) => {
    const allPages = Array.isArray(renderPagesRef.current) ? renderPagesRef.current : [];
    if (!allPages.length) return [];

    const activePageIndex = Math.max(0, Number(currentPageIndexRef.current) || 0);
    if (isSinglePageViewRef.current || activePageIndex === 0) {
      return allPages.filter((page) => page.pageIndex === activePageIndex);
    }

    const anchorPageIndex =
      Math.max(0, Number(spreadAnchorPageIndexRef.current)) ||
      resolveSpreadLeftPageIndex(activePageIndex, allPages.length);
    const pagesInView = [
      allPages.find((page) => page.pageIndex === anchorPageIndex) || null,
      allPages.find((page) => page.pageIndex === anchorPageIndex + 1) || null,
    ].filter(Boolean);

    if (startPageIndex == null) {
      return pagesInView;
    }

    const targetIndex = pagesInView.findIndex((page) => page.pageIndex === Number(startPageIndex));
    if (targetIndex <= 0) {
      return pagesInView;
    }

    return pagesInView.slice(targetIndex);
  }, []);

  const getVisibleTtsSegments = useCallback(({ startSegmentId = "", startPageIndex = null } = {}) => {
    const pagesInView = resolveTtsPagesInView({ startPageIndex });
    const segments = pagesInView.flatMap((page) => page?.textSegments || []);
    if (!segments.length) return [];
    if (!startSegmentId) return segments;
    const startIndex = segments.findIndex((segment) => segment.id === startSegmentId);
    if (startIndex < 0) {
      if (startPageIndex == null) return segments;
      const pageSegments = pagesInView
        .filter((page) => page.pageIndex === Number(startPageIndex))
        .flatMap((page) => page?.textSegments || []);
      return pageSegments.length ? pageSegments : segments;
    }
    return segments.slice(startIndex);
  }, [resolveTtsPagesInView]);

  const fetchTtsAudioUrl = useCallback(async (text, voiceId, token) => {
    const controller = new AbortController();
    ttsAbortControllersRef.current.add(controller);
    const response = await fetch(`/api/library/books/${initialBook.slug}/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        voiceId,
        sessionToken,
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
        URL.revokeObjectURL(objectUrl);
        ttsObjectUrlsRef.current.delete(objectUrl);
      },
    };
  }, [initialBook.slug, sessionToken]);

  const playTtsAudioUrl = useCallback(async (audioChunk, token) => {
    if (typeof window === "undefined" || !audioChunk?.url) return;
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
        .catch((playError) => {
          cleanup();
          reject(new Error(playError?.message || "Read aloud playback failed."));
        });
    });

    if (ttsAudioRef.current === audio) {
      ttsAudioRef.current = null;
    }
    audioChunk.release?.();
  }, []);

  const advanceToNextTtsView = useCallback(async () => {
    const nextVisualPageIndex = resolveVisualTurnTarget("next");
    const currentVisualPageIndex = isSinglePageViewRef.current
      ? Math.max(0, Number(currentPageIndexRef.current) || 0)
      : Math.max(0, Number(spreadAnchorPageIndexRef.current) || 0);
    if (nextVisualPageIndex <= currentVisualPageIndex) {
      return false;
    }

    const previousVisualWindow = visualWindowRef.current;
    const presentationMode = isSinglePageViewRef.current ? "single" : "spread";
    const nextVisualWindow = syncVisualWindow({
      anchorPageIndex: currentVisualPageIndex,
      ttsPageIndex: ttsActivePageIndex,
      includeTtsBuffer: true,
      presentationMode,
    });
    const nextRequestedWindowKey = buildFlipbookVisualWindowKey({
      mode: presentationMode,
      start: nextVisualWindow.start,
      end: nextVisualWindow.end,
    });
    if (
      nextVisualWindow.start !== previousVisualWindow.start ||
      nextVisualWindow.end !== previousVisualWindow.end ||
      nextVisualWindow.mode !== previousVisualWindow.mode ||
      !canFlipbookAdapterAcceptNavigation({
        isSettling: isAdapterWindowSettlingRef.current,
        requestedWindowKey: nextRequestedWindowKey,
        readyWindowKey: adapterReadyWindowKeyRef.current,
      })
    ) {
      const isReady = await waitForAdapterWindowReady(nextRequestedWindowKey);
      if (!isReady) {
        return false;
      }
    }

    const adapter = adapterRef.current;
    if (!adapter?.flipNext) {
      return false;
    }

    await preloadTargetPageRange({
      targetPageIndex: nextVisualPageIndex,
      backwardRadius: isSinglePageViewRef.current ? 1 : 2,
      forwardRadius: FLIPBOOK_JUMP_LOAD_RADIUS + (isSinglePageViewRef.current ? 1 : 2),
    }).catch(() => undefined);

    clearPendingFlipWait(false);
    const flipped = new Promise((resolve) => {
      pendingFlipWaitRef.current.resolve = resolve;
      pendingFlipWaitRef.current.timeoutId = window.setTimeout(() => {
        clearPendingFlipWait(false);
      }, 1400);
    });

    pendingFlipReasonRef.current = "tts-auto";
    ttsAutoAdvanceRef.current = true;
    adapter.flipNext();
    return flipped;
  }, [clearPendingFlipWait, preloadTargetPageRange, resolveVisualTurnTarget, syncVisualWindow, ttsActivePageIndex, waitForAdapterWindowReady]);

  const continueTtsPlayback = useCallback(async ({ startSegmentId = "", startPageIndex = null } = {}) => {
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
    let nextStartPageIndex = startPageIndex;

    while (ttsRunTokenRef.current === token) {
      const visibleQueueSegments = getVisibleTtsSegments({
        startSegmentId: nextStartSegmentId,
        startPageIndex: nextStartPageIndex,
      });
      nextStartSegmentId = "";
      nextStartPageIndex = null;

      if (!visibleQueueSegments.length) {
        stopTtsPlayback({
          message: "No readable text was found on this page.",
          preserveSelection: true,
        });
        return;
      }

      const queue = buildLibraryTtsPlaybackQueue(visibleQueueSegments);
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

        const highlightResult = highlightTtsChunk({ segmentId: item.segmentId });
        setTtsHighlightMode(highlightResult?.mode || "paragraph");
        setTtsStatus("loading");

        if (!currentAudioChunk) {
          try {
            currentAudioChunk = await fetchTtsAudioUrl(item.text, voice.id, token);
          } catch (requestError) {
            if (ttsRunTokenRef.current !== token) return;
            setTtsMessage(requestError?.message || "One paragraph could not be read aloud.");
            continue;
          }
        }

        if (ttsRunTokenRef.current !== token) return;
        if (!currentAudioChunk) {
          continue;
        }

        if (index + 1 < queue.length) {
          nextAudioPromise = fetchTtsAudioUrl(queue[index + 1].text, voice.id, token).catch((requestError) => {
            if (ttsRunTokenRef.current !== token) return null;
            setTtsMessage(requestError?.message || "One paragraph could not be read aloud.");
            return null;
          });
        } else {
          nextAudioPromise = null;
        }

        await playTtsAudioUrl(currentAudioChunk, token);
        currentAudioChunk = nextAudioPromise ? await nextAudioPromise : null;
      }

      if (ttsRunTokenRef.current !== token) return;
      if (currentPageIndexRef.current >= renderPages.length - 1) {
        stopTtsPlayback({
          message: `Reached the end of ${bookPayload.title}.`,
          preserveSelection: true,
        });
        return;
      }

      setTtsStatus("loading");
      const turned = await advanceToNextTtsView();
      ttsAutoAdvanceRef.current = false;
      if (!turned) {
        stopTtsPlayback({
          message: `Reached the end of ${bookPayload.title}.`,
          preserveSelection: true,
        });
        return;
      }

      nextStartPageIndex = currentPageIndexRef.current;
      await new Promise((resolve) => window.setTimeout(resolve, 260));
    }
  }, [
    advanceToNextTtsView,
    bookPayload.title,
    fetchTtsAudioUrl,
    getVisibleTtsSegments,
    highlightTtsChunk,
    playTtsAudioUrl,
    renderPages.length,
    stopTtsPlayback,
    ttsEnabled,
    ttsVoiceId,
  ]);

  useEffect(() => {
    if (!ttsEnabled) {
      stopTtsPlayback({ message: "", preserveSelection: false });
      setTtsControlsVisible(false);
    }
  }, [stopTtsPlayback, ttsEnabled]);

  useEffect(() => {
    if (!ttsEnabled || !ttsSelectionMode) return undefined;
    setTtsMessage("Click a paragraph to start reading from there.");

    const element = rootRef.current;
    if (!element) return undefined;
    element.classList.add("flipbook-selection-mode");

    const stopInteraction = (event) => {
      const block = event.target?.closest?.("[data-block-id]");
      if (!block) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    const handleClick = async (event) => {
      const block = event.target?.closest?.("[data-block-id]");
      if (!block) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const segmentId = block.getAttribute("data-block-id") || "";
      const segment = ttsSegmentRegistryRef.current.get(segmentId);
      if (!segment) return;

      setTtsControlsVisible(true);
      const nextSelection = {
        id: segment.id,
        text: segment.text,
        label: segment.text.slice(0, 88),
      };
      setTtsSelectedSegment(nextSelection);
      setExplicitSelectedPageIndex(segment.pageIndex);
      setCurrentPageIndex(segment.pageIndex);
      currentPageIndexRef.current = segment.pageIndex;
      setTtsSelectionMode(false);

      try {
        await continueTtsPlayback({ startSegmentId: segment.id, startPageIndex: segment.pageIndex });
      } catch (selectionError) {
        stopTtsPlayback({
          message: selectionError?.message || "Read aloud is temporarily unavailable.",
          preserveSelection: true,
        });
      }
    };

    element.addEventListener("pointerdown", stopInteraction, true);
    element.addEventListener("click", handleClick, true);
    return () => {
      element.classList.remove("flipbook-selection-mode");
      element.removeEventListener("pointerdown", stopInteraction, true);
      element.removeEventListener("click", handleClick, true);
    };
  }, [continueTtsPlayback, getVisibleTtsSegments, stopTtsPlayback, ttsEnabled, ttsSelectionMode]);

  useEffect(() => {
    if (!ttsActiveSegmentId) return;
    if (!["playing", "paused", "loading"].includes(ttsStatus)) return;
    if (!visibleSegments.some((segment) => segment.id === ttsActiveSegmentId)) return;
    highlightTtsChunk({ segmentId: ttsActiveSegmentId });
  }, [highlightTtsChunk, ttsActiveSegmentId, ttsStatus, visibleSegments]);

  useEffect(() => {
    const abortControllers = ttsAbortControllersRef.current;
    const objectUrls = ttsObjectUrlsRef.current;
    const readyWaiters = adapterReadyWaitersRef.current;

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (activityTimeoutRef.current) {
        window.clearTimeout(activityTimeoutRef.current);
      }
      if (pendingFlipWaitRef.current.timeoutId) {
        window.clearTimeout(pendingFlipWaitRef.current.timeoutId);
      }
      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.currentTime = 0;
        } catch {
          // no-op
        }
      }
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
      readyWaiters.forEach((waiters) => {
        waiters.forEach((resolve) => resolve(false));
      });
      readyWaiters.clear();
    };
  }, []);

  const handleAdapterOrientationChange = useCallback((eventOrPayload) => {
    if (typeof eventOrPayload === "boolean") {
      setIsSinglePageView(Boolean(eventOrPayload));
      return;
    }

    if (
      shouldIgnoreFlipbookAdapterEvent({
        eventWindowKey: eventOrPayload?.windowKey,
        requestedWindowKey: currentRequestedWindowKeyRef.current,
      })
    ) {
      return;
    }

    setIsSinglePageView(Boolean(eventOrPayload?.isPortrait));
  }, []);

  const handleFlipStateChange = useCallback(
    (eventOrPayload) => {
      const flipState =
        typeof eventOrPayload === "string" ? eventOrPayload : eventOrPayload?.flipState;
      const eventWindowKey =
        typeof eventOrPayload === "string" ? currentRequestedWindowKeyRef.current : eventOrPayload?.windowKey;

      if (
        shouldIgnoreFlipbookAdapterEvent({
          eventWindowKey,
          requestedWindowKey: currentRequestedWindowKeyRef.current,
        })
      ) {
        return;
      }
      debugFlipbookEvent("flip-state-change", { eventWindowKey, flipState, bookVisualState });
      if (bookVisualState !== FLIPBOOK_VISUAL_STATE_OPENING_BOOK) return;
      if (flipState !== "read") return;
      setBookVisualState(FLIPBOOK_VISUAL_STATE_READING);
    },
    [bookVisualState]
  );

  const commitNavigationFromLocal = useCallback(
    ({
      windowKey = "",
      windowStart = 0,
      localPageIndex = 0,
      source = "flip",
    } = {}) => {
      if (
        shouldIgnoreFlipbookAdapterEvent({
          eventWindowKey: windowKey,
          requestedWindowKey: currentRequestedWindowKeyRef.current,
        })
      ) {
        return false;
      }

      const safeWindowStart = Math.max(0, Number(windowStart) || 0);
      const safeLocalPageIndex = Math.max(0, Number(localPageIndex) || 0);
      const pendingJump = pendingGoToPageRef.current;
      if (
        pendingJump?.windowKey === windowKey &&
        pendingJump?.windowStart === safeWindowStart
      ) {
        const pendingLocalTargetPageIndex = globalToLocalPageIndex(
          pendingJump.visualTargetPageIndex,
          safeWindowStart
        );
        if (source === "flip" && safeLocalPageIndex !== pendingLocalTargetPageIndex) {
          return false;
        }
      }

      const globalPageIndex = localToGlobalPageIndex(
        safeLocalPageIndex,
        safeWindowStart,
        renderPages.length
      );
      const leftPageIndex = isSinglePageViewRef.current
        ? Math.max(0, Number(globalPageIndex) || 0)
        : resolveSpreadLeftPageIndex(globalPageIndex, renderPages.length);
      const rightPageIndex = leftPageIndex + 1 < renderPages.length ? leftPageIndex + 1 : null;
      const explicitPageIndex = explicitSelectedPageIndexRef.current;
      const nextPageIndex =
        isSinglePageViewRef.current || leftPageIndex === 0
          ? leftPageIndex
          : resolvePrimaryReadingPage({
              leftPageIndex,
              rightPageIndex,
              ttsActivePageIndex,
              explicitSelectedPageIndex: explicitPageIndex,
              pageCount: renderPages.length,
            });
      const flipReason =
        pendingFlipReasonRef.current || (ttsAutoAdvanceRef.current ? "tts-auto" : "manual");
      const isPassiveWindowSync = flipReason === "window-sync";
      const isReadyCommit = source === "ready";
      pendingFlipReasonRef.current = "";

      debugFlipbookEvent("commit-navigation-from-local", {
        windowKey,
        windowStart: safeWindowStart,
        localPageIndex: safeLocalPageIndex,
        globalPageIndex,
        leftPageIndex,
        rightPageIndex,
        nextPageIndex,
        source,
        flipReason,
      });

      if (flipReason === "tts-auto" && source === "flip") {
        ttsAutoAdvanceRef.current = false;
      }

      if (source === "flip") {
        clearPendingFlipWait(true);
      }

      if (source === "flip") {
        registerReaderActivity();
      }

      setSpreadPageIndex(leftPageIndex);
      spreadAnchorPageIndexRef.current = leftPageIndex;
      setExplicitSelectedPageIndex(null);
      explicitSelectedPageIndexRef.current = null;
      setCurrentPageIndex(nextPageIndex);
      currentPageIndexRef.current = nextPageIndex;

      const resolvedPendingJump =
        pendingJump?.windowKey === windowKey &&
        pendingJump?.windowStart === safeWindowStart &&
        pendingJump?.visualTargetPageIndex === leftPageIndex &&
        adapterReadyWindowKeyRef.current === windowKey;
      const shouldUnlockWindow =
        resolvedPendingJump ||
        (isReadyCommit &&
          adapterReadyWindowKeyRef.current === windowKey &&
          isAdapterWindowSettlingRef.current);

      if (resolvedPendingJump) {
        pendingGoToPageRef.current = null;
      }

      if (shouldUnlockWindow) {
        setAdapterWindowSettling(false, windowKey);
        resolveAdapterWindowReadyWaiters(windowKey, true);
        flushPendingNavigation();
      }

      if (
        bookVisualState === FLIPBOOK_VISUAL_STATE_OPENING_BOOK &&
        nextPageIndex > 0
      ) {
        setBookVisualState(FLIPBOOK_VISUAL_STATE_READING);
      }

      if (!isReadyCommit && !isPassiveWindowSync && flipReason !== "tts-auto" && flipReason !== "intro-open") {
        if (soundEnabled) {
          playLibraryPageFlipSound({
            enabled: soundEnabled,
            audioContextRef: pageTurnAudioRef,
          });
        }

        if (["playing", "paused", "loading"].includes(ttsStatusRef.current)) {
          stopTtsPlayback({
            message:
              flipReason === "chapter"
                ? "Read aloud stopped because the chapter changed."
                : "Read aloud stopped because the page changed.",
            preserveSelection: true,
          });
        }
      }

      return true;
    },
    [
      bookVisualState,
      clearPendingFlipWait,
      flushPendingNavigation,
      registerReaderActivity,
      renderPages.length,
      resolveAdapterWindowReadyWaiters,
      setAdapterWindowSettling,
      soundEnabled,
      stopTtsPlayback,
      ttsActivePageIndex,
    ]
  );

  const handleAdapterReady = useCallback(
    ({ windowKey = "", windowStart = 0, localPageIndex = 0, source = "ready" } = {}) => {
      if (
        shouldIgnoreFlipbookAdapterEvent({
          eventWindowKey: windowKey,
          requestedWindowKey: currentRequestedWindowKeyRef.current,
        })
      ) {
        return;
      }

      adapterReadyWindowKeyRef.current = windowKey;
      const settledLocalPageIndex = Math.max(
        0,
        Number(adapterRef.current?.getCurrentPageIndex?.() ?? localPageIndex) || 0
      );
      debugFlipbookEvent("adapter-ready", {
        windowKey,
        windowStart,
        localPageIndex,
        settledLocalPageIndex,
        source,
      });
      const pendingJump = pendingGoToPageRef.current;
      if (pendingJump?.windowKey === windowKey) {
        const localTargetPageIndex = globalToLocalPageIndex(
          pendingJump.visualTargetPageIndex,
          windowStart
        );
        if (settledLocalPageIndex !== localTargetPageIndex) {
          pendingFlipReasonRef.current = pendingJump.reason || "chapter";
          adapterRef.current?.setPage?.(localTargetPageIndex);
          return;
        }
      }

      commitNavigationFromLocal({
        windowKey,
        windowStart,
        localPageIndex: settledLocalPageIndex,
        source,
      });
    },
    [commitNavigationFromLocal]
  );

  const requestBookOpening = useCallback(() => {
    if (bookVisualState !== FLIPBOOK_VISUAL_STATE_CLOSED_BOOK) return;
    debugFlipbookEvent("request-book-opening", {
      visualState: bookVisualState,
      localPageIndex: adapterRef.current?.getCurrentPageIndex?.() ?? null,
    });
    registerReaderActivity();
    void preloadTargetPageRange({
      targetPageIndex: 1,
      backwardRadius: 0,
      forwardRadius: FLIPBOOK_JUMP_LOAD_RADIUS,
    }).catch(() => undefined);
    if (prefersReducedMotion) {
      pendingFlipReasonRef.current = "intro-open";
      setBookVisualState(FLIPBOOK_VISUAL_STATE_READING);
      adapterRef.current?.setPage?.(globalToLocalPageIndex(1, visualWindowRef.current.start));
      return;
    }
    setBookVisualState(FLIPBOOK_VISUAL_STATE_OPENING_BOOK);
  }, [bookVisualState, preloadTargetPageRange, prefersReducedMotion, registerReaderActivity]);

  const handleOpeningTransitionReady = useCallback(() => {
    if (bookVisualState !== FLIPBOOK_VISUAL_STATE_OPENING_BOOK) return;
    debugFlipbookEvent("opening-transition-ready", {
      visualState: bookVisualState,
      localPageIndex: adapterRef.current?.getCurrentPageIndex?.() ?? null,
    });
    pendingFlipReasonRef.current = "intro-open";
    adapterRef.current?.flipNext?.();
  }, [bookVisualState]);

  const handleFlip = useCallback(
    (payload = {}) => {
      commitNavigationFromLocal(payload);
    },
    [commitNavigationFromLocal]
  );

  const handlePageSet = useCallback(
    (payload = {}) => {
      commitNavigationFromLocal(payload);
    },
    [commitNavigationFromLocal]
  );

  async function handleTtsPlay() {
    registerReaderActivity();
    setTtsControlsVisible(true);
    setTtsSelectedSegment(null);
    setExplicitSelectedPageIndex(null);
    try {
      await continueTtsPlayback({ startPageIndex: ttsFocusPageIndex });
    } catch (playError) {
      stopTtsPlayback({
        message: playError?.message || "Read aloud is temporarily unavailable.",
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
    } catch (resumeError) {
      setTtsMessage(resumeError?.message || "Read aloud could not resume.");
    }
  }

  const requestPageTurn = useCallback((direction) => {
    debugFlipbookEvent("request-page-turn", {
      direction,
      visualState: bookVisualState,
      navigationLocked,
      canGoPrev,
      canGoNext,
      adapterLocalPageIndex: adapterRef.current?.getCurrentPageIndex?.() ?? null,
      isSettling: isAdapterWindowSettlingRef.current,
      requestedWindowKey: currentRequestedWindowKeyRef.current,
      readyWindowKey: adapterReadyWindowKeyRef.current,
    });
    if (bookVisualState === FLIPBOOK_VISUAL_STATE_OPENING_BOOK) return;
    if (bookVisualState === FLIPBOOK_VISUAL_STATE_CLOSED_BOOK) {
      if (navigationLocked) return;
      if (direction === "next") {
        requestBookOpening();
      }
      return;
    }
    if (ttsSelectionMode) return;
    if (direction === "previous" && !canGoPrev) return;
    if (direction === "next" && !canGoNext) return;
    registerReaderActivity();
    if (!adapterCanNavigate()) {
      pendingNavigationRef.current = { direction };
      return;
    }
    dispatchManualPageTurn(direction);
  }, [
    adapterCanNavigate,
    bookVisualState,
    canGoNext,
    canGoPrev,
    dispatchManualPageTurn,
    navigationLocked,
    registerReaderActivity,
    requestBookOpening,
    ttsSelectionMode,
  ]);

  useEffect(() => {
    function handleKeydown(event) {
      registerReaderActivity();
      if (!canUseLibraryReaderArrowKeys(event)) return;
      const activeElement = document.activeElement;
      if (
        activeElement &&
        activeElement !== document.body &&
        !rootRef.current?.contains(activeElement)
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        requestPageTurn("previous");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        requestPageTurn("next");
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [registerReaderActivity, requestPageTurn]);

  async function handleGoToPage(pageIndex) {
    const targetPageIndex = Math.max(0, Number(pageIndex) || 0);
    if (targetPageIndex === currentPageIndexRef.current) return;
    if (bookVisualState !== FLIPBOOK_VISUAL_STATE_READING) {
      setBookVisualState(FLIPBOOK_VISUAL_STATE_READING);
    }
    if (["playing", "paused", "loading"].includes(ttsStatusRef.current)) {
      stopTtsPlayback({
        message: "Read aloud stopped because the chapter changed.",
        preserveSelection: true,
      });
    }
    await preloadTargetPageRange({
      targetPageIndex,
      backwardRadius: isSinglePageViewRef.current ? 1 : 2,
      forwardRadius: FLIPBOOK_JUMP_LOAD_RADIUS + (isSinglePageViewRef.current ? 0 : 2),
    }).catch(() => undefined);
    const visualTargetPageIndex = isSinglePageViewRef.current
      ? targetPageIndex
      : resolveSpreadLeftPageIndex(targetPageIndex, renderPages.length);
    const currentVisualWindow = visualWindowRef.current;
    const windowIncludesTarget =
      currentVisualWindow.mode === visualPresentationMode &&
      isPageIndexInsideVisualWindow(
        visualTargetPageIndex,
        currentVisualWindow.start,
        currentVisualWindow.end
      );
    const nextVisualWindow = syncVisualWindow({
      anchorPageIndex: visualTargetPageIndex,
      targetPageIndex,
      ttsPageIndex: ttsActivePageIndex,
      force: !windowIncludesTarget,
      presentationMode: visualPresentationMode,
    });
    const nextRequestedWindowKey = buildFlipbookVisualWindowKey({
      mode: visualPresentationMode,
      start: nextVisualWindow.start,
      end: nextVisualWindow.end,
    });
    const canUseCurrentAdapterForJump = canFlipbookAdapterAcceptNavigation({
      isSettling: isAdapterWindowSettlingRef.current,
      requestedWindowKey: nextRequestedWindowKey,
      readyWindowKey: adapterReadyWindowKeyRef.current,
    });
    setExplicitSelectedPageIndex(targetPageIndex);
    explicitSelectedPageIndexRef.current = targetPageIndex;
    registerReaderActivity();
    setAdapterWindowSettling(true, nextRequestedWindowKey);
    pendingGoToPageRef.current = {
      windowKey: nextRequestedWindowKey,
      windowStart: nextVisualWindow.start,
      targetPageIndex,
      visualTargetPageIndex,
      reason: "chapter",
    };
    pendingFlipReasonRef.current = "chapter";
    if (
      nextVisualWindow.start === currentVisualWindow.start &&
      nextVisualWindow.end === currentVisualWindow.end &&
      nextVisualWindow.mode === currentVisualWindow.mode &&
      canUseCurrentAdapterForJump
    ) {
      adapterRef.current?.setPage?.(
        globalToLocalPageIndex(visualTargetPageIndex, nextVisualWindow.start)
      );
    }
  }

  async function toggleFullscreen() {
    const element = rootRef.current || document.documentElement;
    if (!element) return;
    if (getFullscreenElement()) {
      await exitDocumentFullscreen().catch(() => undefined);
      return;
    }
    await requestElementFullscreen(element).catch(() => undefined);
  }

  if (loading) {
    return (
      <section
        className="-mx-4 -my-6 flex items-center bg-[#111] p-8 text-white sm:-mx-6 sm:-my-8"
        style={{ ...FULL_STAGE_FRAME_STYLE, minHeight: FULL_STAGE_HEIGHT, height: FULL_STAGE_HEIGHT }}
      >
        <p className="text-sm uppercase tracking-[0.22em] text-white/50">Preparing flipbook</p>
      </section>
    );
  }

  if (error || !manifest || !renderPages.length) {
    return (
      <section
        className="-mx-4 -my-6 bg-[#111] p-8 text-white sm:-mx-6 sm:-my-8"
        style={{ ...FULL_STAGE_FRAME_STYLE, minHeight: FULL_STAGE_HEIGHT, height: FULL_STAGE_HEIGHT }}
      >
        <p className="text-sm uppercase tracking-[0.22em] text-white/50">Flipbook unavailable</p>
        <p className="mt-3 text-lg">{error || "This title could not be prepared."}</p>
      </section>
    );
  }

  return (
    <section
      ref={rootRef}
      className={`relative -mx-4 -my-6 flex w-auto flex-col overflow-hidden text-white sm:-mx-6 sm:-my-8 ${
        isFullscreen ? "min-h-screen" : ""
      }`}
      data-theme={theme}
      style={{
        ...FULL_STAGE_FRAME_STYLE,
        ...stageStyle,
        height: isFullscreen ? "100dvh" : FULL_STAGE_HEIGHT,
        minHeight: isFullscreen ? "100dvh" : FULL_STAGE_HEIGHT,
        borderRadius: "0px",
      }}
      onMouseMove={() => registerReaderActivity()}
      onPointerDown={() => registerReaderActivity()}
      onTouchStart={() => registerReaderActivity()}
    >
      <div className="absolute inset-x-0 top-0 z-20 px-2 pt-2 sm:px-4 sm:pt-4">
        <div
          className={`transition duration-300 ${
            chromeVisible || !isFullscreen ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
          }`}
        >
          <FlipbookHeader slug={bookPayload.slug} title={bookPayload.title} />
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          className="pointer-events-none absolute left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "var(--flipbook-stage-glow)" }}
        />

        <div className="relative flex h-full min-h-0 items-center justify-center px-1 pb-24 pt-14 sm:px-2 sm:pb-28 sm:pt-20">
          <div className="relative h-full w-full">
            <FlipbookBookFrame
              adapterRef={adapterRef}
              pages={visualWindowPages}
              startPage={localVisualPageIndex}
              windowStart={visualWindow.start}
              visualPageIndex={localVisualPageIndex}
              ttsActivePageIndex={localTtsFocusPageIndex}
              adapterWindowKey={visualWindowKey}
              showCover={showCoverInVisualWindow}
              coverPage={renderPages[0] || null}
              isFullscreen={isFullscreen}
              showPageArrows={!isMobile}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              chromeVisible={chromeVisible || !isFullscreen}
              ttsSelectionMode={ttsSelectionMode}
              navigationLocked={navigationLocked}
              visualState={bookVisualState}
              onReady={handleAdapterReady}
              onPageSet={handlePageSet}
              onFlipStateChange={handleFlipStateChange}
              onOpeningTransitionReady={handleOpeningTransitionReady}
              onRequestOpenBook={requestBookOpening}
              onRequestPageTurn={requestPageTurn}
              onFlip={handleFlip}
              onOrientationChange={handleAdapterOrientationChange}
            />
          </div>
        </div>
      </div>
      <FlipbookControlsBar
        toc={visibleToc}
        currentPageIndex={currentPageIndex}
        visiblePageNumber={visiblePageNumber}
        visiblePageTotal={visiblePageTotal}
        progressPercent={progressPercent}
        theme={theme}
        onThemeChange={setTheme}
        isMobile={isMobile}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((previous) => !previous)}
        fullscreenSupported={fullscreenSupported}
        isFullscreen={isFullscreen}
        chromeVisible={chromeVisible || !isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onGoToPage={handleGoToPage}
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
          registerReaderActivity();
          setTtsControlsVisible(true);
          setTtsVoiceId(resolveLibraryTtsVoice(voiceId).id);
          if (["playing", "paused", "loading"].includes(ttsStatusRef.current)) {
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
        onTtsToggleSelectionMode={() => {
          registerReaderActivity();
          setTtsControlsVisible(true);
          setTtsSelectionMode((previous) => !previous);
        }}
      />
      <style jsx global>{`
        .flipbook-selection-mode [data-block-id] {
          cursor: pointer;
        }
        .stf__outerShadow,
        .stf__innerShadow,
        .stf__hardShadow,
        .stf__hardInnerShadow {
          pointer-events: none;
        }
        .flipbook-animation-host {
          margin: 0 auto;
          overflow: hidden;
          contain: paint;
          clip-path: inset(0);
          user-select: none;
          -webkit-user-select: none;
        }
        .stf__parent {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .stf__parent,
        .stf__block,
        .stf__wrapper {
          overflow: hidden;
          contain: paint;
          clip-path: inset(0);
          isolation: isolate;
        }
        .stf__wrapper {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .stf__block {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .stf__item {
          overflow: hidden;
          user-select: none;
          -webkit-user-select: none;
        }
        .flipbook-page-node {
          width: 720px;
          height: 1080px;
          overflow: hidden;
          contain: layout paint style;
          transform: translateZ(0);
          will-change: transform;
          user-select: none;
          -webkit-user-select: none;
        }
        .flipbook-runtime-page {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: var(--flipbook-page-bg);
          color: var(--flipbook-page-text);
          border: 1px solid var(--flipbook-page-border);
          box-shadow: 0 16px 32px rgba(0, 0, 0, 0.2);
          backface-visibility: hidden;
          transform: translateZ(0);
          will-change: transform;
          user-select: none;
          -webkit-user-select: none;
        }
        .flipbook-runtime-page::after {
          content: "";
          position: absolute;
          inset: 0;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03), inset 0 24px 36px rgba(255, 255, 255, 0.02);
          pointer-events: none;
        }
        .flipbook-page-sheet {
          position: relative;
          width: 100%;
          height: 100%;
          background: var(--flipbook-page-bg);
          color: var(--flipbook-page-text);
          backface-visibility: hidden;
          transform: translateZ(0);
        }
        .flipbook-page-content,
        .flipbook-page-inner {
          width: 100%;
          height: 100%;
        }
        .flipbook-page-content {
          background: inherit;
          color: inherit;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
        }
        .flipbook-page-sheet.has-editorial-chrome .flipbook-page-content {
          padding-top: ${FLIPBOOK_EDITORIAL_CONTENT_TOP_INSET}px;
          padding-bottom: ${FLIPBOOK_EDITORIAL_CONTENT_BOTTOM_INSET}px;
        }
        .flipbook-page-inner {
          width: 720px;
          min-height: 100%;
          padding: ${DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingTop}px ${DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingRight}px ${DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingBottom}px ${DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingLeft}px;
          color: var(--flipbook-page-text);
          box-sizing: border-box;
          font-family: Georgia, Times New Roman, serif;
          font-size: 18px;
          line-height: 1.58;
          overflow: hidden;
        }
        .flipbook-page-shell {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
        }
        .flipbook-page-shell-skeleton,
        .flipbook-page-shell-placeholder {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: ${DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingTop}px ${DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingRight}px ${DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingBottom}px ${DEFAULT_FLIPBOOK_LAYOUT_PROFILE.paddingLeft}px;
        }
        .flipbook-page-shell-placeholder {
          align-items: center;
        }
        .flipbook-page-shell-skeleton {
          gap: 16px;
        }
        .flipbook-page-shell-skeleton.is-cover-shell,
        .flipbook-page-shell-placeholder.is-cover-shell {
          padding: 0;
        }
        .flipbook-page-shell-loading {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 220px;
          min-height: 64px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: var(--flipbook-page-chrome-text);
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .flipbook-page-shell-line {
          height: 12px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(82, 63, 36, 0.08), rgba(122, 97, 58, 0.18), rgba(82, 63, 36, 0.08));
        }
        .flipbook-page-shell-line.short {
          width: 28%;
        }
        .flipbook-page-shell-line.medium {
          width: 64%;
        }
        .flipbook-page-shell-line.wide {
          width: 100%;
        }
        .flipbook-cover-shell-surface {
          display: flex;
          flex-direction: column;
          justify-content: center;
          width: 100%;
          height: 100%;
          padding: 96px 74px;
          background: linear-gradient(180deg, rgba(220, 200, 164, 0.82) 0%, rgba(159, 127, 79, 0.96) 100%);
        }
        .flipbook-cover-shell-kicker,
        .flipbook-cover-shell-title,
        .flipbook-cover-shell-author {
          border-radius: 999px;
          background: rgba(31, 22, 11, 0.18);
        }
        .flipbook-cover-shell-kicker {
          width: 32%;
          height: 10px;
          margin-bottom: 28px;
        }
        .flipbook-cover-shell-title {
          width: 88%;
          height: 18px;
          margin-bottom: 16px;
        }
        .flipbook-cover-shell-author {
          width: 54%;
          height: 12px;
        }
        .flipbook-page-sheet.is-cover-page .flipbook-page-content {
          padding-top: 0;
          padding-bottom: 0;
        }
        .flipbook-page-meta {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          color: var(--flipbook-page-chrome-text);
          font-family: "Iowan Old Style", "Baskerville Old Face", Georgia, serif;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .flipbook-page-meta-line {
          position: absolute;
          left: 8%;
          right: 8%;
          height: 1px;
          background: var(--flipbook-page-chrome-line);
        }
        .flipbook-page-meta-line.top {
          top: 1.62rem;
        }
        .flipbook-page-meta-line.bottom {
          bottom: 1.52rem;
        }
        .flipbook-page-meta-row {
          position: absolute;
          left: 8%;
          right: 8%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          font-size: 11px;
          line-height: 1;
        }
        .flipbook-page-meta-row.top {
          top: 1rem;
        }
        .flipbook-page-meta-row.bottom {
          bottom: 0.78rem;
        }
        .flipbook-page-meta-row.bottom span:last-child {
          min-width: 2rem;
          text-align: right;
        }
        .flipbook-cover-page {
          padding: 0;
        }
        .flipbook-loading-page {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .flipbook-loading-page-shell {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          text-align: center;
          color: var(--flipbook-page-chrome-text);
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .flipbook-loading-page-shell p {
          margin: 0;
        }
        .flipbook-cover-page img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .flipbook-cover-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          background: linear-gradient(180deg, #dcc8a4 0%, #9f7f4f 100%);
          color: #1f160b;
        }
        .flipbook-cover-kicker {
          margin: 0 0 18px;
          font-size: 11px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          opacity: 0.7;
        }
        .flipbook-block {
          margin: 0;
        }
        .flipbook-block + .flipbook-block {
          margin-top: 18px;
        }
        .flipbook-block.flipbook-block-h1,
        .flipbook-block.flipbook-block-h2,
        .flipbook-block.flipbook-block-h3,
        .flipbook-block.flipbook-block-h4,
        .flipbook-block.flipbook-block-h5,
        .flipbook-block.flipbook-block-h6 {
          margin: 0;
          font-weight: 600;
          line-height: 1.25;
        }
        .flipbook-block.flipbook-block-p,
        .flipbook-block.flipbook-block-blockquote,
        .flipbook-block.flipbook-block-pre,
        .flipbook-block.flipbook-block-li,
        .flipbook-block.flipbook-block-figure,
        .flipbook-block figcaption {
          margin: 0;
        }
        .flipbook-block img {
          display: block;
          max-width: 100%;
          max-height: 360px;
          margin: 0 auto 12px;
          object-fit: contain;
        }
        .flipbook-block figcaption {
          font-size: 13px;
          line-height: 1.45;
          color: var(--flipbook-page-muted);
          text-align: center;
        }
        .flipbook-tts-active {
          background: rgba(214, 170, 72, 0.18);
          box-shadow: inset 0 0 0 1px rgba(214, 170, 72, 0.24);
        }
      `}</style>
    </section>
  );
}
