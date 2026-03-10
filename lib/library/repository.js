import { detectDuplicateGroups } from "./dedupe.js";
import { LIBRARY_GUTENBERG_SOURCE_NAME } from "./constants.js";
import {
  buildBookSlug,
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
import { normalizeLibraryPageCode, normalizeLibraryPageNumber } from "./read-state.js";

const LIBRARY_BOOK_FIELDS = [
  "id",
  "slug",
  "title",
  "subtitle",
  "normalized_title",
  "normalized_author",
  "description",
  "author_display",
  "authors_json",
  "language_code",
  "cefr_level",
  "category",
  "tags",
  "cover_url",
  "thumbnail_url",
  "source_name",
  "openlibrary_work_key",
  "openlibrary_edition_key",
  "internet_archive_identifier",
  "first_publish_year",
  "ebook_access",
  "has_fulltext",
  "readable_online",
  "preview_only",
  "borrowable",
  "reader_url",
  "embed_url",
  "publish_status",
  "featured",
  "active",
  "duplicate_group_key",
  "metadata_verified_at",
  "last_embed_check_at",
  "source_sync_status",
  "source_sync_error",
  "published_at",
  "created_at",
  "updated_at",
];

const LIBRARY_BOOK_ADMIN_FIELDS = [...LIBRARY_BOOK_FIELDS, "source_payload"];

const LIBRARY_STAGING_FIELDS = [
  "id",
  "raw_title",
  "normalized_title",
  "normalized_author",
  "author_display",
  "language_code",
  "cefr_level",
  "category",
  "tags",
  "openlibrary_work_key",
  "openlibrary_edition_key",
  "internet_archive_identifier",
  "first_publish_year",
  "ebook_access",
  "has_fulltext",
  "readable_online",
  "preview_only",
  "borrowable",
  "cover_url",
    "thumbnail_url",
    "reader_url",
    "embed_url",
    "uploaded_epub_key",
    "uploaded_epub_file_name",
    "uploaded_epub_content_type",
    "uploaded_epub_bytes",
    "source_payload",
  "ingestion_status",
  "duplicate_group_key",
  "duplicate_of_book_id",
  "rejection_reason",
  "metadata_score",
  "metadata_verified_at",
  "last_embed_check_at",
  "source_sync_status",
  "source_sync_error",
  "created_at",
  "updated_at",
];

const LIBRARY_USER_STATE_FIELDS = [
  "id",
  "user_id",
  "library_book_id",
  "in_my_library",
  "started_reading",
  "completed",
  "saved_page_number",
  "saved_page_code",
  "last_page_number",
  "last_location",
  "progress_percent",
  "last_opened_at",
  "completed_at",
  "created_at",
  "updated_at",
];

function normalizeBooleanFlag(value, fallback = false) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function resolveDuplicateGroupKey(record) {
  const explicit = cleanText(record?.duplicateGroupKey || record?.duplicate_group_key);
  if (explicit) return explicit;

  const workKey = cleanText(record?.openlibraryWorkKey || record?.openlibrary_work_key);
  if (workKey) return `work:${workKey}`;

  const archiveIdentifier = cleanText(record?.internetArchiveIdentifier || record?.internet_archive_identifier);
  if (archiveIdentifier) return `archive:${archiveIdentifier}`;

  return `title-author:${buildNormalizedTitleAuthorKey({
    normalized_title:
      cleanText(record?.normalizedTitle || record?.normalized_title) ||
      normalizeTitleForComparison(record?.title || record?.rawTitle || record?.raw_title),
    normalized_author:
      cleanText(record?.normalizedAuthor || record?.normalized_author) ||
      normalizeAuthorForComparison(record?.authorDisplay || record?.author_display || pickPrimaryAuthor(record)),
    first_publish_year: record?.firstPublishYear || record?.first_publish_year,
  })}`;
}

function mapAuthors(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") return { name: normalizeWhitespace(entry) };
      const name = normalizeWhitespace(entry.name || entry.author || entry.display || "");
      return name ? { ...entry, name } : null;
    })
    .filter(Boolean);
}

function normalizeStudentLevel(value) {
  const raw = cleanText(value).toUpperCase();
  if (!raw) return "";
  const match = raw.match(/\b(A1|A2|B1|B2|C1|C2)\b/);
  return match?.[1] || "";
}

