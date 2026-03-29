import test from "node:test";
import assert from "node:assert/strict";
import {
  constantTimeEqual,
  requirePrivateServerEnv,
  requireServerEnv,
  resolveCanonicalAppUrl,
} from "../lib/security/env.js";
import {
  createFlipbookSessionToken,
  verifyFlipbookSessionToken,
} from "../lib/flipbook-services/session-token.js";

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

test("requireServerEnv trims and returns configured values", () => {
  const value = requireServerEnv("APP_URL", {
    env: { APP_URL: "  https://example.com/app/  " },
  });

  assert.equal(value, "https://example.com/app/");
});

test("requireServerEnv fails closed when missing", () => {
  assert.throws(() => requireServerEnv("APP_URL", { env: {} }), /APP_URL no esta configurada/);
});

test("requirePrivateServerEnv rejects NEXT_PUBLIC variables", () => {
  assert.throws(
    () => requirePrivateServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", { env: {} }),
    /No se permite leer secretos privados/
  );
});

test("resolveCanonicalAppUrl prefers APP_URL and strips trailing slash", () => {
  const url = resolveCanonicalAppUrl({
    env: {
      APP_URL: "https://englishmate.example.com/app/",
      SITE_URL: "https://ignored.example.com",
    },
  });

  assert.equal(url, "https://englishmate.example.com/app");
});

test("resolveCanonicalAppUrl falls back to SITE_URL when APP_URL is absent", () => {
  const url = resolveCanonicalAppUrl({
    env: {
      SITE_URL: "https://englishmate.example.com/",
    },
  });

  assert.equal(url, "https://englishmate.example.com");
});

test("resolveCanonicalAppUrl fails closed on missing config", () => {
  assert.throws(() => resolveCanonicalAppUrl({ env: {} }), /APP_URL no esta configurada/);
});

test("resolveCanonicalAppUrl rejects invalid absolute urls", () => {
  assert.throws(
    () => resolveCanonicalAppUrl({ env: { APP_URL: "not-a-url" } }),
    /APP_URL debe ser una URL absoluta valida/
  );
});

test("resolveCanonicalAppUrl rejects NEXT_PUBLIC fallback candidates", () => {
  assert.throws(
    () =>
      resolveCanonicalAppUrl({
        env: { NEXT_PUBLIC_SITE_URL: "https://example.com" },
        candidates: ["NEXT_PUBLIC_SITE_URL"],
      }),
    /No se permite usar NEXT_PUBLIC_/
  );
});

test("constantTimeEqual compares equal values", () => {
  assert.equal(constantTimeEqual("secret-value", "secret-value"), true);
});

test("constantTimeEqual rejects different values and lengths", () => {
  assert.equal(constantTimeEqual("secret-value", "secret-values"), false);
  assert.equal(constantTimeEqual("secret-value", "other-value"), false);
});

test("flipbook session tokens do not fall back to public anon keys", () => {
  withEnv(
    {
      FLIPBOOK_SESSION_SECRET: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    },
    () => {
      const token = createFlipbookSessionToken({
        userId: "user-1",
        libraryBookId: "book-1",
        slug: "reader-book",
        manifestId: "manifest-1",
      });

      assert.equal(token, null);
      assert.deepEqual(verifyFlipbookSessionToken("forged-token"), {
        valid: false,
        reason: "missing-secret",
      });
    }
  );
});
