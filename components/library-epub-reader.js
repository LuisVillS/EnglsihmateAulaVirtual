"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { updateBookProgress } from "@/lib/library/client-read-state";
import {
  flattenLibraryTocItems,
  resolveLibraryEpubDisplayMode,
  resolveLibraryEpubPageKind,
  getLibraryEpubPageIndicator,
  resolveLibraryEpubTheme,
  resolveLibraryEpubPageState,
  resolveLibraryEpubVisiblePageNumbers,
  resolveLibraryTocLabel,
} from "@/lib/library/epub-reader-ui";
import { normalizeLibraryLocation } from "@/lib/library/read-state";
import {
  normalizeLibraryTtsText,
  splitLibraryTtsSentences,
} from "@/lib/library/tts";

function withTimeout(promise, ms, message, controller = null) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      controller?.abort?.();
      reject(new Error(message));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  });
}

const ACTIVE_EPUB_THEME_ID = "library-active";
const LIBRARY_LOCATION_CACHE_VERSION = 2;
const LIBRARY_PROGRESS_CACHE_VERSION = 4;
const LIBRARY_CANONICAL_SINGLE_PAGE_WIDTH = 560;
const LIBRARY_CANONICAL_PAGE_HEIGHT = 820;
const LIBRARY_CANONICAL_SPREAD_WIDTH = LIBRARY_CANONICAL_SINGLE_PAGE_WIDTH * 2;
const LIBRARY_TTS_BLOCK_SELECTOR = "p, li, blockquote, h1, h2, h3, h4, h5, h6";
const LIBRARY_TTS_SENTENCE_HIGHLIGHT_ID = "library-tts-sentence-highlight";

function resolveLocationCacheKey(slug, sourceFingerprint = "") {
  const safeSlug = String(slug || "").trim().toLowerCase();
  const safeFingerprint = String(sourceFingerprint || "").trim().toLowerCase();
  if (!safeSlug) return "";
  return `library.epub.locations.v${LIBRARY_LOCATION_CACHE_VERSION}.${safeSlug}.${safeFingerprint || "default"}`;
}

function loadCachedLocations(cacheKey) {
  if (!cacheKey || typeof window === "undefined") return "";

  try {
    const rawValue = window.localStorage.getItem(cacheKey);
    if (!rawValue) return "";
    const parsed = JSON.parse(rawValue);
    if (typeof parsed === "string") return parsed;
    if (parsed?.version === LIBRARY_LOCATION_CACHE_VERSION && typeof parsed?.locations === "string") {
      return parsed.locations;
    }
    return "";
  } catch {
    return "";
  }
}

function saveCachedLocations(cacheKey, locations) {
  if (!cacheKey || !locations || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({
        version: LIBRARY_LOCATION_CACHE_VERSION,
        locations,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    return;
  }
}

function resolveProgressCacheKey(slug, sourceFingerprint = "") {
  const safeSlug = String(slug || "").trim().toLowerCase();
  const safeFingerprint = String(sourceFingerprint || "").trim().toLowerCase();
  if (!safeSlug) return "";
  return `library.epub.progress.v${LIBRARY_PROGRESS_CACHE_VERSION}.${safeSlug}.${safeFingerprint || "default"}`;
}

function loadCachedProgress(cacheKey) {
  if (!cacheKey || typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(cacheKey);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue);
    if (parsed?.version !== LIBRARY_PROGRESS_CACHE_VERSION) return null;

    return {
      lastLocation: normalizeLibraryLocation(parsed?.lastLocation),
      lastPageNumber:
        parsed?.lastPageNumber == null || parsed?.lastPageNumber === ""
          ? null
          : Number(parsed.lastPageNumber),
      progressPercent:
        parsed?.progressPercent == null || parsed?.progressPercent === ""
          ? null
          : Number(parsed.progressPercent),
      updatedAt: parsed?.updatedAt || null,
    };
  } catch {
    return null;
  }
}

function saveCachedProgress(cacheKey, progress = {}) {
  if (!cacheKey || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({
        version: LIBRARY_PROGRESS_CACHE_VERSION,
        lastLocation: normalizeLibraryLocation(progress.lastLocation),
        lastPageNumber:
          progress.lastPageNumber == null || progress.lastPageNumber === ""
            ? null
            : Number(progress.lastPageNumber),
        progressPercent:
          progress.progressPercent == null || progress.progressPercent === ""
            ? null
            : Number(progress.progressPercent),
        updatedAt: progress.updatedAt || new Date().toISOString(),
      })
    );
  } catch {
    return;
  }
}

function scheduleIdleTask(callback, timeout = 1200) {
  if (typeof window === "undefined") return null;

  if (typeof window.requestIdleCallback === "function") {
    return {
      type: "idle",
      id: window.requestIdleCallback(callback, { timeout }),
    };
  }

  return {
    type: "timeout",
    id: window.setTimeout(() => callback(), Math.min(timeout, 420)),
  };
}

function cancelScheduledTask(task) {
  if (!task || typeof window === "undefined") return;

  if (task.type === "idle" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(task.id);
    return;
  }

  if (task.type === "timeout") {
    window.clearTimeout(task.id);
  }
}

function applyRenderMountLayout(renderMount, { displayMode = "spread", isMobile = false } = {}) {
  if (!renderMount) return;

  if (isMobile) {
    renderMount.style.inset = "3.2rem 1.15rem 2.9rem 1.15rem";
    renderMount.style.transform = "";
    return;
  }

  if (displayMode === "single") {
    renderMount.style.inset = "2.5rem 0rem 2.5rem 0rem";
    renderMount.style.transform = "";
    return;
  }

  renderMount.style.inset = "2.5rem 0rem 2.5rem 0rem";
  renderMount.style.transform = "";
}

function resolveCanonicalViewport({ displayMode = "spread", isMobile = false } = {}) {
  if (isMobile || displayMode === "single") {
    return {
      width: LIBRARY_CANONICAL_SINGLE_PAGE_WIDTH,
      height: LIBRARY_CANONICAL_PAGE_HEIGHT,
    };
  }

  return {
    width: LIBRARY_CANONICAL_SPREAD_WIDTH,
    height: LIBRARY_CANONICAL_PAGE_HEIGHT,
  };
}