export function mapLibraryUserStateRow(row) {
  if (!row) return null;
  return {
    id: cleanText(row.id),
    userId: cleanText(row.user_id),
    libraryBookId: cleanText(row.library_book_id),
    inMyLibrary: Boolean(row.in_my_library),
    startedReading: Boolean(row.started_reading),
    completed: Boolean(row.completed),
    savedPageNumber: normalizeLibraryPageNumber(row.saved_page_number),
    savedPageCode: normalizeLibraryPageCode(row.saved_page_code),
    lastPageNumber: normalizeLibraryPageNumber(row.last_page_number),
    lastLocation: cleanText(row.last_location),
    progressPercent:
      row.progress_percent == null || row.progress_percent === ""
        ? null
        : Number(row.progress_percent),
    lastOpenedAt: row.last_opened_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function applyUserState(book, userState = null) {
  return {
    ...book,
    userState,
    inMyLibrary: Boolean(userState?.inMyLibrary),
    startedReading: Boolean(userState?.startedReading),
    completed: Boolean(userState?.completed),
    savedPageNumber: userState?.savedPageNumber ?? null,
    savedPageCode: userState?.savedPageCode || "",
    lastPageNumber: userState?.lastPageNumber ?? null,
    lastLocation: userState?.lastLocation || "",
    progressPercent: userState?.progressPercent ?? null,
    lastOpenedAt: userState?.lastOpenedAt || null,
    completedAt: userState?.completedAt || null,
  };
}

export function mapLibraryBookRow(row, { includeSource = false, userState = null } = {}) {
  if (!row) return null;

  const mapped = {
    id: cleanText(row.id),
    slug: cleanText(row.slug),
    title: normalizeWhitespace(row.title),
    subtitle: normalizeWhitespace(row.subtitle),
    normalizedTitle: normalizeWhitespace(row.normalized_title),
    normalizedAuthor: normalizeWhitespace(row.normalized_author),
    description: normalizeWhitespace(row.description),
    authorDisplay: normalizeWhitespace(row.author_display),
    authors: mapAuthors(row.authors_json),
    languageCode: cleanText(row.language_code).toLowerCase(),
    cefrLevel: cleanText(row.cefr_level).toUpperCase(),
    category: normalizeWhitespace(row.category),
    tags: normalizeTags(row.tags),
    coverUrl: cleanText(row.cover_url),
    thumbnailUrl: cleanText(row.thumbnail_url),
    sourceName: cleanText(row.source_name),
    openlibraryWorkKey: cleanText(row.openlibrary_work_key),
    openlibraryEditionKey: cleanText(row.openlibrary_edition_key),
    internetArchiveIdentifier: cleanText(row.internet_archive_identifier),
    firstPublishYear: Number(row.first_publish_year) || null,
    ebookAccess: cleanText(row.ebook_access).toLowerCase(),
    hasFulltext: Boolean(row.has_fulltext),
    readableOnline: Boolean(row.readable_online),
    previewOnly: Boolean(row.preview_only),
    borrowable: Boolean(row.borrowable),
    readerUrl: cleanText(row.reader_url),
    embedUrl: cleanText(row.embed_url),
    publishStatus: cleanText(row.publish_status) || "published",
    featured: Boolean(row.featured),
    active: Boolean(row.active),
    duplicateGroupKey: cleanText(row.duplicate_group_key),
    metadataVerifiedAt: row.metadata_verified_at || null,
    lastEmbedCheckAt: row.last_embed_check_at || null,
    sourceSyncStatus: cleanText(row.source_sync_status) || "pending",
    sourceSyncError: cleanText(row.source_sync_error),
    publishedAt: row.published_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };

  if (includeSource) {
    mapped.sourcePayload = row.source_payload || null;
  }

  return applyUserState(mapped, userState);
}

export function mapLibraryStagingRow(row) {
  if (!row) return null;
  return {
    id: cleanText(row.id),
    rawTitle: normalizeWhitespace(row.raw_title),
    normalizedTitle: normalizeWhitespace(row.normalized_title),
    normalizedAuthor: normalizeWhitespace(row.normalized_author),
    authorDisplay: normalizeWhitespace(row.author_display),
    languageCode: cleanText(row.language_code).toLowerCase(),
    cefrLevel: cleanText(row.cefr_level).toUpperCase(),
    category: normalizeWhitespace(row.category),
    tags: normalizeTags(row.tags),
    openlibraryWorkKey: cleanText(row.openlibrary_work_key),
    openlibraryEditionKey: cleanText(row.openlibrary_edition_key),
    internetArchiveIdentifier: cleanText(row.internet_archive_identifier),
    firstPublishYear: Number(row.first_publish_year) || null,
    ebookAccess: cleanText(row.ebook_access).toLowerCase(),
    hasFulltext: Boolean(row.has_fulltext),
    readableOnline: Boolean(row.readable_online),
    previewOnly: Boolean(row.preview_only),
    borrowable: Boolean(row.borrowable),
    coverUrl: cleanText(row.cover_url),
      thumbnailUrl: cleanText(row.thumbnail_url),
      readerUrl: cleanText(row.reader_url),
      embedUrl: cleanText(row.embed_url),
      uploadedEpubKey: cleanText(row.uploaded_epub_key),
      uploadedEpubFileName: cleanText(row.uploaded_epub_file_name),
      uploadedEpubContentType: cleanText(row.uploaded_epub_content_type),
      uploadedEpubBytes: row.uploaded_epub_bytes == null ? null : Number(row.uploaded_epub_bytes),
      sourcePayload: row.source_payload || null,
    ingestionStatus: cleanText(row.ingestion_status) || "pending",
    duplicateGroupKey: cleanText(row.duplicate_group_key),
    duplicateOfBookId: cleanText(row.duplicate_of_book_id),
    rejectionReason: cleanText(row.rejection_reason),
    metadataScore: Number(row.metadata_score) || 0,
    metadataVerifiedAt: row.metadata_verified_at || null,
    lastEmbedCheckAt: row.last_embed_check_at || null,
    sourceSyncStatus: cleanText(row.source_sync_status) || "pending",
    sourceSyncError: cleanText(row.source_sync_error),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function getMissingSupabaseRelationName(error) {
  const message = String(error?.message || "");
  const match = message.match(/relation\s+"([^"]+)"/i);
  return match?.[1] || "";
}

export function isMissingLibraryTableError(error, tableName) {
  const missingRelation = getMissingSupabaseRelationName(error);
  return missingRelation.endsWith(tableName);
}

function matchesBookSearch(book, query) {
  const needle = cleanText(query).toLowerCase();
  if (!needle) return true;

  return [
    book.title,
    book.subtitle,
    book.authorDisplay,
    book.category,
    ...book.tags,
  ]
    .map((entry) => cleanText(entry).toLowerCase())
    .some((entry) => entry.includes(needle));
}

export function applyStudentCatalogFilters(books = [], filters = {}) {
  const query = cleanText(filters.q || filters.query).toLowerCase();
  const cefrLevel = normalizeCefrLevel(filters.cefrLevel || filters.cefr_level || filters.cefr);
  const category = normalizeCategory(filters.category);
  const tag = cleanText(filters.tag);

  const filtered = [...books].filter((book) => {
    if (query && !matchesBookSearch(book, query)) return false;
    if (cefrLevel && book.cefrLevel !== cefrLevel) return false;
    if (category && book.category !== category) return false;
    if (tag && !book.tags.includes(tag)) return false;
    return true;
  });

  return filtered.sort((left, right) => {
    const rightTime = Date.parse(right.publishedAt || right.createdAt || 0);
    const leftTime = Date.parse(left.publishedAt || left.createdAt || 0);
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.title.localeCompare(right.title, "en", { sensitivity: "base" });
  });
}

function buildBookAliasSet(record) {
  const aliases = new Set();
  const workKey = cleanText(record.openlibraryWorkKey || record.openlibrary_work_key);
  const editionKey = cleanText(record.openlibraryEditionKey || record.openlibrary_edition_key);
  const archiveIdentifier = cleanText(record.internetArchiveIdentifier || record.internet_archive_identifier);
  const metadataProvider = cleanText(
    record.sourceName ||
      record.source_name ||
      record.sourcePayload?.provider ||
      record.source_payload?.provider
  ).toLowerCase();
  const providerBookId = cleanText(
    record.providerBookId ||
      record.provider_book_id ||
      record.sourcePayload?.providerBookId ||
      record.source_payload?.providerBookId
  );
  if (workKey) aliases.add(`openlibrary_work_key:${workKey}`);
  if (editionKey) aliases.add(`openlibrary_edition_key:${editionKey}`);
  if (archiveIdentifier) aliases.add(`archive_identifier:${archiveIdentifier}`);
  if (metadataProvider && providerBookId) aliases.add(`metadata_provider_id:${metadataProvider}:${providerBookId}`);
  const titleAuthorKey = buildNormalizedTitleAuthorKey({
    normalized_title:
      record.normalizedTitle || record.normalized_title || normalizeTitleForComparison(record.title || record.rawTitle),
    normalized_author:
      record.normalizedAuthor ||
      record.normalized_author ||
      normalizeAuthorForComparison(record.authorDisplay || record.author_display || pickPrimaryAuthor(record)),
    first_publish_year: record.firstPublishYear || record.first_publish_year,
  });
  if (titleAuthorKey) aliases.add(`normalized_title_author:${titleAuthorKey}`);
  return [...aliases];
}

async function loadFavoriteMap(db, userId, bookIds) {
  const safeUserId = cleanText(userId);
  const safeBookIds = (Array.isArray(bookIds) ? bookIds : []).map((id) => cleanText(id)).filter(Boolean);
  if (!safeUserId || !safeBookIds.length) return new Set();

  const { data, error } = await db
    .from("library_book_favorites")
    .select("library_book_id")
    .eq("user_id", safeUserId)
    .in("library_book_id", safeBookIds);

  if (error) {
    throw new Error(error.message || "No se pudieron cargar favoritos de la biblioteca.");
  }

  return new Set((data || []).map((row) => cleanText(row.library_book_id)).filter(Boolean));
}

async function loadLibraryUserStateMap(db, userId, bookIds) {
  const safeUserId = cleanText(userId);
  const safeBookIds = (Array.isArray(bookIds) ? bookIds : []).map((id) => cleanText(id)).filter(Boolean);
  if (!safeUserId || !safeBookIds.length) return new Map();

  const { data, error } = await db
    .from("library_book_user_state")
    .select(LIBRARY_USER_STATE_FIELDS.join(", "))
    .eq("user_id", safeUserId)
    .in("library_book_id", safeBookIds);

  if (error) {
    throw new Error(error.message || "No se pudo cargar el estado de lectura.");
  }

  return new Map(
    (data || [])
      .map((row) => mapLibraryUserStateRow(row))
      .filter(Boolean)
      .map((row) => [row.libraryBookId, row])
  );
}

export async function listPublishedLibraryBooks({ db, userId = "", filters = {} }) {
  const { data, error } = await db
    .from("library_books")
    .select(LIBRARY_BOOK_FIELDS.join(", "))
    .eq("publish_status", "published")
    .eq("active", true)
    .eq("readable_online", true)
    .eq("language_code", "eng")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  const mapped = (data || []).map((row) => mapLibraryBookRow(row));
  const userStateMap = await loadLibraryUserStateMap(db, userId, mapped.map((book) => book.id));
  const withState = mapped.map((book) => applyUserState(book, userStateMap.get(book.id) || null));

  return applyStudentCatalogFilters(withState, filters);
}

export async function getPublishedLibraryBookBySlug({ db, slug, userId = "" }) {
  const safeSlug = cleanText(slug);
  if (!safeSlug) return null;

  const { data, error } = await db
    .from("library_books")
    .select(LIBRARY_BOOK_FIELDS.join(", "))
    .eq("slug", safeSlug)
    .eq("publish_status", "published")
    .eq("active", true)
    .eq("readable_online", true)
    .eq("language_code", "eng")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) return null;

  const userStateMap = await loadLibraryUserStateMap(db, userId, [data.id]);
  return mapLibraryBookRow(data, {
    userState: userStateMap.get(cleanText(data.id)) || null,
  });
}

export async function listRelatedLibraryBooks({ db, book, userId = "", limit = 4 }) {
  if (!book?.id) return [];

  const books = await listPublishedLibraryBooks({ db, userId });
  return books
    .filter((entry) => entry.id !== book.id)
    .map((entry) => {
      let score = 0;
      if (book.category && entry.category === book.category) score += 4;
      if (book.cefrLevel && entry.cefrLevel === book.cefrLevel) score += 3;
      if (book.authorDisplay && entry.authorDisplay === book.authorDisplay) score += 2;
      const sharedTags = entry.tags.filter((tag) => book.tags.includes(tag));
      score += sharedTags.length;
      return { entry, score };
    })
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.entry.title.localeCompare(right.entry.title, "en", { sensitivity: "base" });
    })
    .slice(0, Math.max(1, limit))
    .map((item) => item.entry);
}

