import { selectPreferredEdition } from "./dedupe.js";
import { hydrateGutenbergCandidate } from "./gutenberg.js";
import { hydrateOpenLibraryCandidate } from "./openlibrary.js";
import { isEnglishOnlyLibraryRecord, isReadableOnlineLibraryRecord } from "./policies.js";
import {
  buildLibraryBookPayloadFromCandidate,
  buildLibraryStagingPayloadFromCandidate,
  createUniqueLibrarySlug,
  getAdminLibraryBookById,
  getLibraryStagingCandidateById,
  listAdminLibraryBooks,
  listLibraryStagingCandidates,
  loadAdminDuplicateGroups,
  mapLibraryBookRow,
  mapLibraryStagingRow,
  upsertLibraryAliases,
} from "./repository.js";
import { getLibraryR2Bucket, deleteObjectFromR2 } from "../r2.js";
import {
  buildNormalizedTitleAuthorKey,
  cleanText,
  normalizeAuthorForComparison,
  normalizeCategory,
  normalizeCefrLevel,
  normalizeTags,
  normalizeTitleForComparison,
  normalizeWhitespace,
  pickPrimaryAuthor,
} from "./normalization.js";
import { deleteLibrarySourceAsset, listLibraryBookSources, syncLibraryBookSources } from "./source-manager.js";

const LIBRARY_UPLOAD_BUCKET = getLibraryR2Bucket();

function getMetadataProviderName(record = {}) {
  return cleanText(
    record?.sourceName ||
      record?.source_name ||
      record?.sourcePayload?.provider ||
      record?.source_payload?.provider
  ).toLowerCase();
}

function isGutenbergProvider(record = {}) {
  return getMetadataProviderName(record) === "gutenberg";
}

function isLegacyOpenLibraryProvider(record = {}) {
  return (
    getMetadataProviderName(record) === "openlibrary" ||
    Boolean(
      cleanText(record?.openlibraryWorkKey || record?.openlibrary_work_key) ||
        cleanText(record?.openlibraryEditionKey || record?.openlibrary_edition_key) ||
        cleanText(record?.internetArchiveIdentifier || record?.internet_archive_identifier)
    )
  );
}

async function hydrateLibraryMetadataCandidate(candidate = {}) {
  if (isGutenbergProvider(candidate)) {
    return hydrateGutenbergCandidate(candidate);
  }

  if (isLegacyOpenLibraryProvider(candidate)) {
    return hydrateOpenLibraryCandidate(candidate);
  }

  return candidate;
}

function normalizeAdminBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function candidateHasRequiredMetadata(candidate) {
  const hasUploadedEpub = Boolean(cleanText(candidate?.uploadedEpubKey || candidate?.uploaded_epub_key));
  return Boolean(
    cleanText(candidate?.title || candidate?.rawTitle) &&
      (hasUploadedEpub ||
        isGutenbergProvider(candidate) ||
        (isEnglishOnlyLibraryRecord(candidate) &&
          isReadableOnlineLibraryRecord(candidate) &&
          (cleanText(candidate?.internetArchiveIdentifier || candidate?.internet_archive_identifier) ||
            cleanText(candidate?.embedUrl || candidate?.embed_url))))
  );
}

function candidateDisallowedForPublish(candidate) {
  if (cleanText(candidate?.uploadedEpubKey || candidate?.uploaded_epub_key)) {
    return false;
  }
  if (isGutenbergProvider(candidate)) {
    return !isEnglishOnlyLibraryRecord(candidate);
  }
  return !isEnglishOnlyLibraryRecord(candidate) || !isReadableOnlineLibraryRecord(candidate);
}

function resolveDuplicateGroupKey(record) {
  const workKey = cleanText(record?.openlibraryWorkKey || record?.openlibrary_work_key);
  if (workKey) return `work:${workKey}`;
  const archiveIdentifier = cleanText(record?.internetArchiveIdentifier || record?.internet_archive_identifier);
  if (archiveIdentifier) return `archive:${archiveIdentifier}`;

  const normalizedTitle =
    cleanText(record?.normalizedTitle || record?.normalized_title) ||
    normalizeTitleForComparison(record?.title || record?.rawTitle || record?.raw_title);
  const normalizedAuthor =
    cleanText(record?.normalizedAuthor || record?.normalized_author) ||
    normalizeAuthorForComparison(record?.authorDisplay || record?.author_display || pickPrimaryAuthor(record));
  const year = cleanText(record?.firstPublishYear || record?.first_publish_year);

  return `title-author:${buildNormalizedTitleAuthorKey({
    normalized_title: normalizedTitle,
    normalized_author: normalizedAuthor,
    first_publish_year: year || null,
  })}`;
}

