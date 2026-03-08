import { LIBRARY_CEFR_LEVELS } from "./constants.js";

const LEADING_ARTICLE_PATTERN = /^(the|a|an)\s+/i;
const PUNCTUATION_PATTERN = /[^\p{L}\p{N}\s]/gu;

export function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

export function normalizeWhitespace(value) {
  return cleanText(value).replace(/\s+/g, " ");
}

export function stripDiacritics(value) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function toAsciiSlug(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function splitTitleAndSubtitle(rawTitle, rawSubtitle = "") {
  const title = normalizeWhitespace(rawTitle);
  const subtitle = normalizeWhitespace(rawSubtitle);
  if (subtitle) {
    return { title, subtitle };
  }

  const separatorIndex = title.indexOf(":");
  if (separatorIndex === -1) {
    return { title, subtitle: "" };
  }

  return {
    title: normalizeWhitespace(title.slice(0, separatorIndex)),
    subtitle: normalizeWhitespace(title.slice(separatorIndex + 1)),
  };
}

export function normalizeTitleForComparison(value, { removeSubtitle = true } = {}) {
  let output = stripDiacritics(value).toLowerCase();
  if (removeSubtitle) {
    output = output.split(":")[0] || output;
  }
  output = output.replace(PUNCTUATION_PATTERN, " ");
  output = output.replace(LEADING_ARTICLE_PATTERN, "");
  return output.replace(/\s+/g, " ").trim();
}

export function normalizeAuthorForComparison(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(PUNCTUATION_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeOpenLibraryKey(value, prefix) {
  const raw = cleanText(value);
  if (!raw) return "";
  if (raw.startsWith("/")) {
    const pieces = raw.split("/").filter(Boolean);
    if (!pieces.length) return "";
    return pieces.at(-1) || "";
  }
  const normalized = raw.toUpperCase();
  if (!prefix) return normalized;
  return normalized.startsWith(prefix.toUpperCase()) ? normalized : normalized;
}

export function normalizeLanguageCode(value) {
  const raw = cleanText(value)
    .replace(/^\/languages\//i, "")
    .toLowerCase();

  if (!raw) return "";
  if (raw === "eng" || raw === "en" || raw === "english") return "eng";
  if (raw === "spa" || raw === "es" || raw === "spanish") return "spa";
  return raw;
}

export function coerceStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeWhitespace(entry)).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
}

export function normalizeTags(value) {
  return Array.from(
    new Set(
      coerceStringArray(value).map((entry) =>
        stripDiacritics(entry)
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, " ")
          .trim()
      )
    )
  ).filter(Boolean);
}

export function normalizeCefrLevel(value) {
  const raw = cleanText(value).toUpperCase();
  return LIBRARY_CEFR_LEVELS.includes(raw) ? raw : null;
}

export function normalizeCategory(value) {
  return normalizeWhitespace(value);
}

export function isEnglishLanguageCode(value) {
  return normalizeLanguageCode(value) === "eng";
}

export function pickPrimaryAuthor(record) {
  const authors = Array.isArray(record?.authors_json)
    ? record.authors_json
    : Array.isArray(record?.authors)
      ? record.authors
      : [];

  const fromAuthors = authors
    .map((entry) => {
      if (!entry) return "";
      if (typeof entry === "string") return normalizeWhitespace(entry);
      return normalizeWhitespace(entry.name || entry.author || entry.display || "");
    })
    .find(Boolean);

  return fromAuthors || normalizeWhitespace(record?.author_display || "");
}

export function extractDescriptionText(value) {
  if (!value) return "";
  if (typeof value === "string") return normalizeWhitespace(value);
  if (typeof value === "object") {
    return normalizeWhitespace(value.value || value.description || "");
  }
  return "";
}

export function buildNormalizedTitleAuthorKey(record) {
  const normalizedTitle =
    normalizeWhitespace(record?.normalized_title) || normalizeTitleForComparison(record?.title || record?.raw_title);
  const normalizedAuthor =
    normalizeWhitespace(record?.normalized_author) || normalizeAuthorForComparison(pickPrimaryAuthor(record));
  const year = cleanText(record?.first_publish_year || "");
  return [normalizedTitle, normalizedAuthor, year].filter(Boolean).join("|");
}

export function buildBookSlug({ title, authorDisplay, workKey, suffix = "" }) {
  const titleSlug = toAsciiSlug(title) || "book";
  const authorSlug = toAsciiSlug(authorDisplay).split("-").slice(0, 3).join("-");
  const workSuffix = cleanText(workKey).toLowerCase().replace(/^ol/i, "").replace(/[^a-z0-9]/g, "");
  const extras = [authorSlug, suffix, workSuffix].filter(Boolean).join("-");
  return [titleSlug, extras].filter(Boolean).join("-").replace(/-{2,}/g, "-");
}
