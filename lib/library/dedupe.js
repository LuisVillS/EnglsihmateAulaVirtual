import {
  buildNormalizedTitleAuthorKey,
  cleanText,
  normalizeAuthorForComparison,
  normalizeLanguageCode,
  normalizeTitleForComparison,
  pickPrimaryAuthor,
} from "./normalization.js";

export function computeLibraryMetadataScore(record) {
  let score = 0;
  if (cleanText(record?.title || record?.raw_title)) score += 20;
  if (pickPrimaryAuthor(record)) score += 15;
  if (normalizeLanguageCode(record?.language_code) === "eng") score += 20;
  if (record?.readable_online) score += 25;
  if (cleanText(record?.internet_archive_identifier)) score += 15;
  if (cleanText(record?.cover_url || record?.thumbnail_url)) score += 5;
  if (cleanText(record?.description)) score += 5;
  return score;
}

export function buildDuplicateMatchKeys(record) {
  const keys = [];
  const workKey = cleanText(record?.openlibrary_work_key);
  const archiveIdentifier = cleanText(record?.internet_archive_identifier);
  const normalizedTitle = cleanText(record?.normalized_title) || normalizeTitleForComparison(record?.title || record?.raw_title);
  const normalizedAuthor =
    cleanText(record?.normalized_author) || normalizeAuthorForComparison(pickPrimaryAuthor(record));
  const year = cleanText(record?.first_publish_year || "");

  if (workKey) keys.push(`work:${workKey}`);
  if (archiveIdentifier) keys.push(`archive:${archiveIdentifier}`);
  if (normalizedTitle && normalizedAuthor) {
    keys.push(`title-author:${normalizedTitle}|${normalizedAuthor}`);
    if (year) {
      keys.push(`title-author-year:${normalizedTitle}|${normalizedAuthor}|${year}`);
    }
  }
  return Array.from(new Set(keys));
}

export function scorePreferredEdition(record) {
  const breakdown = {
    readableOnline: record?.readable_online ? 1000 : 0,
    publicAccess: cleanText(record?.ebook_access).toLowerCase() === "public" ? 500 : 0,
    english: normalizeLanguageCode(record?.language_code) === "eng" ? 250 : 0,
    hasCover: cleanText(record?.cover_url || record?.thumbnail_url) ? 125 : 0,
    hasArchiveIdentifier: cleanText(record?.internet_archive_identifier) ? 90 : 0,
    hasEmbed: cleanText(record?.embed_url) ? 65 : 0,
    metadata: computeLibraryMetadataScore(record),
    adminPreferred: record?.admin_preferred ? 5000 : 0,
  };

  const score = Object.values(breakdown).reduce((total, part) => total + Number(part || 0), 0);
  return { score, breakdown };
}

export function selectPreferredEdition(records = []) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!list.length) return null;

  return [...list].sort((left, right) => {
    const leftScore = scorePreferredEdition(left).score;
    const rightScore = scorePreferredEdition(right).score;
    if (leftScore !== rightScore) return rightScore - leftScore;

    const leftMetadataScore = Number(left?.metadata_score || 0) || computeLibraryMetadataScore(left);
    const rightMetadataScore = Number(right?.metadata_score || 0) || computeLibraryMetadataScore(right);
    if (leftMetadataScore !== rightMetadataScore) return rightMetadataScore - leftMetadataScore;

    const leftYear = Number(left?.first_publish_year || 9999);
    const rightYear = Number(right?.first_publish_year || 9999);
    if (leftYear !== rightYear) return leftYear - rightYear;

    return String(left?.id || left?.slug || "").localeCompare(String(right?.id || right?.slug || ""));
  })[0];
}

export function detectDuplicateGroups(records = []) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  const keyToRecords = new Map();

  for (const record of list) {
    for (const key of buildDuplicateMatchKeys(record)) {
      const current = keyToRecords.get(key) || [];
      current.push(record);
      keyToRecords.set(key, current);
    }
  }

  const groups = [];
  const seenSignatures = new Set();

  for (const [key, matches] of keyToRecords.entries()) {
    if (!matches || matches.length < 2) continue;
    const uniqueMatches = Array.from(
      new Map(matches.map((match) => [String(match?.id || match?.slug || buildNormalizedTitleAuthorKey(match)), match])).values()
    );
    if (uniqueMatches.length < 2) continue;

    const canonical = selectPreferredEdition(uniqueMatches);
    const signature = uniqueMatches
      .map((match) => String(match?.id || match?.slug || buildNormalizedTitleAuthorKey(match)))
      .sort()
      .join("|");

    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);

    groups.push({
      groupKey: key,
      canonical,
      records: uniqueMatches,
      duplicates: uniqueMatches.filter((match) => String(match?.id || "") !== String(canonical?.id || "")),
    });
  }

  return groups.sort((left, right) => right.records.length - left.records.length);
}
