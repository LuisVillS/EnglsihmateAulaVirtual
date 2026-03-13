import { resolveSpreadLeftPageIndex } from "./presentation.js";

const DEFAULT_INITIAL_WINDOW_SIZE = 12;
const DEFAULT_RESUME_CONTEXT_WINDOW = 6;
const DEFAULT_NEIGHBOR_PREFETCH_RADIUS = 10;
const DEFAULT_NEIGHBOR_EDGE_THRESHOLD = 6;
const DEFAULT_VISUAL_WINDOW_SIZE_SINGLE = 16;
const DEFAULT_VISUAL_WINDOW_SIZE_SPREAD = 32;
const DEFAULT_VISUAL_WINDOW_EDGE_THRESHOLD_SINGLE = 4;
const DEFAULT_VISUAL_WINDOW_EDGE_THRESHOLD_SPREAD = 6;

export function buildFlipbookVisualWindowKey({
  mode = "spread",
  start = 0,
  end = -1,
} = {}) {
  return `${String(mode || "spread")}:${Math.max(0, Number(start) || 0)}:${Math.max(-1, Number(end) || -1)}`;
}

function clampPageIndex(pageIndex = 0, pageCount = 0) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  if (!safePageCount) return 0;
  const numericPageIndex = Number(pageIndex);
  if (!Number.isFinite(numericPageIndex)) return 0;
  return Math.max(0, Math.min(safePageCount - 1, Math.trunc(numericPageIndex)));
}

function normalizeVisualWindowRange({
  pageCount = 0,
  windowStart = 0,
  windowSize = DEFAULT_VISUAL_WINDOW_SIZE_SPREAD,
  isSinglePageView = false,
} = {}) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  if (!safePageCount) {
    return {
      start: 0,
      end: -1,
      size: 0,
      key: "0:-1",
    };
  }

  let safeStart = clampPageIndex(windowStart, safePageCount);
  if (!isSinglePageView && safeStart > 0) {
    safeStart = resolveSpreadLeftPageIndex(safeStart, safePageCount);
  }

  const safeWindowSize = Math.max(
    1,
    Number(windowSize) ||
      (isSinglePageView ? DEFAULT_VISUAL_WINDOW_SIZE_SINGLE : DEFAULT_VISUAL_WINDOW_SIZE_SPREAD)
  );
  let safeEnd = Math.min(safePageCount - 1, safeStart + safeWindowSize - 1);
  if (!isSinglePageView && safeStart > 0 && safePageCount - safeStart <= safeWindowSize + 1) {
    safeEnd = safePageCount - 1;
  }

  return {
    start: safeStart,
    end: safeEnd,
    size: safeEnd >= safeStart ? safeEnd - safeStart + 1 : 0,
    key: `${safeStart}:${safeEnd}`,
  };
}

function resolveVisualWindowSize({
  isSinglePageView = false,
  singlePageWindowSize = DEFAULT_VISUAL_WINDOW_SIZE_SINGLE,
  spreadWindowSize = DEFAULT_VISUAL_WINDOW_SIZE_SPREAD,
} = {}) {
  return Math.max(
    1,
    Number(isSinglePageView ? singlePageWindowSize : spreadWindowSize) ||
      (isSinglePageView ? DEFAULT_VISUAL_WINDOW_SIZE_SINGLE : DEFAULT_VISUAL_WINDOW_SIZE_SPREAD)
  );
}

function normalizePinnedPageIndexes(pageIndexes = [], pageCount = 0) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  const lookup = new Set();

  for (const pageIndex of Array.isArray(pageIndexes) ? pageIndexes : []) {
    if (pageIndex == null || pageIndex === "") continue;
    lookup.add(clampPageIndex(pageIndex, safePageCount));
  }

  return Array.from(lookup).sort((left, right) => left - right);
}

