import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionPlan } from "../lib/duolingo/session-generator.js";

const nowIso = "2026-02-22T12:00:00.000Z";

test("buildSessionPlan uses only published exercises", () => {
  const exercises = [
    { id: "ex-1", type: "image_match", status: "published", content_json: {}, ordering: 1 },
    { id: "ex-2", type: "cloze", status: "draft", content_json: {}, ordering: 2 },
    { id: "ex-3", type: "scramble", status: "published", content_json: {}, ordering: 3 },
  ];

  const plan = buildSessionPlan({
    exercises,
    progressRows: [],
    now: new Date(nowIso),
  });

  const ids = plan.items.map((item) => item.id);
  assert.deepEqual(ids.includes("ex-2"), false);
  assert.deepEqual(ids.includes("ex-1"), true);
  assert.deepEqual(ids.includes("ex-3"), true);
});

test("buildSessionPlan prioritizes due review items", () => {
  const exercises = [
    { id: "new-1", type: "image_match", status: "published", content_json: {}, ordering: 1 },
    { id: "rev-1", type: "scramble", status: "published", content_json: {}, ordering: 2 },
  ];

  const progressRows = [
    {
      exercise_id: "rev-1",
      is_correct: true,
      last_quality: 2,
      next_due_at: "2026-02-20T00:00:00.000Z",
    },
  ];

  const plan = buildSessionPlan({
    exercises,
    progressRows,
    now: new Date(nowIso),
    newCount: 1,
    reviewCount: 1,
  });

  assert.equal(plan.totals.selectedReview >= 1, true);
  assert.equal(plan.items.some((item) => item.id === "rev-1"), true);
});