function syncRenderViewportLayout({
  viewportMount,
  renderMount,
  readerHost,
  displayMode = "spread",
  isMobile = false,
} = {}) {
  if (!viewportMount || !renderMount || !readerHost) return;

  const viewport = resolveCanonicalViewport({ displayMode, isMobile });
  const availableWidth = viewportMount.clientWidth || readerHost.clientWidth || viewport.width;
  const availableHeight = viewportMount.clientHeight || readerHost.clientHeight || viewport.height;
  const scale = Math.min(availableWidth / viewport.width, availableHeight / viewport.height, 1);

  renderMount.style.position = "absolute";
  renderMount.style.left = "50%";
  renderMount.style.top = "50%";
  renderMount.style.width = `${viewport.width}px`;
  renderMount.style.height = `${viewport.height}px`;
  renderMount.style.transformOrigin = "center center";
  renderMount.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function ensureLibraryTtsStyles(documentRef) {
  if (!documentRef?.head || documentRef.getElementById(LIBRARY_TTS_SENTENCE_HIGHLIGHT_ID)) return;

  const style = documentRef.createElement("style");
  style.id = LIBRARY_TTS_SENTENCE_HIGHLIGHT_ID;
  style.textContent = `
    [data-library-tts-segment-id] {
      transition: background-color 140ms ease, box-shadow 140ms ease;
    }
    [data-library-tts-segment-id].library-tts-active-paragraph {
      background-color: rgba(214, 170, 72, 0.14);
      box-shadow: inset 0 0 0 1px rgba(214, 170, 72, 0.18);
    }
    [data-library-tts-selection-mode='true'] [data-library-tts-segment-id] {
      cursor: pointer;
    }
    .library-tts-sentence-overlay {
      position: fixed;
      pointer-events: none;
      background: rgba(214, 170, 72, 0.24);
      box-shadow: 0 0 0 1px rgba(214, 170, 72, 0.28);
      border-radius: 3px;
      z-index: 2147483640;
    }
  `;
  documentRef.head.appendChild(style);
}

function resolveLibraryTtsSegmentId(href = "", index = 0) {
  return `tts-${String(href || "page").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${index}`;
}

function annotateLibraryTtsBlocks(documentRef, href = "") {
  if (!documentRef?.querySelectorAll) return [];

  return Array.from(documentRef.querySelectorAll(LIBRARY_TTS_BLOCK_SELECTOR)).map((element, index) => {
    if (!element.dataset.libraryTtsSegmentId) {
      element.dataset.libraryTtsSegmentId = resolveLibraryTtsSegmentId(href, index);
    }
    return element;
  });
}

function isLibraryTtsBlockVisible(element, windowRef) {
  if (!element || !windowRef) return false;
  const rect = element.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const viewportWidth = windowRef.innerWidth || 0;
  const viewportHeight = windowRef.innerHeight || 0;

  return rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;
}

function findLibraryTtsAncestor(target, windowRef) {
  let current = target;
  while (current && current !== windowRef?.document?.body) {
    if (
      current instanceof windowRef.HTMLElement &&
      current.matches?.(LIBRARY_TTS_BLOCK_SELECTOR) &&
      normalizeLibraryTtsText(current.textContent).length > 0
    ) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

function removeLibraryTtsSentenceOverlay(documentRef) {
  if (!documentRef?.querySelectorAll) return;
  documentRef.querySelectorAll(".library-tts-sentence-overlay").forEach((node) => node.remove());
}

function clearLibraryTtsHighlight(contentsList = []) {
  (Array.isArray(contentsList) ? contentsList : []).forEach((content) => {
    const documentRef = content?.document;
    if (!documentRef) return;
    removeLibraryTtsSentenceOverlay(documentRef);
    documentRef
      .querySelectorAll(".library-tts-active-paragraph")
      .forEach((node) => node.classList.remove("library-tts-active-paragraph"));
  });
}

function locateLibrarySentenceRange(documentRef, element, sentenceText = "") {
  const normalizedSentence = normalizeLibraryTtsText(sentenceText);
  if (!documentRef || !element || !normalizedSentence) return null;

  const rawText = element.textContent || "";
  const startIndex = rawText.indexOf(sentenceText);
  const fallbackIndex = startIndex >= 0 ? startIndex : rawText.indexOf(normalizedSentence);
  if (fallbackIndex < 0) return null;

  const targetLength = (startIndex >= 0 ? sentenceText : normalizedSentence).length;
  const walker = documentRef.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let combinedLength = 0;

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const textValue = textNode.nodeValue || "";
    if (!textValue) continue;
    textNodes.push({
      node: textNode,
      start: combinedLength,
      end: combinedLength + textValue.length,
    });
    combinedLength += textValue.length;
  }

  if (!textNodes.length) return null;

  const range = documentRef.createRange();
  const absoluteEnd = fallbackIndex + targetLength;
  const startNode = textNodes.find((entry) => fallbackIndex >= entry.start && fallbackIndex <= entry.end);
  const endNode = textNodes.find((entry) => absoluteEnd >= entry.start && absoluteEnd <= entry.end);

  if (!startNode || !endNode) return null;

  range.setStart(startNode.node, Math.max(0, fallbackIndex - startNode.start));
  range.setEnd(endNode.node, Math.max(0, absoluteEnd - endNode.start));
  return range;
}

function applyLibrarySentenceHighlight(documentRef, sentenceRange) {
  if (!documentRef || !sentenceRange) return false;
  removeLibraryTtsSentenceOverlay(documentRef);

  const rects = Array.from(sentenceRange.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (!rects.length) return false;

  const host = documentRef.body || documentRef.documentElement;
  if (!host) return false;

  rects.forEach((rect) => {
    const overlay = documentRef.createElement("div");
    overlay.className = "library-tts-sentence-overlay";
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    host.appendChild(overlay);
  });

  return true;
}

function buildReaderStatePatch({
  location,
  locationIndex = null,
  locationTotal = null,
  stableSpread = null,
  stablePageTotal = null,
  progressPercent = null,
  tocItems = [],
  lastAutoSavedAt = null,
  displayMode = "spread",
  canGoPrev = undefined,
  canGoNext = undefined,
} = {}) {
  const href = normalizeLibraryLocation(location?.start?.href || location?.end?.href);
  const fallbackPageState = resolveLibraryEpubPageState({
    location,
    locationIndex,
    locationTotal,
  });
  const pageNumber = stableSpread?.startPageNumber ?? fallbackPageState.pageNumber;
  const pageTotal = stablePageTotal ?? fallbackPageState.pageTotal;
  const visiblePageNumbers = resolveLibraryEpubVisiblePageNumbers({
    location,
    pageNumber,
    pageTotal,
    displayMode,
    spreadStartPageNumber: stableSpread?.startPageNumber ?? null,
    spreadEndPageNumber: stableSpread?.displayMode === "spread" ? stableSpread?.endPageNumber ?? null : null,
  });
  const hasGlobalLocation = Number.isFinite(Number(locationIndex)) && Number(locationIndex) >= 0;
  const hasGlobalTotal = Number.isFinite(Number(locationTotal)) && Number(locationTotal) >= 0;

  return {
    currentHref: href,
    chapterLabel: resolveLibraryTocLabel(tocItems, href),
    pageNumber,
    pageTotal,
    progressPercent,
    canGoPrev:
      canGoPrev ??
      (hasGlobalLocation ? Number(locationIndex) > 0 : !Boolean(location?.atStart)),
    canGoNext:
      canGoNext ??
      ((hasGlobalLocation && hasGlobalTotal)
        ? Number(locationIndex) < Number(locationTotal)
        : !Boolean(location?.atEnd)),
    lastAutoSavedAt,
    pageIndicator: getLibraryEpubPageIndicator({ pageNumber, pageTotal }),
    displayMode,
    visiblePageNumbers,
  };
}

function applyReaderShellTheme(readerHost, themeDefinition) {
  if (!readerHost || !themeDefinition) return;
  readerHost.style.background = themeDefinition.paperBackground;
  readerHost.style.color = themeDefinition.shellText;
}

function applyContentPresentation(content, themeDefinition) {
  const documentRef = content?.document;
  const windowRef = content?.window;
  if (!documentRef?.documentElement || !documentRef.body) return;

  const htmlRef = documentRef.documentElement;
  const bodyRef = documentRef.body;
  const viewportHeight = Number(windowRef?.innerHeight) || 0;
  const viewportWidth = Number(windowRef?.innerWidth) || 0;
  const isShortViewport = viewportHeight > 0 && viewportHeight <= 860;
  const isNarrowViewport = viewportWidth > 0 && viewportWidth <= 1000;
  const columnGap = isNarrowViewport ? "1.2rem" : isShortViewport ? "1.45rem" : "2rem";
  const horizontalPadding = isNarrowViewport ? "0.3rem" : isShortViewport ? "0.45rem" : "0.8rem";

  htmlRef.style.backgroundColor = themeDefinition.paperBackground;
  htmlRef.style.color = themeDefinition.shellText;
  htmlRef.style.setProperty("max-width", "none", "important");
  htmlRef.style.setProperty("margin", "0", "important");
  htmlRef.style.setProperty("padding-left", "0", "important");
  htmlRef.style.setProperty("padding-right", "0", "important");
  bodyRef.style.backgroundColor = themeDefinition.paperBackground;
  bodyRef.style.color = themeDefinition.shellText;
  bodyRef.style.textRendering = "optimizeLegibility";
  bodyRef.style.fontKerning = "normal";
  bodyRef.style.userSelect = "none";
  bodyRef.style.webkitUserSelect = "none";
  bodyRef.style.webkitTouchCallout = "none";
  bodyRef.style.caretColor = "transparent";
  bodyRef.style.setProperty("max-width", "none", "important");
  bodyRef.style.setProperty("width", "auto", "important");
  bodyRef.style.setProperty("margin", "0", "important");
  bodyRef.style.setProperty("padding-left", horizontalPadding, "important");
  bodyRef.style.setProperty("padding-right", horizontalPadding, "important");
  bodyRef.style.setProperty("column-gap", columnGap, "important");
  htmlRef.style.setProperty("column-gap", columnGap, "important");

  Array.from(bodyRef.children || []).forEach((child) => {
    if (!(child instanceof windowRef.HTMLElement)) return;
    const tagName = cleanShortcutKey(child.tagName).toUpperCase();
    if (["SCRIPT", "STYLE", "LINK"].includes(tagName)) return;

    child.style.boxSizing = "border-box";
    child.style.setProperty("width", "auto", "important");
    child.style.setProperty("max-width", "none", "important");
    child.style.setProperty("margin-left", "0", "important");
    child.style.setProperty("margin-right", "0", "important");
  });

  documentRef
    .querySelectorAll("section, article, main, hgroup, blockquote, figure, div[class], div[id]")
    .forEach((element) => {
      if (!(element instanceof windowRef.HTMLElement)) return;
      element.style.setProperty("max-width", "none", "important");
      element.style.setProperty("width", "auto", "important");
      if (["SECTION", "ARTICLE", "MAIN", "HGROUP"].includes(element.tagName)) {
        element.style.setProperty("margin-left", "0", "important");
        element.style.setProperty("margin-right", "0", "important");
        element.style.setProperty("padding-left", "0", "important");
        element.style.setProperty("padding-right", "0", "important");
      }
    });

  Array.from(documentRef.images || []).forEach((image) => {
    image.draggable = false;
    image.style.userSelect = "none";
    image.style.webkitUserDrag = "none";
  });

  if (!documentRef.body.dataset.libraryReaderGuarded) {
    const preventDefault = (event) => event.preventDefault();
    documentRef.addEventListener("copy", preventDefault);
    documentRef.addEventListener("cut", preventDefault);
    documentRef.addEventListener("contextmenu", preventDefault);
    documentRef.addEventListener("selectstart", preventDefault);
    documentRef.addEventListener("dragstart", preventDefault);
    documentRef.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && cleanShortcutKey(event.key) === "c") {
        event.preventDefault();
      }
    });
    documentRef.body.dataset.libraryReaderGuarded = "true";
  }

  windowRef?.getSelection?.()?.removeAllRanges?.();
}

