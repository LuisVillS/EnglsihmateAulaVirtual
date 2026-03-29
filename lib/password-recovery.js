"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers.js";
import { getServiceSupabaseClient, hasServiceRoleClient } from "./supabase-service.js";
import { sendRecoveryEmail } from "./brevo.js";
import {
  ADMIN_LOGIN_LOCK_MESSAGE,
  GENERIC_RECOVERY_CODE_MESSAGE,
  RECOVERY_RATE_LIMIT_MESSAGE,
  assertPasswordRecoveryRequestAllowed,
  assertPasswordRecoveryVerifyAllowed,
  clearPasswordRecoveryVerifyFailures,
  hashRecoveryCode,
  normalizeAuthEmail,
  recordPasswordRecoveryRequest,
  recordPasswordRecoveryVerifyFailure,
  resolveRequestIp,
} from "./auth-security.js";

const CODE_TTL_MINUTES = 10;

async function findAccountByEmail(service, email) {
  const { data: student } = await service
    .from("profiles")
    .select("id, email, full_name, invited")
    .eq("email", email)
    .maybeSingle();
  if (student) {
    return { table: "profiles", record: student };
  }

  const { data: admin } = await service
    .from("admin_profiles")
    .select("id, email, full_name, invited")
    .eq("email", email)
    .maybeSingle();
  if (admin) {
    return { table: "admin_profiles", record: admin };
  }

  return null;
}

function ensureServiceClient(service) {
  if (service?.from) {
    return service;
  }

  if (!hasServiceRoleClient()) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY para recuperacion.");
  }

  return getServiceSupabaseClient();
}

function generateCode() {
  const randomValue = randomBytes(3).readUIntBE(0, 3) % 1000000;
  return randomValue.toString().padStart(6, "0");
}

function handleQueryError(error, fallbackMessage = "No se pudo procesar la solicitud.") {
  if (error) {
    console.error("[PasswordRecovery] Supabase error:", error);
    throw new Error(fallbackMessage);
  }
}

async function resolveRequestIpForRecovery(requestIp) {
  if (requestIp) {
    return String(requestIp).trim() || null;
  }

  try {
    const headerStore = await headers();
    return resolveRequestIp(headerStore);
  } catch {
    return null;
  }
}

async function loadLatestRecoveryRow(service, normalizedEmail) {
  const { data, error } = await service
    .from("password_recovery_codes")
    .select("id, email, code, expires_at, used, used_at, requested_ip, created_at")
    .eq("email", normalizedEmail)
    .eq("used", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  handleQueryError(error, GENERIC_RECOVERY_CODE_MESSAGE);
  return data || null;
}

function isExpired(expiresAt, now = new Date()) {
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return true;
  return expires.getTime() <= now.getTime();
}

export async function requestPasswordRecovery(email, options = {}) {
  const normalized = normalizeAuthEmail(email);
  if (!normalized) {
    throw new Error("Ingresa un correo valido.");
  }

  const service = ensureServiceClient(options.service);
  const requestIp = await resolveRequestIpForRecovery(options.requestIp);
  const now = options.now ? new Date(options.now) : new Date();

  const allowedState = await assertPasswordRecoveryRequestAllowed({
    email: normalized,
    ipAddress: requestIp,
    service,
    now,
  });

  if (!allowedState.allowed) {
    throw new Error(RECOVERY_RATE_LIMIT_MESSAGE);
  }

  await recordPasswordRecoveryRequest({
    email: normalized,
    ipAddress: requestIp,
    service,
    now,
  });

  const account = await findAccountByEmail(service, normalized);
  if (!account?.record?.id || account.record.invited === false) {
    return { email: normalized };
  }

  const rawCode = generateCode();
  const codeDigest = hashRecoveryCode(normalized, rawCode);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: clearError } = await service
    .from("password_recovery_codes")
    .update({
      used: true,
      used_at: now.toISOString(),
    })
    .eq("email", normalized)
    .eq("used", false);
  handleQueryError(clearError, "No pudimos guardar el codigo.");

  const { error: insertError } = await service.from("password_recovery_codes").insert({
    email: normalized,
    code: codeDigest,
    expires_at: expiresAt,
    used: false,
    used_at: null,
    requested_ip: requestIp || null,
  });
  handleQueryError(insertError, "No pudimos guardar el codigo.");

  await sendRecoveryEmail({
    toEmail: normalized,
    name: account.record.full_name || account.record.email,
    code: rawCode,
  });

  return { email: normalized };
}