function toComparableRecord(record) {
  return {
    id: cleanText(record?.id),
    title: record?.title || record?.rawTitle || record?.raw_title,
    raw_title: record?.rawTitle || record?.raw_title || record?.title,
    subtitle: record?.subtitle || "",
    normalized_title:
      record?.normalizedTitle || record?.normalized_title || normalizeTitleForComparison(record?.title || record?.rawTitle),
    normalized_author:
      record?.normalizedAuthor ||
      record?.normalized_author ||
      normalizeAuthorForComparison(record?.authorDisplay || record?.author_display || pickPrimaryAuthor(record)),
    description: record?.description || "",
    author_display: record?.authorDisplay || record?.author_display || "",
    authors_json: Array.isArray(record?.authors) ? record.authors : record?.authors_json || [],
    language_code: cleanText(record?.languageCode || record?.language_code).toLowerCase(),
    cefr_level: cleanText(record?.cefrLevel || record?.cefr_level).toUpperCase() || null,
    category: record?.category || null,
    tags: Array.isArray(record?.tags) ? record.tags : [],
    cover_url: record?.coverUrl || record?.cover_url || null,
    thumbnail_url: record?.thumbnailUrl || record?.thumbnail_url || null,
    source_name:
      cleanText(
        record?.sourceName ||
          record?.source_name ||
          record?.sourcePayload?.provider ||
          record?.source_payload?.provider
      ) || "gutenberg",
    openlibrary_work_key: cleanText(record?.openlibraryWorkKey || record?.openlibrary_work_key),
    openlibrary_edition_key: cleanText(record?.openlibraryEditionKey || record?.openlibrary_edition_key),
    internet_archive_identifier: cleanText(record?.internetArchiveIdentifier || record?.internet_archive_identifier),
    first_publish_year: Number(record?.firstPublishYear || record?.first_publish_year) || null,
    ebook_access: cleanText(record?.ebookAccess || record?.ebook_access).toLowerCase(),
    has_fulltext: Boolean(record?.hasFulltext ?? record?.has_fulltext),
    readable_online: Boolean(record?.readableOnline ?? record?.readable_online),
    preview_only: Boolean(record?.previewOnly ?? record?.preview_only),
    borrowable: Boolean(record?.borrowable),
    reader_url: record?.readerUrl || record?.reader_url || null,
    embed_url: record?.embedUrl || record?.embed_url || null,
    featured: false,
    active: record?.active == null ? true : Boolean(record?.active),
    duplicate_group_key: cleanText(record?.duplicateGroupKey || record?.duplicate_group_key) || resolveDuplicateGroupKey(record),
    source_payload: record?.sourcePayload || record?.source_payload || null,
    source_sync_status: cleanText(record?.sourceSyncStatus || record?.source_sync_status) || "ok",
    source_sync_error: cleanText(record?.sourceSyncError || record?.source_sync_error) || null,
  };
}

function shouldSendToReview(candidate) {
  if (isGutenbergProvider(candidate)) {
    return !isEnglishOnlyLibraryRecord(candidate);
  }
  return (
    !isEnglishOnlyLibraryRecord(candidate) ||
    !isReadableOnlineLibraryRecord(candidate) ||
    !cleanText(candidate?.internetArchiveIdentifier || candidate?.internet_archive_identifier)
  );
}

function normalizeUploadedEpubMetadata(value = {}) {
  const key = cleanText(value.key || value.uploadedEpubKey || value.uploaded_epub_key);
  if (!key) return null;

  return {
    key,
    fileName: cleanText(value.fileName || value.uploadedEpubFileName || value.uploaded_epub_file_name) || null,
    contentType:
      cleanText(value.contentType || value.uploadedEpubContentType || value.uploaded_epub_content_type) ||
      "application/epub+zip",
    bytes:
      value.bytes == null && value.uploadedEpubBytes == null && value.uploaded_epub_bytes == null
        ? null
        : Number(value.bytes ?? value.uploadedEpubBytes ?? value.uploaded_epub_bytes) || null,
  };
}

async function deleteUploadedEpubIfPresent(uploadedEpubKey) {
  const safeKey = cleanText(uploadedEpubKey);
  if (!safeKey) return;

  try {
    await deleteObjectFromR2(safeKey, LIBRARY_UPLOAD_BUCKET);
  } catch {
    // Best-effort cleanup.
  }
}

function findMatchingBooks(books, candidate) {
  const providerBookId = cleanText(
    candidate?.providerBookId || candidate?.provider_book_id || candidate?.sourcePayload?.providerBookId
  );
  const workKey = cleanText(candidate?.openlibraryWorkKey || candidate?.openlibrary_work_key);
  const archiveIdentifier = cleanText(candidate?.internetArchiveIdentifier || candidate?.internet_archive_identifier);
  const titleAuthorKey = buildNormalizedTitleAuthorKey({
    normalized_title:
      candidate?.normalizedTitle || candidate?.normalized_title || normalizeTitleForComparison(candidate?.title || candidate?.rawTitle),
    normalized_author:
      candidate?.normalizedAuthor ||
      candidate?.normalized_author ||
      normalizeAuthorForComparison(candidate?.authorDisplay || candidate?.author_display || pickPrimaryAuthor(candidate)),
    first_publish_year: candidate?.firstPublishYear || candidate?.first_publish_year,
  });

  return books.filter((book) => {
    if (
      providerBookId &&
      cleanText(book.sourcePayload?.providerBookId || book.source_payload?.providerBookId) === providerBookId
    ) {
      return true;
    }
    if (workKey && book.openlibraryWorkKey === workKey) return true;
    if (archiveIdentifier && book.internetArchiveIdentifier === archiveIdentifier) return true;
    if (
      titleAuthorKey &&
      buildNormalizedTitleAuthorKey({
        normalized_title: book.normalizedTitle,
        normalized_author: book.normalizedAuthor,
        first_publish_year: book.firstPublishYear,
      }) === titleAuthorKey
    ) {
      return true;
    }
    return false;
  });
}