function cleanShortcutKey(value) {
  return String(value || "").trim().toLowerCase();
}

function pickPreferredResumeLocation(initialLocation = "", initialUpdatedAt = "", cachedProgress = null) {
  const normalizedInitialLocation = normalizeLibraryLocation(initialLocation);
  const cachedLocation = normalizeLibraryLocation(cachedProgress?.lastLocation);

  if (!normalizedInitialLocation) {
    return cachedLocation;
  }
  if (!cachedLocation) {
    return normalizedInitialLocation;
  }

  const initialUpdatedMs = Date.parse(initialUpdatedAt || 0);
  const cachedUpdatedMs = Date.parse(cachedProgress?.updatedAt || 0);

  if (Number.isFinite(cachedUpdatedMs) && (!Number.isFinite(initialUpdatedMs) || cachedUpdatedMs > initialUpdatedMs)) {
    return cachedLocation;
  }

  return normalizedInitialLocation;
}

function pickPreferredResumePageNumber(initialPageNumber = null, initialUpdatedAt = "", cachedProgress = null) {
  const normalizedInitialPageNumber =
    initialPageNumber == null || initialPageNumber === "" ? null : Number(initialPageNumber);
  const normalizedCachedPageNumber =
    cachedProgress?.lastPageNumber == null || cachedProgress?.lastPageNumber === ""
      ? null
      : Number(cachedProgress.lastPageNumber);

  if (!Number.isFinite(normalizedInitialPageNumber) || normalizedInitialPageNumber <= 0) {
    return Number.isFinite(normalizedCachedPageNumber) && normalizedCachedPageNumber > 0
      ? normalizedCachedPageNumber
      : null;
  }

  if (!Number.isFinite(normalizedCachedPageNumber) || normalizedCachedPageNumber <= 0) {
    return normalizedInitialPageNumber;
  }

  const initialUpdatedMs = Date.parse(initialUpdatedAt || 0);
  const cachedUpdatedMs = Date.parse(cachedProgress?.updatedAt || 0);

  if (Number.isFinite(cachedUpdatedMs) && (!Number.isFinite(initialUpdatedMs) || cachedUpdatedMs > initialUpdatedMs)) {
    return normalizedCachedPageNumber;
  }

  return normalizedInitialPageNumber;
}

function resolveGlobalLocationState(book, lastLocation = "") {
  if (!book?.locations || !lastLocation || !book.locations._locations?.length) {
    return {
      locationIndex: null,
      locationTotal: null,
    };
  }

  try {
    const locationIndex = book.locations.locationFromCfi(lastLocation);
    return {
      locationIndex: Number.isFinite(locationIndex) && locationIndex >= 0 ? locationIndex : null,
      locationTotal:
        Number.isFinite(book.locations.total) && book.locations.total >= 0 ? book.locations.total : null,
    };
  } catch {
    return {
      locationIndex: null,
      locationTotal: null,
    };
  }
}

function createEmptyStableSpreadLayer() {
  return {
    entries: [],
    byLocationIndex: new Map(),
    totalPages: null,
  };
}

