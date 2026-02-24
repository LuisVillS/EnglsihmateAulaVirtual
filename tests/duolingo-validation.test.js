import test from "node:test";
import assert from "node:assert/strict";
import { validateExerciseContent } from "../lib/duolingo/validation.js";

test("validateExerciseContent accepts a valid cloze exercise", () => {
  const result = validateExerciseContent({
    type: "cloze",
    contentJson: {
      sentence: "I ____ a student.",
      options: ["am", "are", "is", "be"],
      correct_index: 0,
    },
  });

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateExerciseContent rejects invalid scramble payload", () => {
  const result = validateExerciseContent({
    type: "scramble",
    contentJson: {
      prompt_native: "Yo soy estudiante",
      target_words: ["I", "am", "a", "student"],
      answer_order: [0, 1, 2],
    },
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("answer_order")));
});

test("validateExerciseContent rejects invalid type", () => {
  const result = validateExerciseContent({
    type: "unsupported_type",
    contentJson: {},
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes("Tipo de ejercicio"));
});

