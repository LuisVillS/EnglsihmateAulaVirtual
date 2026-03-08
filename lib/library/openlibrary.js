import {
  DEFAULT_OPEN_LIBRARY_SEARCH_LIMIT,
  getOpenLibraryUserAgent,
  OPEN_LIBRARY_SEARCH_FIELDS,
} from "./constants.js";
import { computeLibraryMetadataScore, selectPreferredEdition } from "./dedupe.js";
import { buildArchiveReaderUrl, sanitizeLibraryEmbedUrl } from "./embed.js";
import {
  cleanText,
  extractDescriptionText,
  normalizeAuthorForComparison,
  normalizeLanguageCode,
  normalizeOpenLibraryKey,
  normalizeTitleForComparison,
  normalizeWhitespace,
  pickPrimaryAuthor,
  splitTitleAndSubtitle,
} from "./normalization.js";

const OPEN_LIBRARY_BASE_URL = "https://openlibrary.org";

function buildCoverUrl(coverId, size = "L") {
  const safeCoverId = cleanText(coverId);
  if (!safeCoverId) return "";
  return `https://covers.openlibrary.org/b/id/${safeCoverId}-${size}.jpg`;
}

function parseYearValue(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value).match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

async function openLibraryFetchJson(pathname, searchParams = null) {
  const url = new URL(pathname.startsWith("http") ? pathname : `${OPEN_LIBRARY_BASE_URL}${pathname}`);
  if (searchParams) {
    for (const [key, value] of searchParams.entries()) {
      if (value != null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": getOpenLibraryUserAgent(),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Open Library request failed with status ${response.status}.`);
  }

  return response.json();
}

function coerceLanguageCode(languageValue, fallbackValues = []) {
  const values = [
    ...(Array.isArray(languageValue) ? languageValue : languageValue ? [languageValue] : []),
    ...(Array.isArray(fallbackValues) ? fallbackValues : []),
  ];

  for (const entry of values) {
    const candidate = normalizeLanguageCode(entry?.key || entry);
    if (candidate) return candidate;
  }

  return "";
}

function resolveInternetArchiveIdentifier(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const first = value.map((entry) => cleanText(entry)).find(Boolean);
      if (first) return first;
      continue;
    }
    const candidate = cleanText(value);
    if (candidate) return candidate;
  }
  return "";
}

function deriveAvailability(record) {
  const availability = record?.availability || {};
  const ebookAccess = cleanText(record?.ebook_access || availability.status).toLowerCase();
  const archiveIdentifier = resolveInternetArchiveIdentifier(
    availability.identifier,
    record?.ocaid,
    record?.ia
  );

  const borrowable =
    ebookAccess === "borrowable" ||
    Boolean(availability.available_to_borrow) ||
    Boolean(availability.is_lendable);
  const previewOnly =
    !["public", "full", "readable"].includes(ebookAccess) &&
    (Boolean(availability.is_previewable) || ebookAccess === "printdisabled" || ebookAccess === "preview");
  const readableOnline =
    Boolean(archiveIdentifier) &&
    (ebookAccess === "public" || ebookAccess === "full" || ebookAccess === "readable");

  return {
    availability,
    ebookAccess,
    borrowable,
    previewOnly,
    readableOnline,
    archiveIdentifier,
  };
}

function toAuthorObjects(names = []) {
  return (Array.isArray(names) ? names : [])
    .map((name) => normalizeWhitespace(name))
    .filter(Boolean)
    .map((name) => ({ name }));
}

function normalizeCandidateRecord({
  workKey = "",
  editionKey = "",
  title = "",
  subtitle = "",
  description = "",
  authorNames = [],
  authorDisplay = "",
  languageValue = "",
  coverId = "",
  coverUrl = "",
  thumbnailUrl = "",
  archiveIdentifier = "",
  ebookAccess = "",
  hasFulltext = false,
  readableOnline = false,
  previewOnly = false,
  borrowable = false,
  firstPublishYear = null,
  sourcePayload = null,
  sourceSyncStatus = "ok",
}) {
  const titleParts = splitTitleAndSubtitle(title, subtitle);
  const normalizedAuthor = normalizeAuthorForComparison(authorDisplay || authorNames[0] || "");
  const safeArchiveIdentifier = cleanText(archiveIdentifier);
  const readerUrl = buildArchiveReaderUrl(safeArchiveIdentifier);
  const embedUrl = sanitizeLibraryEmbedUrl("", safeArchiveIdentifier);
  const normalized = {
    source_name: "openlibrary",
    title: titleParts.title,
    subtitle: titleParts.subtitle || "",
    raw_title: titleParts.title,
    normalized_title: normalizeTitleForComparison(titleParts.title),
    normalized_author: normalizedAuthor,
    description: extractDescriptionText(description),
    author_display: normalizeWhitespace(authorDisplay || authorNames.join(", ")),
    authors_json: toAuthorObjects(authorNames),
    language_code: coerceLanguageCode(languageValue),
    openlibrary_work_key: normalizeOpenLibraryKey(workKey, "OL"),
    openlibrary_edition_key: normalizeOpenLibraryKey(editionKey, "OL"),
    internet_archive_identifier: safeArchiveIdentifier,
    first_publish_year: parseYearValue(firstPublishYear),
    cover_url: cleanText(coverUrl) || buildCoverUrl(coverId, "L"),
    thumbnail_url: cleanText(thumbnailUrl) || buildCoverUrl(coverId, "M"),
    ebook_access: cleanText(ebookAccess).toLowerCase(),
    has_fulltext: Boolean(hasFulltext),
    readable_online: Boolean(readableOnline),
    preview_only: Boolean(previewOnly),
    borrowable: Boolean(borrowable),
    reader_url: readerUrl,
    embed_url: embedUrl,
    source_payload: sourcePayload,
    metadata_verified_at: new Date().toISOString(),
    source_sync_status: sourceSyncStatus,
    source_sync_error: null,
  };

  normalized.metadata_score = computeLibraryMetadataScore(normalized);
  return normalized;
}