function buildStableSpreadLayer({ book, isMobile = false } = {}) {
  if (!book?.locations?._locations?.length) {
    return createEmptyStableSpreadLayer();
  }

  const totalLocations =
    Number.isFinite(book.locations.total) && book.locations.total >= 0
      ? Number(book.locations.total)
      : book.locations._locations.length - 1;

  if (!Number.isFinite(totalLocations) || totalLocations < 0) {
    return createEmptyStableSpreadLayer();
  }

  const entries = [];
  const byLocationIndex = new Map();
  let cursor = 0;

  while (cursor <= totalLocations) {
    let startCfi = "";
    try {
      startCfi = book.locations.cfiFromLocation(cursor) || "";
    } catch {
      startCfi = "";
    }

    if (!startCfi || startCfi === -1) {
      cursor += 1;
      continue;
    }

    const href = normalizeLibraryLocation(book.spine?.get?.(startCfi)?.href);
    const pageKind = resolveLibraryEpubPageKind(href);
    const isSingleLeaf = isMobile || cursor === 0;
    const endIndex = isSingleLeaf ? cursor : Math.min(totalLocations, cursor + 1);
    let endCfi = startCfi;

    if (endIndex !== cursor) {
      try {
        const nextCfi = book.locations.cfiFromLocation(endIndex);
        if (nextCfi && nextCfi !== -1) {
          endCfi = nextCfi;
        }
      } catch {
        endCfi = startCfi;
      }
    }

    const entry = {
      id: `${isSingleLeaf ? "leaf" : "spread"}-${cursor + 1}-${endIndex + 1}`,
      entryIndex: entries.length,
      href,
      pageKind,
      displayMode: isSingleLeaf ? "single" : "spread",
      startIndex: cursor,
      endIndex,
      startPageNumber: cursor + 1,
      endPageNumber: endIndex + 1,
      startCfi,
      endCfi,
    };

    entries.push(entry);

    for (let index = cursor; index <= endIndex; index += 1) {
      byLocationIndex.set(index, entry.entryIndex);
    }

    cursor = endIndex + 1;
  }

  return {
    entries,
    byLocationIndex,
    totalPages: totalLocations + 1,
  };
}

function resolveStableSpreadEntry({
  book,
  layer = null,
  locationIndex = null,
  lastLocation = "",
} = {}) {
  if (!layer?.entries?.length) {
    return {
      entry: null,
      entryIndex: null,
      locationIndex: Number.isFinite(locationIndex) ? Number(locationIndex) : null,
    };
  }

  let numericLocationIndex =
    locationIndex == null || locationIndex === "" ? null : Number(locationIndex);

  if (!Number.isFinite(numericLocationIndex) && book && lastLocation) {
    numericLocationIndex = resolveGlobalLocationState(book, lastLocation).locationIndex;
  }

  if (!Number.isFinite(numericLocationIndex) || numericLocationIndex < 0) {
    return {
      entry: null,
      entryIndex: null,
      locationIndex: null,
    };
  }

  const entryIndex = layer.byLocationIndex.get(numericLocationIndex);
  const entry = Number.isFinite(entryIndex) ? layer.entries[entryIndex] || null : null;

  return {
    entry,
    entryIndex: Number.isFinite(entryIndex) ? entryIndex : null,
    locationIndex: numericLocationIndex,
  };
}

function resolveStableSpreadByPageNumber(layer = null, pageNumber = null) {
  const numericPageNumber =
    pageNumber == null || pageNumber === "" ? null : Number(pageNumber);

  if (!layer?.entries?.length || !Number.isFinite(numericPageNumber) || numericPageNumber <= 0) {
    return null;
  }

  return (
    layer.entries.find(
      (entry) =>
        numericPageNumber >= entry.startPageNumber &&
        numericPageNumber <= entry.endPageNumber
    ) || null
  );
}

function resolveSectionNavigationState(book, location = null) {
  const target = normalizeLibraryLocation(location?.start?.cfi || location?.start?.href);
  const section = target ? book?.spine?.get?.(target) : null;
  const prevSection = section?.prev?.() || null;
  const nextSection = section?.next?.() || null;
  return {
    hasPrevSection: Boolean(prevSection),
    hasNextSection: Boolean(nextSection),
    prevSectionHref: normalizeLibraryLocation(prevSection?.href),
    nextSectionHref: normalizeLibraryLocation(nextSection?.href),
  };
}

async function navigateByGlobalLocationOffset({
  rendition,
  book,
  currentLocation = "",
  offset = 0,
}) {
  if (!rendition || !book || !currentLocation || !offset || !book.locations?._locations?.length) {
    return false;
  }

  const globalState = resolveGlobalLocationState(book, currentLocation);
  if (globalState.locationIndex == null || globalState.locationTotal == null) {
    return false;
  }

  const targetIndex = Math.max(0, Math.min(globalState.locationTotal, globalState.locationIndex + offset));
  if (targetIndex === globalState.locationIndex) {
    return false;
  }

  const targetCfi = book.locations.cfiFromLocation(targetIndex);
  if (!targetCfi || targetCfi === -1) {
    return false;
  }

  await rendition.display(targetCfi);
  return true;
}

