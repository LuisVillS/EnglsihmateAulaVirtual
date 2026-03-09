export const LIBRARY_SOURCE_NAME = "openlibrary";
export const LIBRARY_MANUAL_EPUB_SOURCE_NAME = "manual_epub";

export const LIBRARY_SOURCE_ROLES = {
  METADATA: "metadata",
  READ: "read",
  AUDIOBOOK: "audiobook",
  HYBRID: "hybrid",
  SUPPLEMENTAL: "supplemental",
};

export const LIBRARY_SOURCE_FORMATS = {
  ARCHIVE_EMBED: "archive_embed",
  EPUB: "epub",
  EXTERNAL_AUDIO: "external_audio",
  CATALOG_RECORD: "catalog_record",
  EXTERNAL_LINK: "external_link",
};

export const LIBRARY_SOURCE_STATUSES = {
  PENDING: "pending",
  ACTIVE: "active",
  NOT_FOUND: "not_found",
  DISABLED: "disabled",
  ERROR: "error",
};

export const LIBRARY_SOURCE_CACHE_STATUSES = {
  NOT_CACHED: "not_cached",
  FETCHING: "fetching",
  READY: "ready",
  ERROR: "error",
};

export const LIBRARY_ALLOWED_EMBED_HOSTS = new Set(["archive.org", "www.archive.org"]);

export const LIBRARY_CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"];

export const LIBRARY_PUBLISH_STATUSES = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
};

export const LIBRARY_STAGING_STATUSES = {
  PENDING: "pending",
  NEEDS_REVIEW: "needs_review",
  APPROVED: "approved",
  DUPLICATE: "duplicate",
  REJECTED: "rejected",
  PUBLISHED: "published",
};

export const LIBRARY_SYNC_STATUSES = {
  PENDING: "pending",
  OK: "ok",
  STALE: "stale",
  ERROR: "error",
};

export const OPEN_LIBRARY_SEARCH_FIELDS = [
  "key",
  "title",
  "subtitle",
  "author_name",
  "language",
  "cover_i",
  "ebook_access",
  "has_fulltext",
  "ia",
  "availability",
  "first_publish_year",
  "editions",
].join(",");

export const DEFAULT_OPEN_LIBRARY_SEARCH_LIMIT = 24;
export const DEFAULT_STANDARD_EBOOKS_MATCH_LIMIT = 12;

export function getOpenLibraryUserAgent() {
  const contactEmail = String(
    process.env.OPEN_LIBRARY_CONTACT_EMAIL ||
      process.env.LIBRARY_CONTACT_EMAIL ||
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
      "support@englishmate.app"
  ).trim();

  return `EnglishMateLibrary/1.0 (${contactEmail})`;
}
