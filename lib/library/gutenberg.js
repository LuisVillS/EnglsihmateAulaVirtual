import {
  DEFAULT_GUTENBERG_SEARCH_LIMIT,
  LIBRARY_GUTENBERG_SOURCE_NAME,
  getGutenbergApiConfig,
} from "./constants.js";
import {
  cleanText,
  normalizeCategory,
  normalizeLanguageCode,
  normalizeTags,
  normalizeTitleForComparison,
  normalizeWhitespace,
  stripDiacritics,
  splitTitleAndSubtitle,
} from "./normalization.js";

function buildGutenbergBookUrl(bookId) {
  const safeBookId = cleanText(bookId);
  if (!safeBookId) return "";
  return `https://www.gutenberg.org/ebooks/${safeBookId}`;
}

function normalizeGutenbergTitleValue(value) {
  return normalizeWhitespace(String(value || "").replace(/\s*\$[a-z]\s*/gi, ": "));
}

function resolveGutenbergArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeWhitespace(entry))
      .filter(Boolean);
  }
  return [];
}

function mapGutenbergAuthors(authors = []) {
  return resolveGutenbergArray(authors)
    .map((author) => {
      if (!author) return null;
      if (typeof author === "string") {
        return { name: normalizeWhitespace(author) };
      }

      const name = normalizeWhitespace(author.name || author.author || author.display || "");
      if (!name) return null;

      return {
        id: author.id == null ? null : String(author.id),
        name,
        birth_year: author.birth_year ?? null,
        death_year: author.death_year ?? null,
        webpage: cleanText(author.webpage) || null,
        aliases: Array.isArray(author.aliases) ? author.aliases.filter(Boolean) : [],
      };
    })
    .filter(Boolean);
}

function normalizeGutenbergLanguage(value) {
  const languages = resolveGutenbergArray(value);
  if (!languages.length) return "eng";
  return normalizeLanguageCode(languages[0]);
}

function resolveGutenbergDescription(record = {}) {
  return normalizeWhitespace(
    record.summary ||
      record.description ||
      record.excerpt ||
      record.text_preview ||
      record.short_description ||
      ""
  );
}

function buildGutenbergCategory(bookshelves = [], subjects = []) {
  const bookshelf = resolveGutenbergArray(bookshelves)[0];
  if (bookshelf) return normalizeCategory(bookshelf);

  const firstSubject = resolveGutenbergArray(subjects)[0];
  if (!firstSubject) return "";

  const normalized = normalizeWhitespace(firstSubject);
  return normalizeCategory(normalized.split(" -- ")[0] || normalized);
}

function resolveFirstPublishYear(record = {}) {
  const issuedValue = cleanText(record.issued || record.release_date || record.publication_date);
  if (!issuedValue) return null;

  const parsed = Number(String(issuedValue).slice(0, 4));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveGutenbergCoverUrl(record = {}) {
  return (
    cleanText(record.cover_image || record.cover_url) ||
    cleanText(record.formats?.["image/jpeg"]) ||
    null
  );
}

function resolveGutenbergProviderUrl(record = {}, providerBookId = "") {
  return cleanText(
    record.gutenberg_url ||
      record.book_url ||
      record.formats?.["text/html"] ||
      record.formats?.["text/html; charset=utf-8"] ||
      buildGutenbergBookUrl(providerBookId)
  );
}

export function normalizeGutenbergCandidate(record = {}) {
  const providerBookId = cleanText(record.id);
  const { title, subtitle } = splitTitleAndSubtitle(
    normalizeGutenbergTitleValue(record.title || ""),
    normalizeGutenbergTitleValue(record.alternative_title || "")
  );
  const authors = mapGutenbergAuthors(record.authors);
  const authorDisplay = authors.map((author) => author.name).join(", ");
  const subjects = resolveGutenbergArray(record.subjects);
  const bookshelves = resolveGutenbergArray(record.bookshelves);
  const tags = normalizeTags([...bookshelves, ...subjects]);
  const languageCode = normalizeGutenbergLanguage(record.language || record.languages);
  const providerUrl = resolveGutenbergProviderUrl(record, providerBookId);
  const firstPublishYear = resolveFirstPublishYear(record);
  const coverUrl = resolveGutenbergCoverUrl(record);

  return {
    title: title || "Untitled",
    subtitle: subtitle || "",
    description: resolveGutenbergDescription(record),
    author_display: authorDisplay || "Unknown author",
    authors_json: authors,
    language_code: languageCode,
    category: buildGutenbergCategory(bookshelves, subjects),
    tags,
    cover_url: coverUrl,
    thumbnail_url: coverUrl || cleanText(record.thumbnail_url) || null,
    source_name: LIBRARY_GUTENBERG_SOURCE_NAME,
    openlibrary_work_key: null,
    openlibrary_edition_key: null,
    internet_archive_identifier: null,
    first_publish_year: firstPublishYear,
    ebook_access: null,
    has_fulltext: false,
    readable_online: false,
    preview_only: false,
    borrowable: false,
    reader_url: null,
    embed_url: null,
    metadata_score: Number(record.download_count || 0) || 0,
    provider_book_id: providerBookId,
    provider_url: providerUrl || null,
    source_payload: {
      provider: LIBRARY_GUTENBERG_SOURCE_NAME,
      providerBookId,
      providerUrl: providerUrl || null,
      apiUrl: providerBookId ? `/books/${providerBookId}` : null,
      mediaType: cleanText(record.media_type) || null,
      formats: record.formats || null,
      downloadCount: record.download_count == null ? null : Number(record.download_count) || null,
      readingEaseScore:
        record.reading_ease_score == null || record.reading_ease_score === ""
          ? null
          : Number(record.reading_ease_score) || null,
      bookshelves,
      subjects,
      raw: record,
    },
  };
}

function unwrapGutenbergRecord(payload = {}) {
  if (payload && !Array.isArray(payload) && typeof payload === "object") {
    if (Array.isArray(payload.results)) {
      return payload.results[0] || {};
    }
  }

  return payload || {};
}

async function fetchGutenbergApi(pathname, searchParams = {}) {
  const { apiKey, apiHost, baseUrl } = getGutenbergApiConfig();
  if (!apiKey) {
    throw new Error(
      "Gutenberg API credentials are missing. Set GUTENBERG_API_KEY (or RAPIDAPI_KEY) before using admin import."
    );
  }

  const url = new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": apiHost,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Gutenberg API request failed with status ${response.status}.`);
  }

  return response.json();
}

