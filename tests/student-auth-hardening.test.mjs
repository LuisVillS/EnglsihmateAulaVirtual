import test from "node:test";
import assert from "node:assert/strict";
import { assertOwnedPracticeItem, resolveStudentFromRequest } from "../lib/duolingo/api-auth.js";
import { resolveStudentIdentity, upsertStudentByCode } from "../lib/duolingo/student-upsert.js";

function createFakeDb({
  profiles = [],
  practiceSessions = [],
  practiceSessionItems = [],
} = {}) {
  const tables = {
    profiles,
    practice_sessions: practiceSessions,
    practice_session_items: practiceSessionItems,
  };

  function matchRow(row, filters) {
    return filters.every(({ column, value, operator }) => {
      if (operator === "is") {
        return row?.[column] === value;
      }
      return row?.[column] === value;
    });
  }

  function createQuery(table) {
    const filters = [];
    const query = {
      select() {
        return query;
      },
      eq(column, value) {
        filters.push({ column, value, operator: "eq" });
        return query;
      },
      is(column, value) {
        filters.push({ column, value, operator: "is" });
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      maybeSingle: async () => {
        const rows = tables[table] || [];
        const row = rows.find((candidate) => matchRow(candidate, filters)) || null;
        return { data: row ? { ...row } : null, error: null };
      },
    };
    return query;
  }

  return {
    from(table) {
      return createQuery(table);
    },
  };
}

test("student_code-only requests are rejected", async () => {
  const result = await resolveStudentFromRequest({
    getDbClientFn: async () => ({ supabase: {}, db: createFakeDb() }),
    getAuthenticatedUserFn: async () => ({ data: { user: null }, error: null }),
  });

  assert.equal(result.errorResponse?.status, 401);
});

test("unauthorized student_code provisioning is rejected", async () => {
  let dbTouched = false;
  const result = await upsertStudentByCode({
    studentCode: "E20261234",
    fullName: "Mallory",
    email: "mallory@example.com",
    idDocument: "11112222",
    serviceClient: {
      from() {
        dbTouched = true;
        throw new Error("should not reach persistence");
      },
      auth: {
        admin: {
          listUsers() {
            dbTouched = true;
            throw new Error("should not reach auth");
          },
        },
      },
    },
  });

  assert.equal(result, null);
  assert.equal(dbTouched, false);
});

test("cross-account practice item tampering is rejected", async () => {
  const db = createFakeDb({
    practiceSessions: [{ id: "session-2", user_id: "user-2" }],
    practiceSessionItems: [{ id: "item-1", practice_session_id: "session-2", xp_earned: 5 }],
  });

  const result = await assertOwnedPracticeItem(db, {
    practiceItemId: "item-1",
    userId: "user-1",
  });

  assert.equal(result.errorResponse?.status, 403);
});

test("authenticated student flow still resolves the session user", async () => {
  const db = createFakeDb({
    profiles: [
      {
        id: "user-1",
        student_code: "E20261234",
        full_name: "Alice Test",
        email: "alice@example.com",
        role: "student",
        status: "enrolled",
        course_level: "A1",
        xp_total: 120,
        current_streak: 3,
      },
    ],
  });

  const result = await resolveStudentFromRequest({
    getDbClientFn: async () => ({ supabase: {}, db }),
    getAuthenticatedUserFn: async () => ({
      data: { user: { id: "user-1", email: "alice@example.com" } },
      error: null,
    }),
    resolveStudentIdentityFn: resolveStudentIdentity,
  });

  assert.equal(result.errorResponse, undefined);
  assert.equal(result.source, "session");
  assert.equal(result.profile?.id, "user-1");
  assert.equal(result.profile?.student_code, "E20261234");
});
