import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { getLimaTodayISO } from "@/lib/commissions";
import { generateStudentCode } from "@/lib/students";

const OTP_TTL_MINUTES = 3;
const OTP_RATE_WINDOW_SECONDS = 60;
const OTP_RATE_MAX_PER_WINDOW = 1;
const OTP_RATE_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const RESERVATION_MINUTES = 10;

function ensureServiceClient() {
  if (!hasServiceRoleClient()) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY para pre-matricula.");
  }
  return getServiceSupabaseClient();
}

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const quotedMatch = message.match(/'([^']+)' column/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

function normalizeEmail(value) {
  return value?.toString().trim().toLowerCase() || "";
}

function normalizePhone(value) {
  const digits = value?.toString().replace(/\D+/g, "") || "";
  if (!digits) return "";
  if (digits.length === 9) {
    return `51${digits}`;
  }
  return digits;
}

function parseBirthDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function getOtpSecret() {
  const secret = process.env.OTP_SECRET;
  if (!secret) {
    throw new Error("Configura OTP_SECRET para validar el codigo.");
  }
  return secret;
}

function hashOtp(code) {
  const secret = getOtpSecret();
  return createHash("sha256").update(`${secret}:${code}`).digest("hex");
}

function generateOtp() {
  const value = randomBytes(3).readUIntBE(0, 3) % 1000000;
  return value.toString().padStart(6, "0");
}

function getCurrentPeriod(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

function normalizeStartMonth(value) {
  if (!value) return null;
  const str = value.toString().trim();
  const [year, month] = str.split("-");
  if (!year || !month) return null;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeCourseType(value) {
  const normalized = value?.toString().trim().toLowerCase();
  if (normalized === "premium") return "PREMIUM";
  return "REGULAR";
}

function normalizeCourseId(value) {
  const raw = value?.toString().trim();
  if (!raw) return null;
  return /^[0-9a-fA-F-]{36}$/.test(raw) ? raw : null;
}

async function findAuthUserByEmail(service, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const perPage = 100;
  let page = 1;
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || "No se pudo verificar el usuario en Supabase.");
    }
    const users = data?.users || [];
    const match = users.find((user) => normalizeEmail(user.email) === normalized);
    if (match) return match;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

function generateTempPassword() {
  return randomBytes(8).toString("hex");
}

async function createAuthUserForPreEnrollment(service, normalizedEmail, fullName) {
  const baseMetadata = { full_name: fullName || normalizedEmail };
  const tryCreate = async (metadata) => {
    const tempPassword = generateTempPassword();
    return service.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: metadata,
    });
  };

  let createResult = await tryCreate(baseMetadata);
  if (!createResult.error && createResult.data?.user?.id) {
    return createResult.data.user.id;
  }

  const firstMessage = String(createResult.error?.message || "").toLowerCase();
  if (firstMessage.includes("already been registered")) {
    const existingAuth = await findAuthUserByEmail(service, normalizedEmail);
    if (existingAuth?.id) {
      return existingAuth.id;
    }
  }

  if (!firstMessage.includes("database error creating new user")) {
    throw new Error(createResult.error?.message || "No se pudo crear el usuario.");
  }

  // Fallback para proyectos con trigger legacy en auth.users que falla al insertar en profiles.
  createResult = await tryCreate({ ...baseMetadata, account_type: "admin" });
  if (createResult.error || !createResult.data?.user?.id) {
    throw new Error(
      "No se pudo crear el usuario en Auth. Revisa el trigger handle_new_user y los constraints de profiles (role/status)."
    );
  }

  const fallbackUserId = createResult.data.user.id;
  try {
    await service.from("admin_profiles").delete().eq("id", fallbackUserId);
    await service.auth.admin.updateUserById(fallbackUserId, {
      user_metadata: { ...baseMetadata, account_type: "student" },
    });
  } catch (cleanupError) {
    try {
      await service.auth.admin.deleteUser(fallbackUserId);
    } catch {
      // no-op: ya devolvemos un error claro al cliente.
    }
    throw new Error(
      "No se pudo completar la creacion segura del usuario. Revisa trigger handle_new_user y estructura de admin_profiles/profiles."
    );
  }

  return fallbackUserId;
}

async function validateOtpRateLimit(service, userId) {
  const now = Date.now();
  const windowStart = new Date(now - OTP_RATE_WINDOW_SECONDS * 1000).toISOString();
  const hourStart = new Date(now - 60 * 60 * 1000).toISOString();

  const { count: windowCount } = await service
    .from("email_verification_tokens")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);

  if ((windowCount ?? 0) >= OTP_RATE_MAX_PER_WINDOW) {
    throw new Error("Ya enviamos un codigo recientemente. Intenta en unos segundos.");
  }

  const { count: hourCount } = await service
    .from("email_verification_tokens")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", hourStart);

  if ((hourCount ?? 0) >= OTP_RATE_MAX_PER_HOUR) {
    throw new Error("Has alcanzado el limite de envios por hora.");
  }
}

