import { createHmac } from "node:crypto";
import { constantTimeEqual } from "../security/env.js";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseKeyValuePairs(value) {
  const parsed = {};
  for (const part of normalizeText(value).split(/[;,]/)) {
    const chunk = part.trim();
    if (!chunk) continue;
    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = chunk.slice(0, separatorIndex).trim().toLowerCase();
    const raw = chunk.slice(separatorIndex + 1).trim();
    if (!key || !raw) continue;
    parsed[key] = raw;
  }
  return parsed;
}

function signSha256Hex(payload, secret) {
  return createHmac("sha256", secret).update(String(payload)).digest("hex");
}

function isWithinTolerance(timestampSeconds, { now = Date.now(), toleranceSeconds = 300 } = {}) {
  const currentSeconds = Math.floor(Number(now) / 1000);
  const parsedTimestamp = Number(timestampSeconds);
  if (!Number.isFinite(parsedTimestamp)) return false;
  return Math.abs(currentSeconds - parsedTimestamp) <= Math.max(0, Number(toleranceSeconds) || 0);
}

export function verifyLegacyWebhookSecret({
  request,
  expectedSecret,
  headerNames = [],
  queryParamNames = [],
} = {}) {
  const secret = normalizeText(expectedSecret);
  if (!secret) {
    return { valid: false, reason: "missing-secret" };
  }

  for (const headerName of headerNames) {
    const provided = normalizeText(request?.headers?.get?.(headerName));
    if (provided && constantTimeEqual(provided, secret)) {
      return { valid: true, source: "header" };
    }
  }

  if (request?.url && queryParamNames.length) {
    const searchParams = new URL(request.url).searchParams;
    for (const queryParamName of queryParamNames) {
      const provided = normalizeText(searchParams.get(queryParamName));
      if (provided && constantTimeEqual(provided, secret)) {
        return { valid: true, source: "query" };
      }
    }
  }

  return { valid: false, reason: "invalid-secret" };
}

export function verifyMercadoPagoWebhookSignature({
  signatureHeader,
  requestId,
  dataId,
  secret,
  now = Date.now(),
  toleranceSeconds = 300,
} = {}) {
  const normalizedSecret = normalizeText(secret);
  if (!normalizedSecret) {
    return { valid: false, reason: "missing-secret" };
  }

  const signatureParts = parseKeyValuePairs(signatureHeader);
  const timestamp = signatureParts.ts || signatureParts.t;
  const providedSignature = signatureParts.v1;
  const resourceId = normalizeText(dataId);
  const normalizedRequestId = normalizeText(requestId);

  if (!timestamp || !providedSignature || !resourceId || !normalizedRequestId) {
    return { valid: false, reason: "invalid-format" };
  }

  if (!isWithinTolerance(timestamp, { now, toleranceSeconds })) {
    return { valid: false, reason: "expired" };
  }

  const manifest = `id:${resourceId};request-id:${normalizedRequestId};ts:${timestamp};`;
  const expectedSignature = signSha256Hex(manifest, normalizedSecret);
  if (!constantTimeEqual(providedSignature.toLowerCase(), expectedSignature.toLowerCase())) {
    return { valid: false, reason: "invalid-signature" };
  }

  return {
    valid: true,
    timestamp: Number(timestamp),
    requestId: normalizedRequestId,
    dataId: resourceId,
  };
}

export function verifyCalendlyWebhookSignature({
  signatureHeader,
  rawBody,
  secret,
  now = Date.now(),
  toleranceSeconds = 300,
} = {}) {
  const normalizedSecret = normalizeText(secret);
  if (!normalizedSecret) {
    return { valid: false, reason: "missing-secret" };
  }

  const signatureParts = parseKeyValuePairs(signatureHeader);
  const timestamp = signatureParts.t;
  const providedSignature = signatureParts.v1;
  const bodyText = String(rawBody ?? "");

  if (!timestamp || !providedSignature) {
    return { valid: false, reason: "invalid-format" };
  }

  if (!isWithinTolerance(timestamp, { now, toleranceSeconds })) {
    return { valid: false, reason: "expired" };
  }

  const expectedSignature = signSha256Hex(`${timestamp}.${bodyText}`, normalizedSecret);
  if (!constantTimeEqual(providedSignature.toLowerCase(), expectedSignature.toLowerCase())) {
    return { valid: false, reason: "invalid-signature" };
  }

  return {
    valid: true,
    timestamp: Number(timestamp),
  };
}