function findMatchingStaging(stagingRows, candidate) {
  const providerBookId = cleanText(
    candidate?.providerBookId || candidate?.provider_book_id || candidate?.sourcePayload?.providerBookId
  );
  const workKey = cleanText(candidate?.openlibraryWorkKey || candidate?.openlibrary_work_key);
  const archiveIdentifier = cleanText(candidate?.internetArchiveIdentifier || candidate?.internet_archive_identifier);
  const duplicateGroupKey = resolveDuplicateGroupKey(candidate);

  return stagingRows.filter((row) => {
    if (
      providerBookId &&
      cleanText(row.sourcePayload?.providerBookId || row.source_payload?.providerBookId) === providerBookId
    ) {
      return true;
    }
    if (workKey && row.openlibraryWorkKey === workKey) return true;
    if (archiveIdentifier && row.internetArchiveIdentifier === archiveIdentifier) return true;
    return resolveDuplicateGroupKey(row) === duplicateGroupKey;
  });
}

function summarizeDuplicateWarning({ books = [], stagingRows = [], candidate }) {
  const matchingBooks = findMatchingBooks(books, candidate);
  const matchingStaging = findMatchingStaging(stagingRows, candidate);

  return {
    hasDuplicate: Boolean(matchingBooks.length || matchingStaging.length),
    duplicateGroupKey: resolveDuplicateGroupKey(candidate),
    existingBooks: matchingBooks.slice(0, 3).map((book) => ({
      id: book.id,
      title: book.title,
      authorDisplay: book.authorDisplay,
      slug: book.slug,
    })),
    stagingMatches: matchingStaging.slice(0, 3).map((row) => ({
      id: row.id,
      title: row.rawTitle,
      authorDisplay: row.authorDisplay,
      ingestionStatus: row.ingestionStatus,
    })),
  };
}

async function publishComparableLibraryCandidate({ db, candidate, overrides = {}, stagingId = "" }) {
  if (!candidateHasRequiredMetadata(candidate)) {
    throw new Error("El candidato no cumple los metadatos minimos para publicar.");
  }

  if (candidateDisallowedForPublish(candidate)) {
    throw new Error("Solo se pueden publicar titulos en ingles, publicos y legibles online.");
  }

  const books = await listAdminLibraryBooks({ db });
  const matchingBooks = findMatchingBooks(books, candidate);
  const canonicalBook = selectPreferredEdition(matchingBooks.map((book) => toComparableRecord(book)));
  const nowIso = new Date().toISOString();

  if (canonicalBook?.id) {
    const existingBook = books.find((book) => book.id === canonicalBook.id) || null;
    const updatePayload = mergeCandidateIntoBook(existingBook, candidate, overrides);
    const { data, error } = await db
      .from("library_books")
      .update(updatePayload)
      .eq("id", existingBook.id)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "No se pudo fusionar el libro duplicado.");
    }

    await upsertLibraryAliases({ db, bookId: existingBook.id, record: candidate });
    if (stagingId) {
      await updateStagingStatus(db, stagingId, {
        ingestion_status: "published",
        duplicate_of_book_id: existingBook.id,
        rejection_reason: null,
      });
    }

    const mergedBook = mapLibraryBookRow(data, { includeSource: true });
    await syncLibraryBookSources({
      db,
      book: mergedBook,
      manualUploadedEpub:
        normalizeUploadedEpubMetadata(overrides) || normalizeUploadedEpubMetadata(candidate),
    });

    console.info("library.publish.merge", {
      source: stagingId ? "staging" : "import",
      stagingId: stagingId || null,
      canonicalBookId: existingBook.id,
    });

    return mergedBook;
  }

  const payload = buildLibraryBookPayloadFromCandidate(candidate, overrides);
  const slug = await createUniqueLibrarySlug({
    db,
    title: payload.title,
    authorDisplay: payload.author_display || "",
    workKey: payload.openlibrary_work_key || "",
  });

  const { data, error } = await db
    .from("library_books")
    .insert({
      ...payload,
      slug,
      publish_status: "published",
      active: true,
      published_at: nowIso,
      created_at: nowIso,
    })
    .select("*")
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error(error?.message || "No se pudo publicar el libro.");
  }

  await upsertLibraryAliases({ db, bookId: data.id, record: candidate });
  if (stagingId) {
    await updateStagingStatus(db, stagingId, {
      ingestion_status: "published",
      duplicate_of_book_id: data.id,
      rejection_reason: null,
    });
  }

  const createdBook = mapLibraryBookRow(data, { includeSource: true });
  await syncLibraryBookSources({
    db,
    book: createdBook,
    manualUploadedEpub:
      normalizeUploadedEpubMetadata(overrides) || normalizeUploadedEpubMetadata(candidate),
  });

  console.info("library.publish.create", {
    source: stagingId ? "staging" : "import",
    stagingId: stagingId || null,
    bookId: data.id,
    slug,
  });

  return createdBook;
}

