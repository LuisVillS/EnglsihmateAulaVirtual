import test from "node:test";
import assert from "node:assert/strict";
import { authorizeInternalJobRequest } from "../lib/jobs/internal-auth.js";
import {
  runCourseEmailRemindersJob,
  runPreEnrollmentCleanupJob,
} from "../lib/jobs/internal-job-handlers.js";

function createRequest(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
  });
}

function createMockService() {
  const operations = [];

  function makeChain(table) {
    const chain = {
      delete() {
        operations.push({ table, op: "delete" });
        return chain;
      },
      update(payload) {
        operations.push({ table, op: "update", payload });
        return chain;
      },
      eq(column, value) {
        operations.push({ table, op: "eq", column, value });
        return chain;
      },
      lt(column, value) {
        operations.push({ table, op: "lt", column, value });
        return chain;
      },
      in(column, value) {
        operations.push({ table, op: "in", column, value });
        return chain;
      },
    };
    return chain;
  }

  return {
    operations,
    from(table) {
      operations.push({ table, op: "from" });
      return makeChain(table);
    },
  };
}

test("internal job auth fails closed when CRON_SECRET is missing", () => {
  const result = authorizeInternalJobRequest(createRequest("/api/jobs/course-email-reminders"), {
    env: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing-secret");
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "Configura CRON_SECRET." });
});

test("course email reminders rejects anonymous requests", async () => {
  const result = await runCourseEmailRemindersJob({
    request: createRequest("/api/jobs/course-email-reminders"),
    env: { CRON_SECRET: "cron-secret" },
    runJob: async () => ({ sent: 1 }),
    service: createMockService(),
  });

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "Unauthorized" });
});

test("pre-enrollment cleanup rejects wrong bearer token", async () => {
  const result = await runPreEnrollmentCleanupJob({
    request: createRequest("/api/jobs/pre-enrollment-cleanup", "wrong-secret"),
    env: { CRON_SECRET: "cron-secret" },
    service: createMockService(),
  });

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "Unauthorized" });
});

test("course email reminders succeeds with a valid bearer token", async () => {
  const service = createMockService();
  const seen = [];
  const result = await runCourseEmailRemindersJob({
    request: createRequest("/api/jobs/course-email-reminders", "cron-secret"),
    env: { CRON_SECRET: "cron-secret" },
    service,
    runJob: async ({ service: passedService }) => {
      seen.push(passedService);
      return { sent: 3, skipped: 1 };
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, sent: 3, skipped: 1 });
  assert.equal(seen[0], service);
});

test("pre-enrollment cleanup succeeds with a valid bearer token", async () => {
  const service = createMockService();
  const result = await runPreEnrollmentCleanupJob({
    request: createRequest("/api/jobs/pre-enrollment-cleanup", "cron-secret"),
    env: { CRON_SECRET: "cron-secret" },
    service,
    now: new Date("2026-03-27T12:00:00.000Z"),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.ok(service.operations.some((entry) => entry.table === "email_verification_tokens" && entry.op === "delete"));
  assert.ok(service.operations.some((entry) => entry.table === "pre_enrollments" && entry.op === "update"));
});
