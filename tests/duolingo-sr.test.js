import test from "node:test";
import assert from "node:assert/strict";
import { computeSpacedRepetitionUpdate, qualityFromAttempt } from "../lib/duolingo/sr.js";

test("qualityFromAttempt scores first-try correct as 5", () => {
  assert.equal(qualityFromAttempt({ isCorrect: true, attempts: 1 }), 5);
});

test("qualityFromAttempt scores incorrect as low quality", () => {
  assert.equal(qualityFromAttempt({ isCorrect: false, attempts: 1 }) <= 2, true);
});

test("computeSpacedRepetitionUpdate resets interval to 1 on failure", () => {
  const update = computeSpacedRepetitionUpdate({
    prevIntervalDays: 7,
    prevEaseFactor: 2.4,
    isCorrect: false,
    attempts: 3,
    now: new Date("2026-02-22T00:00:00.000Z"),
  });

  assert.equal(update.intervalDays, 1);
  assert.ok(update.easeFactor >= 1.3 && update.easeFactor <= 2.8);
});

test("computeSpacedRepetitionUpdate grows interval on success", () => {
  const update = computeSpacedRepetitionUpdate({
    prevIntervalDays: 3,
    prevEaseFactor: 2.5,
    isCorrect: true,
    attempts: 1,
    now: new Date("2026-02-22T00:00:00.000Z"),
  });

  assert.ok(update.intervalDays >= 3);
  assert.ok(update.easeFactor >= 1.3 && update.easeFactor <= 2.8);
});