export async function recordLibraryReadOpen({ db, userId, libraryBookId }) {
  const safeUserId = cleanText(userId);
  const safeBookId = cleanText(libraryBookId);
  if (!safeUserId || !safeBookId) return null;

  const nowIso = new Date().toISOString();
  const existingState = await getLibraryBookReadState({
    db,
    userId: safeUserId,
    libraryBookId: safeBookId,
  });
  const { data: existingRows, error: existingError } = await db
    .from("library_book_reads")
    .select("id, opened_at, last_seen_at")
    .eq("user_id", safeUserId)
    .eq("library_book_id", safeBookId)
    .order("last_seen_at", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message || "No se pudo registrar apertura de lectura.");
  }

  const latest = existingRows?.[0] || null;
  const withinSessionWindow =
    latest?.id &&
    Date.now() - Date.parse(latest.last_seen_at || latest.opened_at || 0) < 30 * 60 * 1000;

  const touchUserState = async () =>
    upsertLibraryUserState({
      db,
      userId: safeUserId,
      libraryBookId: safeBookId,
      inMyLibrary: existingState?.inMyLibrary,
      startedReading: true,
      completed: existingState?.completed,
      savedPageNumber: existingState?.savedPageNumber,
      savedPageCode: existingState?.savedPageCode,
      lastPageNumber: existingState?.lastPageNumber,
      lastLocation: existingState?.lastLocation,
      progressPercent: existingState?.progressPercent,
      lastOpenedAt: nowIso,
      completedAt: existingState?.completedAt,
      updatedAt: existingState?.updatedAt,
    });

  if (withinSessionWindow) {
    const { data, error } = await db
      .from("library_book_reads")
      .update({ last_seen_at: nowIso })
      .eq("id", latest.id)
      .select("id, opened_at, last_seen_at")
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "No se pudo actualizar analytics de lectura.");
    }

    await touchUserState();

    return data || null;
  }

  const { data, error } = await db
    .from("library_book_reads")
    .insert({
      user_id: safeUserId,
      library_book_id: safeBookId,
      opened_at: nowIso,
      last_seen_at: nowIso,
    })
    .select("id, opened_at, last_seen_at")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo guardar analytics de lectura.");
  }

  await touchUserState();

  return data || null;
}

