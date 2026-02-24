import assert from "node:assert/strict";
import { validateExerciseContent } from "../lib/duolingo/validation.js";
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

const results = [];

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

await run("validation accepts valid cloze", () => {
  const result = validateExerciseContent({
    type: "cloze",
    contentJson: {
      sentence: "I ____ a student.",
      options: ["am", "are", "is", "be"],
      correct_index: 0,
    },
  });
  assert.equal(result.valid, true);
});

await run("validation rejects invalid scramble", () => {
  const result = validateExerciseContent({
    type: "scramble",
    contentJson: {
      prompt_native: "Yo soy estudiante",
      target_words: ["I", "am", "a", "student"],
      answer_order: [0, 1, 2],
    },
  });
  assert.equal(result.valid, false);
});

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

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;

console.log(`\nSummary: ${passed}/${results.length} passed`);

if (failed > 0) {
  process.exit(1);
}