function mergeCandidateIntoBook(existingBook, candidate, overrides = {}) {
  const nowIso = new Date().toISOString();
  const normalizedCandidate = toComparableRecord(candidate);
  const normalizedBook = toComparableRecord(existingBook);
  const preferred = selectPreferredEdition([normalizedBook, normalizedCandidate]);
  const preferCandidate = preferred?.id === normalizedCandidate.id;
  const hasUploadedEpub = Boolean(cleanText(candidate?.uploadedEpubKey || candidate?.uploaded_epub_key));
  const resolvedSourceName =
    cleanText(existingBook.sourceName || normalizedCandidate.source_name) || "gutenberg";
  const shouldPreserveLegacyReadFields = resolvedSourceName === "openlibrary";
  const preferCandidateMetadata = isGutenbergProvider(candidate) || preferCandidate;

  const title = normalizeWhitespace(
    overrides.title ||
      (preferCandidateMetadata ? normalizedCandidate.title || existingBook.title : existingBook.title || normalizedCandidate.title) ||
      "Untitled"
  );
  const subtitle =
    overrides.subtitle != null
      ? normalizeWhitespace(overrides.subtitle)
      : normalizeWhitespace(
          preferCandidateMetadata
            ? normalizedCandidate.subtitle || existingBook.subtitle || ""
            : existingBook.subtitle || normalizedCandidate.subtitle || ""
        );
  const authorDisplay = normalizeWhitespace(
    overrides.authorDisplay ||
      (preferCandidateMetadata
        ? normalizedCandidate.author_display || existingBook.authorDisplay || ""
        : existingBook.authorDisplay || normalizedCandidate.author_display || "")
  );
  const normalizedTitle = normalizeTitleForComparison(title);
  const normalizedAuthor = normalizeAuthorForComparison(authorDisplay || pickPrimaryAuthor(normalizedCandidate));

  return {
    title,
    subtitle: subtitle || null,
    normalized_title: normalizedTitle,
    normalized_author: normalizedAuthor || null,
    description:
      normalizeWhitespace(overrides.description) ||
      normalizeWhitespace(
        preferCandidateMetadata
          ? normalizedCandidate.description || existingBook.description || ""
          : existingBook.description || normalizedCandidate.description || ""
      ) ||
      null,
    author_display: authorDisplay || null,
    authors_json:
      preferCandidateMetadata
        ? normalizedCandidate.authors_json?.length
          ? normalizedCandidate.authors_json
          : existingBook.authors || []
        : existingBook.authors?.length
          ? existingBook.authors
          : normalizedCandidate.authors_json || [],
    language_code: cleanText(existingBook.languageCode || normalizedCandidate.language_code).toLowerCase(),
    cefr_level:
      normalizeCefrLevel(overrides.cefrLevel) ||
      normalizeCefrLevel(existingBook.cefrLevel) ||
      normalizeCefrLevel(normalizedCandidate.cefr_level),
    category:
      normalizeCategory(overrides.category) ||
      normalizeCategory(
        preferCandidateMetadata
          ? normalizedCandidate.category || existingBook.category || ""
          : existingBook.category || normalizedCandidate.category || ""
      ) ||
      null,
    tags:
      overrides.tags != null
        ? normalizeTags(overrides.tags)
        : preferCandidateMetadata
          ? normalizeTags(normalizedCandidate.tags?.length ? normalizedCandidate.tags : existingBook.tags)
          : existingBook.tags?.length
            ? normalizeTags(existingBook.tags)
            : normalizeTags(normalizedCandidate.tags),
    cover_url:
      cleanText(overrides.coverUrl) ||
      cleanText(
        preferCandidateMetadata
          ? normalizedCandidate.cover_url || existingBook.coverUrl || ""
          : existingBook.coverUrl || normalizedCandidate.cover_url || ""
      ) ||
      null,
    thumbnail_url:
      cleanText(
        preferCandidateMetadata
          ? normalizedCandidate.thumbnail_url || existingBook.thumbnailUrl || ""
          : existingBook.thumbnailUrl || normalizedCandidate.thumbnail_url || ""
      ) || null,
    source_name: resolvedSourceName,
    openlibrary_work_key: shouldPreserveLegacyReadFields
      ? cleanText(existingBook.openlibraryWorkKey || normalizedCandidate.openlibrary_work_key) || null
      : cleanText(existingBook.openlibraryWorkKey) || null,
    openlibrary_edition_key:
      shouldPreserveLegacyReadFields
        ? cleanText(
            preferCandidate
              ? normalizedCandidate.openlibrary_edition_key
              : existingBook.openlibraryEditionKey || normalizedCandidate.openlibrary_edition_key
          ) || null
        : cleanText(existingBook.openlibraryEditionKey) || null,
    internet_archive_identifier:
      shouldPreserveLegacyReadFields
        ? cleanText(
            preferCandidate
              ? normalizedCandidate.internet_archive_identifier
              : existingBook.internetArchiveIdentifier || normalizedCandidate.internet_archive_identifier
          ) || null
        : cleanText(existingBook.internetArchiveIdentifier) || null,
    first_publish_year:
      Number(
        preferCandidateMetadata
          ? normalizedCandidate.first_publish_year || existingBook.firstPublishYear
          : existingBook.firstPublishYear || normalizedCandidate.first_publish_year
      ) || null,
    ebook_access: hasUploadedEpub
      ? "internal"
      : cleanText(
          shouldPreserveLegacyReadFields
            ? preferCandidate
              ? normalizedCandidate.ebook_access
              : existingBook.ebookAccess || normalizedCandidate.ebook_access
            : existingBook.ebookAccess
        ) || null,
    has_fulltext: hasUploadedEpub || Boolean(existingBook.hasFulltext || normalizedCandidate.has_fulltext),
    readable_online: hasUploadedEpub || Boolean(existingBook.readableOnline || normalizedCandidate.readable_online),
    preview_only: hasUploadedEpub
      ? false
      : Boolean(
          shouldPreserveLegacyReadFields
            ? preferCandidate
              ? normalizedCandidate.preview_only
              : existingBook.previewOnly
            : existingBook.previewOnly
        ),
    borrowable: hasUploadedEpub ? false : Boolean(existingBook.borrowable || normalizedCandidate.borrowable),
    reader_url:
      shouldPreserveLegacyReadFields
        ? cleanText(
            preferCandidate ? normalizedCandidate.reader_url : existingBook.readerUrl || normalizedCandidate.reader_url
          ) || null
        : cleanText(existingBook.readerUrl) || null,
    embed_url:
      shouldPreserveLegacyReadFields
        ? cleanText(
            preferCandidate ? normalizedCandidate.embed_url : existingBook.embedUrl || normalizedCandidate.embed_url
          ) || null
        : cleanText(existingBook.embedUrl) || null,
    publish_status: "published",
    featured: false,
    active: overrides.active == null ? true : normalizeAdminBoolean(overrides.active, true),
    duplicate_group_key: resolveDuplicateGroupKey(preferred || normalizedBook),
    source_payload: preferCandidate ? normalizedCandidate.source_payload : existingBook.sourcePayload || normalizedCandidate.source_payload,
    metadata_verified_at: nowIso,
    last_embed_check_at:
      cleanText(preferCandidate ? normalizedCandidate.embed_url : existingBook.embedUrl || normalizedCandidate.embed_url)
        ? nowIso
        : existingBook.lastEmbedCheckAt || null,
    source_sync_status: "ok",
    source_sync_error: null,
    updated_at: nowIso,
  };
}

