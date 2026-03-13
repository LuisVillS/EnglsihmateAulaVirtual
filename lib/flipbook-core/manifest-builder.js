import { cleanText } from "../library/normalization.js";
import {
  buildCanonicalManualEpubCacheKey,
  loadLibrarySourceAsset,
} from "../library/source-manager.js";
import {
  FLIPBOOK_GENERATOR_VERSION,
  FLIPBOOK_LAYOUT_SLUG,
  resolveFlipbookLayoutProfile,
} from "./layout-profile.js";
import { paginateFlipbookPublication, buildFlipbookManifestId } from "./page-paginator.js";
import { normalizeFlipbookPublication } from "./publication-normalizer.js";
import {
  getFlipbookLayoutProfileBySlug,
  getFlipbookManifestByFingerprint,
  replaceFlipbookManifest,
} from "../flipbook-services/repository.js";

function normalizeCoverUrl(value = "") {
  return cleanText(value);
}

function isSkippedTocEntry(item = null) {
  const href = cleanText(item?.href);
  const label = cleanText(item?.label).toLowerCase();
  const fileName = href.split("#")[0].split("/").pop()?.toLowerCase() || "";
  return (
    /titlepage/i.test(fileName) ||
    /imprint/i.test(fileName) ||
    label === "titlepage" ||
    label === "title page" ||
    label === "imprint"
  );
}

export function resolveFlipbookSourceFingerprint(source = null) {
  if (!source) return "";
  return cleanText(
    source.sourceName === "manual_epub" && cleanText(source.libraryBookId)
      ? buildCanonicalManualEpubCacheKey(source)
      : source.cacheKey || source.sourceIdentifier || source.id
  );
}

export async function ensureFlipbookManifest({ db, book, source } = {}) {
  const layoutProfileRecord = await getFlipbookLayoutProfileBySlug({
    db,
    slug: FLIPBOOK_LAYOUT_SLUG,
  });
  const layoutProfile = resolveFlipbookLayoutProfile(layoutProfileRecord);
  const sourceFingerprint = resolveFlipbookSourceFingerprint(source);

  if (!book?.id || !source?.id || !sourceFingerprint) {
    throw new Error("Flipbook generation requires a readable EPUB source.");
  }

  const existingManifest = await getFlipbookManifestByFingerprint({
    db,
    libraryBookId: book.id,
    sourceFingerprint,
    layoutProfileId: layoutProfile.id,
    includePages: false,
  });
  if (
    existingManifest?.id &&
    existingManifest.manifestVersion === FLIPBOOK_GENERATOR_VERSION &&
    existingManifest.pageCount > 0 &&
    normalizeCoverUrl(existingManifest.metadata?.coverUrl) === normalizeCoverUrl(book.coverUrl || "") &&
    !(Array.isArray(existingManifest.toc) && existingManifest.toc.some((item) => isSkippedTocEntry(item)))
  ) {
    return existingManifest;
  }

  const asset = await loadLibrarySourceAsset({ db, source });
  const normalizedPublication = await normalizeFlipbookPublication({
    epubBytes: asset.bytes,
    coverUrl: book.coverUrl || "",
    fallbackTitle: book.title || "",
    fallbackAuthor: book.authorDisplay || "",
  });
  const manifestId = buildFlipbookManifestId({
    libraryBookId: book.id,
    sourceFingerprint,
    layoutProfileId: layoutProfile.id,
  });
  const manifest = paginateFlipbookPublication({
    normalizedPublication,
    layoutProfile,
    manifestId,
    layoutProfileId: layoutProfile.id,
    sourceFingerprint,
  });

  return replaceFlipbookManifest({
    db,
    libraryBookId: book.id,
    layoutProfileId: layoutProfile.id,
    sourceFingerprint,
    sourceName: source.sourceName || "",
    sourceHash: normalizedPublication.sourceHash,
    manifest,
    includePages: false,
  });
}