export async function verifyRecoveryCodeAndResetPassword({ email, code, newPassword }, options = {}) {
  const normalized = normalizeAuthEmail(email);
  const trimmedCode = String(code || "").trim();

  if (!normalized || !trimmedCode) {
    throw new Error(GENERIC_RECOVERY_CODE_MESSAGE);
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error("La nueva contrasena debe tener al menos 6 caracteres.");
  }

  const service = ensureServiceClient(options.service);
  const requestIp = await resolveRequestIpForRecovery(options.requestIp);
  const now = options.now ? new Date(options.now) : new Date();

  const allowedState = await assertPasswordRecoveryVerifyAllowed({
    email: normalized,
    ipAddress: requestIp,
    service,
    now,
  });

  if (!allowedState.allowed) {
    throw new Error(ADMIN_LOGIN_LOCK_MESSAGE);
  }

  const recoveryRecord = await loadLatestRecoveryRow(service, normalized);
  const account = await findAccountByEmail(service, normalized);

  if (!recoveryRecord || !account?.record?.id || account.record.invited === false) {
    const failureState = await recordPasswordRecoveryVerifyFailure({
      email: normalized,
      ipAddress: requestIp,
      service,
      now,
    });
    throw new Error(failureState.locked ? ADMIN_LOGIN_LOCK_MESSAGE : GENERIC_RECOVERY_CODE_MESSAGE);
  }

  if (isExpired(recoveryRecord.expires_at, now)) {
    const { error: markExpiredError } = await service
      .from("password_recovery_codes")
      .update({
        used: true,
        used_at: now.toISOString(),
      })
      .eq("id", recoveryRecord.id);
    handleQueryError(markExpiredError, GENERIC_RECOVERY_CODE_MESSAGE);

    const failureState = await recordPasswordRecoveryVerifyFailure({
      email: normalized,
      ipAddress: requestIp,
      service,
      now,
    });
    throw new Error(failureState.locked ? ADMIN_LOGIN_LOCK_MESSAGE : GENERIC_RECOVERY_CODE_MESSAGE);
  }

  const incomingDigest = hashRecoveryCode(normalized, trimmedCode);
  if (incomingDigest !== recoveryRecord.code) {
    const failureState = await recordPasswordRecoveryVerifyFailure({
      email: normalized,
      ipAddress: requestIp,
      service,
      now,
    });
    throw new Error(failureState.locked ? ADMIN_LOGIN_LOCK_MESSAGE : GENERIC_RECOVERY_CODE_MESSAGE);
  }

  try {
    await service.auth.admin.updateUserById(account.record.id, {
      password: newPassword,
      email_confirm: true,
    });
  } catch (error) {
    console.error("[PasswordRecovery] Admin reset error:", error);
    throw new Error("No se pudo actualizar la contrasena. Intenta mas tarde.");
  }

  const { error: profileUpdateError } = await service
    .from(account.table)
    .update({ password_set: true, invited: true })
    .eq("id", account.record.id);
  handleQueryError(profileUpdateError, "No se pudo actualizar la contrasena. Intenta mas tarde.");

  const { error: usedError } = await service
    .from("password_recovery_codes")
    .update({
      used: true,
      used_at: now.toISOString(),
    })
    .eq("id", recoveryRecord.id);
  handleQueryError(usedError, "No se pudo actualizar la contrasena. Intenta mas tarde.");

  await clearPasswordRecoveryVerifyFailures({
    email: normalized,
    ipAddress: requestIp,
    service,
  });

  return { email: normalized };
}
