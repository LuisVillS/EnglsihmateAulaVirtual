import { createHmac } from "node:crypto";
import { getServiceSupabaseClient, hasServiceRoleClient } from "./supabase-service.js";
import { requirePrivateServerEnv } from "./security/env.js";
import { computeNextFailureWindow, isRateLimitLocked } from "./security/rate-limit.js";

const ADMIN_LOGIN_SCOPE = "admin-password-login";
const RECOVERY_REQUEST_EMAIL_SCOPE = "password-recovery-request:email";
const RECOVERY_REQUEST_IP_SCOPE = "password-recovery-request:ip";
const RECOVERY_VERIFY_EMAIL_SCOPE = "password-recovery-verify:email";
const RECOVERY_VERIFY_IP_SCOPE = "password-recovery-verify:ip";

const ADMIN_LOGIN_POLICY = {
  windowMinutes: 20,
  maxAttempts: 4,
  lockMinutes: 20,
};

const RECOVERY_REQUEST_POLICY = {
  windowMinutes: 10,
  maxAttempts: 3,
  lockMinutes: 10,
};

const RECOVERY_REQUEST_IP_POLICY = {
  windowMinutes: 10,
  maxAttempts: 10,
  lockMinutes: 10,
};

const RECOVERY_VERIFY_POLICY = {
  windowMinutes: 20,
  maxAttempts: 5,
  lockMinutes: 20,
};

const RECOVERY_VERIFY_IP_POLICY = {
  windowMinutes: 20,
  maxAttempts: 10,
  lockMinutes: 20,
};

export const GENERIC_AUTH_ERROR_MESSAGE = "No se pudo validar tu acceso.";
export const GENERIC_RECOVERY_CODE_MESSAGE = "Codigo invalido o expirado.";
export const RECOVERY_RATE_LIMIT_MESSAGE = "Ya enviamos un codigo recientemente. Intenta mas tarde.";
export const ADMIN_LOGIN_LOCK_MESSAGE = "Demasiados intentos. Intenta nuevamente en 20 minutos.";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeIpCandidate(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return normalized.split(",")[0].trim();
}

function readHeader(headersLike, name) {
  if (!headersLike) return "";
  if (typeof headersLike.get === "function") {
    return headersLike.get(name) || "";
  }
  if (typeof headersLike === "object") {
    const lowerName = name.toLowerCase();
    return headersLike[name] || headersLike[lowerName] || "";
  }
  return "";
}

function buildScopeKey(scope, identifier) {
  return `${scope}:${normalizeText(identifier).toLowerCase()}`;
}

function ensureServiceClient(service = null) {
  if (service?.from) {
    return service;
  }
  if (!hasServiceRoleClient()) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY para protecciones de autenticacion.");
  }
  return getServiceSupabaseClient();
}

async function loadRateLimitRecord(service, scopeKey) {
  const { data, error } = await service
    .from("auth_rate_limits")
    .select("scope_key, scope, identifier, ip_address, attempt_count, window_started_at, locked_until")
    .eq("scope_key", scopeKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "No se pudo validar el estado de seguridad.");
  }

  return data || null;
}

async function persistRateLimitRecord(service, payload) {
  const { error } = await service.from("auth_rate_limits").upsert(payload, {
    onConflict: "scope_key",
  });

  if (error) {
    throw new Error(error.message || "No se pudo actualizar el estado de seguridad.");
  }
}

async function clearRateLimitRecord(service, scopeKey) {
  const { error } = await service.from("auth_rate_limits").delete().eq("scope_key", scopeKey);
  if (error) {
    throw new Error(error.message || "No se pudo limpiar el estado de seguridad.");
  }
}

async function checkRateLimit(service, scope, identifier, now = new Date()) {
  if (!identifier) {
    return { locked: false };
  }

  const scopeKey = buildScopeKey(scope, identifier);
  const record = await loadRateLimitRecord(service, scopeKey);
  const locked = isRateLimitLocked(record, now);

  return {
    locked,
    scopeKey,
    record,
    lockedUntil: record?.locked_until || null,
  };
}

async function recordFailure(service, scope, identifier, policy, ipAddress = null, now = new Date()) {
  if (!identifier) {
    return { locked: false };
  }

  const scopeKey = buildScopeKey(scope, identifier);
  const record = await loadRateLimitRecord(service, scopeKey);
  const nextState = computeNextFailureWindow(record, {
    ...policy,
    now,
  });

  await persistRateLimitRecord(service, {
    scope_key: scopeKey,
    scope,
    identifier,
    ip_address: ipAddress || null,
    attempt_count: nextState.attemptCount,
    window_started_at: nextState.windowStartedAt.toISOString(),
    locked_until: nextState.lockedUntil?.toISOString() || null,
    updated_at: now.toISOString(),
  });

  return {
    locked: nextState.locked,
    lockedUntil: nextState.lockedUntil?.toISOString() || null,
  };
}

function getRecoverySecret() {
  return requirePrivateServerEnv("PASSWORD_RECOVERY_SECRET", {
    label: "PASSWORD_RECOVERY_SECRET",
  });
}

