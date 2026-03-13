import { createHmac } from "node:crypto";

const DEFAULT_MAX_AGE_SECONDS = 60 * 15;

function getFlipbookSessionSecret() {
  return (
    process.env.FLIPBOOK_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    null
  );
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value) {
  try {
    return JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function signValue(value, secret) {
  return createHmac("sha256", secret).update(String(value)).digest("base64url");
}

export function createFlipbookSessionToken({
  userId,
  libraryBookId,
  slug,
  manifestId,
  layoutProfileId,
  ttsEnabled = false,
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
} = {}) {
  if (!userId || !libraryBookId || !slug || !manifestId) return null;
  const secret = getFlipbookSessionSecret();
  if (!secret) return null;

  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Number(maxAgeSeconds) || DEFAULT_MAX_AGE_SECONDS);
  const payload = encodePayload({
    sub: String(userId),
    bookId: String(libraryBookId),
    slug: String(slug),
    manifestId: String(manifestId),
    layoutProfileId: layoutProfileId ? String(layoutProfileId) : "",
    ttsEnabled: Boolean(ttsEnabled),
    exp,
    v: 1,
  });
  const signature = signValue(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyFlipbookSessionToken(token) {
  const secret = getFlipbookSessionSecret();
  if (!secret) return { valid: false, reason: "missing-secret" };

  const parts = String(token || "").split(".");
  if (parts.length !== 2) return { valid: false, reason: "invalid-format" };
  const [payload, signature] = parts;
  if (!payload || !signature) return { valid: false, reason: "invalid-format" };

  const expected = signValue(payload, secret);
  if (signature !== expected) return { valid: false, reason: "invalid-signature" };

  const data = decodePayload(payload);
  if (!data?.sub || !data?.bookId || !data?.slug || !data?.manifestId) {
    return { valid: false, reason: "invalid-payload" };
  }
  if (!Number.isFinite(Number(data.exp))) return { valid: false, reason: "invalid-exp" };
  if (Math.floor(Date.now() / 1000) > Number(data.exp)) return { valid: false, reason: "expired" };

  return {
    valid: true,
    userId: String(data.sub),
    libraryBookId: String(data.bookId),
    slug: String(data.slug),
    manifestId: String(data.manifestId),
    layoutProfileId: String(data.layoutProfileId || ""),
    ttsEnabled: Boolean(data.ttsEnabled),
  };
}