async function upsertLibraryUserState({
  db,
  userId,
  libraryBookId,
  inMyLibrary,
  startedReading,
  completed,
  savedPageNumber,
  savedPageCode,
  lastPageNumber,
  lastLocation,
  progressPercent,
  lastOpenedAt,
  completedAt,
  updatedAt,
}) {
  const safeUserId = cleanText(userId);
  const safeBookId = cleanText(libraryBookId);
  if (!safeUserId || !safeBookId) {
    throw new Error("Estado de lectura invalido.");
  }

  const payload = {
    user_id: safeUserId,
    library_book_id: safeBookId,
    updated_at: updatedAt || new Date().toISOString(),
  };

  if (inMyLibrary !== undefined) payload.in_my_library = Boolean(inMyLibrary);
  if (startedReading !== undefined) payload.started_reading = Boolean(startedReading);
  if (completed !== undefined) payload.completed = Boolean(completed);
  if (savedPageNumber !== undefined) payload.saved_page_number = normalizeLibraryPageNumber(savedPageNumber);
  if (savedPageCode !== undefined) payload.saved_page_code = normalizeLibraryPageCode(savedPageCode) || null;
  if (lastPageNumber !== undefined) payload.last_page_number = normalizeLibraryPageNumber(lastPageNumber);
  if (lastLocation !== undefined) payload.last_location = cleanText(lastLocation) || null;
  if (progressPercent !== undefined) payload.progress_percent = progressPercent;
  if (lastOpenedAt !== undefined) payload.last_opened_at = lastOpenedAt || null;
  if (completedAt !== undefined) payload.completed_at = completedAt || null;

  const { data, error } = await db
    .from("library_book_user_state")
    .upsert(payload, { onConflict: "user_id,library_book_id" })
    .select(LIBRARY_USER_STATE_FIELDS.join(", "))
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo guardar el estado personal del libro.");
  }

  return data ? mapLibraryUserStateRow(data) : null;
}

