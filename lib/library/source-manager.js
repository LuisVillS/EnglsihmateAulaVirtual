import { deleteObjectFromR2, getLibraryR2Bucket, getObjectFromR2, putObjectToR2 } from "../r2.js";
import {
  LIBRARY_GUTENBERG_SOURCE_NAME,
  LIBRARY_MANUAL_EPUB_SOURCE_NAME,
  LIBRARY_SOURCE_CACHE_STATUSES,
  LIBRARY_SOURCE_FORMATS,
  LIBRARY_SOURCE_NAME,
  LIBRARY_SOURCE_ROLES,
  LIBRARY_SOURCE_STATUSES,
  getOpenLibraryUserAgent,
} from "./constants.js";
import { buildArchiveEmbedUrl, buildArchiveReaderUrl, sanitizeLibraryEmbedUrl } from "./embed.js";
import {
  cleanText,
  normalizeLanguageCode,
  normalizeWhitespace,
  toAsciiSlug,
} from "./normalization.js";
import { isMissingLibraryTableError } from "./repository.js";

const LIBRARY_SOURCE_FIELDS = [
  "id",
  "library_book_id",
  "source_name",
  "source_role",
  "source_format",
  "source_status",
  "source_identifier",
  "source_url",
  "reader_url",
  "embed_url",
  "download_url",
  "cover_url",
  "thumbnail_url",
  "language_code",
  "readable",
  "is_preferred_read",
  "is_preferred_metadata",
  "availability_json",
  "metadata_json",
  "cache_status",
  "cache_key",
  "cache_content_type",
  "cache_etag",
  "cache_last_modified",
  "cache_bytes",
  "cache_checked_at",
  "cached_at",
  "cache_error",
  "created_at",
  "updated_at",
];

const SOURCE_ROLE_VALUES = new Set(Object.values(LIBRARY_SOURCE_ROLES));
const SOURCE_FORMAT_VALUES = new Set(Object.values(LIBRARY_SOURCE_FORMATS));
const SOURCE_STATUS_VALUES = new Set(Object.values(LIBRARY_SOURCE_STATUSES));
const CACHE_STATUS_VALUES = new Set(Object.values(LIBRARY_SOURCE_CACHE_STATUSES));
const LIBRARY_CACHE_BUCKET = getLibraryR2Bucket();
const MANUAL_UPLOAD_SCOPES = new Set(["candidate", "staging", "book", "manual"]);

function coerceSourceValue(value, fallback) {
  const normalized = cleanText(value).toLowerCase();
  return normalized || fallback;
}

function coerceSourceRole(value) {
  const normalized = coerceSourceValue(value, LIBRARY_SOURCE_ROLES.SUPPLEMENTAL);
  return SOURCE_ROLE_VALUES.has(normalized) ? normalized : LIBRARY_SOURCE_ROLES.SUPPLEMENTAL;
}

function coerceSourceFormat(value) {
  const normalized = coerceSourceValue(value, LIBRARY_SOURCE_FORMATS.EXTERNAL_LINK);
  return SOURCE_FORMAT_VALUES.has(normalized) ? normalized : LIBRARY_SOURCE_FORMATS.EXTERNAL_LINK;
}

function coerceSourceStatus(value) {
  const normalized = coerceSourceValue(value, LIBRARY_SOURCE_STATUSES.PENDING);
  return SOURCE_STATUS_VALUES.has(normalized) ? normalized : LIBRARY_SOURCE_STATUSES.PENDING;
}

function coerceCacheStatus(value) {
  const normalized = coerceSourceValue(value, LIBRARY_SOURCE_CACHE_STATUSES.NOT_CACHED);
  return CACHE_STATUS_VALUES.has(normalized) ? normalized : LIBRARY_SOURCE_CACHE_STATUSES.NOT_CACHED;
}

function normalizeLibrarySourceInput(source = {}) {
  const sourceStatus = coerceSourceStatus(source.sourceStatus || source.source_status);
  const readable = Boolean(source.readable);
  const isActive = sourceStatus === LIBRARY_SOURCE_STATUSES.ACTIVE;
  const nowIso = new Date().toISOString();

  return {
    id: cleanText(source.id),
    library_book_id: cleanText(source.libraryBookId || source.library_book_id),
    source_name: coerceSourceValue(source.sourceName || source.source_name, LIBRARY_SOURCE_NAME),
    source_role: coerceSourceRole(source.sourceRole || source.source_role),
    source_format: coerceSourceFormat(source.sourceFormat || source.source_format),
    source_status: sourceStatus,
    source_identifier: cleanText(source.sourceIdentifier || source.source_identifier) || null,
    source_url: cleanText(source.sourceUrl || source.source_url) || null,
    reader_url: cleanText(source.readerUrl || source.reader_url) || null,
    embed_url: cleanText(source.embedUrl || source.embed_url) || null,
    download_url: cleanText(source.downloadUrl || source.download_url) || null,
    cover_url: cleanText(source.coverUrl || source.cover_url) || null,
    thumbnail_url: cleanText(source.thumbnailUrl || source.thumbnail_url) || null,
    language_code: normalizeLanguageCode(source.languageCode || source.language_code) || null,
    readable,
    is_preferred_read: readable && isActive && Boolean(source.isPreferredRead ?? source.is_preferred_read),
    is_preferred_metadata: isActive && Boolean(source.isPreferredMetadata ?? source.is_preferred_metadata),
    availability_json: source.availabilityJson ?? source.availability_json ?? null,
    metadata_json: source.metadataJson ?? source.metadata_json ?? null,
    cache_status: coerceCacheStatus(source.cacheStatus || source.cache_status),
    cache_key: cleanText(source.cacheKey || source.cache_key) || null,
    cache_content_type: cleanText(source.cacheContentType || source.cache_content_type) || null,
    cache_etag: cleanText(source.cacheEtag || source.cache_etag) || null,
    cache_last_modified: cleanText(source.cacheLastModified || source.cache_last_modified) || null,
    cache_bytes:
      source.cacheBytes == null || source.cacheBytes === ""
        ? null
        : Number(source.cacheBytes || source.cache_bytes) || null,
    cache_checked_at: source.cacheCheckedAt || source.cache_checked_at || null,
    cached_at: source.cachedAt || source.cached_at || null,
    cache_error: cleanText(source.cacheError || source.cache_error) || null,
    created_at: source.createdAt || source.created_at || nowIso,
    updated_at: source.updatedAt || source.updated_at || nowIso,
  };
}

