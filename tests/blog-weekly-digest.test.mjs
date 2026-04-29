import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBlogDigestHtml,
  buildBlogDigestText,
  buildDigestUnsubscribeUrl,
  normalizeAudienceEmail,
  resolveWeeklyDigestSlot,
  verifyDigestUnsubscribeToken,
} from "../lib/blog/digest.js";

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

const baseEnv = {
  APP_URL: "https://admin.englishmate.test",
  BLOG_PUBLIC_BASE_URL: "https://www.englishmate.test",
  BLOG_DIGEST_UNSUBSCRIBE_SECRET: "digest-secret",
};

test("normalizeAudienceEmail trims and lowercases", () => {
  assert.equal(normalizeAudienceEmail("  Luis@Example.COM "), "luis@example.com");
});

test("resolveWeeklyDigestSlot recognizes monday and saturday in Lima timezone", () => {
  const monday = resolveWeeklyDigestSlot(new Date("2026-04-27T15:00:00.000Z"), {
    BLOG_DIGEST_TIMEZONE: "America/Lima",
  });
  const saturday = resolveWeeklyDigestSlot(new Date("2026-04-25T15:00:00.000Z"), {
    BLOG_DIGEST_TIMEZONE: "America/Lima",
  });

  assert.equal(monday.isScheduledDay, true);
  assert.equal(monday.weekdayLabel, "monday");
  assert.equal(monday.digestKey, "weekly-2026-04-27-monday");

  assert.equal(saturday.isScheduledDay, true);
  assert.equal(saturday.weekdayLabel, "saturday");
  assert.equal(saturday.digestKey, "weekly-2026-04-25-saturday");
});

test("unsubscribe urls round-trip through token verification", () => {
  withEnv(baseEnv, () => {
    const url = new URL(buildDigestUnsubscribeUrl("reader@example.com"));
    const email = url.searchParams.get("email");
    const token = url.searchParams.get("token");

    assert.equal(email, "reader@example.com");
    assert.equal(typeof token, "string");
    assert.equal(token.length > 10, true);
    assert.equal(verifyDigestUnsubscribeToken(email, token), true);
    assert.equal(verifyDigestUnsubscribeToken(email, `${token}x`), false);
  });
});

test("digest html and text include unsubscribe and post links", () => {
  withEnv(baseEnv, () => {
    const unsubscribeUrl = buildDigestUnsubscribeUrl("reader@example.com");
    const posts = [
      {
        title: "How to Learn Faster",
        slug: "how-to-learn-faster",
        excerpt: "Useful study habits for English learners.",
        cover_image_url: "https://cdn.example.com/cover.jpg",
        published_at: "2026-04-26T12:00:00.000Z",
        category: { name: "Study Tips" },
      },
    ];

    const html = buildBlogDigestHtml({
      recipientName: "Luis",
      posts,
      unsubscribeUrl,
    });
    const text = buildBlogDigestText({
      recipientName: "Luis",
      posts,
      unsubscribeUrl,
    });

    assert.match(html, /Blog EnglishMate/);
    assert.match(html, /https:\/\/www\.englishmate\.test\/blog\/how-to-learn-faster/);
    assert.match(html, /https:\/\/admin\.englishmate\.test\/api\/blog\/subscribers\/unsubscribe/);

    assert.match(text, /How to Learn Faster/);
    assert.match(text, /https:\/\/www\.englishmate\.test\/blog\/how-to-learn-faster/);
    assert.match(text, /Darte de baja:/);
  });
});