export async function upsertPreEnrollmentProfile({ email, fullName, phone, birthDate }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("El correo es obligatorio.");
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error("El celular es obligatorio.");
  }
  const parsedBirth = parseBirthDate(birthDate);
  if (!parsedBirth) {
    throw new Error("La fecha de nacimiento es invalida.");
  }

  const service = ensureServiceClient();

  let existingProfile = null;
  {
    let profileResult = await service
      .from("profiles")
      .select("id, email, full_name, student_code, status, role")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (profileResult.error && String(profileResult.error.message || "").toLowerCase().includes("status")) {
      profileResult = await service
        .from("profiles")
        .select("id, email, full_name, student_code, role")
        .eq("email", normalizedEmail)
        .maybeSingle();
    }
    existingProfile = profileResult.data || null;
  }

  let userId = existingProfile?.id || null;
  let studentCode = existingProfile?.student_code || null;

  if (!userId) {
    const existingAuth = await findAuthUserByEmail(service, normalizedEmail);
    if (existingAuth?.id) {
      userId = existingAuth.id;
    }
  }

  if (!userId) {
    userId = await createAuthUserForPreEnrollment(service, normalizedEmail, fullName);
  }

  if (!studentCode) {
    studentCode = await generateStudentCode();
  }

  const isExistingStudent =
    existingProfile?.role === "student" || existingProfile?.status === "enrolled";

  const payload = {
    id: userId,
    email: normalizedEmail,
    full_name: fullName || null,
    phone: normalizedPhone,
    birth_date: parsedBirth,
    email_verified_at: new Date().toISOString(),
    student_code: studentCode,
    role: isExistingStudent ? "student" : "non_student",
    invited: true,
    status: isExistingStudent ? "enrolled" : "pre_registered",
  };

  const upsertProfile = async (candidatePayload) => {
    const { error } = await service.from("profiles").upsert(candidatePayload, { onConflict: "id" });
    return error;
  };

  let upsertError = await upsertProfile(payload);
  const lowerErrorMessage = () => String(upsertError?.message || "").toLowerCase();

  if (upsertError && lowerErrorMessage().includes("status")) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.status;
    upsertError = await upsertProfile(fallbackPayload);
  }

  // Compatibilidad con esquemas legacy donde role solo permite admin/student.
  if (
    upsertError &&
    lowerErrorMessage().includes("violates check constraint") &&
    (lowerErrorMessage().includes("profiles_role_check") || lowerErrorMessage().includes("role"))
  ) {
    const legacyRolePayload = { ...payload, role: "student" };
    delete legacyRolePayload.status;
    upsertError = await upsertProfile(legacyRolePayload);
  }

  if (upsertError) {
    throw new Error(upsertError.message || "No se pudo actualizar el perfil.");
  }

  const period = getCurrentPeriod();
  let preEnrollmentPayload = {
    user_id: userId,
    student_code: studentCode,
    period,
    status: "EMAIL_VERIFIED",
    step: "ACCOUNT_CREATED",
    updated_at: new Date().toISOString(),
  };

  let preEnrollment = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await service
      .from("pre_enrollments")
      .upsert(preEnrollmentPayload, { onConflict: "user_id,period" })
      .select("*")
      .maybeSingle();
    if (!result.error) {
      preEnrollment = result.data;
      break;
    }
    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !(missingColumn in preEnrollmentPayload)) {
      throw new Error(result.error.message || "No se pudo guardar la pre-matricula.");
    }
    delete preEnrollmentPayload[missingColumn];
  }

  return { userId, studentCode, preEnrollment };
}

export async function createEmailVerificationToken(userId) {
  const service = ensureServiceClient();
  await validateOtpRateLimit(service, userId);

  const code = generateOtp();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await service.from("email_verification_tokens").insert({
    user_id: userId,
    code_hash: codeHash,
    expires_at: expiresAt,
    attempts: 0,
  });

  if (error) {
    throw new Error(error.message || "No se pudo generar el codigo.");
  }

  return { code, expiresAt };
}