function buildGutenbergSearchVariants(query) {
  const safeQuery = normalizeWhitespace(query);
  if (!safeQuery) return [];

  const variants = [safeQuery];
  const withoutDiacritics = stripDiacritics(safeQuery);
  if (withoutDiacritics && withoutDiacritics !== safeQuery) {
    variants.push(withoutDiacritics);
  }

  const normalizedWords = normalizeTitleForComparison(safeQuery, { removeSubtitle: false });
  if (normalizedWords && !variants.includes(normalizedWords)) {
    variants.push(normalizedWords);
  }

  return variants;
}

function mergeGutenbergCandidates(candidateGroups, limit) {
  const merged = new Map();

  for (const group of candidateGroups) {
    for (const candidate of group) {
      const key = cleanText(candidate.provider_book_id || candidate.providerBookId || candidate.title);
      if (!key || merged.has(key)) continue;
      merged.set(key, candidate);
      if (merged.size >= limit) {
        return Array.from(merged.values());
      }
    }
  }

  return Array.from(merged.values());
}

export async function searchGutenbergCatalog({ query, limit = DEFAULT_GUTENBERG_SEARCH_LIMIT }) {
  const safeQuery = normalizeWhitespace(query);
  if (!safeQuery) return [];

  const safeLimit = Math.max(1, Math.min(60, Number(limit) || DEFAULT_GUTENBERG_SEARCH_LIMIT));
  const queryVariants = buildGutenbergSearchVariants(safeQuery);
  const candidateGroups = [];

  for (const queryVariant of queryVariants) {
    const payload = await fetchGutenbergApi("/books", {
      q: queryVariant,
      page_size: safeLimit,
      languages: "en",
    });

    const results = Array.isArray(payload?.results) ? payload.results : [];
    candidateGroups.push(results.map((record) => normalizeGutenbergCandidate(record)));
  }

  return mergeGutenbergCandidates(candidateGroups, safeLimit);
}

export async function hydrateGutenbergCandidate(candidate = {}) {
  const providerBookId = cleanText(
    candidate.provider_book_id ||
      candidate.providerBookId ||
      candidate.source_payload?.providerBookId ||
      candidate.sourcePayload?.providerBookId
  );

  if (!providerBookId) {
    return {
      ...candidate,
      source_name: cleanText(candidate.source_name || candidate.sourceName) || LIBRARY_GUTENBERG_SOURCE_NAME,
    };
  }

  try {
    const payload = await fetchGutenbergApi(`/books/${providerBookId}`);
    const record = unwrapGutenbergRecord(payload);
    return {
      ...candidate,
      ...normalizeGutenbergCandidate(record),
    };
  } catch {
    return {
      ...candidate,
      source_name: cleanText(candidate.source_name || candidate.sourceName) || LIBRARY_GUTENBERG_SOURCE_NAME,
      provider_book_id: providerBookId,
      provider_url:
        cleanText(candidate.provider_url || candidate.providerUrl) ||
        cleanText(candidate.source_payload?.providerUrl || candidate.sourcePayload?.providerUrl) ||
        buildGutenbergBookUrl(providerBookId),
    };
  }
}