export function buildFlipbookPlaceholderPage(pageIndex = 0) {
  const safePageIndex = Math.max(0, Number(pageIndex) || 0);
  const isCover = safePageIndex === 0;
  return {
    pageId: `placeholder-${safePageIndex}`,
    pageIndex: safePageIndex,
    layoutProfileId: "",
    chapterId: "",
    sectionId: "",
    startLocator: "",
    endLocator: "",
    html: isCover
      ? '<article class="flipbook-page-inner flipbook-cover-page flipbook-loading-page"><div class="flipbook-loading-page-shell"><p>Preparing cover...</p></div></article>'
      : '<article class="flipbook-page-inner flipbook-loading-page"><div class="flipbook-loading-page-shell"><p>Loading page...</p></div></article>',
    textSegments: [],
    flags: {
      isSyntheticCover: isCover,
      isFrontmatter: false,
      isChapterStart: false,
      isPlaceholder: true,
    },
  };
}

export function buildFlipbookPlaceholderPages(pageCount = 0) {
  return Array.from({ length: Math.max(0, Number(pageCount) || 0) }, (_, index) =>
    buildFlipbookPlaceholderPage(index)
  );
}

export function resolveInitialFlipbookPageWindow({
  pageCount = 0,
  startPageIndex = 0,
  hasSavedState = false,
  initialWindowSize = DEFAULT_INITIAL_WINDOW_SIZE,
  resumeContextWindow = DEFAULT_RESUME_CONTEXT_WINDOW,
} = {}) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  if (!safePageCount) {
    return { from: 0, to: -1 };
  }

  const safeStartPageIndex = Math.max(0, Math.min(safePageCount - 1, Number(startPageIndex) || 0));
  if (!hasSavedState) {
    return {
      from: 0,
      to: Math.min(safePageCount - 1, Math.max(0, Number(initialWindowSize) || DEFAULT_INITIAL_WINDOW_SIZE) - 1),
    };
  }

  const contextWindow = Math.max(0, Number(resumeContextWindow) || DEFAULT_RESUME_CONTEXT_WINDOW);
  return {
    from: Math.max(0, safeStartPageIndex - contextWindow),
    to: Math.min(safePageCount - 1, safeStartPageIndex + contextWindow),
  };
}

export function resolveFlipbookBackgroundRanges({
  pageCount = 0,
  batchSize = DEFAULT_INITIAL_WINDOW_SIZE,
  excludeRange = null,
} = {}) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  const safeBatchSize = Math.max(1, Number(batchSize) || DEFAULT_INITIAL_WINDOW_SIZE);
  const excludedFrom = Math.max(0, Number(excludeRange?.from) || 0);
  const excludedTo = Math.max(-1, Number(excludeRange?.to) || -1);
  const ranges = [];

  for (let from = 0; from < safePageCount; from += safeBatchSize) {
    const to = Math.min(safePageCount - 1, from + safeBatchSize - 1);
    if (to < excludedFrom || from > excludedTo) {
      ranges.push({ from, to });
      continue;
    }
    if (from < excludedFrom) {
      ranges.push({ from, to: excludedFrom - 1 });
    }
    if (to > excludedTo) {
      ranges.push({ from: excludedTo + 1, to });
    }
  }

  return ranges.filter((range) => range.from <= range.to);
}

