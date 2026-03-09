import { cleanText } from "./normalization.js";

export function normalizeLibraryPageNumber(value, { max = 10000 } = {}) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  if (numeric > max) return null;
  return numeric;
}

export function normalizeLibraryPageCode(value) {
  const safeValue = cleanText(value);
  if (!safeValue) return "";

  const normalized = safeValue.replace(/^#/, "").trim();
  return normalized || "";
}

export function resolveLibraryResumePage(readState = null) {
  if (!readState) return null;
  return (
    normalizeLibraryPageNumber(readState.savedPageNumber) ||
    normalizeLibraryPageNumber(readState.lastPageNumber) ||
    null
  );
}

export function resolveLibraryResumeTarget(readState = null) {
  if (!readState) {
    return {
      pageNumber: null,
      pageCode: "",
      location: "",
    };
  }

  const pageNumber = resolveLibraryResumePage(readState);
  const pageCode = normalizeLibraryPageCode(readState.savedPageCode);
  const lastLocation = normalizeLibraryLocation(readState.lastLocation);

  return {
    pageNumber,
    pageCode,
    location: pageCode ? pageCode : lastLocation,
  };
}

export function serializeLibraryReadState(readState = null) {
  if (!readState) {
    return {
      savedPageNumber: null,
      savedPageCode: "",
      lastPageNumber: null,
      lastLocation: "",
      progressPercent: null,
      inMyLibrary: false,
      startedReading: false,
      completed: false,
      lastOpenedAt: null,
      completedAt: null,
      updatedAt: null,
    };
  }

  return {
    savedPageNumber: normalizeLibraryPageNumber(readState.savedPageNumber),
    savedPageCode: normalizeLibraryPageCode(readState.savedPageCode),
    lastPageNumber: normalizeLibraryPageNumber(readState.lastPageNumber),
    lastLocation: normalizeLibraryLocation(readState.lastLocation),
    progressPercent:
      readState.progressPercent == null || readState.progressPercent === ""
        ? null
        : Number(readState.progressPercent),
    inMyLibrary: Boolean(readState.inMyLibrary),
    startedReading: Boolean(readState.startedReading),
    completed: Boolean(readState.completed),
    lastOpenedAt: readState.lastOpenedAt || null,
    completedAt: readState.completedAt || null,
    updatedAt: readState.updatedAt || null,
  };
}

export function formatLibrarySavedPage(pageNumber, prefix = "Saved page") {
  const normalized = normalizeLibraryPageNumber(pageNumber);
  return normalized ? `${prefix}: ${normalized}` : "";
}

export function buildLibrarySavedPageNotice(pageNumber, pageCode = "") {
  const normalized = normalizeLibraryPageNumber(pageNumber);
  if (normalized) return `Your saved page is ${normalized}.`;
  if (normalizeLibraryPageCode(pageCode)) return "Your saved bookmark is ready.";
  return "";
}

export function buildLibraryResumeHint(pageNumber, pageCode = "") {
  const normalized = normalizeLibraryPageNumber(pageNumber);
  if (normalized) return `Resume from page ${normalized}`;
  if (normalizeLibraryPageCode(pageCode)) return "Resume from your saved bookmark";
  return "";
}

export function buildLibraryBookProgressLabel(book = {}) {
  const savedPageNumber = normalizeLibraryPageNumber(book.savedPageNumber);
  const savedPageCode = normalizeLibraryPageCode(book.savedPageCode);
  const lastPageNumber = normalizeLibraryPageNumber(book.lastPageNumber);

  if (savedPageNumber) return `Saved page ${savedPageNumber}`;
  if (savedPageCode) return "Saved bookmark";
  if (lastPageNumber) return `Page ${lastPageNumber}`;
  if (book.progressPercent != null && book.progressPercent !== "") {
    return `${Math.round(Number(book.progressPercent) || 0)}% read`;
  }
  if (book.completed) return "Completed";
  if (book.inMyLibrary) return "In My Library";
  if (book.readableOnline) return "Online";
  return "Unavailable";
}

export function normalizeLibraryLocation(value) {
  const safeValue = cleanText(value);
  return safeValue || "";
}