export function mapLibrarySourceRow(row) {
  if (!row) return null;
  return {
    id: cleanText(row.id),
    libraryBookId: cleanText(row.library_book_id),
    sourceName: cleanText(row.source_name),
    sourceRole: cleanText(row.source_role),
    sourceFormat: cleanText(row.source_format),
    sourceStatus: cleanText(row.source_status),
    sourceIdentifier: cleanText(row.source_identifier),
    sourceUrl: cleanText(row.source_url),
    readerUrl: cleanText(row.reader_url),
    embedUrl: cleanText(row.embed_url),
    downloadUrl: cleanText(row.download_url),
    coverUrl: cleanText(row.cover_url),
    thumbnailUrl: cleanText(row.thumbnail_url),
    languageCode: cleanText(row.language_code),
    readable: Boolean(row.readable),
    isPreferredRead: Boolean(row.is_preferred_read),
    isPreferredMetadata: Boolean(row.is_preferred_metadata),
    availabilityJson: row.availability_json || null,
    metadataJson: row.metadata_json || null,
    cacheStatus: cleanText(row.cache_status),
    cacheKey: cleanText(row.cache_key),
    cacheContentType: cleanText(row.cache_content_type),
    cacheEtag: cleanText(row.cache_etag),
    cacheLastModified: cleanText(row.cache_last_modified),
    cacheBytes: row.cache_bytes == null || row.cache_bytes === "" ? null : Number(row.cache_bytes),
    cacheCheckedAt: row.cache_checked_at || null,
    cachedAt: row.cached_at || null,
    cacheError: cleanText(row.cache_error),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function buildOpenLibrarySourceUrl(book) {
  const workKey = cleanText(book?.openlibraryWorkKey || book?.openlibrary_work_key);
  const editionKey = cleanText(book?.openlibraryEditionKey || book?.openlibrary_edition_key);

  if (editionKey) {
    return `https://openlibrary.org/books/${editionKey}`;
  }
  if (workKey) {
    return `https://openlibrary.org/works/${workKey}`;
  }
  return "";
}

function buildGutenbergSourceUrl(book) {
  const providerUrl = cleanText(book?.sourcePayload?.providerUrl || book?.source_payload?.providerUrl);
  if (providerUrl) return providerUrl;

  const providerBookId = cleanText(book?.sourcePayload?.providerBookId || book?.source_payload?.providerBookId);
  if (!providerBookId) return "";
  return `https://www.gutenberg.org/ebooks/${providerBookId}`;
}

function hasLegacyOpenLibraryFallback(book = {}) {
  return Boolean(
    cleanText(book?.sourceName || book?.source_name) === LIBRARY_SOURCE_NAME ||
      cleanText(book?.openlibraryWorkKey || book?.openlibrary_work_key) ||
      cleanText(book?.openlibraryEditionKey || book?.openlibrary_edition_key) ||
      cleanText(book?.internetArchiveIdentifier || book?.internet_archive_identifier) ||
      cleanText(book?.embedUrl || book?.embed_url) ||
      cleanText(book?.readerUrl || book?.reader_url)
  );
}

export function buildLegacyOpenLibrarySource(book = {}, { preferRead = true } = {}) {
  const archiveIdentifier = cleanText(book.internetArchiveIdentifier || book.internet_archive_identifier);
  const readable = Boolean(book.readableOnline ?? book.readable_online);
  return mapLibrarySourceRow(
    normalizeLibrarySourceInput({
      libraryBookId: book.id,
      sourceName: LIBRARY_SOURCE_NAME,
      sourceRole: LIBRARY_SOURCE_ROLES.HYBRID,
      sourceFormat:
        archiveIdentifier || cleanText(book.embedUrl || book.embed_url)
          ? LIBRARY_SOURCE_FORMATS.ARCHIVE_EMBED
          : LIBRARY_SOURCE_FORMATS.CATALOG_RECORD,
      sourceStatus:
        book.active === false || cleanText(book.publishStatus || book.publish_status) === "archived"
          ? LIBRARY_SOURCE_STATUSES.DISABLED
          : LIBRARY_SOURCE_STATUSES.ACTIVE,
      sourceIdentifier:
        archiveIdentifier ||
        cleanText(book.openlibraryEditionKey || book.openlibrary_edition_key) ||
        cleanText(book.openlibraryWorkKey || book.openlibrary_work_key) ||
        cleanText(book.slug),
      sourceUrl: buildOpenLibrarySourceUrl(book),
      readerUrl: cleanText(book.readerUrl || book.reader_url) || buildArchiveReaderUrl(archiveIdentifier),
      embedUrl: sanitizeLibraryEmbedUrl(book.embedUrl || book.embed_url, archiveIdentifier),
      coverUrl: cleanText(book.coverUrl || book.cover_url),
      thumbnailUrl: cleanText(book.thumbnailUrl || book.thumbnail_url),
      languageCode: cleanText(book.languageCode || book.language_code),
      readable,
      isPreferredRead: readable && preferRead,
      isPreferredMetadata: true,
      availabilityJson: {
        ebookAccess: cleanText(book.ebookAccess || book.ebook_access),
        hasFulltext: Boolean(book.hasFulltext ?? book.has_fulltext),
        readableOnline: readable,
        previewOnly: Boolean(book.previewOnly ?? book.preview_only),
        borrowable: Boolean(book.borrowable),
      },
      metadataJson: {
        title: cleanText(book.title || book.raw_title),
        authorDisplay: cleanText(book.authorDisplay || book.author_display),
        openlibraryWorkKey: cleanText(book.openlibraryWorkKey || book.openlibrary_work_key),
        openlibraryEditionKey: cleanText(book.openlibraryEditionKey || book.openlibrary_edition_key),
        firstPublishYear: book.firstPublishYear || book.first_publish_year || null,
      },
    })
  );
}

function buildGutenbergMetadataSource(book = {}) {
  const providerBookId = cleanText(book?.sourcePayload?.providerBookId || book?.source_payload?.providerBookId);

  return mapLibrarySourceRow(
    normalizeLibrarySourceInput({
      libraryBookId: book.id,
      sourceName: LIBRARY_GUTENBERG_SOURCE_NAME,
      sourceRole: LIBRARY_SOURCE_ROLES.METADATA,
      sourceFormat: LIBRARY_SOURCE_FORMATS.CATALOG_RECORD,
      sourceStatus:
        book.active === false || cleanText(book.publishStatus || book.publish_status) === "archived"
          ? LIBRARY_SOURCE_STATUSES.DISABLED
          : LIBRARY_SOURCE_STATUSES.ACTIVE,
      sourceIdentifier: providerBookId || cleanText(book.slug),
      sourceUrl: buildGutenbergSourceUrl(book) || null,
      coverUrl: cleanText(book.coverUrl || book.cover_url),
      thumbnailUrl: cleanText(book.thumbnailUrl || book.thumbnail_url),
      languageCode: cleanText(book.languageCode || book.language_code),
      readable: false,
      isPreferredRead: false,
      isPreferredMetadata: true,
      availabilityJson: {
        uploadedEpubRequired: true,
        readableOnline: Boolean(book.readableOnline ?? book.readable_online),
      },
      metadataJson: {
        title: cleanText(book.title || book.raw_title),
        authorDisplay: cleanText(book.authorDisplay || book.author_display),
        providerBookId: providerBookId || null,
        firstPublishYear: book.firstPublishYear || book.first_publish_year || null,
      },
    })
  );
}

function buildCatalogMetadataSourceInput(book, { preferRead = true } = {}) {
  const providerName = cleanText(
    book?.sourceName || book?.source_name || book?.sourcePayload?.provider || book?.source_payload?.provider
  ).toLowerCase();
  if (providerName === LIBRARY_GUTENBERG_SOURCE_NAME) {
    return buildGutenbergMetadataSource(book);
  }

  if (hasLegacyOpenLibraryFallback(book)) {
    return buildLegacyOpenLibrarySource(book, { preferRead });
  }

  return null;
}

function extractArchiveIdentifierFromUrl(value) {
  const raw = cleanText(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const pieces = url.pathname.split("/").filter(Boolean);
    if (!pieces.length) return "";

    const embedIndex = pieces.findIndex((entry) => /^(embed|details|stream)$/i.test(entry));
    if (embedIndex !== -1 && pieces[embedIndex + 1]) {
      return decodeURIComponent(pieces[embedIndex + 1]);
    }

    return "";
  } catch {
    return "";
  }
}

export function resolveArchiveIdentifierFromSource(source = {}, book = null) {
  return (
    extractArchiveIdentifierFromUrl(source?.embedUrl) ||
    extractArchiveIdentifierFromUrl(source?.readerUrl) ||
    cleanText(source?.availabilityJson?.archiveIdentifier || source?.availabilityJson?.ocaid) ||
    cleanText(source?.metadataJson?.internetArchiveIdentifier) ||
    cleanText(source?.sourceIdentifier) ||
    cleanText(book?.internetArchiveIdentifier || book?.internet_archive_identifier)
  );
}

function preserveSourceCache(existingSource, nextIdentifier) {
  if (!existingSource?.id) {
    return {
      cacheStatus: LIBRARY_SOURCE_CACHE_STATUSES.NOT_CACHED,
      cacheKey: null,
      cacheContentType: null,
      cacheEtag: null,
      cacheLastModified: null,
      cacheBytes: null,
      cacheCheckedAt: null,
      cachedAt: null,
      cacheError: null,
    };
  }

  if (cleanText(existingSource.sourceIdentifier) !== cleanText(nextIdentifier)) {
    return {
      cacheStatus: LIBRARY_SOURCE_CACHE_STATUSES.NOT_CACHED,
      cacheKey: null,
      cacheContentType: null,
      cacheEtag: null,
      cacheLastModified: null,
      cacheBytes: null,
      cacheCheckedAt: null,
      cachedAt: null,
      cacheError: null,
    };
  }

  return {
    cacheStatus: existingSource.cacheStatus || LIBRARY_SOURCE_CACHE_STATUSES.NOT_CACHED,
    cacheKey: existingSource.cacheKey || null,
    cacheContentType: existingSource.cacheContentType || null,
    cacheEtag: existingSource.cacheEtag || null,
    cacheLastModified: existingSource.cacheLastModified || null,
    cacheBytes: existingSource.cacheBytes ?? null,
    cacheCheckedAt: existingSource.cacheCheckedAt || null,
    cachedAt: existingSource.cachedAt || null,
    cacheError: existingSource.cacheError || null,
  };
}

function buildOpenLibrarySourceInput(book, { preferRead = true } = {}) {
  const legacySource = buildLegacyOpenLibrarySource(book, { preferRead });
  return {
    ...legacySource,
    id: cleanText(legacySource.id),
  };
}

function buildManualUploadedEpubSourceInput(book, upload = {}, existingSource = null) {
  const cacheKey = cleanText(upload.key || upload.cacheKey || existingSource?.cacheKey);
  if (!cacheKey) {
    throw new Error("Uploaded EPUB key is required.");
  }

  const fileName = cleanText(upload.fileName || upload.uploadedEpubFileName || existingSource?.metadataJson?.fileName);
  const contentType =
    cleanText(upload.contentType || upload.uploadedEpubContentType || existingSource?.cacheContentType) ||
    "application/epub+zip";
  const fileBytes =
    upload.bytes == null && upload.uploadedEpubBytes == null && existingSource?.cacheBytes == null
      ? null
      : Number(upload.bytes ?? upload.uploadedEpubBytes ?? existingSource?.cacheBytes) || null;
  const nowIso = new Date().toISOString();

  return {
    id: cleanText(existingSource?.id),
    libraryBookId: cleanText(book.id),
    sourceName: LIBRARY_MANUAL_EPUB_SOURCE_NAME,
    sourceRole: LIBRARY_SOURCE_ROLES.READ,
    sourceFormat: LIBRARY_SOURCE_FORMATS.EPUB,
    sourceStatus: LIBRARY_SOURCE_STATUSES.ACTIVE,
    sourceIdentifier: cacheKey,
    sourceUrl: null,
    readerUrl: null,
    downloadUrl: null,
    coverUrl: cleanText(book.coverUrl),
    thumbnailUrl: cleanText(book.thumbnailUrl),
    languageCode: "eng",
    readable: true,
    isPreferredRead: true,
    isPreferredMetadata: false,
    availabilityJson: {
      acquisition: "admin_uploaded_epub",
      uploaded: true,
      cacheKey,
    },
    metadataJson: {
      manual: true,
      fileName,
      uploaded: true,
    },
    cacheStatus: LIBRARY_SOURCE_CACHE_STATUSES.READY,
    cacheKey,
    cacheContentType: contentType,
    cacheEtag: cleanText(existingSource?.cacheEtag) || null,
    cacheLastModified: cleanText(existingSource?.cacheLastModified) || nowIso,
    cacheBytes: fileBytes,
    cacheCheckedAt: nowIso,
    cachedAt: nowIso,
    cacheError: null,
  };
}

function normalizeManualUploadScope(value = "") {
  const scope = cleanText(value).toLowerCase();
  return MANUAL_UPLOAD_SCOPES.has(scope) ? scope : "manual";
}

export function buildCanonicalManualEpubCacheKey(book = {}) {
  const safeBookId = toAsciiSlug(cleanText(book?.id || book?.libraryBookId || book?.library_book_id || book)) || "book";
  const safeFileName =
    toAsciiSlug(
      cleanText(
        book?.uploadedEpubFileName ||
          book?.uploaded_epub_file_name ||
          book?.metadataJson?.fileName ||
          book?.fileName ||
          ""
      ).replace(/\.epub$/i, "")
    ) || "book";
  return `library/books/${safeBookId}/${safeFileName}.epub`;
}

function resolveManualEpubCandidateCacheKeys(source = {}) {
  const keys = [];
  const currentKey = cleanText(source.cacheKey);
  if (currentKey) {
    keys.push(currentKey);
  }

  if (source?.sourceName === LIBRARY_MANUAL_EPUB_SOURCE_NAME && cleanText(source.libraryBookId)) {
    const canonicalKey = buildCanonicalManualEpubCacheKey(source);
    if (canonicalKey && canonicalKey !== currentKey) {
      keys.push(canonicalKey);
    }
  }

  return keys;
}

async function readFirstAvailableCachedObject(keys = []) {
  let lastError = null;

  for (const key of keys) {
    try {
      const object = await getObjectFromR2(key, LIBRARY_CACHE_BUCKET);
      return {
        key,
        object,
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("No cached object was found for this source.");
}

export function buildLibraryManualUploadKey({ scope = "manual", entityKey = "", fileName = "" } = {}) {
  const safeScope = normalizeManualUploadScope(scope);
  const safeEntityKey = toAsciiSlug(cleanText(entityKey)) || "book";
  const safeFileName =
    toAsciiSlug(
      cleanText(
        fileName ||
          "book"
      ).replace(/\.epub$/i, "")
    ) || "book";

  if (safeScope === "book") {
    return buildCanonicalManualEpubCacheKey({ id: safeEntityKey, fileName: `${safeFileName}.epub` });
  }

  return `library/manual-uploads/${safeScope}/${safeEntityKey}/${safeFileName}.epub`;
}

async function promoteManualUploadedEpubToCanonicalKey({ book, upload = {} } = {}) {
  const safeCurrentKey = cleanText(upload.key || upload.cacheKey);
  if (!book?.id || !safeCurrentKey) {
    return normalizeUploadedManualEpub(upload);
  }

  const normalizedUpload = normalizeUploadedManualEpub(upload);
  const canonicalKey = buildCanonicalManualEpubCacheKey({
    id: book?.id || book,
    fileName: normalizedUpload.fileName,
  });
  if (safeCurrentKey === canonicalKey) {
    return {
      ...normalizedUpload,
      key: canonicalKey,
      cacheKey: canonicalKey,
    };
  }

  try {
    const object = await getObjectFromR2(safeCurrentKey, LIBRARY_CACHE_BUCKET);
    await putObjectToR2(
      canonicalKey,
      Buffer.from(object.bytes),
      normalizedUpload.contentType || object.contentType || "application/epub+zip",
      LIBRARY_CACHE_BUCKET
    );
    await deleteObjectFromR2(safeCurrentKey, LIBRARY_CACHE_BUCKET).catch(() => null);

    return {
      ...normalizedUpload,
      key: canonicalKey,
      cacheKey: canonicalKey,
      contentType: normalizedUpload.contentType || object.contentType || "application/epub+zip",
      bytes: normalizedUpload.bytes ?? object.bytes?.length ?? null,
    };
  } catch {
    return normalizedUpload;
  }
}

function normalizeUploadedManualEpub(upload = {}) {
  const key = cleanText(upload.key || upload.cacheKey);
  if (!key) return null;

  return {
    key,
    cacheKey: key,
    fileName: cleanText(upload.fileName) || null,
    contentType: cleanText(upload.contentType) || "application/epub+zip",
    bytes: upload.bytes == null ? null : Number(upload.bytes) || null,
  };
}

async function queryLibraryBookSources({ db, libraryBookIds = [], activeOnly = false }) {
  const safeIds = (Array.isArray(libraryBookIds) ? libraryBookIds : []).map((id) => cleanText(id)).filter(Boolean);
  if (!safeIds.length) return [];

  let query = db
    .from("library_book_sources")
    .select(LIBRARY_SOURCE_FIELDS.join(", "))
    .in("library_book_id", safeIds)
    .order("is_preferred_read", { ascending: false })
    .order("source_name", { ascending: true });

  if (activeOnly) {
    query = query.eq("source_status", LIBRARY_SOURCE_STATUSES.ACTIVE);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapLibrarySourceRow(row)).filter(Boolean);
}

export async function listLibraryBookSources({ db, libraryBookId, activeOnly = false }) {
  try {
    return await queryLibraryBookSources({ db, libraryBookIds: [libraryBookId], activeOnly });
  } catch (error) {
    if (isMissingLibraryTableError(error, "library_book_sources")) {
      return [];
    }
    throw error;
  }
}

export async function loadLibraryBookSourceMap({ db, libraryBookIds = [], activeOnly = false }) {
  try {
    const rows = await queryLibraryBookSources({ db, libraryBookIds, activeOnly });
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.libraryBookId)) {
        map.set(row.libraryBookId, []);
      }
      map.get(row.libraryBookId).push(row);
    }
    return map;
  } catch (error) {
    if (isMissingLibraryTableError(error, "library_book_sources")) {
      return new Map();
    }
    throw error;
  }
}

async function clearPreferredSourceFlags({ db, libraryBookId, read = false, metadata = false }) {
  const safeBookId = cleanText(libraryBookId);
  if (!safeBookId || (!read && !metadata)) return;

  const payload = {
    updated_at: new Date().toISOString(),
  };
  if (read) payload.is_preferred_read = false;
  if (metadata) payload.is_preferred_metadata = false;

  const { error } = await db.from("library_book_sources").update(payload).eq("library_book_id", safeBookId);
  if (error && !isMissingLibraryTableError(error, "library_book_sources")) {
    throw new Error(error.message || "No se pudo actualizar preferencia de fuentes.");
  }
}

export async function upsertLibraryBookSource({ db, source }) {
  const payload = normalizeLibrarySourceInput(source);
  if (!payload.library_book_id || !payload.source_name) {
    throw new Error("Fuente de biblioteca invalida.");
  }

  const writePayload = { ...payload };
  if (!writePayload.id) {
    delete writePayload.id;
  }

  if (writePayload.is_preferred_read) {
    await clearPreferredSourceFlags({ db, libraryBookId: writePayload.library_book_id, read: true });
  }
  if (writePayload.is_preferred_metadata) {
    await clearPreferredSourceFlags({ db, libraryBookId: writePayload.library_book_id, metadata: true });
  }

  try {
    const { data, error } = await db
      .from("library_book_sources")
      .upsert(writePayload, { onConflict: "library_book_id,source_name,source_role" })
      .select(LIBRARY_SOURCE_FIELDS.join(", "))
      .maybeSingle();

    if (error) {
      throw error;
    }

    return mapLibrarySourceRow(data || writePayload);
  } catch (error) {
    if (isMissingLibraryTableError(error, "library_book_sources")) {
      return mapLibrarySourceRow(writePayload);
    }
    throw new Error(error.message || "No se pudo guardar la fuente del libro.");
  }
}

export function pickPreferredLibraryReadSource({ sources = [], book = null } = {}) {
  const activeReadable = (Array.isArray(sources) ? sources : []).filter(
    (source) => source.readable && source.sourceStatus === LIBRARY_SOURCE_STATUSES.ACTIVE
  );

  const preferred = activeReadable.find((source) => source.isPreferredRead);
  if (preferred) return preferred;

  const manualEpub = activeReadable.find((source) => source.sourceName === LIBRARY_MANUAL_EPUB_SOURCE_NAME);
  if (manualEpub) return manualEpub;

  const epub = activeReadable.find((source) => source.sourceFormat === LIBRARY_SOURCE_FORMATS.EPUB);
  if (epub) return epub;

  const openLibrary = activeReadable.find((source) => source.sourceName === LIBRARY_SOURCE_NAME);
  if (openLibrary) return openLibrary;

  return book && hasLegacyOpenLibraryFallback(book) ? buildLegacyOpenLibrarySource(book) : null;
}

export function sourceHasReadableEpubAsset(source) {
  return Boolean(
    source?.sourceStatus === LIBRARY_SOURCE_STATUSES.ACTIVE &&
      source?.sourceFormat === LIBRARY_SOURCE_FORMATS.EPUB &&
      source?.readable &&
      (cleanText(source.downloadUrl) ||
        (source?.cacheStatus === LIBRARY_SOURCE_CACHE_STATUSES.READY && cleanText(source.cacheKey)))
  );
}

function manualEpubSourceNeedsCanonicalization(source, book) {
  return Boolean(
    source?.sourceName === LIBRARY_MANUAL_EPUB_SOURCE_NAME &&
      cleanText(source?.cacheKey) &&
      book?.id &&
      cleanText(source.cacheKey) !== buildCanonicalManualEpubCacheKey({
        id: book.id,
        metadataJson: source?.metadataJson,
      })
  );
}

export function pickLibraryArchiveFallbackSource({ sources = [], book = null, excludeSourceId = "" } = {}) {
  const safeExcludeId = cleanText(excludeSourceId);
  const candidates = (Array.isArray(sources) ? sources : []).filter((source) => {
    if (safeExcludeId && source.id === safeExcludeId) return false;
    return Boolean(source.embedUrl && source.sourceStatus === LIBRARY_SOURCE_STATUSES.ACTIVE && source.readable);
  });

  const openLibrary = candidates.find((source) => source.sourceName === LIBRARY_SOURCE_NAME);
  if (openLibrary) return openLibrary;
  if (candidates[0]) return candidates[0];

  if (hasLegacyOpenLibraryFallback(book)) {
    return buildLegacyOpenLibrarySource(book);
  }

  return null;
}

export async function syncLibraryBookSources({
  db,
  book,
  manualUploadedEpub = null,
} = {}) {
  if (!book?.id) {
    return {
      sources: [],
      syncError: "Book not found.",
    };
  }

  const existingSources = await listLibraryBookSources({ db, libraryBookId: book.id });
  const existingManualEpubSource =
    existingSources.find(
      (source) =>
        source.sourceName === LIBRARY_MANUAL_EPUB_SOURCE_NAME &&
        source.sourceRole === LIBRARY_SOURCE_ROLES.READ
    ) || null;

  let nextManualUploadedEpub = null;
  const hasManualUploadedEpub = Boolean(cleanText(manualUploadedEpub?.key || manualUploadedEpub?.cacheKey));
  const currentManualFileName =
    cleanText(manualUploadedEpub?.fileName || manualUploadedEpub?.uploadedEpubFileName) ||
    cleanText(existingManualEpubSource?.metadataJson?.fileName) ||
    cleanText(book?.uploadedEpubFileName || book?.uploaded_epub_file_name);
  const canonicalManualKey = buildCanonicalManualEpubCacheKey({
    id: book.id,
    fileName: currentManualFileName,
  });

  if (hasManualUploadedEpub) {
    nextManualUploadedEpub = await promoteManualUploadedEpubToCanonicalKey({
      book,
      upload: manualUploadedEpub,
    });
  } else if (
    cleanText(existingManualEpubSource?.cacheKey) &&
    cleanText(existingManualEpubSource.cacheKey) !== canonicalManualKey
  ) {
    nextManualUploadedEpub = await promoteManualUploadedEpubToCanonicalKey({
      book,
      upload: {
        key: existingManualEpubSource.cacheKey,
        fileName: cleanText(existingManualEpubSource.metadataJson?.fileName),
        contentType: cleanText(existingManualEpubSource.cacheContentType),
        bytes: existingManualEpubSource.cacheBytes,
      },
    });
  }

  let manualEpubSource = existingManualEpubSource;
  if (nextManualUploadedEpub) {
    manualEpubSource = await upsertLibraryBookSource({
      db,
      source: buildManualUploadedEpubSourceInput(book, nextManualUploadedEpub, existingManualEpubSource),
    });
  }

  const refreshedExistingSources = await listLibraryBookSources({ db, libraryBookId: book.id });
  const readableInternalEpub = (refreshedExistingSources.length ? refreshedExistingSources : existingSources).find(
    (source) => sourceHasReadableEpubAsset(source)
  );

  const metadataSourceInput = buildCatalogMetadataSourceInput(book, { preferRead: !readableInternalEpub });
  const metadataSource = metadataSourceInput
    ? await upsertLibraryBookSource({
        db,
        source: metadataSourceInput,
      })
    : null;

  const refreshedSources = await listLibraryBookSources({ db, libraryBookId: book.id });
  const sources = refreshedSources.length ? refreshedSources : [metadataSource, manualEpubSource].filter(Boolean);

  return {
    sources,
    syncError: "",
  };
}

export async function resolvePreferredEpubSource({ db, book, allowSourceSync = false } = {}) {
  if (!book?.id) return null;

  let sources = await listLibraryBookSources({ db, libraryBookId: book.id });
  let epubSource = pickPreferredLibraryReadSource({ sources, book });

  if (
    allowSourceSync &&
    (!sourceHasReadableEpubAsset(epubSource) || manualEpubSourceNeedsCanonicalization(epubSource, book))
  ) {
    const syncResult = await syncLibraryBookSources({ db, book });
    sources = syncResult.sources;
    epubSource = pickPreferredLibraryReadSource({ sources, book });
  }

  return sourceHasReadableEpubAsset(epubSource) ? epubSource : null;
}

export async function resolveLibraryReadPayload({ db, book, allowSourceSync = false } = {}) {
  if (!book?.id) {
    return {
      reader: null,
      sources: [],
      syncError: "Book not found.",
    };
  }

  let sources = await listLibraryBookSources({ db, libraryBookId: book.id });
  let syncError = "";
  if (!sources.length && allowSourceSync) {
    const syncResult = await syncLibraryBookSources({ db, book });
    sources = syncResult.sources;
    syncError = syncResult.syncError;
  }

  if (!sources.length && hasLegacyOpenLibraryFallback(book)) {
    sources = [buildLegacyOpenLibrarySource(book)];
  }

  const preferredSource = pickPreferredLibraryReadSource({ sources, book });
  const fallbackSource = pickLibraryArchiveFallbackSource({
    sources,
    book,
    excludeSourceId: preferredSource?.id,
  });
  const fallbackArchiveIdentifier = resolveArchiveIdentifierFromSource(fallbackSource, book);

    if (sourceHasReadableEpubAsset(preferredSource)) {
        const assetFingerprint =
        preferredSource.sourceName === LIBRARY_MANUAL_EPUB_SOURCE_NAME && cleanText(preferredSource.libraryBookId)
          ? buildCanonicalManualEpubCacheKey(preferredSource)
          : cleanText(preferredSource.cacheKey) ||
            cleanText(preferredSource.sourceIdentifier) ||
            cleanText(preferredSource.id);
      return {
        reader: {
          type: "epub",
          sourceName: preferredSource.sourceName,
          sourceId: preferredSource.id,
          sourceUrl: preferredSource.sourceUrl || preferredSource.readerUrl || "",
          assetFingerprint,
          assetUrl: `/api/library/books/${book.slug}/asset${assetFingerprint ? `?v=${encodeURIComponent(assetFingerprint)}` : ""}`,
          fallback:
            fallbackSource?.embedUrl
              ? {
                  type: "archive_embed",
                  sourceName: fallbackSource.sourceName,
                  sourceId: fallbackSource.id,
                  embedUrl: fallbackSource.embedUrl,
                  readerUrl: fallbackSource.readerUrl || "",
                  internetArchiveIdentifier: fallbackArchiveIdentifier,
                }
              : null,
        },
        sources,
        syncError,
      };
  }

  const archiveSource =
    fallbackSource || (hasLegacyOpenLibraryFallback(book) ? buildLegacyOpenLibrarySource(book) : null);
  if (!archiveSource?.embedUrl && !archiveSource?.readerUrl) {
    return {
      reader: null,
      sources,
      syncError,
    };
  }
  const archiveIdentifier = resolveArchiveIdentifierFromSource(archiveSource, book);
  return {
    reader: {
      type: "archive_embed",
      sourceName: archiveSource?.sourceName || LIBRARY_SOURCE_NAME,
      sourceId: archiveSource?.id || "",
      embedUrl: archiveSource?.embedUrl || buildArchiveEmbedUrl(archiveIdentifier),
      readerUrl: archiveSource?.readerUrl || buildArchiveReaderUrl(archiveIdentifier),
      internetArchiveIdentifier: archiveIdentifier,
      fallback: null,
    },
    sources,
    syncError,
  };
}

function buildRemoteEpubCacheKey(source) {
  const identifier = cleanText(source.sourceIdentifier).replace(/[^a-z0-9/_-]+/gi, "-");
  const fileName =
    cleanText(source.downloadUrl)
      .split("/")
      .at(-1)
      ?.split("?")[0]
      ?.replace(/[^a-z0-9._-]+/gi, "-") || `${toAsciiSlug(identifier || source.libraryBookId || "book")}.epub`;

  return `library/remote-epubs/${identifier || toAsciiSlug(source.libraryBookId || "book")}/${fileName}`;
}

async function updateLibrarySourceCacheState({ db, source, changes = {} }) {
  const safeId = cleanText(source?.id);
  if (!safeId) {
    return {
      ...source,
      ...changes,
    };
  }

  const payload = normalizeLibrarySourceInput({
    ...source,
    ...changes,
    id: safeId,
    libraryBookId: source.libraryBookId,
    sourceName: source.sourceName,
    sourceRole: source.sourceRole,
  });

  try {
    const { data, error } = await db
      .from("library_book_sources")
      .update(payload)
      .eq("id", safeId)
      .select(LIBRARY_SOURCE_FIELDS.join(", "))
      .maybeSingle();

    if (error) {
      throw error;
    }

    return mapLibrarySourceRow(data || payload);
  } catch (error) {
    if (isMissingLibraryTableError(error, "library_book_sources")) {
      return mapLibrarySourceRow(payload);
    }
    throw new Error(error.message || "No se pudo actualizar cache de la fuente.");
  }
}

async function fetchRemoteEpubBinary(source) {
  const response = await fetch(source.downloadUrl, {
    headers: {
      Accept: "application/epub+zip,*/*;q=0.8",
      "User-Agent": getOpenLibraryUserAgent(),
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Remote EPUB download failed with status ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    bytes,
    contentType: cleanText(response.headers.get("content-type")) || "application/epub+zip",
    etag: cleanText(response.headers.get("etag")),
    lastModified: cleanText(response.headers.get("last-modified")),
  };
}

export async function ensureRemoteEpubCache({ db, source, force = false } = {}) {
  if (!source?.downloadUrl) {
    throw new Error("Remote EPUB source has no download URL.");
  }

  if (
    !force &&
    source.cacheStatus === LIBRARY_SOURCE_CACHE_STATUSES.READY &&
    cleanText(source.cacheKey)
  ) {
    return {
      source,
      bytes: null,
      contentType: source.cacheContentType || "application/epub+zip",
      fromCache: true,
    };
  }

  const startedAt = new Date().toISOString();
  let workingSource = await updateLibrarySourceCacheState({
    db,
    source,
    changes: {
      cacheStatus: LIBRARY_SOURCE_CACHE_STATUSES.FETCHING,
      cacheCheckedAt: startedAt,
      cacheError: null,
    },
  });

  try {
    const download = await fetchRemoteEpubBinary(workingSource);
    const cacheKey = cleanText(workingSource.cacheKey) || buildRemoteEpubCacheKey(workingSource);

    try {
      await putObjectToR2(cacheKey, download.bytes, download.contentType, LIBRARY_CACHE_BUCKET);
      workingSource = await updateLibrarySourceCacheState({
        db,
        source: workingSource,
        changes: {
          cacheStatus: LIBRARY_SOURCE_CACHE_STATUSES.READY,
          cacheKey,
          cacheContentType: download.contentType,
          cacheEtag: download.etag || null,
          cacheLastModified: download.lastModified || null,
          cacheBytes: download.bytes.length,
          cacheCheckedAt: startedAt,
          cachedAt: startedAt,
          cacheError: null,
        },
      });

      return {
        source: workingSource,
        bytes: null,
        contentType: download.contentType,
        fromCache: false,
      };
    } catch (cacheError) {
      workingSource = await updateLibrarySourceCacheState({
        db,
        source: workingSource,
        changes: {
          cacheStatus: LIBRARY_SOURCE_CACHE_STATUSES.ERROR,
          cacheKey: cacheKey || null,
          cacheContentType: download.contentType,
          cacheEtag: download.etag || null,
          cacheLastModified: download.lastModified || null,
          cacheBytes: download.bytes.length,
          cacheCheckedAt: startedAt,
          cacheError: cacheError?.message || "R2 cache write failed.",
        },
      });

      return {
        source: workingSource,
        bytes: download.bytes,
        contentType: download.contentType,
        fromCache: false,
      };
    }
  } catch (error) {
    await updateLibrarySourceCacheState({
      db,
      source: workingSource,
      changes: {
        cacheStatus: LIBRARY_SOURCE_CACHE_STATUSES.ERROR,
        cacheCheckedAt: startedAt,
        cacheError: error?.message || "Remote EPUB fetch failed.",
      },
    });
    throw error;
  }
}

export async function loadLibrarySourceAsset({ db, source, force = false } = {}) {
  if (!cleanText(source?.downloadUrl) && !(source?.cacheStatus === LIBRARY_SOURCE_CACHE_STATUSES.READY && cleanText(source?.cacheKey))) {
    throw new Error("No readable asset is available for this source.");
  }

  const candidateCacheKeys = resolveManualEpubCandidateCacheKeys(source);

  if (!force && source.cacheStatus === LIBRARY_SOURCE_CACHE_STATUSES.READY && cleanText(source.cacheKey)) {
    try {
      const { object } = candidateCacheKeys.length
        ? await readFirstAvailableCachedObject(candidateCacheKeys)
        : { object: await getObjectFromR2(source.cacheKey, LIBRARY_CACHE_BUCKET) };
      return {
        bytes: object.bytes,
        contentType: object.contentType || source.cacheContentType || "application/epub+zip",
        source,
      };
    } catch (error) {
      await updateLibrarySourceCacheState({
        db,
        source,
        changes: {
          cacheStatus: LIBRARY_SOURCE_CACHE_STATUSES.ERROR,
          cacheError: error?.message || "R2 cache read failed.",
          cacheCheckedAt: new Date().toISOString(),
        },
      });
    }
  }

  if (!cleanText(source?.downloadUrl) && cleanText(source?.cacheKey)) {
    const { object } = candidateCacheKeys.length
      ? await readFirstAvailableCachedObject(candidateCacheKeys)
      : { object: await getObjectFromR2(source.cacheKey, LIBRARY_CACHE_BUCKET) };
    return {
      bytes: object.bytes,
      contentType: object.contentType || source.cacheContentType || "application/epub+zip",
      source,
    };
  }

  const ensured = await ensureRemoteEpubCache({ db, source, force });
  if (ensured.bytes) {
    return {
      bytes: ensured.bytes,
      contentType: ensured.contentType,
      source: ensured.source,
    };
  }

  if (cleanText(ensured.source?.cacheKey)) {
    const object = await getObjectFromR2(ensured.source.cacheKey, LIBRARY_CACHE_BUCKET);
    return {
      bytes: object.bytes,
      contentType: object.contentType || ensured.source.cacheContentType || "application/epub+zip",
      source: ensured.source,
    };
  }

  throw new Error("No se pudo cargar el EPUB cacheado.");
}

export async function deleteLibrarySourceAsset(source) {
  const cacheKey = cleanText(source?.cacheKey);
  if (!cacheKey) return;

  try {
    await deleteObjectFromR2(cacheKey, LIBRARY_CACHE_BUCKET);
  } catch {
    // Best-effort cleanup.
  }
}