export function resolveFlipbookNeighborPrefetchRange({
  pageCount = 0,
  currentPageIndex = 0,
  loadedPageIndexes = [],
  prefetchRadius = DEFAULT_NEIGHBOR_PREFETCH_RADIUS,
  edgeThreshold = DEFAULT_NEIGHBOR_EDGE_THRESHOLD,
} = {}) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  if (!safePageCount) return null;

  const safeCurrentPageIndex = Math.max(0, Math.min(safePageCount - 1, Number(currentPageIndex) || 0));
  const lookup =
    loadedPageIndexes instanceof Set
      ? loadedPageIndexes
      : new Set((Array.isArray(loadedPageIndexes) ? loadedPageIndexes : []).map((value) => Math.max(0, Number(value) || 0)));

  if (!lookup.has(safeCurrentPageIndex)) {
    return {
      from: safeCurrentPageIndex,
      to: Math.min(safePageCount - 1, safeCurrentPageIndex + Math.max(1, Number(prefetchRadius) || DEFAULT_NEIGHBOR_PREFETCH_RADIUS) - 1),
    };
  }

  let loadedFrom = safeCurrentPageIndex;
  while (loadedFrom > 0 && lookup.has(loadedFrom - 1)) {
    loadedFrom -= 1;
  }

  let loadedTo = safeCurrentPageIndex;
  while (loadedTo < safePageCount - 1 && lookup.has(loadedTo + 1)) {
    loadedTo += 1;
  }

  const safePrefetchRadius = Math.max(1, Number(prefetchRadius) || DEFAULT_NEIGHBOR_PREFETCH_RADIUS);
  const safeEdgeThreshold = Math.max(0, Number(edgeThreshold) || DEFAULT_NEIGHBOR_EDGE_THRESHOLD);
  const distanceToStart = safeCurrentPageIndex - loadedFrom;
  const distanceToEnd = loadedTo - safeCurrentPageIndex;
  const nearStart = distanceToStart <= safeEdgeThreshold;
  const nearEnd = distanceToEnd <= safeEdgeThreshold;

  if (nearEnd && loadedTo < safePageCount - 1) {
    return {
      from: loadedTo + 1,
      to: Math.min(safePageCount - 1, loadedTo + safePrefetchRadius),
    };
  }

  if (nearStart && loadedFrom > 0) {
    return {
      from: Math.max(0, loadedFrom - safePrefetchRadius),
      to: loadedFrom - 1,
    };
  }

  return null;
}

export function globalToLocalPageIndex(globalPageIndex = 0, windowStart = 0) {
  return Math.max(0, (Number(globalPageIndex) || 0) - Math.max(0, Number(windowStart) || 0));
}

export function localToGlobalPageIndex(localPageIndex = 0, windowStart = 0, pageCount = null) {
  const globalPageIndex = Math.max(0, Number(windowStart) || 0) + Math.max(0, Number(localPageIndex) || 0);
  if (pageCount == null || pageCount === "") {
    return globalPageIndex;
  }
  return clampPageIndex(globalPageIndex, pageCount);
}

export function isPageIndexInsideVisualWindow(pageIndex = 0, windowStart = 0, windowEnd = -1) {
  const safePageIndex = Math.max(0, Number(pageIndex) || 0);
  const safeWindowStart = Math.max(0, Number(windowStart) || 0);
  const safeWindowEnd = Math.max(-1, Number(windowEnd) || -1);
  return safeWindowEnd >= safeWindowStart && safePageIndex >= safeWindowStart && safePageIndex <= safeWindowEnd;
}

export function canFlipbookAdapterAcceptNavigation({
  isSettling = false,
  requestedWindowKey = "",
  readyWindowKey = "",
} = {}) {
  if (isSettling) return false;
  return String(requestedWindowKey || "") !== "" && String(requestedWindowKey || "") === String(readyWindowKey || "");
}

export function shouldIgnoreFlipbookAdapterEvent({
  eventWindowKey = "",
  requestedWindowKey = "",
} = {}) {
  return String(eventWindowKey || "") === "" || String(eventWindowKey || "") !== String(requestedWindowKey || "");
}