const LibraryEpubReader = forwardRef(function LibraryEpubReader({
  slug,
  assetUrl,
  sourceFingerprint = "",
  title,
  initialLocation = "",
  initialPageNumber = null,
  initialLocationUpdatedAt = "",
  theme = "sepia",
  onLocationChange,
  onProgressSaved,
  onReaderStateChange,
  onFatalError,
  isFullscreen = false,
  ttsSelectionMode = false,
  onTtsParagraphSelect,
}, ref) {
  const wrapperRef = useRef(null);
  const readerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const mountAttemptRef = useRef(0);
  const locationsReadyRef = useRef(false);
  const saveTimerRef = useRef(null);
  const idleGenerationTaskRef = useRef(null);
  const pendingProgressRef = useRef(null);
  const stableSpreadLayersRef = useRef({
    mobile: createEmptyStableSpreadLayer(),
    desktop: createEmptyStableSpreadLayer(),
  });
  const activeLocationRef = useRef(normalizeLibraryLocation(initialLocation));
  const activeDisplayModeRef = useRef(
    initialPageNumber == null || initialPageNumber === "" || Number(initialPageNumber) <= 1 ? "single" : "spread"
  );
  const lastRelocatedLocationRef = useRef(null);
  const initialLocationRef = useRef(normalizeLibraryLocation(initialLocation));
  const initialPageNumberRef = useRef(initialPageNumber);
  const initialLocationUpdatedAtRef = useRef(initialLocationUpdatedAt);
  const themeRef = useRef(theme);
  const onLocationChangeRef = useRef(onLocationChange);
  const onProgressSavedRef = useRef(onProgressSaved);
  const onReaderStateChangeRef = useRef(onReaderStateChange);
  const onFatalErrorRef = useRef(onFatalError);
  const onTtsParagraphSelectRef = useRef(onTtsParagraphSelect);
  const tocItemsRef = useRef([]);
  const ttsSelectionModeRef = useRef(ttsSelectionMode);
  const readerStateRef = useRef({
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
    displayMode:
      initialPageNumber == null || initialPageNumber === "" || Number(initialPageNumber) <= 1 ? "single" : "spread",
  });
  const destroyedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    initialLocationRef.current = normalizeLibraryLocation(initialLocation);
  }, [initialLocation]);

  useEffect(() => {
    initialPageNumberRef.current = initialPageNumber;
  }, [initialPageNumber]);

  useEffect(() => {
    initialLocationUpdatedAtRef.current = initialLocationUpdatedAt;
  }, [initialLocationUpdatedAt]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
    onProgressSavedRef.current = onProgressSaved;
    onReaderStateChangeRef.current = onReaderStateChange;
    onFatalErrorRef.current = onFatalError;
    onTtsParagraphSelectRef.current = onTtsParagraphSelect;
  }, [onFatalError, onLocationChange, onProgressSaved, onReaderStateChange, onTtsParagraphSelect]);

  useEffect(() => {
    ttsSelectionModeRef.current = ttsSelectionMode;

    const contents = renditionRef.current?.getContents?.() || [];
    contents.forEach((content) => {
      const bodyRef = content?.document?.body;
      if (bodyRef) {
        bodyRef.dataset.libraryTtsSelectionMode = ttsSelectionMode ? "true" : "false";
      }
    });
  }, [ttsSelectionMode]);

  function rebuildStableSpreadLayers(book) {
    stableSpreadLayersRef.current = {
      mobile: buildStableSpreadLayer({ book, isMobile: true }),
      desktop: buildStableSpreadLayer({ book, isMobile: false }),
    };
  }

  useImperativeHandle(
    ref,
    () => ({
      async goPreviousPage() {
        if (!renditionRef.current) return false;
        const previousLocation = activeLocationRef.current;
        await renditionRef.current.prev();
        const movedByPrev = await new Promise((resolve) => {
          const startedAt = Date.now();
          const timeout = 900;
          function check() {
            if (normalizeLibraryLocation(activeLocationRef.current) !== previousLocation) {
              resolve(true);
              return;
            }
            if (Date.now() - startedAt >= timeout) {
              resolve(false);
              return;
            }
            window.requestAnimationFrame(check);
          }
          window.requestAnimationFrame(check);
        });
        if (movedByPrev) return true;

        const movedByGlobalLocation = await navigateByGlobalLocationOffset({
          rendition: renditionRef.current,
          book: bookRef.current,
          currentLocation: previousLocation,
          offset: -1,
        });
        if (movedByGlobalLocation) return true;
        const sectionNavigationState = resolveSectionNavigationState(
          bookRef.current,
          lastRelocatedLocationRef.current
        );
        if (lastRelocatedLocationRef.current?.atStart && sectionNavigationState.prevSectionHref) {
          await renditionRef.current.display(sectionNavigationState.prevSectionHref);
          return true;
        }
        await renditionRef.current.prev();
        return true;
      },
      async goNextPage() {
        if (!renditionRef.current) return false;
        const previousLocation = activeLocationRef.current;
        await renditionRef.current.next();
        const movedByNext = await new Promise((resolve) => {
          const startedAt = Date.now();
          const timeout = 900;
          function check() {
            if (normalizeLibraryLocation(activeLocationRef.current) !== previousLocation) {
              resolve(true);
              return;
            }
            if (Date.now() - startedAt >= timeout) {
              resolve(false);
              return;
            }
            window.requestAnimationFrame(check);
          }
          window.requestAnimationFrame(check);
        });
        if (movedByNext) return true;

        const movedByGlobalLocation = await navigateByGlobalLocationOffset({
          rendition: renditionRef.current,
          book: bookRef.current,
          currentLocation: previousLocation,
          offset: 1,
        });
        if (movedByGlobalLocation) return true;
        const sectionNavigationState = resolveSectionNavigationState(
          bookRef.current,
          lastRelocatedLocationRef.current
        );
        if (lastRelocatedLocationRef.current?.atEnd && sectionNavigationState.nextSectionHref) {
          await renditionRef.current.display(sectionNavigationState.nextSectionHref);
          return true;
        }
        await renditionRef.current.next();
        return true;
      },
      async goToTarget(target = "") {
        if (!renditionRef.current || !target) return false;
        await renditionRef.current.display(target);
        return true;
      },
      focusReader() {
        wrapperRef.current?.focus?.();
      },
      getVisibleTtsSegments({ startSegmentId = "" } = {}) {
        const contentsList = renditionRef.current?.getContents?.() || [];
        const visibleSegments = contentsList.flatMap((content) => {
          const documentRef = content?.document;
          const windowRef = content?.window;
          const href = normalizeLibraryLocation(
            content?.section?.href || content?.href || readerStateRef.current.currentHref
          );
          if (!documentRef || !windowRef) return [];

          ensureLibraryTtsStyles(documentRef);
          const blocks = annotateLibraryTtsBlocks(documentRef, href);
          return blocks
            .filter((element) => isLibraryTtsBlockVisible(element, windowRef))
            .map((element) => {
              const text = normalizeLibraryTtsText(element.textContent || "");
              if (!text) return null;

              return {
                id: element.dataset.libraryTtsSegmentId,
                text,
                href,
                sentenceCount: splitLibraryTtsSentences(text).length,
              };
            })
            .filter(Boolean);
        });

        if (!startSegmentId) {
          return visibleSegments;
        }

        const startIndex = visibleSegments.findIndex((segment) => segment.id === startSegmentId);
        return startIndex >= 0 ? visibleSegments.slice(startIndex) : visibleSegments;
      },
      clearTtsHighlight() {
        clearLibraryTtsHighlight(renditionRef.current?.getContents?.() || []);
      },
      highlightTtsChunk({ segmentId = "", text = "" } = {}) {
        const contentsList = renditionRef.current?.getContents?.() || [];
        clearLibraryTtsHighlight(contentsList);

        const targetElement = contentsList
          .map((content) =>
            content?.document?.querySelector?.(`[data-library-tts-segment-id="${segmentId}"]`)
          )
          .find(Boolean);

        if (!targetElement) {
          return { mode: "none" };
        }

        targetElement.classList.add("library-tts-active-paragraph");

        if (!text) {
          return { mode: "paragraph" };
        }

        const documentRef = targetElement.ownerDocument;
        const sentenceRange = locateLibrarySentenceRange(documentRef, targetElement, text);
        if (sentenceRange && applyLibrarySentenceHighlight(documentRef, sentenceRange)) {
          return { mode: "sentence" };
        }

        return { mode: "paragraph" };
      },
    }),
    []
  );

  useEffect(() => {
    const rendition = renditionRef.current;
    const readerHost = readerRef.current;
    if (!rendition || !readerHost) return;

    const themeDefinition = resolveLibraryEpubTheme(theme);
    rendition.themes.register(ACTIVE_EPUB_THEME_ID, themeDefinition.rules);
    rendition.themes.select(ACTIVE_EPUB_THEME_ID);
    applyReaderShellTheme(readerHost, themeDefinition);

    const contents = rendition.getContents?.() || [];
    contents.forEach((content) => applyContentPresentation(content, themeDefinition));
    window.requestAnimationFrame(() => {
      try {
        const viewport = resolveCanonicalViewport({
          displayMode: activeDisplayModeRef.current,
          isMobile: window.matchMedia("(max-width: 1000px)").matches,
        });
        rendition.resize(viewport.width, viewport.height);
      } catch {
        return null;
      }
      return null;
    });
  }, [theme]);

  useLayoutEffect(() => {
    const mountAttempt = mountAttemptRef.current + 1;
    mountAttemptRef.current = mountAttempt;
    destroyedRef.current = false;
    locationsReadyRef.current = false;
    let assetController = null;
    let renderViewportMount = null;
    let renderMount = null;
    const locationsCacheKey = resolveLocationCacheKey(slug, sourceFingerprint);
    const progressCacheKey = resolveProgressCacheKey(slug, sourceFingerprint);

    function isStaleMount() {
      return destroyedRef.current || mountAttemptRef.current !== mountAttempt;
    }

    function resolveReaderHost() {
      const element = readerRef.current;
      if (!element?.tagName || !element.isConnected) {
        return null;
      }
      return element;
    }

    async function waitForReaderHost() {
      const deadline = Date.now() + 4000;

      while (Date.now() < deadline) {
        const element = resolveReaderHost();
        if (element && element.clientWidth > 0 && element.clientHeight > 0) {
          return element;
        }
        await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      }

      return resolveReaderHost();
    }

    async function flushPendingProgress({ keepalive = false } = {}) {
      const pending = pendingProgressRef.current;
      if (!pending?.lastLocation || !slug) return;

      pendingProgressRef.current = null;

      try {
        const nextState = await updateBookProgress(
          slug,
          {
            lastPageNumber: pending.lastPageNumber,
            lastLocation: pending.lastLocation,
            progressPercent: pending.progressPercent,
            completed: pending.completed,
          },
          { keepalive }
        );

        if (!destroyedRef.current) {
          const lastAutoSavedAt = nextState?.updatedAt || nextState?.lastOpenedAt || new Date().toISOString();
          readerStateRef.current = {
            ...readerStateRef.current,
            lastAutoSavedAt,
          };
          onReaderStateChangeRef.current?.({ ...readerStateRef.current, toc: tocItemsRef.current });
          onProgressSavedRef.current?.(nextState || null);
        }
      } catch {
        pendingProgressRef.current = pending;
      }
    }

    if (!slug || !assetUrl) {
      setLoading(false);
      setError("EPUB source unavailable.");
      return () => {
        destroyedRef.current = true;
      };
    }

    let resizeObserver = null;
    let mobileQuery = null;
    let syncSpread = null;
    let relocatedHandler = null;
    let visibilityHandler = null;
    let beforeUnloadHandler = null;
    let pageHideHandler = null;
    let blurHandler = null;

    function emitReaderState(nextPatch = {}) {
      readerStateRef.current = {
        ...readerStateRef.current,
        ...nextPatch,
        toc: tocItemsRef.current,
      };
      onReaderStateChangeRef.current?.({ ...readerStateRef.current });
    }

    async function mountReader() {
      try {
        setLoading(true);
        setError("");
        emitReaderState({
          currentHref: "",
          chapterLabel: "",
          pageNumber: null,
          pageTotal: null,
          pageIndicator: "",
          visiblePageNumbers: { left: null, right: null },
          progressPercent: null,
          canGoPrev: false,
          canGoNext: true,
          displayMode: "spread",
        });

        const epubModule = await import("epubjs");
        if (isStaleMount()) return;

        const ePub = epubModule.default || epubModule;
        assetController = new AbortController();
        const assetResponse = await withTimeout(
          fetch(assetUrl, {
            credentials: "same-origin",
            signal: assetController.signal,
          }),
          20000,
          "The book file took too long to load.",
          assetController
        );
        if (isStaleMount()) return;
        if (!assetResponse.ok) {
          throw new Error(`Book asset request failed with status ${assetResponse.status}.`);
        }

        const assetBuffer = await withTimeout(
          assetResponse.arrayBuffer(),
          25000,
          "The book file could not be read in time."
        );
        if (isStaleMount()) return;

        const readerHost = await waitForReaderHost();
        if (!readerHost) {
          throw new Error("The EPUB reader container is no longer available.");
        }

        renderViewportMount = document.createElement("div");
        renderViewportMount.className = "library-epub-render-viewport";
        renderViewportMount.style.position = "absolute";
        renderViewportMount.style.overflow = "hidden";

        renderMount = document.createElement("div");
        renderMount.className = "library-epub-render-host";
        renderMount.style.overflow = "hidden";
        renderViewportMount.appendChild(renderMount);
        readerHost.replaceChildren(renderViewportMount);

        applyRenderMountLayout(renderViewportMount, {
          displayMode: activeDisplayModeRef.current,
            isMobile: window.matchMedia("(max-width: 1000px)").matches,
        });
        syncRenderViewportLayout({
          viewportMount: renderViewportMount,
          renderMount,
          readerHost,
          displayMode: activeDisplayModeRef.current,
          isMobile: window.matchMedia("(max-width: 1000px)").matches,
        });

        const initialViewport = resolveCanonicalViewport({
          displayMode: activeDisplayModeRef.current,
          isMobile: window.matchMedia("(max-width: 1000px)").matches,
        });

        const book = ePub(assetBuffer);
        const rendition = book.renderTo(renderMount, {
          width: initialViewport.width,
          height: initialViewport.height,
          flow: "paginated",
          manager: "default",
          spread: window.matchMedia("(max-width: 1000px)").matches ? "none" : "auto",
          minSpreadWidth: 920,
          allowScriptedContent: false,
        });

        bookRef.current = book;
        renditionRef.current = rendition;

        rendition.hooks.content.register((contents) => {
          const activeTheme = resolveLibraryEpubTheme(themeRef.current);
          applyContentPresentation(contents, activeTheme);
          const documentRef = contents?.document;
          const windowRef = contents?.window;
          if (documentRef?.body && windowRef) {
            ensureLibraryTtsStyles(documentRef);
            documentRef.body.dataset.libraryTtsSelectionMode = ttsSelectionModeRef.current ? "true" : "false";
            annotateLibraryTtsBlocks(
              documentRef,
              normalizeLibraryLocation(contents?.section?.href || contents?.href || "")
            );

            if (!documentRef.body.dataset.libraryTtsClickBound) {
              documentRef.body.addEventListener(
                "click",
                (event) => {
                  if (!ttsSelectionModeRef.current) return;
                  const segmentElement = findLibraryTtsAncestor(event.target, windowRef);
                  if (!segmentElement) return;
                  const paragraphText = normalizeLibraryTtsText(segmentElement.textContent || "");
                  if (!paragraphText) return;

                  event.preventDefault();
                  event.stopPropagation();
                  event.stopImmediatePropagation?.();

                  onTtsParagraphSelectRef.current?.({
                    id: segmentElement.dataset.libraryTtsSegmentId,
                    text: paragraphText,
                    href: normalizeLibraryLocation(
                      contents?.section?.href || contents?.href || readerStateRef.current.currentHref
                    ),
                  });
                },
                true
              );
              documentRef.body.dataset.libraryTtsClickBound = "true";
            }
          }
          return contents;
        });

        const initialTheme = resolveLibraryEpubTheme(themeRef.current);
        rendition.themes.register(ACTIVE_EPUB_THEME_ID, initialTheme.rules);
        rendition.themes.select(ACTIVE_EPUB_THEME_ID);
        applyReaderShellTheme(readerHost, initialTheme);

        mobileQuery = window.matchMedia("(max-width: 1000px)");
        syncSpread = () => {
          const isMobileViewport = mobileQuery.matches;
          const spreadPreference = resolveLibraryEpubDisplayMode({
            href: readerStateRef.current.currentHref,
            location: lastRelocatedLocationRef.current,
            locationIndex: readerStateRef.current.pageNumber ? readerStateRef.current.pageNumber - 1 : null,
            locationTotal: readerStateRef.current.pageTotal ? readerStateRef.current.pageTotal - 1 : null,
            isMobile: isMobileViewport,
          });
          activeDisplayModeRef.current = spreadPreference;
          applyRenderMountLayout(renderViewportMount, {
            displayMode: spreadPreference,
            isMobile: isMobileViewport,
          });
          syncRenderViewportLayout({
            viewportMount: renderViewportMount,
            renderMount,
            readerHost,
            displayMode: spreadPreference,
            isMobile: isMobileViewport,
          });
          try {
            const viewport = resolveCanonicalViewport({
              displayMode: spreadPreference,
              isMobile: isMobileViewport,
            });
            rendition.spread(spreadPreference === "single" ? "none" : "auto", 920);
            rendition.resize(viewport.width, viewport.height);
          } catch {
            return null;
          }
          return null;
        };

        syncSpread();
        mobileQuery.addEventListener("change", syncSpread);

        relocatedHandler = (location) => {
          clearLibraryTtsHighlight(rendition.getContents?.() || []);
          const lastLocation = normalizeLibraryLocation(location?.start?.cfi || location?.end?.cfi);
          if (!lastLocation) return;

          activeLocationRef.current = lastLocation;
          lastRelocatedLocationRef.current = location;

          let progressPercent = null;
          const globalLocationState = resolveGlobalLocationState(book, lastLocation);
          const stableLayer = mobileQuery?.matches
            ? stableSpreadLayersRef.current.mobile
            : stableSpreadLayersRef.current.desktop;
          const stableSpreadState = resolveStableSpreadEntry({
            book,
            layer: stableLayer,
            locationIndex: globalLocationState.locationIndex,
            lastLocation,
          });
          const stableSpread = stableSpreadState.entry;
          const sectionNavigationState = resolveSectionNavigationState(book, location);
          const lastPageNumber =
            stableSpread?.startPageNumber ??
            (globalLocationState.locationIndex != null ? globalLocationState.locationIndex + 1 : null);
          const canGoPrev =
            stableSpreadState.entryIndex != null
              ? stableSpreadState.entryIndex > 0
              : globalLocationState.locationIndex != null
              ? globalLocationState.locationIndex > 0
              : !Boolean(location?.atStart) || sectionNavigationState.hasPrevSection;
          const canGoNext =
            stableSpreadState.entryIndex != null
              ? stableSpreadState.entryIndex < stableLayer.entries.length - 1
              : globalLocationState.locationIndex != null && globalLocationState.locationTotal != null
              ? globalLocationState.locationIndex < globalLocationState.locationTotal
              : !Boolean(location?.atEnd) || sectionNavigationState.hasNextSection;
          const displayMode =
            stableSpread?.displayMode ??
            resolveLibraryEpubDisplayMode({
              href: normalizeLibraryLocation(location?.start?.href || location?.end?.href),
              location,
              locationIndex: globalLocationState.locationIndex,
              locationTotal: globalLocationState.locationTotal,
              isMobile: mobileQuery?.matches,
            });

          activeDisplayModeRef.current = displayMode;
          applyRenderMountLayout(renderViewportMount, {
            displayMode,
            isMobile: mobileQuery?.matches,
          });
          syncRenderViewportLayout({
            viewportMount: renderViewportMount,
            renderMount,
            readerHost,
            displayMode,
            isMobile: mobileQuery?.matches,
          });
          try {
            const viewport = resolveCanonicalViewport({
              displayMode,
              isMobile: mobileQuery?.matches,
            });
            rendition.spread(displayMode === "single" ? "none" : "auto", 920);
            rendition.resize(viewport.width, viewport.height);
          } catch {
            return null;
          }

          try {
            const ratio =
              locationsReadyRef.current && Array.isArray(book.locations?._locations) && book.locations._locations.length
                ? book.locations.percentageFromCfi(lastLocation)
                : null;
            progressPercent = ratio == null || Number.isNaN(ratio) ? null : Math.max(0, Math.min(100, ratio * 100));
          } catch {
            progressPercent = null;
          }

          onLocationChangeRef.current?.({
            location: lastLocation,
            pageNumber: lastPageNumber,
            progressPercent,
          });
          emitReaderState(
            buildReaderStatePatch({
              location,
              locationIndex: globalLocationState.locationIndex,
              locationTotal: globalLocationState.locationTotal,
              stableSpread,
              stablePageTotal: stableLayer.totalPages,
              progressPercent,
              tocItems: tocItemsRef.current,
              lastAutoSavedAt: readerStateRef.current.lastAutoSavedAt,
              displayMode,
              canGoPrev,
              canGoNext,
            })
          );

          pendingProgressRef.current = {
            lastPageNumber,
            lastLocation,
            progressPercent,
            completed: progressPercent != null ? progressPercent >= 99 : undefined,
          };
          saveCachedProgress(progressCacheKey, {
            lastPageNumber,
            lastLocation,
            progressPercent,
          });

          if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
          }

          saveTimerRef.current = window.setTimeout(() => {
            flushPendingProgress();
          }, 1600);
        };

        rendition.on("relocated", relocatedHandler);

        const navigationPromise = Promise.race([
          book.loaded.navigation
            .then(() => flattenLibraryTocItems(book.navigation?.toc || []))
            .catch(() => []),
          new Promise((resolve) => {
            window.setTimeout(() => resolve([]), 5000);
          }),
        ]);

        await withTimeout(book.opened, 20000, "The reader took too long to initialize.");
        if (isStaleMount()) return;

        const cachedLocations = loadCachedLocations(locationsCacheKey);
        if (cachedLocations) {
          try {
            book.locations.load(cachedLocations);
            locationsReadyRef.current = true;
            rebuildStableSpreadLayers(book);
          } catch {
            locationsReadyRef.current = false;
            stableSpreadLayersRef.current = {
              mobile: createEmptyStableSpreadLayer(),
              desktop: createEmptyStableSpreadLayer(),
            };
          }
        }
        const cachedProgress = loadCachedProgress(progressCacheKey);
        const preferredResumePageNumber = pickPreferredResumePageNumber(
          initialPageNumberRef.current,
          initialLocationUpdatedAtRef.current,
          cachedProgress
        );

        navigationPromise
          .then((flattenedToc) => {
            if (isStaleMount()) return;
            tocItemsRef.current = flattenedToc;
            emitReaderState({
              toc: flattenedToc,
              chapterLabel: resolveLibraryTocLabel(flattenedToc, readerStateRef.current.currentHref) || readerStateRef.current.chapterLabel,
            });
          })
          .catch(() => null);

        if (!locationsReadyRef.current) {
          try {
            await withTimeout(
              book.locations.generate(1600),
              20000,
              "The reader took too long to prepare your saved location."
            );
            if (!isStaleMount()) {
              locationsReadyRef.current = true;
              saveCachedLocations(locationsCacheKey, book.locations.save());
              rebuildStableSpreadLayers(book);
            }
          } catch {
            locationsReadyRef.current = false;
            stableSpreadLayersRef.current = {
              mobile: createEmptyStableSpreadLayer(),
              desktop: createEmptyStableSpreadLayer(),
            };
          }
        }

        let startLocation = pickPreferredResumeLocation(
          initialLocationRef.current,
          initialLocationUpdatedAtRef.current,
          cachedProgress
        );
        if (locationsReadyRef.current && Number.isFinite(preferredResumePageNumber) && preferredResumePageNumber > 0) {
          const activeStableLayer = mobileQuery?.matches
            ? stableSpreadLayersRef.current.mobile
            : stableSpreadLayersRef.current.desktop;
          const targetSpread = resolveStableSpreadByPageNumber(activeStableLayer, preferredResumePageNumber);
          if (targetSpread?.startCfi) {
            startLocation = targetSpread.startCfi;
          } else if (Number.isFinite(book.locations?.total)) {
            const clampedLocationIndex = Math.max(
              0,
              Math.min(book.locations.total, preferredResumePageNumber - 1)
            );
            const pageTargetCfi = book.locations.cfiFromLocation(clampedLocationIndex);
            if (pageTargetCfi && pageTargetCfi !== -1) {
              startLocation = pageTargetCfi;
            }
          }
        }
        if (startLocation) {
          const snappedSection = book.spine?.get?.(startLocation);
          if (!snappedSection) {
            startLocation = "";
          } else if (locationsReadyRef.current) {
            const activeStableLayer = mobileQuery?.matches
              ? stableSpreadLayersRef.current.mobile
              : stableSpreadLayersRef.current.desktop;
            const snappedStableSpread = resolveStableSpreadEntry({
              book,
              layer: activeStableLayer,
              lastLocation: startLocation,
            }).entry;
            startLocation = snappedStableSpread?.startCfi || startLocation;
          }
        }
        await withTimeout(
          rendition.display(startLocation || undefined),
          25000,
          "The reader took too long to open this EPUB."
        );
        syncSpread();
        if (!isStaleMount() && activeLocationRef.current && activeDisplayModeRef.current === "spread") {
          await withTimeout(
            rendition.display(activeLocationRef.current),
            15000,
            "The reader took too long to restore this page."
          ).catch(() => null);
        }
        try {
          const viewport = resolveCanonicalViewport({
            displayMode: activeDisplayModeRef.current,
            isMobile: mobileQuery?.matches,
          });
          rendition.resize(viewport.width, viewport.height);
        } catch {
          // Ignore transient layout errors during initial paint.
        }
        if (!isStaleMount()) {
          setLoading(false);
        }
        emitReaderState({ chapterLabel: readerStateRef.current.chapterLabel });

        if (!locationsReadyRef.current) {
          idleGenerationTaskRef.current = scheduleIdleTask(() => {
            book.locations
              .generate(1600)
              .then(() => {
                if (isStaleMount()) return null;
                locationsReadyRef.current = true;
                saveCachedLocations(locationsCacheKey, book.locations.save());
                rebuildStableSpreadLayers(book);
                const lastLocation = activeLocationRef.current;
                if (!lastLocation) return null;
                const ratio = book.locations.percentageFromCfi(lastLocation);
                const progressPercent = Number.isNaN(ratio) ? null : Math.max(0, Math.min(100, ratio * 100));
                const globalLocationState = resolveGlobalLocationState(book, lastLocation);
                const activeStableLayer = mobileQuery?.matches
                  ? stableSpreadLayersRef.current.mobile
                  : stableSpreadLayersRef.current.desktop;
                const stableSpread = resolveStableSpreadEntry({
                  book,
                  layer: activeStableLayer,
                  locationIndex: globalLocationState.locationIndex,
                  lastLocation,
                }).entry;
                const desiredPageNumber = pickPreferredResumePageNumber(
                  initialPageNumberRef.current,
                  initialLocationUpdatedAtRef.current,
                  loadCachedProgress(progressCacheKey)
                );
                emitReaderState({
                  pageNumber:
                    stableSpread?.startPageNumber ??
                    (globalLocationState.locationIndex != null ? globalLocationState.locationIndex + 1 : readerStateRef.current.pageNumber),
                  pageTotal:
                    activeStableLayer.totalPages ??
                    (globalLocationState.locationTotal != null ? globalLocationState.locationTotal + 1 : readerStateRef.current.pageTotal),
                  progressPercent,
                });
                const currentStablePageNumber =
                  stableSpread?.startPageNumber ??
                  (globalLocationState.locationIndex != null ? globalLocationState.locationIndex + 1 : null);
                if (
                  Number.isFinite(desiredPageNumber) &&
                  desiredPageNumber > 0 &&
                  Number.isFinite(currentStablePageNumber) &&
                  Math.abs(currentStablePageNumber - desiredPageNumber) > 1
                ) {
                  const targetSpread = resolveStableSpreadByPageNumber(activeStableLayer, desiredPageNumber);
                  const targetCfi =
                    targetSpread?.startCfi ||
                    book.locations.cfiFromLocation(
                      Math.max(0, Math.min(book.locations.total, desiredPageNumber - 1))
                    );
                  if (targetCfi && targetCfi !== -1) {
                    return rendition.display(targetCfi).catch(() => null);
                  }
                }
                return null;
              })
              .catch(() => null);
          });
        }

        resizeObserver = new ResizeObserver(() => {
          try {
            syncRenderViewportLayout({
              viewportMount: renderViewportMount,
              renderMount,
              readerHost,
              displayMode: activeDisplayModeRef.current,
              isMobile: mobileQuery?.matches,
            });
          } catch {
            return null;
          }
          return null;
        });
        resizeObserver.observe(readerHost);

        visibilityHandler = () => {
          if (document.visibilityState === "hidden") {
            flushPendingProgress({ keepalive: true });
          }
        };
        beforeUnloadHandler = () => {
          flushPendingProgress({ keepalive: true });
        };
        pageHideHandler = () => {
          flushPendingProgress({ keepalive: true });
        };
        blurHandler = () => {
          flushPendingProgress({ keepalive: true });
        };

        document.addEventListener("visibilitychange", visibilityHandler);
        window.addEventListener("beforeunload", beforeUnloadHandler);
        window.addEventListener("pagehide", pageHideHandler);
        window.addEventListener("blur", blurHandler);
      } catch (readerError) {
        if (isStaleMount() || readerError?.name === "AbortError") {
          return;
        }
        const message = readerError?.message || "This EPUB could not be opened.";
        if (!destroyedRef.current) {
          setError(message);
          setLoading(false);
        }
        emitReaderState({
          currentHref: "",
          chapterLabel: "",
          pageNumber: null,
          pageTotal: null,
          pageIndicator: "",
          visiblePageNumbers: { left: null, right: null },
          progressPercent: null,
        });
        onFatalErrorRef.current?.(message);
      }
    }

    mountReader();

    return () => {
      destroyedRef.current = true;
      assetController?.abort?.();
      cancelScheduledTask(idleGenerationTaskRef.current);
      idleGenerationTaskRef.current = null;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      if (beforeUnloadHandler) {
        window.removeEventListener("beforeunload", beforeUnloadHandler);
      }
      if (pageHideHandler) {
        window.removeEventListener("pagehide", pageHideHandler);
      }
      if (blurHandler) {
        window.removeEventListener("blur", blurHandler);
      }
      flushPendingProgress({ keepalive: true });
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mobileQuery && syncSpread) {
        mobileQuery.removeEventListener("change", syncSpread);
      }
      if (renditionRef.current && relocatedHandler) {
        renditionRef.current.off("relocated", relocatedHandler);
      }
      renditionRef.current = null;
      bookRef.current = null;
      if (renderViewportMount?.parentNode) {
        renderViewportMount.parentNode.removeChild(renderViewportMount);
      }
    };
  }, [assetUrl, slug, sourceFingerprint]);

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      className={`relative select-none ${
        isFullscreen ? "h-[calc(100vh-10rem)]" : "h-[68vh] min-h-[68vh] sm:h-[72vh] lg:h-[78vh]"
      }`}
      onPointerDown={() => wrapperRef.current?.focus?.()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div ref={readerRef} className="absolute inset-0 h-full w-full overflow-hidden bg-[#f8f4eb]" />
      {loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/18 backdrop-blur-[2px]">
          <div className="space-y-2 text-center">
            <p className="text-base font-semibold text-white">Opening reader</p>
            <p className="text-sm text-white/70">{title}</p>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-6 text-center backdrop-blur-sm">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-white">This title is temporarily unavailable</p>
            <p className="text-sm text-white/75">{error}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default LibraryEpubReader;
