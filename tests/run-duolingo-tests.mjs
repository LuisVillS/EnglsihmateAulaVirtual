import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { buildSessionPlan } from "../lib/duolingo/session-generator.js";
import { computeSpacedRepetitionUpdate, qualityFromAttempt } from "../lib/duolingo/sr.js";
import {
  normalizeStudentCodeCore,
  resolveExistingStudentRecord,
  shouldUpdateStudentProfile,
} from "../lib/duolingo/student-upsert-core.js";
import {
  buildAudioCacheKeyCore,
  isCachedAudioReusable,
  normalizeSpeechTextCore,
} from "../lib/duolingo/audio-cache-core.js";
import { buildWeightedCourseGrade } from "../lib/course-grade.js";
import { detectDuplicateGroups, selectPreferredEdition } from "../lib/library/dedupe.js";
import {
  buildLibraryReaderEmbedUrl,
  isAllowedLibraryEmbedUrl,
  parseLibraryReaderLocation,
  resolveLibraryReaderMode,
  sanitizeLibraryEmbedUrl,
  extractLibraryReaderFragmentMessage,
} from "../lib/library/embed.js";
import {
  buildLibraryBookProgressLabel,
  buildLibraryResumeHint,
  normalizeLibraryPageCode,
  normalizeLibraryPageNumber,
  resolveLibraryResumePage,
  resolveLibraryResumeTarget,
  serializeLibraryReadState,
} from "../lib/library/read-state.js";
import {
  applyLibrarySavedBookmarkState,
  getLibraryBookmarkSavedText,
  getLibraryBookmarkValidationError,
  getLibraryFloatingBookmarkPanelClasses,
  toggleLibraryReaderFullscreen,
} from "../lib/library/reader-ui.js";
import {
  buildLibraryEpubProgressLabel,
  canUseLibraryReaderArrowKeys,
  clampLibraryEpubFontScale,
  flattenLibraryTocItems,
  resolveLibraryEpubDisplayMode,
  resolveLibraryEpubPageKind,
  resolveLibraryEpubPageState,
  resolveLibraryEpubVisiblePageNumbers,
  shouldShowLibraryBookmarkPanel,
} from "../lib/library/epub-reader-ui.js";
import {
  buildLibraryTtsPlaybackQueue,
  normalizeLibraryTtsText,
  resolveLibraryTtsVoice,
  sanitizeLibraryTtsText,
  splitLibraryTtsSentences,
} from "../lib/library/tts.js";
import {
  buildCanonicalManualEpubCacheKey,
  buildLibraryManualUploadKey,
  buildLegacyOpenLibrarySource,
  pickPreferredLibraryReadSource,
  resolveArchiveIdentifierFromSource,
  sourceHasReadableEpubAsset,
} from "../lib/library/source-manager.js";
import { DEFAULT_FLIPBOOK_LAYOUT_PROFILE } from "../lib/flipbook-core/layout-profile.js";
import {
  buildFlipbookVisualWindowKey,
  buildFlipbookPlaceholderPage,
  buildFlipbookPlaceholderPages,
  buildFlipbookRuntimePages,
  canFlipbookAdapterAcceptNavigation,
  expandFlipbookVisualWindowForTts,
  globalToLocalPageIndex,
  isPageIndexInsideVisualWindow,
  localToGlobalPageIndex,
  mergeFlipbookPages,
  resolveFlipbookNeighborPrefetchRange,
  resolveFlipbookVisualWindow,
  resolveInitialFlipbookPageWindow,
  shouldIgnoreFlipbookAdapterEvent,
  shouldShiftFlipbookVisualWindow,
} from "../lib/flipbook-core/page-loading.js";
import {
  buildFlipbookManifestId,
  paginateFlipbookPublication,
} from "../lib/flipbook-core/page-paginator.js";
import {
  buildFlipbookPageChrome,
  FLIPBOOK_VISUAL_STATE_CLOSED_BOOK,
  FLIPBOOK_VISUAL_STATE_READING,
  resolveInitialCanonicalPageIndex,
  resolveFlipbookInitialVisualState,
  resolveFlipbookPresentationMode,
  resolvePrimaryReadingPage,
  resolveResumePageIndex,
  resolveFlipbookStageScale,
  resolveFlipbookVisiblePageNumber,
  resolveFlipbookVisiblePageTotal,
} from "../lib/flipbook-core/presentation.js";
import {
  createFlipbookSessionToken,
  verifyFlipbookSessionToken,
} from "../lib/flipbook-services/session-token.js";
import { normalizeFlipbookPublication } from "../lib/flipbook-core/publication-normalizer.js";
import { normalizeGutenbergCandidate } from "../lib/library/gutenberg.js";
import { buildLibraryBookPayloadFromCandidate as buildBookPayload } from "../lib/library/repository.js";
import {
  canOpenLibraryReader,
  filterStudentVisibleLibraryBooks,
  isReadableOnlineLibraryRecord,
} from "../lib/library/policies.js";

const results = [];

