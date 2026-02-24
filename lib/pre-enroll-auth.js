import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "pre_enroll_session";
const SESSION_TTL_HOURS = 24;

function getSessionSecret() {
  const secret = process.env.PRE_ENROLL_SESSION_SECRET;
  if (!secret) {
    throw new Error("Configura PRE_ENROLL_SESSION_SECRET para sesiones de pre-matricula.");
  }
  return secret;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(`${normalized}${pad}`, "base64").toString("utf8");
}

function signPayload(payload) {
  const secret = getSessionSecret();
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function buildToken({ userId, expiresAt }) {
  const payload = JSON.stringify({ userId, exp: expiresAt });
  const encoded = base64UrlEncode(payload);
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  const expected = signPayload(encoded);
  const signatureOk =
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!signatureOk) return null;
  const payload = JSON.parse(base64UrlDecode(encoded));
  if (!payload?.userId || !payload?.exp) return null;
  if (Date.now() > payload.exp) return null;
  return payload;
}

export async function setPreEnrollSession(userId) {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000;
  const token = buildToken({ userId, expiresAt });
  cookieStore.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearPreEnrollSession() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function getPreEnrollSessionUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = verifyToken(token);
  return payload?.userId || null;
}

export function getPreEnrollSessionUserIdFromRequest(request) {
  const token = request.cookies?.get(COOKIE_NAME)?.value;
  const payload = verifyToken(token);
  return payload?.userId || null;
}
