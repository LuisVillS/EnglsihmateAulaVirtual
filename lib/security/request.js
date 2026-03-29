import { constantTimeEqual } from "./env.js";

function normalizeText(value) {
  return String(value ?? "").trim();
}

export function readBearerToken(request) {
  const authorization = request?.headers?.get("authorization") || "";
  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !rest.length) {
    return null;
  }

  return rest.join(" ").trim() || null;
}

export function extractRequestIp(source) {
  const getHeader = (name) =>
    typeof source?.get === "function"
      ? source.get(name)
      : typeof source?.headers?.get === "function"
        ? source.headers.get(name)
        : null;

  const direct =
    normalizeText(getHeader("cf-connecting-ip")) ||
    normalizeText(getHeader("x-real-ip"));
  if (direct) {
    return direct;
  }

  const forwarded = normalizeText(getHeader("x-forwarded-for"));
  if (!forwarded) {
    return null;
  }

  const [first] = forwarded
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return first || null;
}

export function constantTimeBearerMatch(request, expectedToken) {
  const providedToken = readBearerToken(request);
  if (!providedToken || !expectedToken) {
    return false;
  }

  return constantTimeEqual(providedToken, expectedToken);
}
