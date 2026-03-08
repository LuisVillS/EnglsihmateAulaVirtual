import { cleanText, normalizeLanguageCode } from "./normalization.js";

export function isEnglishOnlyLibraryRecord(record) {
  return normalizeLanguageCode(record?.languageCode || record?.language_code) === "eng";
}

export function isReadableOnlineLibraryRecord(record) {
  const ebookAccess = cleanText(record?.ebookAccess || record?.ebook_access).toLowerCase();
  const readableOnline = Boolean(record?.readableOnline ?? record?.readable_online);
  const previewOnly = Boolean(record?.previewOnly ?? record?.preview_only);
  const borrowable = Boolean(record?.borrowable);
  const hasReaderReference = Boolean(
    cleanText(record?.internetArchiveIdentifier || record?.internet_archive_identifier) ||
      cleanText(record?.embedUrl || record?.embed_url)
  );

  return readableOnline && ebookAccess === "public" && !previewOnly && !borrowable && hasReaderReference;
}

export function isStudentVisibleLibraryBook(record) {
  const publishStatus = cleanText(record?.publishStatus || record?.publish_status).toLowerCase() || "published";
  const active = record?.active !== false;
  return active && publishStatus === "published" && isEnglishOnlyLibraryRecord(record) && isReadableOnlineLibraryRecord(record);
}

export function canOpenLibraryReader(record) {
  return isStudentVisibleLibraryBook(record);
}

export function filterStudentVisibleLibraryBooks(records = []) {
  return (Array.isArray(records) ? records : []).filter((record) => isStudentVisibleLibraryBook(record));
}
