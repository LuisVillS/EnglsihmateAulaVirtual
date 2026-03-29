import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createCalendarFeedToken, verifyCalendarFeedToken } from "../lib/calendar-feed-token.js";

function withEnv(overrides, fn) {
  const keys = new Set(Object.keys(overrides));
  const previous = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function buildForgedToken({ secret, userId, exp, version = 2 }) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp, v: version }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test("calendar feed tokens require a private secret", () => {
  withEnv({ CALENDAR_FEED_SECRET: undefined }, () => {
    assert.throws(() => createCalendarFeedToken("student-1"), /CALENDAR_FEED_SECRET no esta configurada/);
    assert.throws(() => verifyCalendarFeedToken("token"), /CALENDAR_FEED_SECRET no esta configurada/);
  });
});

test("valid calendar feed token verifies for the signed user", () => {
  withEnv({ CALENDAR_FEED_SECRET: "calendar-feed-test-secret" }, () => {
    const token = createCalendarFeedToken("student-1", { maxAgeSeconds: 300 });
    const verified = verifyCalendarFeedToken(token);

    assert.equal(verified.valid, true);
    assert.equal(verified.userId, "student-1");
  });
});

test("forged token signed with a public secret is rejected", () => {
  withEnv(
    {
      CALENDAR_FEED_SECRET: "calendar-feed-test-secret",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-guessable-secret",
    },
    () => {
      const token = buildForgedToken({
        secret: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        userId: "student-1",
        exp: Math.floor(Date.now() / 1000) + 300,
      });

      assert.equal(verifyCalendarFeedToken(token).valid, false);
    }
  );
});

test("legacy versioned tokens are rejected", () => {
  withEnv({ CALENDAR_FEED_SECRET: "calendar-feed-test-secret" }, () => {
    const token = buildForgedToken({
      secret: process.env.CALENDAR_FEED_SECRET,
      userId: "student-1",
      exp: Math.floor(Date.now() / 1000) + 300,
      version: 1,
    });

    const verified = verifyCalendarFeedToken(token);
    assert.equal(verified.valid, false);
    assert.equal(verified.reason, "legacy-token");
  });
});

test("calendar feed tokens stay bound to the signed user id", () => {
  withEnv({ CALENDAR_FEED_SECRET: "calendar-feed-test-secret" }, () => {
    const token = createCalendarFeedToken("student-1", { maxAgeSeconds: 300 });
    const verified = verifyCalendarFeedToken(token);

    assert.equal(verified.valid, true);
    assert.equal(verified.userId, "student-1");
    assert.notEqual(verified.userId, "student-2");
  });
});
