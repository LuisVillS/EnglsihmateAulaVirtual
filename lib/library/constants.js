export const LIBRARY_SOURCE_NAME = "openlibrary";

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

export function getOpenLibraryUserAgent() {
  const contactEmail = String(
    process.env.OPEN_LIBRARY_CONTACT_EMAIL ||
      process.env.LIBRARY_CONTACT_EMAIL ||
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
      "support@englishmate.app"
  ).trim();

  return `EnglishMateLibrary/1.0 (${contactEmail})`;
}
