"use server";

import { randomBytes } from "node:crypto";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { sendRecoveryEmail } from "@/lib/brevo";

const CODE_TTL_MINUTES = 10;
const RATE_LIMIT_WINDOW_MINUTES = 2;
const RATE_LIMIT_MAX_REQUESTS = 3;
const NOT_REGISTERED_MESSAGE = "Este correo no se encuentra registrado en el aula virtual.";
const GENERIC_RATE_MESSAGE = "Ya enviamos un codigo recientemente. Intenta mas tarde.";
const GENERIC_CODE_MESSAGE = "Codigo invalido o expirado.";

function normalizeEmail(value) {
  return value?.toString().trim().toLowerCase() || "";
}

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

function ensureServiceClient() {
  if (!hasServiceRoleClient()) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY para recuperación.");
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

export async function requestPasswordRecovery(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error("Ingresa un correo valido.");
  }

  const service = ensureServiceClient();

  const account = await findAccountByEmail(service, normalized);

  if (!account?.record?.id || account.record.invited === false) {
    throw new Error(NOT_REGISTERED_MESSAGE);
  }

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error: countError } = await service
    .from("password_recovery_codes")
    .select("*", { count: "exact", head: true })
    .eq("email", normalized)
    .gte("created_at", windowStart);
  handleQueryError(countError, "No pudimos validar el correo.");

  if ((count ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
    throw new Error(GENERIC_RATE_MESSAGE);
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await service.from("password_recovery_codes").insert({
    email: normalized,
    code,
    expires_at: expiresAt,
  });
  handleQueryError(insertError, "No pudimos guardar el codigo.");

  await sendRecoveryEmail({
    toEmail: normalized,
    name: account.record.full_name || account.record.email,
    code,
  });

  return { email: normalized };
}

export async function verifyRecoveryCodeAndResetPassword({ email, code, newPassword }) {
  const normalized = normalizeEmail(email);
  const trimmedCode = code?.toString().trim() || "";

  if (!normalized || !trimmedCode) {
    throw new Error(GENERIC_CODE_MESSAGE);
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error("La nueva contrasena debe tener al menos 6 caracteres.");
  }

  const service = ensureServiceClient();

  const account = await findAccountByEmail(service, normalized);

  if (!account?.record?.id || account.record.invited === false) {
    throw new Error(NOT_REGISTERED_MESSAGE);
  }

  const { data: recoveryRecord, error: recoveryError } = await service
    .from("password_recovery_codes")
    .select("id, expires_at, used")
    .eq("email", normalized)
    .eq("code", trimmedCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  handleQueryError(recoveryError, GENERIC_CODE_MESSAGE);

  if (!recoveryRecord) {
    throw new Error(GENERIC_CODE_MESSAGE);
  }

  const expired = new Date(recoveryRecord.expires_at).getTime() < Date.now();
  if (recoveryRecord.used || expired) {
    const { error: markUsedError } = await service
      .from("password_recovery_codes")
      .update({ used: true })
      .eq("id", recoveryRecord.id);
    handleQueryError(markUsedError, GENERIC_CODE_MESSAGE);
    throw new Error(GENERIC_CODE_MESSAGE);
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
    .update({ used: true })
    .eq("email", normalized);
  handleQueryError(usedError, "No se pudo actualizar la contrasena. Intenta mas tarde.");

  return { email: normalized };
}