async function updateStagingStatus(db, stagingId, values) {
  const { data, error } = await db
    .from("library_book_staging")
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stagingId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo actualizar staging de biblioteca.");
  }

  return data ? mapLibraryStagingRow(data) : null;
}

export async function importLibraryCandidateToStaging({ db, candidate, overrides = {} }) {
  const hydratedCandidate = {
    ...candidate,
    ...(await hydrateLibraryMetadataCandidate(candidate)),
  };

  const books = await listAdminLibraryBooks({ db });
  const stagingRows = await listLibraryStagingCandidates({ db });
  const matchingBooks = findMatchingBooks(books, hydratedCandidate);
  const matchingStaging = stagingRows.find((row) => {
    if (row.openlibraryWorkKey && row.openlibraryWorkKey === hydratedCandidate.openlibraryWorkKey) return true;
    if (row.internetArchiveIdentifier && row.internetArchiveIdentifier === hydratedCandidate.internetArchiveIdentifier) return true;
    return resolveDuplicateGroupKey(row) === resolveDuplicateGroupKey(hydratedCandidate);
  });

  const duplicateBook = selectPreferredEdition(matchingBooks.map((book) => toComparableRecord(book)));
  const ingestionStatus = cleanText(overrides.ingestionStatus) ||
    (duplicateBook ? "duplicate" : shouldSendToReview(hydratedCandidate) ? "needs_review" : "pending");

  const payload = buildLibraryStagingPayloadFromCandidate(hydratedCandidate, {
    ...overrides,
    ingestionStatus,
    duplicateOfBookId: duplicateBook?.id || null,
  });

  let data = null;
  if (matchingStaging?.id) {
    const response = await db
      .from("library_book_staging")
      .update(payload)
      .eq("id", matchingStaging.id)
      .select("*")
      .maybeSingle();
    data = response.data;
    if (response.error) {
      throw new Error(response.error.message || "No se pudo actualizar candidato de biblioteca.");
    }
  } else {
    const response = await db
      .from("library_book_staging")
      .insert(payload)
      .select("*")
      .maybeSingle();
    data = response.data;
    if (response.error) {
      throw new Error(response.error.message || "No se pudo importar candidato a staging.");
    }
  }

  console.info("library.import", {
    workKey: cleanText(hydratedCandidate.openlibraryWorkKey || hydratedCandidate.openlibrary_work_key),
    archiveIdentifier: cleanText(
      hydratedCandidate.internetArchiveIdentifier || hydratedCandidate.internet_archive_identifier
    ),
    ingestionStatus,
  });

  return data ? mapLibraryStagingRow(data) : null;
}

export async function annotateLibrarySourceCandidates({ db, candidates = [] }) {
  const books = await listAdminLibraryBooks({ db });

  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const duplicateWarning = summarizeDuplicateWarning({ books, stagingRows: [], candidate });
    return {
      ...candidate,
      duplicateWarning,
    };
  });
}

export async function importLibraryCandidatesBulk({ db, candidates = [], overrides = {} }) {
  const imported = [];
  const errors = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    try {
      const book = await publishLibrarySourceCandidate({ db, candidate, overrides });
      if (book?.id) {
        imported.push(book);
      }
    } catch (error) {
      errors.push({
        title: candidate?.title || candidate?.rawTitle || "Unknown title",
        error: error?.message || "No se pudo importar el candidato.",
      });
    }
  }

  return {
    imported,
    errors,
  };
}

export async function publishLibraryStagingCandidate({ db, stagingId, overrides = {} }) {
  const stagingCandidate = await getLibraryStagingCandidateById({ db, id: stagingId });
  if (!stagingCandidate?.id) {
    throw new Error("No se encontro el candidato en staging.");
  }

  const candidate = {
    ...stagingCandidate,
    title: stagingCandidate.rawTitle,
    sourcePayload: stagingCandidate.sourcePayload,
  };

  return publishComparableLibraryCandidate({
    db,
    candidate,
    overrides,
    stagingId: stagingCandidate.id,
  });
}

