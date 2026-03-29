import { createHmac } from "node:crypto";
import { constantTimeEqual, requirePrivateServerEnv } from "./security/env.js";

const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const CURRENT_TOKEN_VERSION = 2;

function getCalendarFeedSecret() {
  return requirePrivateServerEnv("CALENDAR_FEED_SECRET");
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

  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Number(maxAgeSeconds) || DEFAULT_MAX_AGE_SECONDS);
  const payload = encodePayload({ sub: String(userId), exp, v: CURRENT_TOKEN_VERSION });
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
  if (!constantTimeEqual(signature, expected)) return { valid: false, reason: "invalid-signature" };

  const data = decodePayload(payload);
  if (!data?.sub) return { valid: false, reason: "invalid-payload" };
  if (Number(data.v) !== CURRENT_TOKEN_VERSION) return { valid: false, reason: "legacy-token" };
  if (!Number.isFinite(Number(data.exp))) return { valid: false, reason: "invalid-exp" };
  if (Math.floor(Date.now() / 1000) > Number(data.exp)) return { valid: false, reason: "expired" };

  return { valid: true, userId: String(data.sub) };
}
