import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStudentCodeCore,
  resolveExistingStudentRecord,
  shouldUpdateStudentProfile,
} from "../lib/duolingo/student-upsert-core.js";

test("normalizeStudentCodeCore normalizes to uppercase no spaces", () => {
  assert.equal(normalizeStudentCodeCore(" e2026 1234 "), "E20261234");
});

test("resolveExistingStudentRecord prevents duplicate by student_code", () => {
  const existing = resolveExistingStudentRecord({
    studentCode: "e20261234",
    idDocument: "44556677",
    records: [
      { id: "A", student_code: "E20261234", id_document: "11223344" },
      { id: "B", student_code: "E20269999", id_document: "44556677" },
    ],
  });

  assert.equal(existing.id, "A");
});

test("resolveExistingStudentRecord falls back to id_document", () => {
  const existing = resolveExistingStudentRecord({
    studentCode: "E20260000",
    idDocument: "44556677",
    records: [
      { id: "A", student_code: "E20261234", id_document: "11223344" },
      { id: "B", student_code: "E20269999", id_document: "44556677" },
    ],
  });

  assert.equal(existing.id, "B");
});

test("shouldUpdateStudentProfile returns false for identical data", () => {
  const shouldUpdate = shouldUpdateStudentProfile({
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
  });

  assert.equal(shouldUpdate, false);
});