export async function getLibraryBookReadState({ db, userId, slug = "", libraryBookId = "" }) {
  let safeBookId = cleanText(libraryBookId);

  if (!safeBookId) {
    const book = await getPublishedLibraryBookBySlug({ db, slug, userId });
    if (!book?.id) return null;
    safeBookId = book.id;
  }

  const stateMap = await loadLibraryUserStateMap(db, userId, [safeBookId]);
  return stateMap.get(safeBookId) || null;
}

export async function setLibraryBookMyLibrary({ db, userId, libraryBookId, inMyLibrary }) {
  const existingState = await getLibraryBookReadState({ db, userId, libraryBookId });

  return upsertLibraryUserState({
    db,
    userId,
    libraryBookId,
    inMyLibrary: Boolean(inMyLibrary),
    startedReading: existingState?.startedReading,
    completed: existingState?.completed,
    savedPageNumber: existingState?.savedPageNumber,
    savedPageCode: existingState?.savedPageCode,
    lastPageNumber: existingState?.lastPageNumber,
    lastLocation: existingState?.lastLocation,
    progressPercent: existingState?.progressPercent,
    lastOpenedAt: existingState?.lastOpenedAt,
    completedAt: existingState?.completedAt,
  });
}

export async function updateLibraryBookProgress({
  db,
  userId,
  libraryBookId,
  lastPageNumber = null,
  lastLocation = "",
  progressPercent = null,
  completed = null,
}) {
  const existingState = await getLibraryBookReadState({ db, userId, libraryBookId });
  const nowIso = new Date().toISOString();
  const safeProgress =
    progressPercent == null || progressPercent === ""
      ? existingState?.progressPercent
      : Number(progressPercent);
  const isCompleted = completed == null ? safeProgress >= 99 : normalizeBooleanFlag(completed, safeProgress >= 99);

  return upsertLibraryUserState({
    db,
    userId,
    libraryBookId,
    inMyLibrary: existingState?.inMyLibrary ?? true,
    startedReading: true,
    completed: isCompleted,
    savedPageNumber: existingState?.savedPageNumber,
    savedPageCode: existingState?.savedPageCode,
    lastPageNumber:
      lastPageNumber == null || lastPageNumber === ""
        ? existingState?.lastPageNumber
        : Math.max(1, Number(lastPageNumber) || 1),
    lastLocation: cleanText(lastLocation) || existingState?.lastLocation,
    progressPercent: safeProgress,
    lastOpenedAt: nowIso,
    completedAt: isCompleted ? nowIso : null,
  });
}

export async function saveLibraryBookPlace({ db, userId, libraryBookId, pageNumber = null, pageCode = undefined }) {
  const normalizedPage = normalizeLibraryPageNumber(pageNumber);
  const normalizedPageCode = normalizeLibraryPageCode(pageCode);
  if (!normalizedPage && !normalizedPageCode) {
    throw new Error("Se necesita una pagina valida o una posicion detectada del lector.");
  }

  const existingState = await getLibraryBookReadState({ db, userId, libraryBookId });
  const nowIso = new Date().toISOString();

  return upsertLibraryUserState({
    db,
    userId,
    libraryBookId,
    inMyLibrary: existingState?.inMyLibrary ?? true,
    startedReading: true,
    completed: existingState?.completed,
    savedPageNumber: normalizedPage,
    savedPageCode: pageCode === undefined ? null : normalizedPageCode,
    lastPageNumber: existingState?.lastPageNumber,
    lastLocation: existingState?.lastLocation,
      progressPercent: existingState?.progressPercent,
      lastOpenedAt: nowIso,
      completedAt: existingState?.completedAt,
      updatedAt: existingState?.updatedAt,
    });
}

export async function clearLibraryBookPlace({ db, userId, libraryBookId }) {
  const existingState = await getLibraryBookReadState({ db, userId, libraryBookId });
  const nowIso = new Date().toISOString();

  return upsertLibraryUserState({
    db,
    userId,
    libraryBookId,
    inMyLibrary: existingState?.inMyLibrary ?? false,
    startedReading: existingState?.startedReading ?? false,
    completed: existingState?.completed ?? false,
    savedPageNumber: null,
    savedPageCode: null,
    lastPageNumber: existingState?.lastPageNumber,
    lastLocation: existingState?.lastLocation,
    progressPercent: existingState?.progressPercent,
    lastOpenedAt: existingState?.lastOpenedAt || nowIso,
    completedAt: existingState?.completedAt,
  });
}