export function normalizeAuthEmail(value) {
  return normalizeEmail(value);
}

export function resolveRequestIp(headersLike) {
  const candidates = [
    readHeader(headersLike, "x-forwarded-for"),
    readHeader(headersLike, "x-real-ip"),
    readHeader(headersLike, "x-client-ip"),
    readHeader(headersLike, "cf-connecting-ip"),
    readHeader(headersLike, "x-vercel-forwarded-for"),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIpCandidate(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function hashRecoveryCode(email, code) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = normalizeText(code);
  if (!normalizedEmail || !normalizedCode) {
    throw new Error("El correo y el codigo son obligatorios.");
  }

  return createHmac("sha256", getRecoverySecret())
    .update(`${normalizedEmail}:${normalizedCode}`)
    .digest("hex");
}

export async function getAdminLoginLockState({ email, service = null, now = new Date() } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { locked: false };
  }

  const client = ensureServiceClient(service);
  return checkRateLimit(client, ADMIN_LOGIN_SCOPE, normalizedEmail, now);
}

export async function recordFailedAdminLogin({ email, ipAddress = null, service = null, now = new Date() } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { locked: false };
  }

  const client = ensureServiceClient(service);
  return recordFailure(client, ADMIN_LOGIN_SCOPE, normalizedEmail, ADMIN_LOGIN_POLICY, ipAddress, now);
}

export async function clearAdminLoginFailures({ email, service = null } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }

  const client = ensureServiceClient(service);
  await clearRateLimitRecord(client, buildScopeKey(ADMIN_LOGIN_SCOPE, normalizedEmail));
}

export async function assertPasswordRecoveryRequestAllowed({
  email,
  ipAddress = null,
  service = null,
  now = new Date(),
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedIp = normalizeText(ipAddress);
  const client = ensureServiceClient(service);

  const emailState = await checkRateLimit(client, RECOVERY_REQUEST_EMAIL_SCOPE, normalizedEmail, now);
  const ipState = normalizedIp
    ? await checkRateLimit(client, RECOVERY_REQUEST_IP_SCOPE, normalizedIp, now)
    : { locked: false };

  return {
    allowed: !emailState.locked && !ipState.locked,
    emailState,
    ipState,
  };
}

export async function recordPasswordRecoveryRequest({
  email,
  ipAddress = null,
  service = null,
  now = new Date(),
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedIp = normalizeText(ipAddress);
  const client = ensureServiceClient(service);

  const emailResult = await recordFailure(
    client,
    RECOVERY_REQUEST_EMAIL_SCOPE,
    normalizedEmail,
    RECOVERY_REQUEST_POLICY,
    normalizedIp,
    now
  );
  const ipResult = normalizedIp
    ? await recordFailure(
        client,
        RECOVERY_REQUEST_IP_SCOPE,
        normalizedIp,
        RECOVERY_REQUEST_IP_POLICY,
        normalizedIp,
        now
      )
    : { locked: false };

  return {
    locked: emailResult.locked || ipResult.locked,
    lockedUntil: emailResult.lockedUntil || ipResult.lockedUntil || null,
  };
}

export async function assertPasswordRecoveryVerifyAllowed({
  email,
  ipAddress = null,
  service = null,
  now = new Date(),
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedIp = normalizeText(ipAddress);
  const client = ensureServiceClient(service);

  const emailState = await checkRateLimit(client, RECOVERY_VERIFY_EMAIL_SCOPE, normalizedEmail, now);
  const ipState = normalizedIp
    ? await checkRateLimit(client, RECOVERY_VERIFY_IP_SCOPE, normalizedIp, now)
    : { locked: false };

  return {
    allowed: !emailState.locked && !ipState.locked,
    emailState,
    ipState,
  };
}

export async function recordPasswordRecoveryVerifyFailure({
  email,
  ipAddress = null,
  service = null,
  now = new Date(),
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedIp = normalizeText(ipAddress);
  const client = ensureServiceClient(service);

  const emailResult = await recordFailure(
    client,
    RECOVERY_VERIFY_EMAIL_SCOPE,
    normalizedEmail,
    RECOVERY_VERIFY_POLICY,
    normalizedIp,
    now
  );
  const ipResult = normalizedIp
    ? await recordFailure(
        client,
        RECOVERY_VERIFY_IP_SCOPE,
        normalizedIp,
        RECOVERY_VERIFY_IP_POLICY,
        normalizedIp,
        now
      )
    : { locked: false };

  return {
    locked: emailResult.locked || ipResult.locked,
    lockedUntil: emailResult.lockedUntil || ipResult.lockedUntil || null,
  };
}

export async function clearPasswordRecoveryVerifyFailures({
  email,
  ipAddress = null,
  service = null,
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedIp = normalizeText(ipAddress);
  const client = ensureServiceClient(service);

  if (normalizedEmail) {
    await clearRateLimitRecord(client, buildScopeKey(RECOVERY_VERIFY_EMAIL_SCOPE, normalizedEmail));
  }
  if (normalizedIp) {
    await clearRateLimitRecord(client, buildScopeKey(RECOVERY_VERIFY_IP_SCOPE, normalizedIp));
  }
}