function normalizeEditionCandidate(edition, workDoc, workDetails = null) {
  const availability = deriveAvailability(edition);
  const authorNames = [
    ...(Array.isArray(workDoc?.author_name) ? workDoc.author_name : []),
    ...(Array.isArray(workDetails?.authors) ? workDetails.authors.map((entry) => entry?.name || "").filter(Boolean) : []),
  ];

  return normalizeCandidateRecord({
    workKey: workDoc?.key || workDetails?.key,
    editionKey: edition?.key,
    title: edition?.title || workDoc?.title || workDetails?.title,
    subtitle: edition?.subtitle || workDoc?.subtitle,
    description: workDetails?.description || workDoc?.description,
    authorNames,
    authorDisplay: authorNames.join(", "),
    languageValue: edition?.languages || edition?.language || workDoc?.language || workDetails?.languages,
    coverId: Array.isArray(edition?.covers) ? edition.covers[0] : edition?.cover_i || workDoc?.cover_i,
    archiveIdentifier: availability.archiveIdentifier,
    ebookAccess: availability.ebookAccess || workDoc?.ebook_access,
    hasFulltext: edition?.has_fulltext ?? workDoc?.has_fulltext ?? Boolean(availability.archiveIdentifier),
    readableOnline: availability.readableOnline,
    previewOnly: availability.previewOnly,
    borrowable: availability.borrowable,
    firstPublishYear: edition?.publish_date || workDoc?.first_publish_year,
    sourcePayload: {
      searchDoc: workDoc || null,
      work: workDetails || null,
      edition,
    },
  });
}

export function normalizeOpenLibrarySearchCandidate(searchDoc) {
  const firstEditionDocs = Array.isArray(searchDoc?.editions?.docs) ? searchDoc.editions.docs : [];
  const editionCandidates = firstEditionDocs.map((edition) => normalizeEditionCandidate(edition, searchDoc));
  const availability = deriveAvailability(searchDoc);

  const baseCandidate = normalizeCandidateRecord({
    workKey: searchDoc?.key,
    editionKey: firstEditionDocs[0]?.key || searchDoc?.edition_key,
    title: searchDoc?.title,
    subtitle: searchDoc?.subtitle,
    authorNames: Array.isArray(searchDoc?.author_name) ? searchDoc.author_name : [],
    authorDisplay: Array.isArray(searchDoc?.author_name) ? searchDoc.author_name.join(", ") : "",
    languageValue: searchDoc?.language,
    coverId: searchDoc?.cover_i,
    archiveIdentifier: availability.archiveIdentifier,
    ebookAccess: availability.ebookAccess || searchDoc?.ebook_access,
    hasFulltext: searchDoc?.has_fulltext,
    readableOnline: availability.readableOnline,
    previewOnly: availability.previewOnly,
    borrowable: availability.borrowable,
    firstPublishYear: searchDoc?.first_publish_year,
    sourcePayload: {
      searchDoc,
    },
  });

  return selectPreferredEdition([baseCandidate, ...editionCandidates]) || baseCandidate;
}