export async function setLibraryFavorite({ db, userId, libraryBookId, favorite }) {
  const safeUserId = cleanText(userId);
  const safeBookId = cleanText(libraryBookId);
  if (!safeUserId || !safeBookId) {
    throw new Error("Favorito invalido.");
  }

  if (favorite) {
    const { error } = await db
      .from("library_book_favorites")
      .upsert(
        {
          user_id: safeUserId,
          library_book_id: safeBookId,
        },
        { onConflict: "user_id,library_book_id" }
      );
    if (error) {
      throw new Error(error.message || "No se pudo guardar favorito.");
    }
    return true;
  }

  const { error } = await db
    .from("library_book_favorites")
    .delete()
    .eq("user_id", safeUserId)
    .eq("library_book_id", safeBookId);

  if (error) {
    throw new Error(error.message || "No se pudo quitar favorito.");
  }

  return false;
}

function uniqueSorted(values = []) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    String(left).localeCompare(String(right), "en", { sensitivity: "base" })
  );
}

function sortMyLibraryByRecent(left, right) {
  const rightTime = Date.parse(right.lastOpenedAt || right.updatedAt || right.createdAt || 0);
  const leftTime = Date.parse(left.lastOpenedAt || left.updatedAt || left.createdAt || 0);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  const rightProgress = Number(right.progressPercent || 0);
  const leftProgress = Number(left.progressPercent || 0);
  if (leftProgress !== rightProgress) {
    return rightProgress - leftProgress;
  }

  return left.title.localeCompare(right.title, "en", { sensitivity: "base" });
}

export async function loadStudentLibraryProfile({ db, userId }) {
  const safeUserId = cleanText(userId);
  if (!safeUserId) return null;

  const { data, error } = await db
    .from("profiles")
    .select("id, full_name, course_level")
    .eq("id", safeUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo cargar el perfil del alumno.");
  }

  return data
    ? {
        id: cleanText(data.id),
        fullName: normalizeWhitespace(data.full_name),
        courseLevel: cleanText(data.course_level),
        cefrLevel: normalizeStudentLevel(data.course_level),
      }
    : null;
}

export async function loadStudentLibraryHome({ db, userId, profileLevel = "" }) {
  const books = await listPublishedLibraryBooks({ db, userId });
  const visibleBooks = Array.isArray(books) ? books : [];
  const myLibraryBooks = visibleBooks.filter((book) => book.inMyLibrary || book.startedReading || book.completed);
  const levelCode = normalizeStudentLevel(profileLevel);
  const rowSource = levelCode ? visibleBooks.filter((book) => book.cefrLevel === levelCode) : visibleBooks;
  const groupedByCategory = new Map();

  for (const book of rowSource) {
    const category = cleanText(book.category);
    if (!category) continue;
    if (!groupedByCategory.has(category)) {
      groupedByCategory.set(category, []);
    }
    groupedByCategory.get(category).push(book);
  }

  return {
    filters: {
      cefrOptions: uniqueSorted(visibleBooks.map((book) => book.cefrLevel)),
      categoryOptions: uniqueSorted(visibleBooks.map((book) => book.category)),
      tagOptions: uniqueSorted(visibleBooks.flatMap((book) => book.tags || [])),
    },
    myLibrary: {
      currentlyReading: myLibraryBooks
        .filter((book) => book.startedReading && !book.completed)
        .sort(sortMyLibraryByRecent),
      saved: myLibraryBooks
        .filter((book) => book.inMyLibrary && !book.startedReading && !book.completed)
        .sort(sortMyLibraryByRecent),
      completed: myLibraryBooks
        .filter((book) => book.completed)
        .sort(sortMyLibraryByRecent),
    },
    levelMatchedRows: [...groupedByCategory.entries()]
      .map(([category, categoryBooks]) => ({
        category,
        books: [...categoryBooks].sort((left, right) =>
          left.title.localeCompare(right.title, "en", { sensitivity: "base" })
        ),
      }))
      .filter((row) => row.books.length > 0)
      .sort((left, right) => {
        if (left.books.length !== right.books.length) {
          return right.books.length - left.books.length;
        }
        return left.category.localeCompare(right.category, "en", { sensitivity: "base" });
      }),
  };
}

export async function listAdminLibraryBooks({ db }) {
  const { data, error } = await db
    .from("library_books")
    .select(LIBRARY_BOOK_ADMIN_FIELDS.join(", "))
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapLibraryBookRow(row, { includeSource: true }));
}

export async function getAdminLibraryBookById({ db, id }) {
  const safeId = cleanText(id);
  if (!safeId) return null;

  const { data, error } = await db
    .from("library_books")
    .select(LIBRARY_BOOK_ADMIN_FIELDS.join(", "))
    .eq("id", safeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ? mapLibraryBookRow(data, { includeSource: true }) : null;
}

export async function listLibraryStagingCandidates({ db }) {
  const { data, error } = await db
    .from("library_book_staging")
    .select(LIBRARY_STAGING_FIELDS.join(", "))
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => mapLibraryStagingRow(row));
}

