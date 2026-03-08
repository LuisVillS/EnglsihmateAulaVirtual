import { selectPreferredEdition } from "./dedupe.js";
import { sanitizeLibraryEmbedUrl } from "./embed.js";
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

function normalizeAdminBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function candidateHasRequiredMetadata(candidate) {
  return Boolean(
    cleanText(candidate?.title || candidate?.rawTitle) &&
      cleanText(candidate?.authorDisplay || candidate?.author_display || pickPrimaryAuthor(candidate)) &&
      isEnglishOnlyLibraryRecord(candidate) &&
      isReadableOnlineLibraryRecord(candidate) &&
      (cleanText(candidate?.internetArchiveIdentifier || candidate?.internet_archive_identifier) ||
        cleanText(candidate?.embedUrl || candidate?.embed_url))
  );
}

function candidateDisallowedForPublish(candidate) {
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
    source_name: cleanText(record?.sourceName || record?.source_name) || "openlibrary",
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
  return (
    !isEnglishOnlyLibraryRecord(candidate) ||
    !isReadableOnlineLibraryRecord(candidate) ||
    !cleanText(candidate?.internetArchiveIdentifier || candidate?.internet_archive_identifier)
  );
}

function findMatchingBooks(books, candidate) {
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
  const workKey = cleanText(candidate?.openlibraryWorkKey || candidate?.openlibrary_work_key);
  const archiveIdentifier = cleanText(candidate?.internetArchiveIdentifier || candidate?.internet_archive_identifier);
  const duplicateGroupKey = resolveDuplicateGroupKey(candidate);

  return stagingRows.filter((row) => {
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

function buildSourcePreview(candidate, duplicateWarning) {
  const archiveIdentifier = cleanText(
    candidate?.internetArchiveIdentifier || candidate?.internet_archive_identifier
  );
  const embedUrl = candidate?.readableOnline || candidate?.readable_online
    ? sanitizeLibraryEmbedUrl(candidate?.embedUrl || candidate?.embed_url, archiveIdentifier)
    : "";

  return {
    title: candidate?.title || candidate?.rawTitle || "",
    authorDisplay: candidate?.authorDisplay || candidate?.author_display || "",
    languageCode: cleanText(candidate?.languageCode || candidate?.language_code).toLowerCase(),
    category: candidate?.category || null,
    tags: Array.isArray(candidate?.tags) ? candidate.tags : [],
    ebookAccess: cleanText(candidate?.ebookAccess || candidate?.ebook_access).toLowerCase(),
    readableOnline: Boolean(candidate?.readableOnline ?? candidate?.readable_online),
    previewOnly: Boolean(candidate?.previewOnly ?? candidate?.preview_only),
    borrowable: Boolean(candidate?.borrowable),
    coverUrl: cleanText(candidate?.coverUrl || candidate?.cover_url),
    workKey: cleanText(candidate?.openlibraryWorkKey || candidate?.openlibrary_work_key),
    editionKey: cleanText(candidate?.openlibraryEditionKey || candidate?.openlibrary_edition_key),
    internetArchiveIdentifier: archiveIdentifier,
    embedUrl,
    sourcePayload: candidate?.sourcePayload || candidate?.source_payload || null,
    duplicateWarning,
  };
}

function mergeCandidateIntoBook(existingBook, candidate, overrides = {}) {
  const nowIso = new Date().toISOString();
  const normalizedCandidate = toComparableRecord(candidate);
  const normalizedBook = toComparableRecord(existingBook);
  const preferred = selectPreferredEdition([normalizedBook, normalizedCandidate]);
  const preferCandidate = preferred?.id === normalizedCandidate.id;

  const title = normalizeWhitespace(overrides.title || existingBook.title || normalizedCandidate.title || "Untitled");
  const subtitle =
    overrides.subtitle != null
      ? normalizeWhitespace(overrides.subtitle)
      : normalizeWhitespace(existingBook.subtitle || normalizedCandidate.subtitle || "");
  const authorDisplay = normalizeWhitespace(
    overrides.authorDisplay || existingBook.authorDisplay || normalizedCandidate.author_display || ""
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
      normalizeWhitespace(existingBook.description) ||
      normalizeWhitespace(normalizedCandidate.description) ||
      null,
    author_display: authorDisplay || null,
    authors_json:
      existingBook.authors?.length
        ? existingBook.authors
        : normalizedCandidate.authors_json || [],
    language_code: cleanText(existingBook.languageCode || normalizedCandidate.language_code).toLowerCase(),
    cefr_level:
      normalizeCefrLevel(overrides.cefrLevel) ||
      normalizeCefrLevel(existingBook.cefrLevel) ||
      normalizeCefrLevel(normalizedCandidate.cefr_level),
    category:
      normalizeCategory(overrides.category) ||
      normalizeCategory(existingBook.category) ||
      normalizeCategory(normalizedCandidate.category) ||
      null,
    tags:
      overrides.tags != null
        ? normalizeTags(overrides.tags)
        : existingBook.tags?.length
          ? normalizeTags(existingBook.tags)
          : normalizeTags(normalizedCandidate.tags),
    cover_url:
      cleanText(overrides.coverUrl) ||
      cleanText(existingBook.coverUrl) ||
      cleanText(normalizedCandidate.cover_url) ||
      null,
    thumbnail_url: cleanText(existingBook.thumbnailUrl || normalizedCandidate.thumbnail_url) || null,
    source_name: "openlibrary",
    openlibrary_work_key: cleanText(existingBook.openlibraryWorkKey || normalizedCandidate.openlibrary_work_key) || null,
    openlibrary_edition_key:
      cleanText(
        preferCandidate
          ? normalizedCandidate.openlibrary_edition_key
          : existingBook.openlibraryEditionKey || normalizedCandidate.openlibrary_edition_key
      ) || null,
    internet_archive_identifier:
      cleanText(
        preferCandidate
          ? normalizedCandidate.internet_archive_identifier
          : existingBook.internetArchiveIdentifier || normalizedCandidate.internet_archive_identifier
      ) || null,
    first_publish_year:
      Number(existingBook.firstPublishYear || normalizedCandidate.first_publish_year) || null,
    ebook_access:
      cleanText(preferCandidate ? normalizedCandidate.ebook_access : existingBook.ebookAccess || normalizedCandidate.ebook_access) ||
      null,
    has_fulltext: Boolean(existingBook.hasFulltext || normalizedCandidate.has_fulltext),
    readable_online: Boolean(existingBook.readableOnline || normalizedCandidate.readable_online),
    preview_only: Boolean(preferCandidate ? normalizedCandidate.preview_only : existingBook.previewOnly),
    borrowable: Boolean(existingBook.borrowable || normalizedCandidate.borrowable),
    reader_url:
      cleanText(preferCandidate ? normalizedCandidate.reader_url : existingBook.readerUrl || normalizedCandidate.reader_url) ||
      null,
    embed_url:
      cleanText(preferCandidate ? normalizedCandidate.embed_url : existingBook.embedUrl || normalizedCandidate.embed_url) ||
      null,
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
  const hydratedCandidate = candidate?.openlibraryWorkKey || candidate?.openlibrary_work_key
    ? await hydrateOpenLibraryCandidate(candidate)
    : candidate;

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
  const [books, stagingRows] = await Promise.all([
    listAdminLibraryBooks({ db }),
    listLibraryStagingCandidates({ db }),
  ]);

  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const duplicateWarning = summarizeDuplicateWarning({ books, stagingRows, candidate });
    return {
      ...candidate,
      duplicateWarning,
    };
  });
}

export async function previewLibrarySourceCandidate({ db, candidate }) {
  if (!candidate) {
    throw new Error("candidate es obligatorio.");
  }

  const hydratedCandidate =
    candidate?.openlibraryWorkKey || candidate?.openlibrary_work_key
      ? await hydrateOpenLibraryCandidate(candidate)
      : candidate;

  const [books, stagingRows] = await Promise.all([
    listAdminLibraryBooks({ db }),
    listLibraryStagingCandidates({ db }),
  ]);

  return buildSourcePreview(
    hydratedCandidate,
    summarizeDuplicateWarning({ books, stagingRows, candidate: hydratedCandidate })
  );
}

export async function importLibraryCandidatesBulk({ db, candidates = [], overrides = {} }) {
  const imported = [];
  const errors = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    try {
      const stagingCandidate = await importLibraryCandidateToStaging({ db, candidate, overrides });
      if (stagingCandidate?.id) {
        imported.push(stagingCandidate);
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
    await updateStagingStatus(db, stagingCandidate.id, {
      ingestion_status: "published",
      duplicate_of_book_id: existingBook.id,
      rejection_reason: null,
    });

    console.info("library.publish.merge", {
      stagingId: stagingCandidate.id,
      canonicalBookId: existingBook.id,
    });

    return mapLibraryBookRow(data, { includeSource: true });
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
  await updateStagingStatus(db, stagingCandidate.id, {
    ingestion_status: "published",
    duplicate_of_book_id: data.id,
    rejection_reason: null,
  });

  console.info("library.publish.create", {
    stagingId: stagingCandidate.id,
    bookId: data.id,
    slug,
  });

  return mapLibraryBookRow(data, { includeSource: true });
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

export async function updateLibraryStagingCandidate({ db, id, changes = {} }) {
  const staging = await getLibraryStagingCandidateById({ db, id });
  if (!staging?.id) {
    throw new Error("No se encontro el candidato.");
  }

  const title = normalizeWhitespace(changes.title || staging.rawTitle);
  const authorDisplay =
    changes.authorDisplay == null ? staging.authorDisplay : normalizeWhitespace(changes.authorDisplay);
  const payload = {
    raw_title: title,
    normalized_title: normalizeTitleForComparison(title),
    normalized_author: normalizeAuthorForComparison(authorDisplay || pickPrimaryAuthor(staging)) || null,
    author_display: authorDisplay || null,
    cefr_level: changes.cefrLevel == null ? staging.cefrLevel || null : normalizeCefrLevel(changes.cefrLevel),
    category: changes.category == null ? staging.category || null : normalizeCategory(changes.category) || null,
    tags: changes.tags == null ? normalizeTags(staging.tags) : normalizeTags(changes.tags),
    cover_url: changes.coverUrl == null ? staging.coverUrl || null : cleanText(changes.coverUrl) || null,
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

export async function recheckLibrarySourceRecord({ db, id, scope = "book" }) {
  const sourceRecord =
    scope === "staging"
      ? await getLibraryStagingCandidateById({ db, id })
      : await getAdminLibraryBookById({ db, id });

  if (!sourceRecord?.id) {
    throw new Error("No se encontro el registro para revalidar.");
  }

  try {
    const refreshed = await hydrateOpenLibraryCandidate({
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
        openlibrary_work_key: cleanText(refreshed.openlibrary_work_key) || null,
        openlibrary_edition_key: cleanText(refreshed.openlibrary_edition_key) || null,
        internet_archive_identifier: cleanText(refreshed.internet_archive_identifier) || null,
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
        source_sync_error: error?.message || "No se pudo revalidar con Open Library.",
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