export async function searchOpenLibraryCatalog({ query, limit = DEFAULT_OPEN_LIBRARY_SEARCH_LIMIT }) {
  const safeQuery = normalizeWhitespace(query);
  if (!safeQuery) {
    return [];
  }

  const searchParams = new URLSearchParams();
  searchParams.set("q", safeQuery);
  searchParams.set("limit", String(Math.max(1, Math.min(60, Number(limit) || DEFAULT_OPEN_LIBRARY_SEARCH_LIMIT))));
  searchParams.set("fields", OPEN_LIBRARY_SEARCH_FIELDS);

  const payload = await openLibraryFetchJson("/search.json", searchParams);
  const docs = Array.isArray(payload?.docs) ? payload.docs : [];
  const byWorkKey = new Map();

  for (const doc of docs) {
    const candidate = normalizeOpenLibrarySearchCandidate(doc);
    const workKey = cleanText(candidate.openlibrary_work_key) || cleanText(doc?.key) || candidate.normalized_title;
    const existing = byWorkKey.get(workKey);
    if (!existing) {
      byWorkKey.set(workKey, candidate);
      continue;
    }
    byWorkKey.set(workKey, selectPreferredEdition([existing, candidate]) || existing);
  }

  return [...byWorkKey.values()];
}

export async function fetchOpenLibraryWork(workKey) {
  const safeWorkKey = normalizeOpenLibraryKey(workKey, "OL");
  if (!safeWorkKey) return null;
  return openLibraryFetchJson(`/works/${safeWorkKey}.json`);
}

export async function fetchOpenLibraryEdition(editionKey) {
  const safeEditionKey = normalizeOpenLibraryKey(editionKey, "OL");
  if (!safeEditionKey) return null;
  return openLibraryFetchJson(`/books/${safeEditionKey}.json`);
}

export async function hydrateOpenLibraryCandidate(candidate) {
  const workKey = cleanText(candidate?.openlibrary_work_key);
  const editionKey = cleanText(candidate?.openlibrary_edition_key);

  const [workDetails, editionDetails] = await Promise.all([
    workKey ? fetchOpenLibraryWork(workKey).catch(() => null) : Promise.resolve(null),
    editionKey ? fetchOpenLibraryEdition(editionKey).catch(() => null) : Promise.resolve(null),
  ]);

  if (!workDetails && !editionDetails) {
    return {
      ...candidate,
      source_sync_status: "stale",
    };
  }

  const normalized = normalizeCandidateRecord({
    workKey: workDetails?.key || candidate?.openlibrary_work_key,
    editionKey: editionDetails?.key || candidate?.openlibrary_edition_key,
    title: editionDetails?.title || workDetails?.title || candidate?.title || candidate?.raw_title,
    subtitle: editionDetails?.subtitle || candidate?.subtitle,
    description: workDetails?.description || candidate?.description,
    authorNames:
      Array.isArray(candidate?.authors_json) && candidate.authors_json.length
        ? candidate.authors_json.map((entry) => entry?.name || "").filter(Boolean)
        : [pickPrimaryAuthor(candidate)].filter(Boolean),
    authorDisplay: candidate?.author_display,
    languageValue: editionDetails?.languages || candidate?.language_code,
    coverId:
      (Array.isArray(editionDetails?.covers) ? editionDetails.covers[0] : null) ||
      (Array.isArray(workDetails?.covers) ? workDetails.covers[0] : null),
    archiveIdentifier: editionDetails?.ocaid || candidate?.internet_archive_identifier,
    ebookAccess: candidate?.ebook_access,
    hasFulltext: candidate?.has_fulltext,
    readableOnline: candidate?.readable_online,
    previewOnly: candidate?.preview_only,
    borrowable: candidate?.borrowable,
    firstPublishYear: editionDetails?.publish_date || workDetails?.first_publish_date || candidate?.first_publish_year,
    sourcePayload: {
      searchDoc: candidate?.source_payload?.searchDoc || null,
      work: workDetails,
      edition: editionDetails,
    },
  });

  if (!normalized.ebook_access) {
    normalized.ebook_access = cleanText(candidate?.ebook_access).toLowerCase();
  }
  if (!normalized.readable_online) {
    normalized.readable_online = Boolean(candidate?.readable_online);
  }
  if (!normalized.preview_only) {
    normalized.preview_only = Boolean(candidate?.preview_only);
  }
  if (!normalized.borrowable) {
    normalized.borrowable = Boolean(candidate?.borrowable);
  }
  if (!normalized.cover_url && candidate?.cover_url) {
    normalized.cover_url = candidate.cover_url;
  }
  if (!normalized.thumbnail_url && candidate?.thumbnail_url) {
    normalized.thumbnail_url = candidate.thumbnail_url;
  }
  if (!normalized.internet_archive_identifier) {
    normalized.internet_archive_identifier = cleanText(candidate?.internet_archive_identifier);
    normalized.reader_url = buildArchiveReaderUrl(normalized.internet_archive_identifier);
    normalized.embed_url = sanitizeLibraryEmbedUrl(candidate?.embed_url, normalized.internet_archive_identifier);
  }

  normalized.metadata_score = computeLibraryMetadataScore(normalized);
  return normalized;
}
