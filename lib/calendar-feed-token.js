import { createHmac } from "node:crypto";

const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function getCalendarFeedSecret() {
  return (
    process.env.CALENDAR_FEED_SECRET ||
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
    const raw = Buffer.from(String(value), "base64url").toString("utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function signValue(value, secret) {
  return createHmac("sha256", secret).update(String(value)).digest("base64url");
}

export function createCalendarFeedToken(userId, { maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS } = {}) {
  if (!userId) return null;
  const secret = getCalendarFeedSecret();
  if (!secret) return null;

  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Number(maxAgeSeconds) || DEFAULT_MAX_AGE_SECONDS);
  const payload = encodePayload({ sub: String(userId), exp, v: 1 });
  const signature = signValue(payload, secret);
  return `${payload}.${signature}`;
}

export function verifyCalendarFeedToken(token) {
  const secret = getCalendarFeedSecret();
  if (!secret) return { valid: false, reason: "missing-secret" };

  const parts = String(token || "").split(".");
  if (parts.length !== 2) return { valid: false, reason: "invalid-format" };
  const [payload, signature] = parts;
  if (!payload || !signature) return { valid: false, reason: "invalid-format" };

  const expected = signValue(payload, secret);
  if (signature !== expected) return { valid: false, reason: "invalid-signature" };

  const data = decodePayload(payload);
  if (!data?.sub) return { valid: false, reason: "invalid-payload" };
  if (!Number.isFinite(Number(data.exp))) return { valid: false, reason: "invalid-exp" };
  if (Math.floor(Date.now() / 1000) > Number(data.exp)) return { valid: false, reason: "expired" };

  return { valid: true, userId: String(data.sub) };
}
