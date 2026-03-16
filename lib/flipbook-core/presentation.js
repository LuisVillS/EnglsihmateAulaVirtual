export const FLIPBOOK_CANONICAL_PAGE_WIDTH = 720;
export const FLIPBOOK_CANONICAL_PAGE_HEIGHT = 1080;
export const FLIPBOOK_CANONICAL_SPREAD_WIDTH = FLIPBOOK_CANONICAL_PAGE_WIDTH * 2;
export const FLIPBOOK_CANONICAL_SPREAD_HEIGHT = FLIPBOOK_CANONICAL_PAGE_HEIGHT;
export const FLIPBOOK_PRESENTATION_BREAKPOINT = 1000;
export const FLIPBOOK_VISUAL_STATE_CLOSED_BOOK = "CLOSED_BOOK";
export const FLIPBOOK_VISUAL_STATE_OPENING_BOOK = "OPENING_BOOK";
export const FLIPBOOK_VISUAL_STATE_READING = "READING";

export function resolveFlipbookVisiblePageNumber(pageIndex = 0) {
  const numericPageIndex = Number(pageIndex);
  if (!Number.isFinite(numericPageIndex) || numericPageIndex <= 0) return null;
  return numericPageIndex;
}

export function resolveFlipbookVisiblePageTotal(pageCount = 0) {
  const numericPageCount = Number(pageCount);
  if (!Number.isFinite(numericPageCount) || numericPageCount <= 1) return 0;
  return numericPageCount - 1;
}

export function buildFlipbookPageChrome({
  page = null,
  bookTitle = "",
  chapterLabel = "",
  presentationMode = "spread",
} = {}) {
  if (!page || page.flags?.isSyntheticCover || Number(page.pageIndex) === 0) {
    return null;
  }

  const visiblePageNumber = resolveFlipbookVisiblePageNumber(page.pageIndex);
  const safePageIndex = Math.max(0, Number(page.pageIndex) || 0);
  const showChapterTitle =
    presentationMode === "single" ? safePageIndex % 2 === 1 : safePageIndex % 2 === 1;
  const showBookTitle =
    presentationMode === "single" ? !showChapterTitle : !showChapterTitle;
  return {
    headerLeft: showChapterTitle ? chapterLabel || "" : "",
    headerRight: showBookTitle ? bookTitle : "",
    footerLeft: "EnglishMate Library",
    footerRight: visiblePageNumber == null ? "" : String(visiblePageNumber),
  };
}

export function resolveFlipbookPresentationMode({
  viewportWidth = 0,
} = {}) {
  const width = Math.max(0, Number(viewportWidth) || 0);
  return width < FLIPBOOK_PRESENTATION_BREAKPOINT ? "single" : "spread";
}

export function resolveFlipbookStageScale({
  viewportWidth = 0,
  viewportHeight = 0,
  presentationMode = "spread",
  targetHeight = null,
} = {}) {
  const width = Math.max(0, Number(viewportWidth) || 0);
  const height = Math.max(0, Number(viewportHeight) || 0);
  const activeWidth =
    presentationMode === "single"
      ? FLIPBOOK_CANONICAL_PAGE_WIDTH
      : FLIPBOOK_CANONICAL_SPREAD_WIDTH;
  const activeHeight =
    presentationMode === "single"
      ? FLIPBOOK_CANONICAL_PAGE_HEIGHT
      : FLIPBOOK_CANONICAL_SPREAD_HEIGHT;

  const effectiveHeight =
    targetHeight == null || targetHeight === ""
      ? height
      : Math.min(height, Math.max(0, Number(targetHeight) || 0));

  return Math.min(width / activeWidth, effectiveHeight / activeHeight, 1);
}