export async function publishLibrarySourceCandidate({ db, candidate, overrides = {} }) {
  const hydratedCandidate = {
    ...candidate,
    ...(await hydrateLibraryMetadataCandidate(candidate)),
  };

  const normalizedCandidate = {
    ...hydratedCandidate,
    title: hydratedCandidate?.title || hydratedCandidate?.rawTitle,
    sourcePayload: hydratedCandidate?.sourcePayload || hydratedCandidate?.source_payload || null,
  };

  return publishComparableLibraryCandidate({
    db,
    candidate: normalizedCandidate,
    overrides,
  });
}

export async function publishLibraryStagingCandidatesBulk({ db, stagingIds = [], overrides = {} }) {
  const published = [];
  const errors = [];

  for (const stagingId of Array.isArray(stagingIds) ? stagingIds : []) {
    try {
      const book = await publishLibraryStagingCandidate({ db, stagingId, overrides });
      if (book?.id) {
        published.push(book);
      }
    } catch (error) {
      errors.push({
        id: stagingId,
        error: error?.message || "No se pudo publicar el candidato.",
      });
    }
  }

  return {
    published,
    errors,
  };
}

export async function patchLibraryBook({ db, id, changes = {} }) {
  const book = await getAdminLibraryBookById({ db, id });
  if (!book?.id) {
    throw new Error("No se encontro el libro.");
  }

  const title = normalizeWhitespace(changes.title || book.title);
  const subtitle =
    changes.subtitle == null ? normalizeWhitespace(book.subtitle) : normalizeWhitespace(changes.subtitle);
  const authorDisplay =
    changes.authorDisplay == null ? normalizeWhitespace(book.authorDisplay) : normalizeWhitespace(changes.authorDisplay);
  const payload = {
    title,
    subtitle: subtitle || null,
    normalized_title: normalizeTitleForComparison(title),
    normalized_author: normalizeAuthorForComparison(authorDisplay || pickPrimaryAuthor(book)) || null,
    description:
      changes.description == null ? book.description || null : normalizeWhitespace(changes.description) || null,
    author_display: authorDisplay || null,
    cefr_level: changes.cefrLevel == null ? book.cefrLevel || null : normalizeCefrLevel(changes.cefrLevel),
    category: changes.category == null ? book.category || null : normalizeCategory(changes.category) || null,
    tags: changes.tags == null ? normalizeTags(book.tags) : normalizeTags(changes.tags),
    cover_url: changes.coverUrl == null ? book.coverUrl || null : cleanText(changes.coverUrl) || null,
    active: changes.active == null ? Boolean(book.active) : normalizeAdminBoolean(changes.active, true),
    updated_at: new Date().toISOString(),
  };

  if (!payload.active) {
    payload.publish_status = "archived";
  } else if (book.publishStatus === "archived") {
    payload.publish_status = "published";
  }

  const { data, error } = await db
    .from("library_books")
    .update(payload)
    .eq("id", book.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo actualizar el libro.");
  }

  return data ? mapLibraryBookRow(data, { includeSource: true }) : null;
}

export async function bulkUpdateLibraryRecords({ db, scope = "staging", ids = [], changes = {} }) {
  const updated = [];
  const errors = [];

  for (const id of Array.isArray(ids) ? ids : []) {
    try {
      if (scope === "book") {
        if (changes.archive === true || changes.active === false) {
          updated.push(await archiveLibraryBook({ db, id }));
        } else {
          updated.push(await patchLibraryBook({ db, id, changes }));
        }
      } else {
        updated.push(await updateLibraryStagingCandidate({ db, id, changes }));
      }
    } catch (error) {
      errors.push({
        id,
        error: error?.message || "No se pudo actualizar el registro.",
      });
    }
  }

  return {
    updated: updated.filter(Boolean),
    errors,
  };
}

export async function archiveLibraryBook({ db, id }) {
  const book = await getAdminLibraryBookById({ db, id });
  if (!book?.id) {
    throw new Error("No se encontro el libro.");
  }

  const { data, error } = await db
    .from("library_books")
    .update({
      active: false,
      publish_status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", book.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo archivar el libro.");
  }

  return data ? mapLibraryBookRow(data, { includeSource: true }) : null;
}

export async function deleteLibraryBook({ db, id }) {
  const book = await getAdminLibraryBookById({ db, id });
  if (!book?.id) {
    throw new Error("No se encontro el libro.");
  }

  const sources = await listLibraryBookSources({ db, libraryBookId: book.id });
  for (const source of sources) {
    await deleteLibrarySourceAsset(source);
  }

  const { error } = await db.from("library_books").delete().eq("id", book.id);
  if (error) {
    throw new Error(error.message || "No se pudo eliminar el libro.");
  }

  console.info("library.book.delete", { bookId: book.id, slug: book.slug });
  return true;
}

