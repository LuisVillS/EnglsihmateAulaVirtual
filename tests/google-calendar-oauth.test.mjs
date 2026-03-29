import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleOAuthUrl,
  createGoogleOAuthState,
  resolveCanonicalAppOrigin,
  resolveGoogleRedirectUri,
  verifyGoogleOAuthState,
} from "../lib/google-calendar-oauth.js";

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

test("canonical app origin comes from APP_URL and ignores request headers", () => {
  withEnv(
    {
      APP_URL: "https://englishmate.example.com/app/",
      SITE_URL: "https://ignored.example.com",
    },
    () => {
      assert.equal(resolveCanonicalAppOrigin(), "https://englishmate.example.com/app");
    }
  );
});

test("google oauth redirect uri is built from the canonical app origin", () => {
  withEnv(
    {
      APP_URL: "https://englishmate.example.com",
      GOOGLE_CALENDAR_CLIENT_ID: "client-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: "client-secret",
      CALENDAR_OAUTH_STATE_SECRET: "state-secret",
    },
    () => {
      const redirectUri = resolveGoogleRedirectUri();
      const authUrl = buildGoogleOAuthUrl({ state: "state-token", redirectUri });

      assert.equal(redirectUri, "https://englishmate.example.com/api/calendar/google/callback");
      assert.match(authUrl, /redirect_uri=https%3A%2F%2Fenglishmate\.example\.com%2Fapi%2Fcalendar%2Fgoogle%2Fcallback/);
    }
  );
});

test("google oauth state round-trips with a server secret", () => {
  withEnv(
    {
      CALENDAR_OAUTH_STATE_SECRET: "state-secret",
    },
    () => {
      const state = createGoogleOAuthState({ userId: "user-123", returnTo: "/app/calendario" });
      const verified = verifyGoogleOAuthState(state);

      assert.equal(verified.valid, true);
      assert.equal(verified.userId, "user-123");
      assert.equal(verified.returnTo, "/app/calendario");
    }
  );
});

test("google oauth state fails closed without CALENDAR_OAUTH_STATE_SECRET", () => {
  withEnv(
    {
      CALENDAR_OAUTH_STATE_SECRET: undefined,
      SUPABASE_SERVICE_ROLE_KEY: "service-role-should-not-be-used",
    },
    () => {
      assert.throws(
        () => createGoogleOAuthState({ userId: "user-123", returnTo: "/app/calendario" }),
        /CALENDAR_OAUTH_STATE_SECRET no esta configurada/
      );
    }
  );
});