function clampPageIndex(pageIndex = 0, pageCount = 0) {
  const numericPageIndex = Number(pageIndex);
  const numericPageCount = Number(pageCount);
  if (!Number.isFinite(numericPageCount) || numericPageCount <= 0) return 0;
  if (!Number.isFinite(numericPageIndex)) return 0;
  return Math.max(0, Math.min(numericPageCount - 1, Math.trunc(numericPageIndex)));
}

export function normalizeFlipbookPageIndex(pageIndex = 0, pageCount = 0) {
  return clampPageIndex(pageIndex, pageCount);
}

export function resolveSpreadLeftPageIndex(pageIndex = 0, pageCount = 0) {
  const clampedPageIndex = clampPageIndex(pageIndex, pageCount);
  if (clampedPageIndex <= 1) return clampedPageIndex;
  return clampedPageIndex % 2 === 0 ? clampedPageIndex - 1 : clampedPageIndex;
}

export function resolvePrimaryReadingPage({
  leftPageIndex = null,
  rightPageIndex = null,
  ttsActivePageIndex = null,
  explicitSelectedPageIndex = null,
  pageCount = 0,
} = {}) {
  const resolvedCandidates = [
    explicitSelectedPageIndex,
    ttsActivePageIndex,
    rightPageIndex,
    leftPageIndex,
  ]
    .filter((value) => value != null && value !== "")
    .map((value) => clampPageIndex(value, pageCount));

  return resolvedCandidates[0] ?? 0;
}

export function resolveCanonicalReadingPageIndex(options = {}) {
  return resolvePrimaryReadingPage(options);
}

export function resolveInitialCanonicalPageIndex({
  requestedPageIndex = null,
  savedPageIndex = null,
  currentPageIndex = null,
  pageCount = 0,
} = {}) {
  const candidates = [requestedPageIndex, savedPageIndex, currentPageIndex].filter(
    (value) => value != null && value !== ""
  );
  if (!candidates.length) {
    return clampPageIndex(0, pageCount);
  }
  return clampPageIndex(candidates[0], pageCount);
}

export function resolveFlipbookInitialVisualState({
  initialPageIndex = 0,
  requestedPageIndex = null,
  savedPageIndex = null,
  currentPageIndex = null,
  startedReading = false,
} = {}) {
  const hasResumeState =
    savedPageIndex != null ||
    currentPageIndex != null ||
    Boolean(startedReading);
  const hasDirectNavigation = requestedPageIndex != null && requestedPageIndex !== "";

  if (Math.max(0, Number(initialPageIndex) || 0) === 0 && !hasResumeState && !hasDirectNavigation) {
    return FLIPBOOK_VISUAL_STATE_CLOSED_BOOK;
  }

  return FLIPBOOK_VISUAL_STATE_READING;
}

export function resolveResumePageIndex({
  currentPageIndex = 0,
  previousPresentationMode = "spread",
  nextPresentationMode = "spread",
  ttsActivePageIndex = null,
  pageCount = 0,
} = {}) {
  const clampedCurrentPageIndex = clampPageIndex(currentPageIndex, pageCount);
  const clampedTtsPageIndex =
    ttsActivePageIndex == null || ttsActivePageIndex === ""
      ? null
      : clampPageIndex(ttsActivePageIndex, pageCount);
  if (nextPresentationMode === "spread") {
    return resolveSpreadLeftPageIndex(clampedTtsPageIndex ?? clampedCurrentPageIndex, pageCount);
  }

  if (nextPresentationMode === "single") {
    if (previousPresentationMode === "spread" && clampedTtsPageIndex != null) {
      const leftPageIndex = resolveSpreadLeftPageIndex(clampedCurrentPageIndex, pageCount);
      const rightPageIndex =
        leftPageIndex + 1 < Math.max(0, Number(pageCount) || 0) ? leftPageIndex + 1 : null;
      if (clampedTtsPageIndex === leftPageIndex || clampedTtsPageIndex === rightPageIndex) {
        return clampedTtsPageIndex;
      }
    }
    return clampedCurrentPageIndex;
  }

  return clampedCurrentPageIndex;
}