export async function updateLibraryStagingCandidate({ db, id, changes = {} }) {
  const staging = await getLibraryStagingCandidateById({ db, id });
  if (!staging?.id) {
    throw new Error("No se encontro el candidato.");
  }

  const title = normalizeWhitespace(changes.title || staging.rawTitle);
  const authorDisplay =
    changes.authorDisplay == null ? staging.authorDisplay : normalizeWhitespace(changes.authorDisplay);
    const uploadedEpub = normalizeUploadedEpubMetadata(changes.uploadedEpub || changes);
    const nextUploadedEpubKey =
      changes.uploadedEpub == null && changes.uploadedEpubKey == null
        ? cleanText(staging.uploadedEpubKey) || null
        : uploadedEpub?.key || null;

    if (cleanText(staging.uploadedEpubKey) && cleanText(staging.uploadedEpubKey) !== cleanText(nextUploadedEpubKey)) {
      await deleteUploadedEpubIfPresent(staging.uploadedEpubKey);
    }

    const payload = {
    raw_title: title,
    normalized_title: normalizeTitleForComparison(title),
    normalized_author: normalizeAuthorForComparison(authorDisplay || pickPrimaryAuthor(staging)) || null,
    author_display: authorDisplay || null,
    cefr_level: changes.cefrLevel == null ? staging.cefrLevel || null : normalizeCefrLevel(changes.cefrLevel),
    category: changes.category == null ? staging.category || null : normalizeCategory(changes.category) || null,
    tags: changes.tags == null ? normalizeTags(staging.tags) : normalizeTags(changes.tags),
    cover_url: changes.coverUrl == null ? staging.coverUrl || null : cleanText(changes.coverUrl) || null,
      uploaded_epub_key:
        changes.uploadedEpub == null && changes.uploadedEpubKey == null
          ? cleanText(staging.uploadedEpubKey) || null
          : uploadedEpub?.key || null,
      uploaded_epub_file_name:
        changes.uploadedEpub == null && changes.uploadedEpubFileName == null
          ? cleanText(staging.uploadedEpubFileName) || null
          : uploadedEpub?.fileName || null,
      uploaded_epub_content_type:
        changes.uploadedEpub == null && changes.uploadedEpubContentType == null
          ? cleanText(staging.uploadedEpubContentType) || null
          : uploadedEpub?.contentType || null,
      uploaded_epub_bytes:
        changes.uploadedEpub == null && changes.uploadedEpubBytes == null
          ? staging.uploadedEpubBytes ?? null
          : uploadedEpub?.bytes ?? null,
      ingestion_status:
      cleanText(changes.ingestionStatus) || cleanText(staging.ingestionStatus) || "pending",
    rejection_reason:
      changes.rejectionReason == null ? staging.rejectionReason || null : cleanText(changes.rejectionReason) || null,
    duplicate_of_book_id:
      changes.duplicateOfBookId == null
        ? staging.duplicateOfBookId || null
        : cleanText(changes.duplicateOfBookId) || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("library_book_staging")
    .update(payload)
    .eq("id", staging.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo actualizar el staging.");
  }

  if (payload.ingestion_status === "rejected") {
    console.warn("library.reject", {
      stagingId: staging.id,
      reason: payload.rejection_reason || "Sin motivo",
    });
  }

  return data ? mapLibraryStagingRow(data) : null;
}

export async function deleteLibraryStagingCandidate({ db, id }) {
  const staging = await getLibraryStagingCandidateById({ db, id });
  if (!staging?.id) {
    throw new Error("No se encontro el candidato.");
  }

  await deleteUploadedEpubIfPresent(staging.uploadedEpubKey);

  const { error } = await db.from("library_book_staging").delete().eq("id", staging.id);
  if (error) {
    throw new Error(error.message || "No se pudo eliminar el candidato de staging.");
  }

  console.info("library.staging.delete", { stagingId: staging.id });
  return true;
}

export async function recheckLibrarySourceRecord({ db, id, scope = "book" }) {
  const sourceRecord =
    scope === "staging"
      ? await getLibraryStagingCandidateById({ db, id })
      : await getAdminLibraryBookById({ db, id });

  if (!sourceRecord?.id) {
    throw new Error("No se encontro el registro para revalidar.");
  }

  try {
    const refreshed = await hydrateLibraryMetadataCandidate({
      ...sourceRecord,
      title: sourceRecord.title || sourceRecord.rawTitle,
      sourcePayload: sourceRecord.sourcePayload,
    });

    if (scope === "staging") {
      return updateLibraryStagingCandidate({
        db,
        id,
        changes: {
          title: refreshed.title,
          authorDisplay: refreshed.author_display,
          cefrLevel: sourceRecord.cefrLevel,
          category: sourceRecord.category,
          tags: sourceRecord.tags,
          coverUrl: refreshed.cover_url,
          ingestionStatus: shouldSendToReview(refreshed) ? "needs_review" : sourceRecord.ingestionStatus,
        },
      });
    }

    const patched = await patchLibraryBook({
      db,
      id,
      changes: {
        title: sourceRecord.title,
        authorDisplay: sourceRecord.authorDisplay,
        cefrLevel: sourceRecord.cefrLevel,
        category: sourceRecord.category,
        tags: sourceRecord.tags,
        coverUrl: refreshed.cover_url || sourceRecord.coverUrl,
        active: candidateDisallowedForPublish(refreshed) ? false : sourceRecord.active,
      },
    });

    await db
      .from("library_books")
      .update({
        source_name:
          cleanText(refreshed.source_name || sourceRecord.sourceName || sourceRecord.source_name) || "gutenberg",
        openlibrary_work_key: cleanText(refreshed.openlibrary_work_key) || null,
        openlibrary_edition_key: cleanText(refreshed.openlibrary_edition_key) || null,
        internet_archive_identifier: cleanText(refreshed.internet_archive_identifier) || null,
        first_publish_year: Number(refreshed.first_publish_year || sourceRecord.firstPublishYear) || null,
        ebook_access: cleanText(refreshed.ebook_access) || null,
        has_fulltext: Boolean(refreshed.has_fulltext),
        readable_online: Boolean(refreshed.readable_online),
        preview_only: Boolean(refreshed.preview_only),
        borrowable: Boolean(refreshed.borrowable),
        reader_url: cleanText(refreshed.reader_url) || null,
        embed_url: cleanText(refreshed.embed_url) || null,
        source_payload: refreshed.source_payload || null,
        metadata_verified_at: new Date().toISOString(),
        last_embed_check_at: cleanText(refreshed.embed_url) ? new Date().toISOString() : null,
        source_sync_status: candidateDisallowedForPublish(refreshed) ? "stale" : "ok",
        source_sync_error: candidateDisallowedForPublish(refreshed)
          ? "El libro ya no cumple las reglas de publicacion."
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (patched?.id) {
      await syncLibraryBookSources({
        db,
        book: {
          ...patched,
          openlibraryWorkKey: cleanText(refreshed.openlibrary_work_key) || patched.openlibraryWorkKey,
          openlibraryEditionKey: cleanText(refreshed.openlibrary_edition_key) || patched.openlibraryEditionKey,
          internetArchiveIdentifier:
            cleanText(refreshed.internet_archive_identifier) || patched.internetArchiveIdentifier,
          ebookAccess: cleanText(refreshed.ebook_access) || patched.ebookAccess,
          hasFulltext: Boolean(refreshed.has_fulltext),
          readableOnline: Boolean(refreshed.readable_online),
          previewOnly: Boolean(refreshed.preview_only),
          borrowable: Boolean(refreshed.borrowable),
          readerUrl: cleanText(refreshed.reader_url) || patched.readerUrl,
          embedUrl: cleanText(refreshed.embed_url) || patched.embedUrl,
          sourcePayload: refreshed.source_payload || patched.sourcePayload,
        },
        forceStandardRefresh: true,
      });
    }

    console.info("library.recheck", {
      scope,
      id,
      sourceSyncStatus: candidateDisallowedForPublish(refreshed) ? "stale" : "ok",
    });

    return patched;
  } catch (error) {
    const tableName = scope === "staging" ? "library_book_staging" : "library_books";
    await db
      .from(tableName)
      .update({
        source_sync_status: "error",
        source_sync_error: error?.message || "No se pudo revalidar la metadata del libro.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    throw error;
  }
}

async function resolveManualDuplicateGroup({ db, canonicalId, duplicateIds = [], stagingIds = [] }) {
  let canonicalBookId = cleanText(canonicalId);

  const canonicalBook = await getAdminLibraryBookById({ db, id: canonicalBookId });
  if (!canonicalBook?.id) {
    const published = await publishLibraryStagingCandidate({ db, stagingId: canonicalBookId });
    canonicalBookId = published.id;
  }

  const safeDuplicateIds = (Array.isArray(duplicateIds) ? duplicateIds : [])
    .map((value) => cleanText(value))
    .filter(Boolean);
  const safeStagingIds = (Array.isArray(stagingIds) ? stagingIds : [])
    .map((value) => cleanText(value))
    .filter(Boolean);

  for (const duplicateId of safeDuplicateIds) {
    const duplicateBook = await getAdminLibraryBookById({ db, id: duplicateId });
    if (!duplicateBook?.id || duplicateBook.id === canonicalBookId) continue;
    await upsertLibraryAliases({ db, bookId: canonicalBookId, record: duplicateBook });
    await archiveLibraryBook({ db, id: duplicateBook.id });
  }

  for (const stagingId of safeStagingIds) {
    await updateLibraryStagingCandidate({
      db,
      id: stagingId,
      changes: {
        ingestionStatus: "duplicate",
        duplicateOfBookId: canonicalBookId,
      },
    });
  }

  console.info("library.dedupe.merge", {
    canonicalBookId,
    duplicateIds: safeDuplicateIds,
    stagingIds: safeStagingIds,
  });

  return getAdminLibraryBookById({ db, id: canonicalBookId });
}

export async function runLibraryDedupe({ db, canonicalId = "", duplicateIds = [], stagingIds = [] } = {}) {
  if (cleanText(canonicalId)) {
    const book = await resolveManualDuplicateGroup({ db, canonicalId, duplicateIds, stagingIds });
    return {
      canonicalBook: book,
      groups: await loadAdminDuplicateGroups({ db }),
    };
  }

  const groups = await loadAdminDuplicateGroups({ db });

  for (const group of groups) {
    const groupKey = group.groupKey;
    for (const record of group.records) {
      if (record.recordScope === "book") {
        await db
          .from("library_books")
          .update({
            duplicate_group_key: groupKey,
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id);
      } else if (record.recordScope === "staging") {
        const duplicateOfBookId = group.canonical?.recordScope === "book" ? group.canonical.id : null;
        await db
          .from("library_book_staging")
          .update({
            duplicate_group_key: groupKey,
            duplicate_of_book_id: duplicateOfBookId,
            ingestion_status:
              duplicateOfBookId && record.id !== group.canonical?.id ? "duplicate" : record.ingestionStatus || "pending",
            updated_at: new Date().toISOString(),
          })
          .eq("id", record.id);
      }
    }
  }

  console.info("library.dedupe.scan", {
    groups: groups.length,
  });

  return {
    groups: await loadAdminDuplicateGroups({ db }),
  };
}