function buildTestEpubBytes() {
  const archive = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
        </rootfiles>
      </container>`),
    "OEBPS/content.opf": strToU8(`<?xml version="1.0" encoding="utf-8"?>
      <package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>Test Flipbook</dc:title>
          <dc:creator>Jane Doe</dc:creator>
        </metadata>
        <manifest>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
          <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml" />
          <item id="imprint" href="imprint.xhtml" media-type="application/xhtml+xml" />
          <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml" />
          <item id="chapter2" href="chapter2.xhtml" media-type="application/xhtml+xml" />
        </manifest>
        <spine>
          <itemref idref="titlepage" />
          <itemref idref="imprint" />
          <itemref idref="chapter1" />
          <itemref idref="chapter2" />
        </spine>
      </package>`),
    "OEBPS/nav.xhtml": strToU8(`<!doctype html>
      <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
        <body>
          <nav epub:type="toc">
            <ol>
              <li><a href="chapter1.xhtml#chapter-1">Chapter 1</a></li>
              <li><a href="chapter2.xhtml#chapter-2">Chapter 2</a></li>
            </ol>
          </nav>
        </body>
      </html>`),
    "OEBPS/titlepage.xhtml": strToU8(`<!doctype html><html><head><title>Titlepage</title></head><body><h1>Title Page</h1></body></html>`),
    "OEBPS/imprint.xhtml": strToU8(`<!doctype html><html><head><title>Imprint</title></head><body><p>Imprint</p></body></html>`),
    "OEBPS/chapter1.xhtml": strToU8(`<!doctype html>
      <html>
        <head><title>Chapter 1</title></head>
        <body>
          <h1 id="chapter-1">Chapter 1</h1>
          <p id="p1">This is the opening paragraph. It is intentionally long enough to be paginated into predictable blocks. Another sentence keeps the paragraph dense.</p>
          <p>This is the second paragraph for chapter one. It continues the same global flow.</p>
        </body>
      </html>`),
    "OEBPS/chapter2.xhtml": strToU8(`<!doctype html>
      <html>
        <head><title>Chapter 2</title></head>
        <body>
          <h1 id="chapter-2">Chapter 2</h1>
          <p>This is the opening paragraph of chapter two. It should map to a later page index without creating filler pages.</p>
        </body>
      </html>`),
  };

  return zipSync(archive, { level: 0 });
}

function createLibraryBook(overrides = {}) {
  return {
    id: overrides.id || `book-${Math.random().toString(36).slice(2, 8)}`,
    title: "Pride and Prejudice",
    authorDisplay: "Jane Austen",
    normalized_title: "pride and prejudice",
    normalized_author: "jane austen",
    language_code: "eng",
    ebook_access: "public",
    readable_online: true,
    preview_only: false,
    borrowable: false,
    internet_archive_identifier: "pride-prejudice-public",
    embed_url: "https://archive.org/embed/pride-prejudice-public",
    publish_status: "published",
    active: true,
    ...overrides,
  };
}

async function run(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

await run("session generator uses only published", () => {
  const plan = buildSessionPlan({
    exercises: [
      { id: "ex-1", type: "image_match", status: "published", content_json: {}, ordering: 1 },
      { id: "ex-2", type: "cloze", status: "draft", content_json: {}, ordering: 2 },
      { id: "ex-3", type: "scramble", status: "published", content_json: {}, ordering: 3 },
    ],
    progressRows: [],
    now: new Date("2026-02-22T12:00:00.000Z"),
  });
  const ids = plan.items.map((item) => item.id);
  assert.equal(ids.includes("ex-2"), false);
});

await run("spaced repetition quality and interval", () => {
  assert.equal(qualityFromAttempt({ isCorrect: true, attempts: 1 }), 5);
  const failed = computeSpacedRepetitionUpdate({
    prevIntervalDays: 7,
    prevEaseFactor: 2.4,
    isCorrect: false,
    attempts: 3,
    now: new Date("2026-02-22T00:00:00.000Z"),
  });
  assert.equal(failed.intervalDays, 1);
});

await run("student upsert core resolves existing without duplicates", () => {
  const record = resolveExistingStudentRecord({
    studentCode: "e20261234",
    idDocument: "44556677",
    records: [
      { id: "A", student_code: "E20261234", id_document: "11223344" },
      { id: "B", student_code: "E20269999", id_document: "44556677" },
    ],
  });
  assert.equal(record.id, "A");
  assert.equal(normalizeStudentCodeCore(" e2026 1234 "), "E20261234");
  assert.equal(
    shouldUpdateStudentProfile({
      existing: {
        student_code: "E20261234",
        id_document: "44556677",
        full_name: "Alice Test",
      },
      incoming: {
        studentCode: "E20261234",
        idDocument: "44556677",
        fullName: "Alice Test",
      },
    }),
    false
  );
});

await run("audio cache core is deterministic and reusable", () => {
  assert.equal(normalizeSpeechTextCore("  How   ARE you? "), "how are you?");
  const keyA = buildAudioCacheKeyCore({
    language: "en",
    voiceId: "voice-1",
    modelId: "model-a",
    text: "How are you?",
  });
  const keyB = buildAudioCacheKeyCore({
    language: "en",
    voiceId: "voice-1",
    modelId: "model-a",
    text: "How are you?",
  });
  assert.equal(keyA, keyB);
  assert.equal(isCachedAudioReusable({ audio_url: "https://cdn.example.com/a.mp3" }), true);
});

await run("course grade promedia pruebas y aplica 50 por ciento admin", () => {
  const summary = buildWeightedCourseGrade({
    baseCourseGrade: 80,
    assignedQuizLessonIds: ["lesson-1", "lesson-2"],
    quizAttemptRows: [
      { lesson_id: "lesson-1", score_percent: 90 },
      { lesson_id: "lesson-2", score_percent: 70 },
    ],
    minQuizWeight: 0.5,
  });

  assert.equal(summary.quizGrade, 80);
  assert.equal(summary.quizWeight, 0.5);
  assert.equal(summary.finalGrade, 80);
});

await run("library filtering keeps only english readable public books", () => {
  const visible = filterStudentVisibleLibraryBooks([
    createLibraryBook({ id: "eng-visible" }),
    createLibraryBook({
      id: "spa-hidden",
      language_code: "spa",
      title: "Orgullo y prejuicio",
      normalized_title: "orgullo y prejuicio",
    }),
    createLibraryBook({
      id: "preview-hidden",
      readable_online: false,
      preview_only: true,
    }),
  ]);

  assert.deepEqual(visible.map((book) => book.id), ["eng-visible"]);
});

await run("gutenberg metadata normalization maps clean admin candidates", () => {
  const candidate = normalizeGutenbergCandidate({
    id: 1342,
    title: "Pride and Prejudice",
    alternative_title: "",
    authors: [{ id: 1, name: "Austen, Jane" }],
    subjects: ["Love stories", "England -- Fiction"],
    bookshelves: ["Best Books Ever Listings"],
    language: "en",
    issued: "1998-01-01T00:00:00.000Z",
    cover_image: "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg",
    download_count: 89234,
  });

  assert.equal(candidate.source_name, "gutenberg");
  assert.equal(candidate.language_code, "eng");
  assert.equal(candidate.author_display, "Austen, Jane");
  assert.equal(candidate.first_publish_year, 1998);
  assert.equal(candidate.provider_book_id, "1342");
  assert.equal(candidate.category, "Best Books Ever Listings");
});

await run("gutenberg imports become student-readable when an epub upload exists", () => {
  const payload = buildBookPayload({
    title: "Pride and Prejudice",
    author_display: "Jane Austen",
    language_code: "eng",
    source_name: "gutenberg",
    uploaded_epub_key: "library/books/book-1/manual.epub",
    source_payload: {
      provider: "gutenberg",
      providerBookId: "1342",
    },
  });

  assert.equal(payload.source_name, "gutenberg");
  assert.equal(payload.readable_online, true);
  assert.equal(payload.ebook_access, "internal");
  assert.equal(payload.has_fulltext, true);
});

await run("library tts voice mapping and sentence chunking stay deterministic", () => {
  assert.equal(resolveLibraryTtsVoice("jenny").label, "Jenny");
  assert.equal(resolveLibraryTtsVoice("unknown").label, "Alba");
  assert.equal(normalizeLibraryTtsText("  Hello   world.\nHow are you? "), "Hello world. How are you?");
  assert.equal(sanitizeLibraryTtsText("Hello\u0000 world \udc9d again"), "Hello world again");
  assert.deepEqual(splitLibraryTtsSentences("Hello world. How are you?"), [
    "Hello world.",
    "How are you?",
  ]);

  const queue = buildLibraryTtsPlaybackQueue([
    { id: "seg-1", text: "Hello world. How are you?" },
  ]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].segmentId, "seg-1");
  assert.equal(queue[0].highlightMode, "paragraph");
});

await run("admin import search keeps only readable source candidates", () => {
  assert.equal(
    isReadableOnlineLibraryRecord(
      createLibraryBook({
        readable_online: true,
        ebook_access: "public",
        preview_only: false,
        borrowable: false,
      })
    ),
    true
  );
  assert.equal(
    isReadableOnlineLibraryRecord(
      createLibraryBook({
        readable_online: false,
        ebook_access: "preview",
        preview_only: true,
      })
    ),
    false
  );
});

await run("library dedupe groups by work key", () => {
  const groups = detectDuplicateGroups([
    createLibraryBook({ id: "a", openlibrary_work_key: "OL1W" }),
    createLibraryBook({ id: "b", openlibrary_work_key: "OL1W", internet_archive_identifier: "other-ia-id" }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].groupKey, "work:OL1W");
});

await run("library dedupe falls back to normalized title and author", () => {
  const groups = detectDuplicateGroups([
    createLibraryBook({
      id: "gatsby-a",
      openlibrary_work_key: "",
      internet_archive_identifier: "",
      title: "The Great Gatsby",
      normalized_title: "great gatsby",
      authorDisplay: "F. Scott Fitzgerald",
      normalized_author: "f scott fitzgerald",
    }),
    createLibraryBook({
      id: "gatsby-b",
      openlibrary_work_key: "",
      internet_archive_identifier: "",
      title: "Great Gatsby: A Novel",
      normalized_title: "great gatsby",
      authorDisplay: "F Scott Fitzgerald",
      normalized_author: "f scott fitzgerald",
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].groupKey.startsWith("title-author:"), true);
});

await run("preferred edition selection prefers the strongest public edition", () => {
  const selected = selectPreferredEdition([
    createLibraryBook({
      id: "weaker",
      readable_online: false,
      ebook_access: "preview",
      embed_url: "",
      internet_archive_identifier: "",
    }),
    createLibraryBook({
      id: "stronger",
      cover_url: "https://covers.openlibrary.org/b/id/1-L.jpg",
      embed_url: "https://archive.org/embed/stronger",
      internet_archive_identifier: "stronger",
    }),
  ]);

  assert.equal(selected.id, "stronger");
});

await run("student visibility excludes archived and inactive books", () => {
  const visible = filterStudentVisibleLibraryBooks([
    createLibraryBook({ id: "published" }),
    createLibraryBook({ id: "archived", publish_status: "archived" }),
    createLibraryBook({ id: "inactive", active: false }),
  ]);

  assert.deepEqual(visible.map((book) => book.id), ["published"]);
});

await run("reader gating refuses inactive or unpublished books", () => {
  assert.equal(canOpenLibraryReader(createLibraryBook({ active: false })), false);
  assert.equal(canOpenLibraryReader(createLibraryBook({ publish_status: "draft" })), false);
  assert.equal(canOpenLibraryReader(createLibraryBook({ id: "allowed" })), true);
});

await run("embed whitelist rejects arbitrary hosts", () => {
  const preserved = sanitizeLibraryEmbedUrl("https://www.archive.org/embed/book-one", "book-one");
  const sanitized = sanitizeLibraryEmbedUrl("https://evil.example/reader", "book-two");

  assert.equal(isAllowedLibraryEmbedUrl(preserved), true);
  assert.equal(preserved, "https://www.archive.org/embed/book-one");
  assert.equal(sanitized, "https://www.archive.org/embed/book-two");
});

await run("reader embed defaults to 2up desktop and 1up mobile", () => {
  const desktop = buildLibraryReaderEmbedUrl({
    embedUrl: "https://www.archive.org/embed/book-one",
    identifier: "book-one",
    pageMode: resolveLibraryReaderMode({ isMobile: false }),
    pageNumber: 170,
  });
  const mobile = buildLibraryReaderEmbedUrl({
    embedUrl: "https://www.archive.org/embed/book-one",
    identifier: "book-one",
    pageMode: resolveLibraryReaderMode({ isMobile: true }),
    pageNumber: 170,
  });

  assert.equal(desktop, "https://www.archive.org/embed/book-one#mode/2up/page/170");
  assert.equal(mobile, "https://www.archive.org/embed/book-one#mode/1up/page/170");
});

await run("reader location parsing keeps last page number for resume", () => {
  const parsed = parseLibraryReaderLocation("#mode/2up/page/170");
  assert.equal(parsed.lastLocation, "#mode/2up/page/170");
  assert.equal(parsed.lastPageNumber, 170);
});

await run("reader fragment messages can be extracted for bookmark capture", () => {
  const fragment = extractLibraryReaderFragmentMessage({
    type: "bookReaderFragmentChange",
    fragment: "page/n12/mode/2up",
  });

  assert.equal(fragment, "page/n12/mode/2up");
});

await run("manual save place accepts a valid page number", () => {
  assert.equal(normalizeLibraryPageNumber(170), 170);
  assert.equal(normalizeLibraryPageNumber("27"), 27);
});

await run("manual save place rejects invalid page numbers", () => {
  assert.equal(normalizeLibraryPageNumber(0), null);
  assert.equal(normalizeLibraryPageNumber(-5), null);
  assert.equal(normalizeLibraryPageNumber("abc"), null);
});

await run("read state serialization exposes saved page number", () => {
  const serialized = serializeLibraryReadState({
    savedPageNumber: 170,
    savedPageCode: "leaf12",
    lastPageNumber: 168,
    lastLocation: "epubcfi(/6/2[chapter1]!/4/1:0)",
    progressPercent: 54.2,
    inMyLibrary: true,
    startedReading: true,
    completed: false,
    lastOpenedAt: "2026-03-08T10:05:00.000Z",
    updatedAt: "2026-03-08T10:00:00.000Z",
  });

  assert.equal(serialized.savedPageNumber, 170);
  assert.equal(serialized.savedPageCode, "leaf12");
  assert.equal(serialized.lastPageNumber, 168);
  assert.equal(serialized.lastLocation, "epubcfi(/6/2[chapter1]!/4/1:0)");
  assert.equal(serialized.progressPercent, 54.2);
  assert.equal(serialized.inMyLibrary, true);
  assert.equal(serialized.lastOpenedAt, "2026-03-08T10:05:00.000Z");
});

await run("read page uses saved page as first resume source", () => {
  assert.equal(resolveLibraryResumePage({ savedPageNumber: 170, lastPageNumber: 140 }), 170);
  assert.equal(resolveLibraryResumePage({ savedPageNumber: null, lastPageNumber: 140 }), 140);
});

await run("read page prefers saved page code when present", () => {
  const target = resolveLibraryResumeTarget({
    savedPageNumber: 170,
    savedPageCode: "leaf12",
    lastPageNumber: 140,
    lastLocation: "#mode/2up/page/20",
  });

  assert.equal(target.pageNumber, 170);
  assert.equal(target.pageCode, "leaf12");
  assert.equal(target.location, "leaf12");
});

await run("saved page code can drive embed fragment", () => {
  const url = buildLibraryReaderEmbedUrl({
    embedUrl: "https://www.archive.org/embed/book-one",
    identifier: "book-one",
    pageMode: "2up",
    pageNumber: 170,
    location: normalizeLibraryPageCode("leaf12"),
  });

  assert.equal(url, "https://www.archive.org/embed/book-one#leaf12/mode/2up");
});

await run("saved full archive reader urls are normalized for resume", () => {
  const url = buildLibraryReaderEmbedUrl({
    embedUrl: "https://www.archive.org/embed/a-tale-of-two-cities",
    identifier: "a-tale-of-two-cities",
    pageMode: "2up",
    location: "https://archive.org/details/a-tale-of-two-cities/page/n15/mode/1up?ref=ol",
  });

  assert.equal(url, "https://www.archive.org/embed/a-tale-of-two-cities#page/n15/mode/2up");
});

await run("preferred library source selection favors preferred remote epub sources", () => {
  const selected = pickPreferredLibraryReadSource({
    book: createLibraryBook(),
    sources: [
      {
        id: "openlibrary",
        sourceName: "openlibrary",
        sourceRole: "hybrid",
        sourceStatus: "active",
        readable: true,
        isPreferredRead: false,
        embedUrl: "https://www.archive.org/embed/book-one",
      },
      {
        id: "standard",
          sourceName: "remote_epub",
        sourceRole: "read",
        sourceStatus: "active",
        readable: true,
        isPreferredRead: true,
        downloadUrl: "https://standardebooks.org/example.epub",
      },
    ],
  });

  assert.equal(selected.id, "standard");
});

await run("preferred library source selection favors uploaded epub when marked preferred", () => {
  const selected = pickPreferredLibraryReadSource({
    book: createLibraryBook(),
    sources: [
      {
        id: "openlibrary",
        sourceName: "openlibrary",
        sourceRole: "hybrid",
        sourceStatus: "active",
        sourceFormat: "archive_embed",
        readable: true,
        isPreferredRead: false,
        embedUrl: "https://www.archive.org/embed/book-one",
      },
      {
        id: "manual-epub",
        sourceName: "manual_epub",
        sourceRole: "read",
        sourceStatus: "active",
        sourceFormat: "epub",
        readable: true,
        isPreferredRead: true,
        cacheStatus: "ready",
        cacheKey: "library/manual-uploads/book.epub",
      },
    ],
  });

  assert.equal(selected.id, "manual-epub");
});

await run("gutenberg books do not invent a legacy open library fallback", () => {
  const selected = pickPreferredLibraryReadSource({
    book: {
      id: "gutenberg-book",
      slug: "pride-and-prejudice",
      sourceName: "gutenberg",
      sourcePayload: {
        provider: "gutenberg",
        providerBookId: "1342",
      },
    },
    sources: [],
  });

  assert.equal(selected, null);
});

await run("uploaded epub sources are readable from cache without a remote download url", () => {
  assert.equal(
    sourceHasReadableEpubAsset({
      sourceStatus: "active",
      sourceFormat: "epub",
      readable: true,
      downloadUrl: "",
      cacheStatus: "ready",
      cacheKey: "library/manual-uploads/book.epub",
    }),
    true
  );
});

await run("legacy open library source builder preserves archive fallback", () => {
  const source = buildLegacyOpenLibrarySource(
    createLibraryBook({
      id: "legacy-book",
      openlibrary_work_key: "OL12W",
      openlibrary_edition_key: "OL34M",
      internet_archive_identifier: "legacy-archive",
    }),
    { preferRead: true }
  );

  assert.equal(source.sourceName, "openlibrary");
  assert.equal(source.sourceRole, "hybrid");
  assert.equal(source.readable, true);
  assert.equal(source.isPreferredRead, true);
  assert.equal(source.embedUrl, "https://www.archive.org/embed/legacy-archive");
});

await run("archive identifier resolution prefers embed urls over stale source identifiers", () => {
  const resolved = resolveArchiveIdentifierFromSource(
    {
      sourceIdentifier: "OL25709295M",
      embedUrl: "https://www.archive.org/embed/a-tale-of-two-cities",
      readerUrl: "https://archive.org/details/a-tale-of-two-cities",
    },
    createLibraryBook({
      internet_archive_identifier: "a-tale-of-two-cities",
    })
  );

  assert.equal(resolved, "a-tale-of-two-cities");
});

await run("my library cards show saved page when available", () => {
  const label = buildLibraryBookProgressLabel({
    savedPageNumber: 170,
    lastPageNumber: 140,
    inMyLibrary: true,
    readableOnline: true,
  });

  assert.equal(label, "Saved page 170");
});

await run("detail page resume hint reflects the saved page", () => {
  assert.equal(buildLibraryResumeHint(170), "Resume from page 170");
});

await run("fullscreen button toggles wrapper fullscreen state", async () => {
  let fullscreenElement = null;
  const element = {
    async requestFullscreen() {
      fullscreenElement = element;
    },
  };
  const documentRef = {
    fullscreenEnabled: true,
    get fullscreenElement() {
      return fullscreenElement;
    },
    async exitFullscreen() {
      fullscreenElement = null;
    },
  };

  const entered = await toggleLibraryReaderFullscreen({ element, documentRef });
  const exited = await toggleLibraryReaderFullscreen({ element, documentRef });

  assert.equal(entered, true);
  assert.equal(exited, false);
  assert.equal(documentRef.fullscreenElement, null);
});

await run("floating bookmark panel renders on reader page", () => {
  const classes = getLibraryFloatingBookmarkPanelClasses({ isMobile: false, isFullscreen: false });
  assert.match(classes, /\bfixed\b/);
  assert.match(classes, /\bbottom-/);
  assert.match(classes, /\bright-/);
});

await run("saved page appears in floating panel", () => {
  assert.equal(getLibraryBookmarkSavedText(170), "Saved page: 170");
});

await run("saved bookmark label falls back when only reader code exists", () => {
  assert.equal(getLibraryBookmarkSavedText(null, "leaf12"), "Saved bookmark");
});

await run("page input validates positive integers", () => {
  assert.equal(getLibraryBookmarkValidationError(12), "");
  assert.equal(getLibraryBookmarkValidationError(0), "Page number must be a positive integer.");
  assert.equal(getLibraryBookmarkValidationError("abc"), "Page number must be a positive integer.");
  assert.equal(getLibraryBookmarkValidationError("", { detectedPageCode: "leaf12" }), "");
});

await run("save bookmark updates UI and persisted state", () => {
  const nextState = applyLibrarySavedBookmarkState(
    {
      savedPageNumber: null,
      savedPageCode: "",
      startedReading: false,
      inMyLibrary: true,
    },
    {
      pageNumber: 170,
      pageCode: "page/n12/mode/2up",
    }
  );

  assert.equal(nextState.savedPageNumber, 170);
  assert.equal(nextState.savedPageCode, "page/n12/mode/2up");
  assert.equal(nextState.startedReading, true);
});

await run("floating panel remains visible in fullscreen mode", () => {
  const classes = getLibraryFloatingBookmarkPanelClasses({ isMobile: false, isFullscreen: true });
  assert.match(classes, /\bfixed\b/);
  assert.match(classes, /\bz-30\b/);
});

await run("mobile layout does not break with panel visible", () => {
  const classes = getLibraryFloatingBookmarkPanelClasses({ isMobile: true, isFullscreen: false });
  assert.match(classes, /\bright-4\b/);
  assert.match(classes, /\bbottom-4\b/);
});

await run("epub readers hide the sticky bookmark panel", () => {
  assert.equal(shouldShowLibraryBookmarkPanel({ type: "epub" }), false);
  assert.equal(shouldShowLibraryBookmarkPanel({ type: "archive_embed" }), true);
});

await run("epub toc flattening keeps nested sections", () => {
  const flattened = flattenLibraryTocItems([
    {
      href: "text/chapter-1.xhtml",
      label: "Chapter 1",
      subitems: [
        {
          href: "text/chapter-1.xhtml#part-2",
          label: "Part 2",
          subitems: [],
        },
      ],
    },
  ]);

  assert.equal(flattened.length, 2);
  assert.equal(flattened[1].depth, 1);
  assert.equal(flattened[1].label, "Part 2");
});

await run("epub font scale is clamped to safe bounds", () => {
  assert.equal(clampLibraryEpubFontScale(50), 90);
  assert.equal(clampLibraryEpubFontScale(118), 118);
  assert.equal(clampLibraryEpubFontScale(999), 150);
});

await run("epub page state prefers global location counts when available", () => {
  assert.deepEqual(
    resolveLibraryEpubPageState({
      location: {
        start: {
          displayed: {
            page: 3,
            total: 12,
          },
        },
      },
      locationIndex: 41,
      locationTotal: 318,
    }),
    {
      pageNumber: 42,
      pageTotal: 319,
    }
  );
  assert.deepEqual(
    resolveLibraryEpubPageState({
      location: {
        start: {
          displayed: {
            page: 3,
            total: 12,
          },
        },
      },
      locationIndex: null,
      locationTotal: null,
    }),
    {
      pageNumber: null,
      pageTotal: null,
    }
  );
});

await run("epub page kind keeps front matter and dividers single-page", () => {
  assert.equal(resolveLibraryEpubPageKind("text/titlepage.xhtml"), "title-leaf");
  assert.equal(resolveLibraryEpubPageKind("text/imprint.xhtml"), "body");
  assert.equal(resolveLibraryEpubPageKind("text/preface.xhtml"), "body");
  assert.equal(resolveLibraryEpubPageKind("text/book-1-1.xhtml"), "divider");
  assert.equal(resolveLibraryEpubPageKind("text/chapter-1-1-1.xhtml"), "body");
});

await run("epub display mode keeps title pages single and body pages spread", () => {
  assert.equal(
    resolveLibraryEpubDisplayMode({
      href: "text/titlepage.xhtml",
      location: { atStart: true, atEnd: false },
      locationIndex: 0,
      locationTotal: 400,
      isMobile: false,
    }),
    "single"
  );
  assert.equal(
    resolveLibraryEpubDisplayMode({
      href: "text/titlepage.xhtml",
      location: { atStart: false, atEnd: false },
      locationIndex: 2,
      locationTotal: 400,
      isMobile: false,
    }),
    "spread"
  );
  assert.equal(
    resolveLibraryEpubDisplayMode({
      href: "text/imprint.xhtml",
      location: { atStart: false, atEnd: false },
      locationIndex: 1,
      locationTotal: 400,
      isMobile: false,
    }),
    "spread"
  );
  assert.equal(
    resolveLibraryEpubDisplayMode({
      href: "text/chapter-1-1-1.xhtml",
      location: { atStart: false, atEnd: false },
      locationIndex: 40,
      locationTotal: 400,
      isMobile: false,
    }),
    "spread"
  );
});

await run("flipbook normalization removes titlepage and imprint", async () => {
  const publication = await normalizeFlipbookPublication({
    epubBytes: buildTestEpubBytes(),
    coverUrl: "https://example.com/cover.jpg",
    fallbackTitle: "Fallback Title",
    fallbackAuthor: "Fallback Author",
  });

  assert.equal(publication.metadata.title, "Test Flipbook");
  assert.equal(publication.metadata.author, "Jane Doe");
  assert.deepEqual(
    publication.sections.map((section) => section.href),
    ["OEBPS/chapter1.xhtml", "OEBPS/chapter2.xhtml"]
  );
  assert.deepEqual(
    publication.toc.map((item) => item.label),
    ["Chapter 1", "Chapter 2"]
  );
  assert.match(publication.sections[0].blocks[0].html, /^<h1[^>]*class="[^"]*flipbook-block/);
  assert.match(publication.sections[0].blocks[0].html, /data-block-id="seg-oebps-chapter1-xhtml-0-0"/);
  assert.match(publication.sections[0].blocks[0].html, /data-anchors="chapter-1"/);
  assert.equal(publication.sections[0].blocks[0].html.includes("<section"), false);
});

await run("flipbook paginator starts with synthetic cover and maps toc globally", async () => {
  const publication = await normalizeFlipbookPublication({
    epubBytes: buildTestEpubBytes(),
    coverUrl: "https://example.com/cover.jpg",
  });
  const manifest = paginateFlipbookPublication({
    normalizedPublication: publication,
    layoutProfile: DEFAULT_FLIPBOOK_LAYOUT_PROFILE,
    manifestId: buildFlipbookManifestId({
      libraryBookId: "book-1",
      sourceFingerprint: "source-1",
      layoutProfileId: "layout-1",
    }),
    layoutProfileId: "layout-1",
    sourceFingerprint: "source-1",
  });

  assert.equal(manifest.pages[0].flags.isSyntheticCover, true);
  assert.equal(manifest.pages[0].pageIndex, 0);
  assert.equal(manifest.toc[0].pageIndex >= 1, true);
  assert.equal(manifest.toc[1].pageIndex >= manifest.toc[0].pageIndex, true);
  assert.equal(Object.values(manifest.anchorMap).includes(0), false);
});

await run("flipbook paginator is deterministic and does not create filler pages", async () => {
  const publication = await normalizeFlipbookPublication({
    epubBytes: buildTestEpubBytes(),
    coverUrl: "https://example.com/cover.jpg",
  });
  const manifestId = buildFlipbookManifestId({
    libraryBookId: "book-1",
    sourceFingerprint: "source-1",
    layoutProfileId: "layout-1",
  });
  const manifestA = paginateFlipbookPublication({
    normalizedPublication: publication,
    layoutProfile: DEFAULT_FLIPBOOK_LAYOUT_PROFILE,
    manifestId,
    layoutProfileId: "layout-1",
    sourceFingerprint: "source-1",
  });
  const manifestB = paginateFlipbookPublication({
    normalizedPublication: publication,
    layoutProfile: DEFAULT_FLIPBOOK_LAYOUT_PROFILE,
    manifestId,
    layoutProfileId: "layout-1",
    sourceFingerprint: "source-1",
  });

  assert.deepEqual(
    manifestA.pages.map((page) => page.pageId),
    manifestB.pages.map((page) => page.pageId)
  );
  assert.equal(
    manifestA.pages.some((page, index) => index > 0 && page.flags?.isFiller),
    false
  );
});

await run("flipbook visible numbering excludes the synthetic cover", () => {
  assert.equal(resolveFlipbookVisiblePageNumber(0), null);
  assert.equal(resolveFlipbookVisiblePageNumber(1), 1);
  assert.equal(resolveFlipbookVisiblePageTotal(1), 0);
  assert.equal(resolveFlipbookVisiblePageTotal(8), 7);
});

await run("flipbook lazy loading picks the correct initial window", () => {
  assert.deepEqual(
    resolveInitialFlipbookPageWindow({
      pageCount: 1200,
      startPageIndex: 0,
      hasSavedState: false,
    }),
    { from: 0, to: 11 }
  );
  assert.deepEqual(
    resolveInitialFlipbookPageWindow({
      pageCount: 1200,
      startPageIndex: 540,
      hasSavedState: true,
    }),
    { from: 534, to: 546 }
  );
});

await run("flipbook lazy loading merges windows by stable page index", () => {
  const placeholders = buildFlipbookPlaceholderPages(4);
  const merged = mergeFlipbookPages({
    pageCount: 4,
    existingPages: placeholders,
    incomingPages: [
      { ...buildFlipbookPlaceholderPage(1), pageId: "page-1", html: "<article>One</article>", flags: {} },
      { ...buildFlipbookPlaceholderPage(3), pageId: "page-3", html: "<article>Three</article>", flags: {} },
    ],
  });

  assert.equal(merged[0].flags.isPlaceholder, true);
  assert.equal(merged[1].pageId, "page-1");
  assert.equal(merged[2].flags.isPlaceholder, true);
  assert.equal(merged[3].pageId, "page-3");
});

await run("flipbook lazy loading only prefetches an adjacent range near the loaded edge", () => {
  const initialLoaded = new Set(Array.from({ length: 12 }, (_, index) => index));
  assert.deepEqual(
    resolveFlipbookNeighborPrefetchRange({
      pageCount: 350,
      currentPageIndex: 8,
      loadedPageIndexes: initialLoaded,
      prefetchRadius: 10,
    }),
    { from: 12, to: 21 }
  );

  const centeredLoaded = new Set(Array.from({ length: 13 }, (_, index) => 534 + index));
  assert.deepEqual(
    resolveFlipbookNeighborPrefetchRange({
      pageCount: 1200,
      currentPageIndex: 540,
      loadedPageIndexes: centeredLoaded,
      prefetchRadius: 10,
    }),
    { from: 547, to: 556 }
  );

  assert.deepEqual(
    resolveFlipbookNeighborPrefetchRange({
      pageCount: 1200,
      currentPageIndex: 539,
      loadedPageIndexes: centeredLoaded,
      prefetchRadius: 10,
    }),
    { from: 524, to: 533 }
  );
});

await run("flipbook runtime pages keep loaded content live and placeholders only for missing pages", () => {
  const runtimePages = buildFlipbookRuntimePages({
    pages: [
      { ...buildFlipbookPlaceholderPage(0), pageId: "page-0", flags: { isSyntheticCover: true, isPlaceholder: false } },
      {
        ...buildFlipbookPlaceholderPage(1),
        pageId: "page-1",
        html: "<article>One</article>",
        runtimeMode: "skeleton",
        flags: { isRuntimeSkeleton: true },
      },
      { ...buildFlipbookPlaceholderPage(2), pageId: "page-2", html: "<article>Two</article>", flags: {} },
      buildFlipbookPlaceholderPage(3),
      {
        ...buildFlipbookPlaceholderPage(4),
        pageId: "page-4",
        html: "<article>Four</article>",
        runtimeMode: "skeleton",
        flags: { isRuntimeSkeleton: true },
      },
    ],
  });

  assert.equal(runtimePages[1].runtimeMode, "live");
  assert.equal(runtimePages[3].runtimeMode, "placeholder");
  assert.equal(runtimePages[4].runtimeMode, "live");
  assert.equal(runtimePages[1].flags.isRuntimeSkeleton, false);
  assert.equal(runtimePages[4].flags.isRuntimeSkeleton, false);
});

await run("flipbook runtime pages never degrade loaded content after a later chapter load", () => {
  const initialRuntimePages = buildFlipbookRuntimePages({
    pages: [
      { ...buildFlipbookPlaceholderPage(10), pageId: "page-10", html: "<article>Ten</article>", flags: {} },
      buildFlipbookPlaceholderPage(11),
      { ...buildFlipbookPlaceholderPage(12), pageId: "page-12", html: "<article>Twelve</article>", flags: {} },
    ],
  });
  const jumpedRuntimePages = buildFlipbookRuntimePages({
    pages: [
      { ...buildFlipbookPlaceholderPage(10), pageId: "page-10", html: "<article>Ten</article>", flags: {} },
      { ...buildFlipbookPlaceholderPage(11), pageId: "page-11", html: "<article>Eleven</article>", flags: {} },
      { ...buildFlipbookPlaceholderPage(12), pageId: "page-12", html: "<article>Twelve</article>", flags: {} },
    ],
  });

  assert.equal(initialRuntimePages[0].runtimeMode, "live");
  assert.equal(initialRuntimePages[2].runtimeMode, "live");
  assert.equal(jumpedRuntimePages[0].runtimeMode, "live");
  assert.equal(jumpedRuntimePages[1].runtimeMode, "live");
  assert.equal(jumpedRuntimePages[2].runtimeMode, "live");
});

await run("flipbook visual window maps cleanly between global and local indexes", () => {
  assert.equal(globalToLocalPageIndex(33, 17), 16);
  assert.equal(localToGlobalPageIndex(16, 17, 800), 33);
  assert.equal(isPageIndexInsideVisualWindow(33, 17, 48), true);
  assert.equal(isPageIndexInsideVisualWindow(49, 17, 48), false);
});

await run("flipbook visual window keeps a stable spread-sized segment around the anchor", () => {
  assert.deepEqual(
    resolveFlipbookVisualWindow({
      pageCount: 1200,
      anchorPageIndex: 0,
      isSinglePageView: false,
    }),
    { start: 0, end: 31, size: 32, key: "0:31" }
  );

  assert.deepEqual(
    resolveFlipbookVisualWindow({
      pageCount: 1200,
      anchorPageIndex: 539,
      isSinglePageView: false,
    }),
    { start: 523, end: 554, size: 32, key: "523:554" }
  );

  assert.deepEqual(
    resolveFlipbookVisualWindow({
      pageCount: 1200,
      anchorPageIndex: 540,
      isSinglePageView: true,
    }),
    { start: 532, end: 547, size: 16, key: "532:547" }
  );
});

await run("flipbook visual window shifts only when the reader nears a local edge", () => {
  assert.equal(
    shouldShiftFlipbookVisualWindow({
      pageIndex: 539,
      windowStart: 523,
      windowEnd: 554,
      isSinglePageView: false,
    }),
    false
  );
  assert.equal(
    shouldShiftFlipbookVisualWindow({
      pageIndex: 549,
      windowStart: 523,
      windowEnd: 554,
      isSinglePageView: false,
    }),
    true
  );
  assert.equal(
    shouldShiftFlipbookVisualWindow({
      pageIndex: 535,
      windowStart: 532,
      windowEnd: 547,
      isSinglePageView: true,
    }),
    true
  );
});

await run("flipbook visual window can be rebuilt around a chapter jump outside the current segment", () => {
  const currentWindow = resolveFlipbookVisualWindow({
    pageCount: 1200,
    anchorPageIndex: 539,
    isSinglePageView: false,
  });
  assert.equal(isPageIndexInsideVisualWindow(611, currentWindow.start, currentWindow.end), false);

  const jumpedWindow = resolveFlipbookVisualWindow({
    pageCount: 1200,
    anchorPageIndex: 611,
    isSinglePageView: false,
    pinnedPageIndexes: [612],
  });

  assert.equal(isPageIndexInsideVisualWindow(611, jumpedWindow.start, jumpedWindow.end), true);
  assert.equal(isPageIndexInsideVisualWindow(612, jumpedWindow.start, jumpedWindow.end), true);
});

await run("flipbook visual window expands for tts without degrading loaded pages", () => {
  const expandedSpreadWindow = expandFlipbookVisualWindowForTts({
    pageCount: 1200,
    windowStart: 523,
    windowEnd: 554,
    visualAnchorPageIndex: 539,
    ttsPageIndex: 553,
    isSinglePageView: false,
  });
  assert.equal(isPageIndexInsideVisualWindow(555, expandedSpreadWindow.start, expandedSpreadWindow.end), true);
  assert.equal(isPageIndexInsideVisualWindow(556, expandedSpreadWindow.start, expandedSpreadWindow.end), true);

  const expandedSingleWindow = expandFlipbookVisualWindowForTts({
    pageCount: 1200,
    windowStart: 532,
    windowEnd: 547,
    visualAnchorPageIndex: 540,
    ttsPageIndex: 547,
    isSinglePageView: true,
  });
  assert.equal(isPageIndexInsideVisualWindow(548, expandedSingleWindow.start, expandedSingleWindow.end), true);
});

await run("flipbook adapter page signatures ignore runtime mode flags", () => {
  const adapterSource = readFileSync(new URL("../components/flipbook/flip-animation-adapter.js", import.meta.url), "utf8");
  const signatureMatch = adapterSource.match(/function buildPagesSignature\(pages = \[\]\) \{([\s\S]*?)\n\}/);

  assert.ok(signatureMatch, "The adapter should expose a buildPagesSignature helper");
  assert.doesNotMatch(signatureMatch[1], /runtimeMode/);
  assert.doesNotMatch(signatureMatch[1], /isRuntimeSkeleton/);
});

await run("flipbook shell feeds the adapter directly from the rendered window pages", () => {
  const shellSource = readFileSync(new URL("../components/flipbook/flipbook-shell.js", import.meta.url), "utf8");

  assert.doesNotMatch(shellSource, /buildFlipbookRuntimePages/);
  assert.match(shellSource, /renderPages\.slice\(/);
});

await run("flipbook window keys gate navigation until the requested adapter is ready", () => {
  const requestedWindowKey = buildFlipbookVisualWindowKey({
    mode: "spread",
    start: 1487,
    end: 1518,
  });
  const staleWindowKey = buildFlipbookVisualWindowKey({
    mode: "spread",
    start: 0,
    end: 31,
  });

  assert.equal(
    canFlipbookAdapterAcceptNavigation({
      isSettling: true,
      requestedWindowKey,
      readyWindowKey: staleWindowKey,
    }),
    false
  );
  assert.equal(
    shouldIgnoreFlipbookAdapterEvent({
      eventWindowKey: staleWindowKey,
      requestedWindowKey,
    }),
    true
  );
  assert.equal(
    canFlipbookAdapterAcceptNavigation({
      isSettling: false,
      requestedWindowKey,
      readyWindowKey: requestedWindowKey,
    }),
    true
  );
});

await run("flipbook deep jumps keep their requested window and never fall back to cover", () => {
  const deepJumpWindow = resolveFlipbookVisualWindow({
    pageCount: 2600,
    anchorPageIndex: 2000,
    isSinglePageView: false,
    pinnedPageIndexes: [2000, 2001],
  });
  const deepJumpWindowKey = buildFlipbookVisualWindowKey({
    mode: "spread",
    start: deepJumpWindow.start,
    end: deepJumpWindow.end,
  });

  assert.equal(deepJumpWindow.start > 0, true);
  assert.equal(
    shouldIgnoreFlipbookAdapterEvent({
      eventWindowKey: "spread:0:31",
      requestedWindowKey: deepJumpWindowKey,
    }),
    true
  );
});

await run("flipbook shell commits local navigation using the event window start", () => {
  const shellSource = readFileSync(new URL("../components/flipbook/flipbook-shell.js", import.meta.url), "utf8");

  assert.match(shellSource, /const commitNavigationFromLocal = useCallback\(/);
  assert.match(shellSource, /const safeWindowStart = Math\.max\(0, Number\(windowStart\) \|\| 0\);/);
  assert.match(shellSource, /localToGlobalPageIndex\(\s*safeLocalPageIndex,\s*safeWindowStart,/);
  assert.doesNotMatch(
    shellSource,
    /localToGlobalPageIndex\(\s*localPageIndex,\s*visualWindowRef\.current\.start/
  );
});

await run("flipbook chapter jumps use setPage and no longer depend on flip animation commits", () => {
  const shellSource = readFileSync(new URL("../components/flipbook/flipbook-shell.js", import.meta.url), "utf8");

  assert.match(shellSource, /adapterRef\.current\?\.setPage\?\.\(localTargetPageIndex\)/);
  assert.match(shellSource, /globalToLocalPageIndex\(\s*pendingJump\.visualTargetPageIndex,\s*windowStart\s*\)/);
  assert.match(shellSource, /const settledLocalPageIndex = Math\.max\(\s*0,\s*Number\(adapterRef\.current\?\.getCurrentPageIndex\?\.\(\) \?\? localPageIndex\) \|\| 0\s*\)/);
  assert.match(shellSource, /if \(settledLocalPageIndex !== localTargetPageIndex\) \{/);
  assert.match(shellSource, /pendingGoToPageRef\.current = \{\s*[\s\S]*windowStart: nextVisualWindow\.start,/);
  assert.doesNotMatch(
    shellSource,
    /globalToLocalPageIndex\(\s*pendingJump\.visualTargetPageIndex,\s*visualWindowRef\.current\.start\s*\)/
  );
});

await run("flipbook chapter jumps do not precommit the spread before the adapter resolves the target", () => {
  const shellSource = readFileSync(new URL("../components/flipbook/flipbook-shell.js", import.meta.url), "utf8");
  const handleGoToPageMatch = shellSource.match(/async function handleGoToPage\(pageIndex\) \{([\s\S]*?)\n  \}/);

  assert.ok(handleGoToPageMatch, "handleGoToPage should exist");
  assert.doesNotMatch(handleGoToPageMatch[1], /setSpreadPageIndex\(/);
  assert.doesNotMatch(handleGoToPageMatch[1], /spreadAnchorPageIndexRef\.current\s*=/);
});

await run("flipbook shell routes flip and page-set events through the same commit path", () => {
  const shellSource = readFileSync(new URL("../components/flipbook/flipbook-shell.js", import.meta.url), "utf8");

  assert.match(shellSource, /const handleFlip = useCallback\(\s*\(payload = \{\}\) => \{\s*commitNavigationFromLocal\(payload\);/);
  assert.match(shellSource, /const handlePageSet = useCallback\(\s*\(payload = \{\}\) => \{\s*commitNavigationFromLocal\(payload\);/);
  assert.match(shellSource, /windowStart=\{visualWindow\.start\}/);
  assert.match(shellSource, /onPageSet=\{handlePageSet\}/);
});

await run("flipbook ignores intermediate flip events while a pending chapter jump is still targeting another local page", () => {
  const shellSource = readFileSync(new URL("../components/flipbook/flipbook-shell.js", import.meta.url), "utf8");

  assert.match(shellSource, /const pendingJump = pendingGoToPageRef\.current;/);
  assert.match(shellSource, /const pendingLocalTargetPageIndex = globalToLocalPageIndex\(\s*pendingJump\.visualTargetPageIndex,\s*safeWindowStart\s*\)/);
  assert.match(shellSource, /if \(source === "flip" && safeLocalPageIndex !== pendingLocalTargetPageIndex\) \{\s*return false;\s*\}/);
});

await run("flipbook book frame forwards window context and page-set callbacks to the adapter", () => {
  const frameSource = readFileSync(new URL("../components/flipbook/book-frame.js", import.meta.url), "utf8");

  assert.match(frameSource, /windowStart = 0,/);
  assert.match(frameSource, /onPageSet,/);
  assert.match(frameSource, /windowStart=\{windowStart\}/);
  assert.match(frameSource, /onPageSet=\{onPageSet\}/);
  assert.match(frameSource, /pointerEvents: navigationLocked \? "none" : "auto"/);
});

await run("flipbook adapter config disables click to turn, corners, and preserves drag support", () => {
  const adapterSource = readFileSync(new URL("../components/flipbook/flip-animation-adapter.js", import.meta.url), "utf8");
  assert.match(adapterSource, /disableFlipByClick:\s*false/);
  assert.match(adapterSource, /showPageCorners:\s*false/);
});

await run("flipbook shell clips the page-flip host and internal wrappers to avoid cross-page hit areas", () => {
  const shellSource = readFileSync(new URL("../components/flipbook/flipbook-shell.js", import.meta.url), "utf8");

  assert.match(shellSource, /\.flipbook-animation-host \{\s*margin: 0 auto;\s*overflow: hidden;\s*contain: paint;\s*clip-path: inset\(0\);/);
  assert.match(shellSource, /\.flipbook-animation-host \{[\s\S]*user-select: none;[\s\S]*-webkit-user-select: none;/);
  assert.match(shellSource, /\.stf__parent \{\s*position: relative;\s*width: 100%;\s*height: 100%;/);
  assert.match(shellSource, /\.stf__parent,\s*\.stf__block,\s*\.stf__wrapper \{\s*overflow: hidden;\s*contain: paint;\s*clip-path: inset\(0\);\s*isolation: isolate;/);
  assert.match(shellSource, /\.stf__wrapper \{\s*position: relative;\s*width: 100%;\s*height: 100%;/);
  assert.match(shellSource, /\.stf__block \{\s*position: absolute;\s*inset: 0;\s*width: 100%;\s*height: 100%;/);
  assert.match(shellSource, /\.stf__item \{\s*overflow: hidden;\s*user-select: none;\s*-webkit-user-select: none;/);
});

await run("flipbook adapter emits window-aware flip and page-set payloads", () => {
  const adapterSource = readFileSync(new URL("../components/flipbook/flip-animation-adapter.js", import.meta.url), "utf8");

  assert.match(adapterSource, /windowStartRef = useRef\(windowStart\)/);
  assert.match(adapterSource, /windowStart:\s*windowStartRef\.current,\s*localPageIndex:\s*nextPageIndex,\s*source:\s*"flip"/);
  assert.match(adapterSource, /onPageSetRef\.current\?\.\(\{\s*windowKey:\s*windowKeyRef\.current,\s*windowStart:\s*windowStartRef\.current,\s*localPageIndex:\s*stablePageIndexRef\.current,\s*source,/);
  assert.match(adapterSource, /setPage\(pageIndex\)\s*\{/);
});

await run("flipbook adapter ready handshake keeps the requested local page on mount", () => {
  const adapterSource = readFileSync(new URL("../components/flipbook/flip-animation-adapter.js", import.meta.url), "utf8");
  assert.match(adapterSource, /startPage:\s*initialPageIndex,/);
  assert.match(
    adapterSource,
    /const readyPageIndex =\s*pageFlipRef\.current\?\.getCurrentPageIndex\?\.\(\) \?\?\s*stablePageIndexRef\.current \?\?\s*initialPageIndex;/
  );
  assert.match(adapterSource, /windowStart:\s*windowStartRef\.current,\s*localPageIndex:\s*Math\.max\(0, Number\(readyPageIndex\) \|\| 0\),\s*source:\s*"ready"/);
});

await run("flipbook adapter mount listeners stay stable across start page changes", () => {
  const adapterSource = readFileSync(new URL("../components/flipbook/flip-animation-adapter.js", import.meta.url), "utf8");
  assert.doesNotMatch(adapterSource, /\[scheduleInstanceUpdate,\s*startPage\]/);
});

await run("flipbook paginator reserves extra space so dense pages split before the footer zone", () => {
  const manifest = paginateFlipbookPublication({
    normalizedPublication: {
      metadata: {
        title: "Dense Flipbook",
        author: "QA",
        coverUrl: "",
      },
      toc: [{ id: "chapter-1", label: "Chapter 1", href: "chapter-1.xhtml", depth: 0 }],
      sections: [
        {
          chapterId: "chapter-1",
          href: "chapter-1.xhtml",
          blocks: [
            {
              html: '<section class="flipbook-block flipbook-block-p" data-block-id="a1"><p>First dense block.</p></section>',
              textSegments: [],
              anchors: ["a1"],
              estimatedUnits: 38,
            },
            {
              html: '<section class="flipbook-block flipbook-block-p" data-block-id="a2"><p>Second dense block.</p></section>',
              textSegments: [],
              anchors: ["a2"],
              estimatedUnits: 38,
            },
          ],
        },
      ],
    },
    layoutProfile: DEFAULT_FLIPBOOK_LAYOUT_PROFILE,
    manifestId: "manifest-dense",
    layoutProfileId: "layout-1",
    sourceFingerprint: "source-1",
  });

  assert.equal(manifest.pages.length, 3);
  assert.match(manifest.pages[1].startLocator, /a1/);
  assert.match(manifest.pages[2].startLocator, /a2/);
});

await run("flipbook page chrome skips cover and formats content pages", () => {
  assert.equal(
    buildFlipbookPageChrome({
      page: {
        pageIndex: 0,
        flags: { isSyntheticCover: true },
      },
      bookTitle: "Test Flipbook",
      chapterLabel: "Chapter One",
    }),
    null
  );

  assert.deepEqual(
    buildFlipbookPageChrome({
      page: {
        pageIndex: 3,
        flags: { isSyntheticCover: false },
      },
      bookTitle: "Test Flipbook",
      chapterLabel: "",
    }),
    {
      headerLeft: "Test Flipbook",
      headerRight: "Test Flipbook",
      footerLeft: "EnglishMate Library",
      footerRight: "3",
    }
  );
});

await run("flipbook primary reading page prefers explicit and then right page in spreads", () => {
  assert.equal(
    resolvePrimaryReadingPage({
      leftPageIndex: 10,
      rightPageIndex: 11,
      ttsActivePageIndex: null,
      explicitSelectedPageIndex: null,
      pageCount: 20,
    }),
    11
  );
  assert.equal(
    resolvePrimaryReadingPage({
      leftPageIndex: 10,
      rightPageIndex: 11,
      ttsActivePageIndex: 10,
      explicitSelectedPageIndex: null,
      pageCount: 20,
    }),
    10
  );
  assert.equal(
    resolvePrimaryReadingPage({
      leftPageIndex: 10,
      rightPageIndex: 11,
      ttsActivePageIndex: 11,
      explicitSelectedPageIndex: 10,
      pageCount: 20,
    }),
    10
  );
});

await run("flipbook initial canonical page prioritizes query before saved state", () => {
  assert.equal(
    resolveInitialCanonicalPageIndex({
      requestedPageIndex: 106,
      savedPageIndex: 88,
      currentPageIndex: 52,
      pageCount: 400,
    }),
    106
  );
  assert.equal(
    resolveInitialCanonicalPageIndex({
      requestedPageIndex: null,
      savedPageIndex: 88,
      currentPageIndex: 52,
      pageCount: 400,
    }),
    88
  );
});

await run("flipbook intro visual state only appears on a fresh cover entry", () => {
  assert.equal(
    resolveFlipbookInitialVisualState({
      initialPageIndex: 0,
      requestedPageIndex: null,
      savedPageIndex: null,
      currentPageIndex: null,
      startedReading: false,
    }),
    FLIPBOOK_VISUAL_STATE_CLOSED_BOOK
  );
  assert.equal(
    resolveFlipbookInitialVisualState({
      initialPageIndex: 0,
      requestedPageIndex: 0,
      savedPageIndex: null,
      currentPageIndex: null,
      startedReading: false,
    }),
    FLIPBOOK_VISUAL_STATE_READING
  );
  assert.equal(
    resolveFlipbookInitialVisualState({
      initialPageIndex: 0,
      requestedPageIndex: null,
      savedPageIndex: 18,
      currentPageIndex: null,
      startedReading: true,
    }),
    FLIPBOOK_VISUAL_STATE_READING
  );
});

await run("flipbook presentation mode depends only on viewport width", () => {
  assert.equal(
    resolveFlipbookPresentationMode({
      viewportWidth: 1320,
    }),
    "spread"
  );
  assert.equal(
    resolveFlipbookPresentationMode({
      viewportWidth: 999,
    }),
    "single"
  );
  assert.equal(
    resolveFlipbookPresentationMode({
      viewportWidth: 1000,
    }),
    "spread"
  );
  assert.equal(
    resolveFlipbookPresentationMode({
      viewportWidth: 640,
    }),
    "single"
  );
});

await run("flipbook stage scale respects constrained height", () => {
  assert.equal(
    resolveFlipbookStageScale({
      viewportWidth: 1800,
      viewportHeight: 700,
      presentationMode: "spread",
    }),
    700 / 1080
  );
  assert.equal(
    resolveFlipbookStageScale({
      viewportWidth: 540,
      viewportHeight: 1300,
      presentationMode: "single",
    }),
    540 / 720
  );
  assert.equal(
    resolveFlipbookStageScale({
      viewportWidth: 1800,
      viewportHeight: 900,
      presentationMode: "spread",
      targetHeight: 680,
    }),
    680 / 1080
  );
});

await run("flipbook resume page index preserves spread focus rules", () => {
  assert.equal(
    resolveResumePageIndex({
      currentPageIndex: 6,
      previousPresentationMode: "single",
      nextPresentationMode: "spread",
      ttsActivePageIndex: null,
      pageCount: 12,
    }),
    5
  );
  assert.equal(
    resolveResumePageIndex({
      currentPageIndex: 5,
      previousPresentationMode: "single",
      nextPresentationMode: "spread",
      ttsActivePageIndex: null,
      pageCount: 12,
    }),
    5
  );
  assert.equal(
    resolveResumePageIndex({
      currentPageIndex: 5,
      previousPresentationMode: "single",
      nextPresentationMode: "spread",
      ttsActivePageIndex: 6,
      pageCount: 12,
    }),
    5
  );
  assert.equal(
    resolveResumePageIndex({
      currentPageIndex: 5,
      previousPresentationMode: "spread",
      nextPresentationMode: "single",
      ttsActivePageIndex: 6,
      pageCount: 12,
    }),
    6
  );
  assert.equal(
    resolveResumePageIndex({
      currentPageIndex: 3,
      previousPresentationMode: "spread",
      nextPresentationMode: "single",
      ttsActivePageIndex: null,
      pageCount: 12,
    }),
    3
  );
  assert.equal(
    resolveResumePageIndex({
      currentPageIndex: 5,
      previousPresentationMode: "spread",
      nextPresentationMode: "single",
      ttsActivePageIndex: null,
      pageCount: 12,
    }),
    5
  );
});

await run("flipbook session tokens preserve short-lived reader context", () => {
  process.env.FLIPBOOK_SESSION_SECRET = "flipbook-test-secret";
  const token = createFlipbookSessionToken({
    userId: "user-1",
    libraryBookId: "book-1",
    slug: "reader-book",
    manifestId: "manifest-1",
    layoutProfileId: "canonical-v1",
    ttsEnabled: true,
    maxAgeSeconds: 300,
  });
  const verified = verifyFlipbookSessionToken(token);
  assert.equal(verified.valid, true);
  assert.equal(verified.userId, "user-1");
  assert.equal(verified.libraryBookId, "book-1");
  assert.equal(verified.slug, "reader-book");
  assert.equal(verified.manifestId, "manifest-1");
  assert.equal(verified.ttsEnabled, true);
});

await run("epub visible page numbers preserve both pages in a spread", () => {
  assert.deepEqual(
    resolveLibraryEpubVisiblePageNumbers({
      location: {
        start: { displayed: { page: 52 } },
        end: { displayed: { page: 53 } },
      },
      pageNumber: 52,
      displayMode: "spread",
    }),
    {
      left: 52,
      right: 53,
    }
  );
  assert.deepEqual(
    resolveLibraryEpubVisiblePageNumbers({
      pageNumber: 59,
      pageTotal: 2220,
      displayMode: "spread",
      spreadStartPageNumber: 58,
      spreadEndPageNumber: 59,
    }),
    {
      left: 58,
      right: 59,
    }
  );
});

await run("manual upload keys are deterministic per entity", () => {
  assert.equal(
    buildLibraryManualUploadKey({
      scope: "staging",
      entityKey: "020e41c0-1234",
      fileName: "book.epub",
    }),
    "library/manual-uploads/staging/020e41c0-1234/book.epub"
  );
  assert.equal(
    buildCanonicalManualEpubCacheKey({ id: "020e41c0-1234", fileName: "book.epub" }),
    "library/books/020e41c0-1234/book.epub"
  );
});

await run("reader arrow shortcuts ignore form controls", () => {
  assert.equal(
    canUseLibraryReaderArrowKeys({
      key: "ArrowLeft",
      target: { tagName: "input", isContentEditable: false },
    }),
    false
  );
  assert.equal(
    canUseLibraryReaderArrowKeys({
      key: "ArrowRight",
      target: { tagName: "div", isContentEditable: false },
    }),
    true
  );
});

await run("epub progress labels surface chapter, page, and percentage", () => {
  assert.equal(
    buildLibraryEpubProgressLabel({
      chapterLabel: "Book One",
      pageNumber: 12,
      pageTotal: 22,
      progressPercent: 18.4,
    }),
    "Book One / 12/22 / 18%"
  );
});

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;

console.log(`\nSummary: ${passed}/${results.length} passed`);

if (failed > 0) {
  process.exit(1);
}
