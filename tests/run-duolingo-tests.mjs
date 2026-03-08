import assert from "node:assert/strict";
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
import { canOpenLibraryReader, filterStudentVisibleLibraryBooks } from "../lib/library/policies.js";

const results = [];

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
    inMyLibrary: true,
    startedReading: true,
    completed: false,
    updatedAt: "2026-03-08T10:00:00.000Z",
  });

  assert.equal(serialized.savedPageNumber, 170);
  assert.equal(serialized.savedPageCode, "leaf12");
  assert.equal(serialized.lastPageNumber, 168);
  assert.equal(serialized.inMyLibrary, true);
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

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;

console.log(`\nSummary: ${passed}/${results.length} passed`);

if (failed > 0) {
  process.exit(1);
}