export function resolveFlipbookVisualWindow({
  pageCount = 0,
  anchorPageIndex = 0,
  isSinglePageView = false,
  pinnedPageIndexes = [],
  singlePageWindowSize = DEFAULT_VISUAL_WINDOW_SIZE_SINGLE,
  spreadWindowSize = DEFAULT_VISUAL_WINDOW_SIZE_SPREAD,
} = {}) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  if (!safePageCount) {
    return normalizeVisualWindowRange({ pageCount: 0 });
  }

  const safeWindowSize = resolveVisualWindowSize({
    isSinglePageView,
    singlePageWindowSize,
    spreadWindowSize,
  });
  const safeAnchorPageIndex = isSinglePageView
    ? clampPageIndex(anchorPageIndex, safePageCount)
    : resolveSpreadLeftPageIndex(anchorPageIndex, safePageCount);
  const safePinnedPageIndexes = normalizePinnedPageIndexes(
    [safeAnchorPageIndex, ...(Array.isArray(pinnedPageIndexes) ? pinnedPageIndexes : [])],
    safePageCount
  );
  const minimumPinnedPageIndex = safePinnedPageIndexes[0] ?? safeAnchorPageIndex;
  const maximumPinnedPageIndex =
    safePinnedPageIndexes[safePinnedPageIndexes.length - 1] ?? safeAnchorPageIndex;
  let windowStart = Math.max(0, safeAnchorPageIndex - Math.floor(safeWindowSize / 2));
  const maxAllowedWindowStart = Math.max(0, maximumPinnedPageIndex - safeWindowSize + 1);
  windowStart = Math.max(windowStart, maxAllowedWindowStart);
  windowStart = Math.min(windowStart, minimumPinnedPageIndex);

  let visualWindow = normalizeVisualWindowRange({
    pageCount: safePageCount,
    windowStart,
    windowSize: safeWindowSize,
    isSinglePageView,
  });

  if (minimumPinnedPageIndex < visualWindow.start) {
    visualWindow = normalizeVisualWindowRange({
      pageCount: safePageCount,
      windowStart: minimumPinnedPageIndex,
      windowSize: safeWindowSize,
      isSinglePageView,
    });
  }

  if (maximumPinnedPageIndex > visualWindow.end) {
    visualWindow = normalizeVisualWindowRange({
      pageCount: safePageCount,
      windowStart: Math.max(0, maximumPinnedPageIndex - safeWindowSize + 1),
      windowSize: safeWindowSize,
      isSinglePageView,
    });
  }

  if (maximumPinnedPageIndex > visualWindow.end) {
    visualWindow = {
      ...visualWindow,
      end: clampPageIndex(maximumPinnedPageIndex, safePageCount),
      size: clampPageIndex(maximumPinnedPageIndex, safePageCount) - visualWindow.start + 1,
      key: `${visualWindow.start}:${clampPageIndex(maximumPinnedPageIndex, safePageCount)}`,
    };
  }

  return visualWindow;
}

export function shouldShiftFlipbookVisualWindow({
  pageIndex = 0,
  windowStart = 0,
  windowEnd = -1,
  isSinglePageView = false,
  singlePageEdgeThreshold = DEFAULT_VISUAL_WINDOW_EDGE_THRESHOLD_SINGLE,
  spreadEdgeThreshold = DEFAULT_VISUAL_WINDOW_EDGE_THRESHOLD_SPREAD,
} = {}) {
  const safeWindowStart = Math.max(0, Number(windowStart) || 0);
  const safeWindowEnd = Math.max(-1, Number(windowEnd) || -1);
  const safePageIndex = Math.max(0, Number(pageIndex) || 0);
  if (safeWindowEnd < safeWindowStart) return true;
  if (!isPageIndexInsideVisualWindow(safePageIndex, safeWindowStart, safeWindowEnd)) return true;

  const edgeThreshold = Math.max(
    0,
    Number(isSinglePageView ? singlePageEdgeThreshold : spreadEdgeThreshold) ||
      (isSinglePageView ? DEFAULT_VISUAL_WINDOW_EDGE_THRESHOLD_SINGLE : DEFAULT_VISUAL_WINDOW_EDGE_THRESHOLD_SPREAD)
  );
  const distanceToStart = safePageIndex - safeWindowStart;
  const distanceToEnd = safeWindowEnd - safePageIndex;
  return distanceToStart <= edgeThreshold || distanceToEnd <= edgeThreshold;
}