export async function getLibraryStagingCandidateById({ db, id }) {
  const safeId = cleanText(id);
  if (!safeId) return null;

  const { data, error } = await db
    .from("library_book_staging")
    .select(LIBRARY_STAGING_FIELDS.join(", "))
    .eq("id", safeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ? mapLibraryStagingRow(data) : null;
}

export async function loadAdminLibraryOverview({ db }) {
  const books = await listAdminLibraryBooks({ db });

  const duplicateGroups = detectDuplicateGroups(books.map((record) => ({ ...record, recordScope: "book" })));

  return {
      counts: {
        published: books.filter((book) => book.publishStatus === "published" && book.active).length,
        archived: books.filter((book) => book.publishStatus === "archived" || !book.active).length,
        staging: 0,
        pendingReview: 0,
        duplicates: duplicateGroups.length,
      },
      books,
      staging: [],
      duplicateGroups,
    };
}

export async function loadAdminDuplicateGroups({ db }) {
  const books = await listAdminLibraryBooks({ db });

  return detectDuplicateGroups(
    books.map((record) => ({
      ...record,
      recordScope: "book",
    }))
  );
}

export async function createUniqueLibrarySlug({ db, title, authorDisplay = "", workKey = "", excludeId = "" }) {
  const baseSlug = buildBookSlug({ title, authorDisplay, workKey }) || "book";
  let attempt = baseSlug;
  let counter = 2;

  while (true) {
    let query = db.from("library_books").select("id, slug").eq("slug", attempt).limit(1);
    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || "No se pudo validar slug de la biblioteca.");
    }
    if (!data?.length) {
      return attempt;
    }
    attempt = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

export function buildLibraryBookPayloadFromCandidate(candidate, overrides = {}) {
  const hasUploadedEpub = Boolean(cleanText(candidate.uploadedEpubKey || candidate.uploaded_epub_key));
  const readableOnline =
    hasUploadedEpub || Boolean(candidate.readableOnline ?? candidate.readable_online);
  const sourceName =
    cleanText(
      candidate.sourceName ||
        candidate.source_name ||
        candidate.sourcePayload?.provider ||
        candidate.source_payload?.provider
    ) || LIBRARY_GUTENBERG_SOURCE_NAME;
  const title = normalizeWhitespace(overrides.title || candidate.title || candidate.rawTitle || "Untitled");
  const subtitle = normalizeWhitespace(overrides.subtitle || candidate.subtitle || "");
  const authorDisplay = normalizeWhitespace(
    overrides.authorDisplay || candidate.authorDisplay || candidate.author_display || ""
  );
  const normalizedTitle = normalizeTitleForComparison(title);
  const normalizedAuthor = normalizeAuthorForComparison(authorDisplay || pickPrimaryAuthor(candidate));
  const description = normalizeWhitespace(overrides.description || candidate.description || "");
  const category = normalizeCategory(overrides.category || candidate.category || "");
  const tags = normalizeTags(overrides.tags ?? candidate.tags ?? []);
  const cefrLevel = normalizeCefrLevel(overrides.cefrLevel || candidate.cefrLevel);
  const nowIso = new Date().toISOString();
  const duplicateGroupKey = resolveDuplicateGroupKey({
    ...candidate,
    normalizedTitle,
    normalizedAuthor,
  });

  return {
    title,
    subtitle: subtitle || null,
    normalized_title: normalizedTitle,
    normalized_author: normalizedAuthor || null,
    description: description || null,
    author_display: authorDisplay || null,
    authors_json: Array.isArray(candidate.authors)
      ? candidate.authors
      : Array.isArray(candidate.authors_json)
        ? candidate.authors_json
        : [],
    language_code: cleanText(candidate.languageCode || candidate.language_code).toLowerCase(),
    cefr_level: cefrLevel,
    category: category || null,
    tags,
    cover_url: cleanText(overrides.coverUrl || candidate.coverUrl || candidate.cover_url) || null,
    thumbnail_url: cleanText(candidate.thumbnailUrl || candidate.thumbnail_url) || null,
    source_name: sourceName,
    openlibrary_work_key: cleanText(candidate.openlibraryWorkKey || candidate.openlibrary_work_key) || null,
    openlibrary_edition_key: cleanText(candidate.openlibraryEditionKey || candidate.openlibrary_edition_key) || null,
    internet_archive_identifier:
      cleanText(candidate.internetArchiveIdentifier || candidate.internet_archive_identifier) || null,
    first_publish_year: Number(candidate.firstPublishYear || candidate.first_publish_year) || null,
    ebook_access: hasUploadedEpub ? "internal" : cleanText(candidate.ebookAccess || candidate.ebook_access).toLowerCase() || null,
    has_fulltext: hasUploadedEpub || Boolean(candidate.hasFulltext ?? candidate.has_fulltext),
    readable_online: readableOnline,
    preview_only: hasUploadedEpub ? false : Boolean(candidate.previewOnly ?? candidate.preview_only),
    borrowable: hasUploadedEpub ? false : Boolean(candidate.borrowable),
    reader_url: cleanText(candidate.readerUrl || candidate.reader_url) || null,
    embed_url: cleanText(candidate.embedUrl || candidate.embed_url) || null,
    featured: false,
    active: overrides.active == null ? true : normalizeBooleanFlag(overrides.active, true),
    duplicate_group_key: duplicateGroupKey,
    source_payload: candidate.sourcePayload || candidate.source_payload || null,
    metadata_verified_at: nowIso,
    last_embed_check_at: cleanText(candidate.embedUrl || candidate.embed_url) ? nowIso : null,
    source_sync_status: cleanText(candidate.sourceSyncStatus || candidate.source_sync_status) || "ok",
    source_sync_error: cleanText(candidate.sourceSyncError || candidate.source_sync_error) || null,
    published_at: nowIso,
    updated_at: nowIso,
  };
}

export function buildLibraryStagingPayloadFromCandidate(candidate, overrides = {}) {
  const hasUploadedEpub = Boolean(cleanText(candidate.uploadedEpubKey || candidate.uploaded_epub_key));
  const readableOnline =
    hasUploadedEpub || Boolean(candidate.readableOnline ?? candidate.readable_online);
  const title = normalizeWhitespace(overrides.title || candidate.title || candidate.rawTitle || "Untitled");
  const authorDisplay = normalizeWhitespace(
    overrides.authorDisplay || candidate.authorDisplay || candidate.author_display || ""
  );
  const normalizedTitle = normalizeTitleForComparison(title);
  const normalizedAuthor = normalizeAuthorForComparison(authorDisplay || pickPrimaryAuthor(candidate));
  const nowIso = new Date().toISOString();

  const duplicateGroupKey = resolveDuplicateGroupKey({
    ...candidate,
    normalizedTitle,
    normalizedAuthor,
  });

  return {
    raw_title: title,
    normalized_title: normalizedTitle,
    normalized_author: normalizedAuthor || null,
    author_display: authorDisplay || null,
    language_code: cleanText(candidate.languageCode || candidate.language_code).toLowerCase() || null,
    cefr_level: normalizeCefrLevel(overrides.cefrLevel || candidate.cefrLevel),
    category: normalizeCategory(overrides.category || candidate.category || "") || null,
    tags: normalizeTags(overrides.tags ?? candidate.tags ?? []),
    openlibrary_work_key: cleanText(candidate.openlibraryWorkKey || candidate.openlibrary_work_key) || null,
    openlibrary_edition_key: cleanText(candidate.openlibraryEditionKey || candidate.openlibrary_edition_key) || null,
    internet_archive_identifier:
      cleanText(candidate.internetArchiveIdentifier || candidate.internet_archive_identifier) || null,
    first_publish_year: Number(candidate.firstPublishYear || candidate.first_publish_year) || null,
    ebook_access: hasUploadedEpub ? "internal" : cleanText(candidate.ebookAccess || candidate.ebook_access).toLowerCase() || null,
    has_fulltext: hasUploadedEpub || Boolean(candidate.hasFulltext ?? candidate.has_fulltext),
    readable_online: readableOnline,
    preview_only: hasUploadedEpub ? false : Boolean(candidate.previewOnly ?? candidate.preview_only),
    borrowable: hasUploadedEpub ? false : Boolean(candidate.borrowable),
    cover_url: cleanText(overrides.coverUrl || candidate.coverUrl || candidate.cover_url) || null,
      thumbnail_url: cleanText(candidate.thumbnailUrl || candidate.thumbnail_url) || null,
      reader_url: cleanText(candidate.readerUrl || candidate.reader_url) || null,
      embed_url: cleanText(candidate.embedUrl || candidate.embed_url) || null,
      uploaded_epub_key: cleanText(candidate.uploadedEpubKey || candidate.uploaded_epub_key) || null,
      uploaded_epub_file_name:
        cleanText(candidate.uploadedEpubFileName || candidate.uploaded_epub_file_name) || null,
      uploaded_epub_content_type:
        cleanText(candidate.uploadedEpubContentType || candidate.uploaded_epub_content_type) || null,
      uploaded_epub_bytes:
        candidate.uploadedEpubBytes == null && candidate.uploaded_epub_bytes == null
          ? null
          : Number(candidate.uploadedEpubBytes ?? candidate.uploaded_epub_bytes) || null,
      source_payload: candidate.sourcePayload || candidate.source_payload || null,
    ingestion_status: cleanText(overrides.ingestionStatus || candidate.ingestionStatus || "pending"),
    duplicate_group_key: duplicateGroupKey || null,
    duplicate_of_book_id: cleanText(overrides.duplicateOfBookId || candidate.duplicateOfBookId) || null,
    rejection_reason: cleanText(overrides.rejectionReason || candidate.rejectionReason) || null,
    metadata_score: Number(candidate.metadataScore || candidate.metadata_score) || 0,
    metadata_verified_at: nowIso,
    last_embed_check_at: cleanText(candidate.embedUrl || candidate.embed_url) ? nowIso : null,
    source_sync_status: cleanText(candidate.sourceSyncStatus || candidate.source_sync_status) || "ok",
    source_sync_error: cleanText(candidate.sourceSyncError || candidate.source_sync_error) || null,
    updated_at: nowIso,
  };
}

export async function upsertLibraryAliases({ db, bookId, record }) {
  const safeBookId = cleanText(bookId);
  if (!safeBookId || !record) return [];

  const aliasRows = buildBookAliasSet(record).map((entry) => {
    const [aliasType, ...rest] = entry.split(":");
    return {
      library_book_id: safeBookId,
      alias_type: aliasType,
      alias_value: rest.join(":"),
    };
  });

  if (!aliasRows.length) return [];

  const { error } = await db.from("library_book_aliases").upsert(aliasRows, { onConflict: "alias_type,alias_value" });
  if (error) {
    throw new Error(error.message || "No se pudieron guardar aliases de biblioteca.");
  }

  return aliasRows;
}
