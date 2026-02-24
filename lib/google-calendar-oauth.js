import { createHmac } from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const OAUTH_STATE_TTL_SECONDS = 60 * 10;

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
];

function getClientId() {
  return process.env.GOOGLE_CALENDAR_CLIENT_ID || "";
}

function getClientSecret() {
  return process.env.GOOGLE_CALENDAR_CLIENT_SECRET || "";
}

function getStateSecret() {
  return (
    process.env.CALENDAR_OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );
}

function encodeBase64Url(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function decodeBase64Url(value) {
  try {
    return Buffer.from(String(value), "base64url").toString("utf8");
  } catch (_error) {
    return null;
  }
}

function signValue(payload) {
  const secret = getStateSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(String(payload)).digest("base64url");
}

export function hasGoogleCalendarOAuthConfig() {
  return Boolean(getClientId() && getClientSecret());
}

export function resolveOriginFromHeaders(headerStore) {
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const forwardedHost = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const derivedOrigin = forwardedHost && forwardedProto ? `${forwardedProto}://${forwardedHost}` : null;
  return derivedOrigin || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export function resolveGoogleRedirectUri(origin) {
  const fixed = String(process.env.GOOGLE_CALENDAR_REDIRECT_URI || "").trim();
  if (fixed) return fixed;
  return `${origin}/api/calendar/google/callback`;
}

export function createGoogleOAuthState({ userId, returnTo = "/app/calendario" } = {}) {
  if (!userId) return null;
  const exp = Math.floor(Date.now() / 1000) + OAUTH_STATE_TTL_SECONDS;
  const payload = encodeBase64Url(JSON.stringify({ sub: String(userId), returnTo: String(returnTo), exp }));
  const signature = signValue(payload);
  if (!signature) return null;
  return `${payload}.${signature}`;
}

export function verifyGoogleOAuthState(state) {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature) return { valid: false };
  const expected = signValue(payload);
  if (!expected || expected !== signature) return { valid: false };
  const decoded = decodeBase64Url(payload);
  if (!decoded) return { valid: false };
  try {
    const value = JSON.parse(decoded);
    if (!value?.sub || !value?.exp) return { valid: false };
    if (Math.floor(Date.now() / 1000) > Number(value.exp)) return { valid: false, expired: true };
    return {
      valid: true,
      userId: String(value.sub),
      returnTo: String(value.returnTo || "/app/calendario"),
    };
  } catch (_error) {
    return { valid: false };
  }
}

export function buildGoogleOAuthUrl({ state, redirectUri } = {}) {
  const params = new URLSearchParams();
  params.set("client_id", getClientId());
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("access_type", "offline");
  params.set("prompt", "consent");
  params.set("include_granted_scopes", "true");
  params.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  params.set("state", String(state || ""));
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function postToken(payload) {
  const body = new URLSearchParams(payload);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage = json?.error_description || json?.error || "No se pudo obtener token de Google.";
    throw new Error(errorMessage);
  }
  return json;
}

export async function exchangeGoogleCode({ code, redirectUri } = {}) {
  return postToken({
    code: String(code || ""),
    client_id: getClientId(),
    client_secret: getClientSecret(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function refreshGoogleAccessToken({ refreshToken } = {}) {
  return postToken({
    refresh_token: String(refreshToken || ""),
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "refresh_token",
  });
}

export function computeTokenExpiry(expiresInSeconds) {
  const seconds = Math.max(60, Number(expiresInSeconds) || 3600);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function fetchGoogleUserProfile(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = await response.json().catch(() => null);
  return json?.email ? json : null;
}

export async function googleCalendarRequest({
  accessToken,
  method = "GET",
  path = "",
  query,
  body,
} = {}) {
  const url = new URL(`${GOOGLE_API_BASE}${path}`);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value == null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const json = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    data: json,
    error: json?.error?.message || json?.error_description || null,
  };
}
