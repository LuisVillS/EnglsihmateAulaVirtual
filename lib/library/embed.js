import { LIBRARY_ALLOWED_EMBED_HOSTS } from "./constants.js";
import { cleanText } from "./normalization.js";

function buildArchiveIdentifierPath(identifier) {
  return encodeURIComponent(cleanText(identifier));
}

export function buildArchiveReaderUrl(identifier) {
  const safeIdentifier = buildArchiveIdentifierPath(identifier);
  if (!safeIdentifier) return "";
  return `https://archive.org/details/${safeIdentifier}`;
}

export function buildArchiveEmbedUrl(identifier) {
  const safeIdentifier = buildArchiveIdentifierPath(identifier);
  if (!safeIdentifier) return "";
  return `https://www.archive.org/embed/${safeIdentifier}`;
}

export function isAllowedLibraryEmbedUrl(value) {
  try {
    const url = new URL(value);
    return LIBRARY_ALLOWED_EMBED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isAllowedLibraryEmbedOrigin(value) {
  try {
    const url = new URL(value);
    return LIBRARY_ALLOWED_EMBED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function sanitizeLibraryEmbedUrl(value, identifier = "") {
  const raw = cleanText(value);
  const canonicalFromIdentifier = buildArchiveEmbedUrl(identifier);
  if (canonicalFromIdentifier) {
    return canonicalFromIdentifier;
  }
  if (raw && isAllowedLibraryEmbedUrl(raw)) {
    try {
      const url = new URL(raw);
      url.hash = "";
      return url.toString();
    } catch {
      return raw;
    }
  }
  return buildArchiveEmbedUrl(identifier);
}

export function resolveLibraryReaderMode({ isMobile = false } = {}) {
  return isMobile ? "1up" : "2up";
}

export function extractLibraryPageNumber(value) {
  const source = cleanText(value);
  if (!source) return null;

  const numberedMatch = source.match(/(?:^|#|\/)page\/n?(\d+)(?:\/|$)/i);
  if (numberedMatch?.[1]) {
    return Number(numberedMatch[1]) || null;
  }

  const pageMatch = source.match(/\bpage(?:=|:)?\s*(\d+)\b/i);
  if (pageMatch?.[1]) {
    return Number(pageMatch[1]) || null;
  }

  return null;
}

export function buildLibraryEmbedFragment({ pageMode = "2up", pageNumber = null, location = "" } = {}) {
  const safeLocation = normalizeLibraryReaderFragment(location);
  if (safeLocation) {
    const normalizedHash = safeLocation.replace(/(^|\/)mode\/(1up|2up)(?=\/|$)/i, `$1mode/${pageMode}`);
    if (normalizedHash) {
      const withMode = /(^|\/)mode\/(1up|2up)(?=\/|$)/i.test(normalizedHash)
        ? normalizedHash
        : `${normalizedHash}/mode/${pageMode}`;
      return `#${withMode}`.replace(/\/{2,}/g, "/");
    }
  }

  const safePageNumber = Number(pageNumber);
  const normalizedPage = Number.isFinite(safePageNumber) && safePageNumber > 0 ? safePageNumber : 1;
  return `#mode/${pageMode}/page/${normalizedPage}`;
}

export function buildLibraryReaderEmbedUrl({
  embedUrl = "",
  identifier = "",
  pageMode = "2up",
  pageNumber = null,
  location = "",
} = {}) {
  const baseUrl = sanitizeLibraryEmbedUrl(embedUrl, identifier);
  if (!baseUrl) return "";
  const fragment = buildLibraryEmbedFragment({ pageMode, pageNumber, location });
  return `${baseUrl}${fragment}`;
}

export function parseLibraryReaderLocation(value) {
  const safeValue = cleanText(value);
  if (!safeValue) {
    return {
      lastLocation: "",
      lastPageNumber: null,
    };
  }

  const lastLocation = safeValue.startsWith("#") ? safeValue : `#${safeValue.replace(/^#/, "")}`;
  return {
    lastLocation,
    lastPageNumber: extractLibraryPageNumber(lastLocation),
  };
}

export function extractLibraryReaderFragmentMessage(value) {
  let payload = value;

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return "";
    }
  }

  if (!payload || typeof payload !== "object") return "";

  const type = cleanText(payload.type || payload.event || payload.action).toLowerCase();
  if (type && type !== "bookreaderfragmentchange") return "";

  const fragment = cleanText(
    payload.fragment ||
      payload.hash ||
      payload.location ||
      payload.data?.fragment ||
      payload.payload?.fragment
  );

  return fragment.replace(/^#/, "");
}

export function buildLibraryReaderFragment(options = {}) {
  return buildLibraryEmbedFragment(options).replace(/^#/, "");
}

export function getLibraryEmbedOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "https://www.archive.org";
  }
}

function normalizeLibraryReaderFragment(value) {
  const source = cleanText(value);
  if (!source) return "";

  let normalized = source.replace(/^#/, "").trim();

  try {
    const url = new URL(source);
    if (url.hash) {
      normalized = url.hash.replace(/^#/, "");
    } else {
      normalized = url.pathname
        .replace(/^\/(?:details|embed|stream)\/[^/]+\/?/i, "")
        .replace(/^\/+|\/+$/g, "");
    }
  } catch {
    normalized = source.replace(/^#/, "").trim();
  }

  normalized = normalized
    .replace(/\?.*$/, "")
    .replace(/^bookreader\//i, "")
    .replace(/^\/+|\/+$/g, "");

  if (/^(?:details|embed|stream)\//i.test(normalized)) {
    normalized = normalized.replace(/^(?:details|embed|stream)\/[^/]+\/?/i, "");
  }

  return normalized.replace(/^\/+|\/+$/g, "");
}
