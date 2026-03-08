import { normalizeLibraryPageCode, normalizeLibraryPageNumber } from "./read-state.js";

export function isLibraryFullscreenSupported({ element = null, documentRef = globalThis.document } = {}) {
  return Boolean(element?.requestFullscreen && documentRef && documentRef.fullscreenEnabled !== false);
}

export function isLibraryReaderFullscreen({ element = null, documentRef = globalThis.document } = {}) {
  return Boolean(element && documentRef?.fullscreenElement === element);
}

export async function toggleLibraryReaderFullscreen({
  element = null,
  documentRef = globalThis.document,
} = {}) {
  if (!isLibraryFullscreenSupported({ element, documentRef })) return false;

  if (isLibraryReaderFullscreen({ element, documentRef })) {
    await documentRef.exitFullscreen?.();
    return false;
  }

  await element.requestFullscreen();
  return true;
}

export function getLibraryFullscreenButtonLabel(isFullscreen = false) {
  return isFullscreen ? "Exit Fullscreen" : "Fullscreen";
}

export function getLibraryBookmarkSavedText(pageNumber, pageCode = "") {
  const normalizedPage = normalizeLibraryPageNumber(pageNumber);
  if (normalizedPage) return `Saved page: ${normalizedPage}`;
  if (normalizeLibraryPageCode(pageCode)) return "Saved bookmark";
  return "";
}

export function getLibraryBookmarkValidationError(value, { detectedPageCode = "" } = {}) {
  if (value != null && value !== "") {
    return normalizeLibraryPageNumber(value) ? "" : "Page number must be a positive integer.";
  }
  if (normalizeLibraryPageCode(detectedPageCode)) return "";
  return "Page number must be a positive integer.";
}

export function getLibraryBookmarkButtonLabel({ saving = false, saveSuccess = false } = {}) {
  if (saving) return "Saving...";
  if (saveSuccess) return "Saved";
  return "Save Bookmark";
}

export function hasLibraryBookmarkDraftChange({ value = "", savedPageNumber = null } = {}) {
  const normalizedValue = normalizeLibraryPageNumber(value);
  const normalizedSaved = normalizeLibraryPageNumber(savedPageNumber);
  return Boolean(normalizedValue && normalizedValue !== normalizedSaved);
}

export function getLibraryFloatingBookmarkPanelClasses({ isMobile = false, isFullscreen = false } = {}) {
  const mobileClasses = isMobile
    ? "right-4 bottom-4 w-[10.75rem] max-w-[calc(100vw-2rem)] sm:right-5 sm:w-[11.5rem]"
    : "bottom-6 right-6 w-[11.5rem] max-w-[calc(100vw-3rem)]";

  const fullscreenClasses = isFullscreen ? "bottom-4 right-4 sm:bottom-5 sm:right-5" : "";

  return `fixed z-30 ${mobileClasses} ${fullscreenClasses}`.trim();
}

export function applyLibrarySavedBookmarkState(readState = null, { pageNumber = null, pageCode = "" } = {}) {
  const normalizedPage = normalizeLibraryPageNumber(pageNumber);
  const normalizedPageCode = normalizeLibraryPageCode(pageCode);
  if (!normalizedPage && !normalizedPageCode) return readState;

  return {
    ...(readState || {}),
    savedPageNumber: normalizedPage,
    savedPageCode: normalizedPageCode,
    startedReading: true,
  };
}
