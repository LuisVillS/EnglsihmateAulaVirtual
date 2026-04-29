import { timingSafeEqual } from "node:crypto";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function isAbsoluteUrl(value) {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
}

function normalizeCanonicalUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString().replace(/\/$/, "");
}

export function requireServerEnv(name, { env = process.env, label = name } = {}) {
  if (!name || typeof name !== "string") {
    throw new Error("El nombre de la variable de entorno es obligatorio.");
  }

  const value = normalizeString(env?.[name]);
  if (!value) {
    throw new Error(`${label} no esta configurada.`);
  }

  return value;
}

export function requirePrivateServerEnv(name, options = {}) {
  if (String(name || "").startsWith("NEXT_PUBLIC_")) {
    throw new Error("No se permite leer secretos privados desde NEXT_PUBLIC_.");
  }

  return requireServerEnv(name, options);
}

export function resolveCanonicalAppUrl({
  env = process.env,
  candidates = ["APP_URL", "SITE_URL"],
  label = "APP_URL",
} = {}) {
  for (const candidate of candidates) {
    if (String(candidate || "").startsWith("NEXT_PUBLIC_")) {
      throw new Error("No se permite usar NEXT_PUBLIC_ como origen canonical.");
    }

    const value = normalizeString(env?.[candidate]);
    if (!value) {
      continue;
    }

    if (!isAbsoluteUrl(value)) {
      throw new Error(`${candidate} debe ser una URL absoluta valida.`);
    }

    return normalizeCanonicalUrl(value);
  }

  throw new Error(`${label} no esta configurada.`);
}

function tryResolveRequestOrigin(request) {
  const headerOrigin = normalizeString(request?.headers?.get?.("origin"));
  if (headerOrigin && isAbsoluteUrl(headerOrigin)) {
    return normalizeCanonicalUrl(headerOrigin);
  }

  const forwardedHost = normalizeString(request?.headers?.get?.("x-forwarded-host"));
  const host = forwardedHost || normalizeString(request?.headers?.get?.("host"));
  if (host) {
    const proto = normalizeString(request?.headers?.get?.("x-forwarded-proto")) || "http";
    const builtOrigin = `${proto}://${host}`;
    if (isAbsoluteUrl(builtOrigin)) {
      return normalizeCanonicalUrl(builtOrigin);
    }
  }

  const referer = normalizeString(request?.headers?.get?.("referer"));
  if (referer && isAbsoluteUrl(referer)) {
    try {
      return normalizeCanonicalUrl(new URL(referer).origin);
    } catch {
      // Fall through to request.url.
    }
  }

  try {
    const url = new URL(request?.url);
    if (!url.protocol || !url.host) return null;
    return normalizeCanonicalUrl(url.origin);
  } catch {
    return null;
  }
}

export function resolveAppUrlForRequest(
  request,
  {
    env = process.env,
    allowDynamicInDev = env.NODE_ENV !== "production",
  } = {}
) {
  if (allowDynamicInDev) {
    const requestOrigin = tryResolveRequestOrigin(request);
    if (requestOrigin) {
      return requestOrigin;
    }
  }

  return resolveCanonicalAppUrl({ env });
}

function toComparableBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return Buffer.from(String(value ?? ""), "utf8");
}

export function constantTimeEqual(left, right) {
  const leftBuffer = toComparableBuffer(left);
  const rightBuffer = toComparableBuffer(right);

  if (leftBuffer.length !== rightBuffer.length) {
    const maxLength = Math.max(leftBuffer.length, rightBuffer.length);
    const paddedLeft = Buffer.concat([leftBuffer, Buffer.alloc(maxLength - leftBuffer.length)]);
    const paddedRight = Buffer.concat([rightBuffer, Buffer.alloc(maxLength - rightBuffer.length)]);
    timingSafeEqual(paddedLeft, paddedRight);
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