export function expandFlipbookVisualWindowForTts({
  pageCount = 0,
  windowStart = 0,
  windowEnd = -1,
  visualAnchorPageIndex = 0,
  ttsPageIndex = null,
  isSinglePageView = false,
  singlePageWindowSize = DEFAULT_VISUAL_WINDOW_SIZE_SINGLE,
  spreadWindowSize = DEFAULT_VISUAL_WINDOW_SIZE_SPREAD,
} = {}) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  if (!safePageCount) {
    return normalizeVisualWindowRange({ pageCount: 0 });
  }

  const safeVisualAnchorPageIndex = isSinglePageView
    ? clampPageIndex(visualAnchorPageIndex, safePageCount)
    : resolveSpreadLeftPageIndex(visualAnchorPageIndex, safePageCount);
  const safeTtsPageIndex =
    ttsPageIndex == null || ttsPageIndex === ""
      ? null
      : clampPageIndex(ttsPageIndex, safePageCount);

  const pinnedPageIndexes = [safeVisualAnchorPageIndex];
  if (safeTtsPageIndex != null) {
    pinnedPageIndexes.push(safeTtsPageIndex);
  }

  if (isSinglePageView) {
    const nextPageIndex = Math.min(
      safePageCount - 1,
      (safeTtsPageIndex ?? safeVisualAnchorPageIndex) + 1
    );
    pinnedPageIndexes.push(nextPageIndex);
  } else {
    const currentSpreadAnchorPageIndex = resolveSpreadLeftPageIndex(
      safeTtsPageIndex ?? safeVisualAnchorPageIndex,
      safePageCount
    );
    pinnedPageIndexes.push(currentSpreadAnchorPageIndex);
    if (currentSpreadAnchorPageIndex + 1 < safePageCount) {
      pinnedPageIndexes.push(currentSpreadAnchorPageIndex + 1);
    }
    const nextSpreadAnchorPageIndex = resolveSpreadLeftPageIndex(
      currentSpreadAnchorPageIndex === 0 ? 1 : currentSpreadAnchorPageIndex + 2,
      safePageCount
    );
    if (nextSpreadAnchorPageIndex > currentSpreadAnchorPageIndex) {
      pinnedPageIndexes.push(nextSpreadAnchorPageIndex);
      if (nextSpreadAnchorPageIndex + 1 < safePageCount) {
        pinnedPageIndexes.push(nextSpreadAnchorPageIndex + 1);
      }
    }
  }

  const shouldExpand = normalizePinnedPageIndexes(pinnedPageIndexes, safePageCount).some(
    (pageIndex) => !isPageIndexInsideVisualWindow(pageIndex, windowStart, windowEnd)
  );

  if (!shouldExpand) {
    return normalizeVisualWindowRange({
      pageCount: safePageCount,
      windowStart,
      windowSize: resolveVisualWindowSize({
        isSinglePageView,
        singlePageWindowSize,
        spreadWindowSize,
      }),
      isSinglePageView,
    });
  }

  return resolveFlipbookVisualWindow({
    pageCount: safePageCount,
    anchorPageIndex: safeVisualAnchorPageIndex,
    isSinglePageView,
    pinnedPageIndexes,
    singlePageWindowSize,
    spreadWindowSize,
  });
}

export function buildFlipbookRuntimePages({
  pages = [],
} = {}) {
  return (Array.isArray(pages) ? pages : []).map((page) => {
    const runtimeMode = page?.flags?.isPlaceholder ? "placeholder" : "live";

    return {
      ...page,
      runtimeMode,
      flags: {
        ...(page?.flags || {}),
        isRuntimeSkeleton: false,
      },
    };
  });
}

export function mergeFlipbookPages({
  pageCount = 0,
  existingPages = [],
  incomingPages = [],
} = {}) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  const pageMap = new Map();

  for (const page of Array.isArray(existingPages) ? existingPages : []) {
    if (!Number.isFinite(Number(page?.pageIndex))) continue;
    pageMap.set(Number(page.pageIndex), page);
  }
  for (const page of Array.isArray(incomingPages) ? incomingPages : []) {
    if (!Number.isFinite(Number(page?.pageIndex))) continue;
    pageMap.set(Number(page.pageIndex), page);
  }

  return Array.from({ length: safePageCount }, (_, index) => pageMap.get(index) || buildFlipbookPlaceholderPage(index));
}