export async function verifyEmailOtp({ userId, code }) {
  const trimmed = code?.toString().trim();
  if (!trimmed) {
    throw new Error("El codigo es obligatorio.");
  }

  const service = ensureServiceClient();
  const { data: token } = await service
    .from("email_verification_tokens")
    .select("id, code_hash, expires_at, attempts")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!token) {
    throw new Error("Codigo invalido o expirado.");
  }

  if ((token.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    throw new Error("Se excedio el numero de intentos.");
  }

  const expired = new Date(token.expires_at).getTime() < Date.now();
  if (expired) {
    throw new Error("OTP expirado.");
  }

  const incomingHash = hashOtp(trimmed);
  const match =
    token.code_hash.length === incomingHash.length &&
    timingSafeEqual(Buffer.from(token.code_hash), Buffer.from(incomingHash));
  if (!match) {
    await service
      .from("email_verification_tokens")
      .update({ attempts: (token.attempts ?? 0) + 1 })
      .eq("id", token.id);
    throw new Error("Codigo invalido o expirado.");
  }

  await service.from("profiles").update({ email_verified_at: new Date().toISOString() }).eq("id", userId);
  await service
    .from("pre_enrollments")
    .update({
      status: "EMAIL_VERIFIED",
      step: "COURSE_SELECTION",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "PENDING_EMAIL_VERIFICATION");

  await service.from("email_verification_tokens").delete().eq("user_id", userId);

  return true;
}

export async function getPreEnrollment(userId) {
  const service = ensureServiceClient();
  const period = getCurrentPeriod();
  const { data: preEnrollment } = await service
    .from("pre_enrollments")
    .select("*")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();
  return preEnrollment;
}

export function buildExpiredReservationResetPayload() {
  return {
    status: "EMAIL_VERIFIED",
    step: "COURSE_SELECTION",
    selected_level: null,
    selected_frequency: null,
    selected_course_id: null,
    selected_schedule_id: null,
    selected_start_time: null,
    selected_course_type: null,
    start_month: null,
    modality: null,
    price_total: null,
    reservation_expires_at: null,
    terms_accepted_at: null,
    payment_method: null,
    payment_proof_url: null,
    payment_proof_meta: {},
    payment_submitted_at: null,
    mp_payment_id: null,
    mp_status: null,
  };
}

export async function ensureReservationStatus(preEnrollment) {
  if (!preEnrollment) return null;
  const isMarkedExpired = preEnrollment.status === "EXPIRED";
  const isReservedAndExpired =
    preEnrollment.status === "RESERVED" &&
    preEnrollment.reservation_expires_at &&
    new Date(preEnrollment.reservation_expires_at).getTime() <= Date.now();

  if (!isMarkedExpired && !isReservedAndExpired) {
    return preEnrollment;
  }

  return updatePreEnrollmentSelection({
    preEnrollmentId: preEnrollment.id,
    payload: buildExpiredReservationResetPayload(),
  });
}

export async function reservePreEnrollment(preEnrollmentId) {
  const service = ensureServiceClient();
  const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000).toISOString();
  const { data } = await service
    .from("pre_enrollments")
    .update({
      status: "RESERVED",
      reservation_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", preEnrollmentId)
    .select("*")
    .maybeSingle();
  return data;
}

export async function updatePreEnrollmentSelection({ preEnrollmentId, payload }) {
  const service = ensureServiceClient();
  let updatePayload = { ...payload, updated_at: new Date().toISOString() };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await service
      .from("pre_enrollments")
      .update(updatePayload)
      .eq("id", preEnrollmentId)
      .select("*")
      .maybeSingle();
    if (!result.error) {
      return result.data;
    }
    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !(missingColumn in updatePayload)) {
      throw new Error(result.error.message || "No se pudo actualizar pre-matricula.");
    }
    delete updatePayload[missingColumn];
  }

  throw new Error("No se pudo actualizar pre-matricula.");
}

export function normalizePreEnrollmentInput({
  level,
  frequency,
  courseId,
  scheduleId,
  modality,
  startTime,
  courseType,
  startMonth,
}) {
  return {
    selected_level: level || null,
    selected_frequency: frequency || null,
    selected_course_id: normalizeCourseId(courseId),
    selected_schedule_id: scheduleId || null,
    selected_start_time: startTime || null,
    selected_course_type: normalizeCourseType(courseType),
    start_month: normalizeStartMonth(startMonth),
    modality: modality || null,
  };
}

export function normalizeReservationInput(preEnrollment) {
  if (!preEnrollment) return null;
  return {
    status: preEnrollment.status,
    reservation_expires_at: preEnrollment.reservation_expires_at,
  };
}

async function countStudentsByCommission(service, commissionIds) {
  if (!commissionIds.length) return new Map();
  const { data } = await service.from("profiles").select("commission_id").in("commission_id", commissionIds);
  const map = new Map();
  (data || []).forEach((row) => {
    if (!row?.commission_id) return;
    map.set(row.commission_id, (map.get(row.commission_id) || 0) + 1);
  });
  return map;
}

export async function resolveCommissionForPreEnrollment({
  level,
  frequency,
  startTime,
  startMonth,
}) {
  const service = ensureServiceClient();
  const todayIso = getLimaTodayISO();
  let query = service
    .from("course_commissions")
    .select("id, course_level, commission_number, modality_key, start_time, start_date, is_active")
    .eq("is_active", true)
    .gte("end_date", todayIso)
    .eq("course_level", level)
    .eq("modality_key", frequency)
    .eq("start_time", startTime);

  const { data } = await query;
  const commissions = data || [];
  if (!commissions.length) return null;

  const [year, month] = startMonth?.toString().slice(0, 10).split("-").map(Number) || [];
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

  const candidates = commissions.filter((commission) => {
    const date = commission.start_date ? new Date(commission.start_date) : null;
    return date && date.getFullYear() === year && date.getMonth() + 1 === month;
  });
  if (!candidates.length) return null;

  const counts = await countStudentsByCommission(service, candidates.map((item) => item.id));
  const available = candidates.filter((item) => (counts.get(item.id) || 0) < 20);
  const ranked = (available.length ? available : candidates).sort((a, b) => {
    const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
    const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
    if (dateA !== dateB) return dateB - dateA;
    return (a.commission_number || 0) - (b.commission_number || 0);
  });

  return ranked[0] || null;
}
