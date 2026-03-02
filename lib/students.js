"use server";

import { randomBytes, randomInt } from "node:crypto";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { getLimaTodayISO } from "@/lib/commissions";
import { STUDENT_LEVELS } from "@/lib/student-constants";
import { parsePreferredHour } from "@/lib/student-time";

async function findAuthUserByEmail(serviceClient, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const perPage = 100;
  let page = 1;
  // Paginamos manualmente para evitar depender de filtros del SDK.
  while (true) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || "No se pudo verificar el usuario en Supabase.");
    }
    const users = data?.users || [];
    const match = users.find((user) => normalizeEmail(user.email) === normalized);
    if (match) {
      return match;
    }
    if (users.length < perPage) {
      break;
    }
    page += 1;
  }
  return null;
}

function ensureServiceClient() {
  if (!hasServiceRoleClient()) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY para gestionar alumnos.");
  }
  return getServiceSupabaseClient();
}

function normalizeEmail(value) {
  return value?.toString().trim().toLowerCase() || "";
}

function normalizeCourseLevel(value) {
  if (!value) return null;
  const normalized = value.toString().trim().toUpperCase();
  return STUDENT_LEVELS.includes(normalized) ? normalized : null;
}

function parseLevelNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 1 || parsed > 3) return null;
  return parsed;
}

function parseBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (value == null) return false;
  const normalized = value.toString().trim().toLowerCase();
  return ["1", "true", "yes", "y", "premium"].includes(normalized);
}

function normalizeStudentStatus(value) {
  if (!value) return "enrolled";
  return value === "pre_registered" ? "pre_registered" : "enrolled";
}

function normalizeMonthValue(value) {
  if (!value) return null;
  const str = value.toString().trim();
  if (!str) return null;
  const [year, month] = str.split("-");
  if (!year || !month) return null;
  const firstDay = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(firstDay.getTime())) return null;
  return firstDay.toISOString().slice(0, 10);
}

function normalizePhoneValue(value) {
  const digits = value?.toString().replace(/\D+/g, "") || "";
  return digits || null;
}

function normalizeBirthDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeDateValue(value, fallback = new Date()) {
  if (!value) {
    return fallback.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

function minutesToTime(value) {
  if (value == null) return null;
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = value % 60 === 0 ? "00" : "30";
  return `${hours}:${minutes}`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = value.toString().split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function isDateWithinRange(target, start, end) {
  if (!target || !start || !end) return false;
  return target >= start && target <= end;
}

const MAX_COMMISSION_STUDENTS = 20;

async function countStudentsByCommission(service, commissionIds) {
  if (!commissionIds.length) return new Map();
  const { data, error } = await service
    .from("profiles")
    .select("commission_id")
    .in("commission_id", commissionIds);
  if (error || !data) return new Map();
  const counts = new Map();
  data.forEach((row) => {
    if (!row?.commission_id) return;
    counts.set(row.commission_id, (counts.get(row.commission_id) || 0) + 1);
  });
  return counts;
}

async function isCommissionAvailable(service, commissionId, currentCommissionId) {
  if (!commissionId) return false;
  if (currentCommissionId && commissionId === currentCommissionId) return true;
  const counts = await countStudentsByCommission(service, [commissionId]);
  const total = counts.get(commissionId) || 0;
  return total < MAX_COMMISSION_STUDENTS;
}

async function resolveCommissionId({
  service,
  courseLevel,
  preferredHour,
  enrollmentDate,
  commissionId,
  modalityKey,
  currentCommissionId,
}) {
  if (commissionId) {
    const available = await isCommissionAvailable(service, commissionId, currentCommissionId);
    return available ? commissionId : null;
  }
  if (!courseLevel || preferredHour == null) return null;

  const startTime = minutesToTime(preferredHour);
  if (!startTime) return null;

  const targetDate = parseDateOnly(enrollmentDate) || new Date();

  const todayIso = getLimaTodayISO();
  const { data: commissions, error } = await service
    .from("course_commissions")
    .select("id, commission_number, start_date, end_date, start_time, modality_key")
    .eq("course_level", courseLevel)
    .eq("start_time", startTime)
    .eq("is_active", true)
    .gte("end_date", todayIso);

  if (error || !commissions?.length) return null;

  const filtered = modalityKey
    ? commissions.filter((commission) => commission.modality_key === modalityKey)
    : commissions;

  if (!filtered.length) return null;

  const commissionIds = filtered.map((commission) => commission.id);
  const counts = await countStudentsByCommission(service, commissionIds);

  const normalized = filtered.map((commission) => ({
    ...commission,
    start: parseDateOnly(commission.start_date),
    end: parseDateOnly(commission.end_date),
    total: counts.get(commission.id) || 0,
  }));

  const available = normalized.filter((commission) => commission.total < MAX_COMMISSION_STUDENTS);
  if (!available.length) return null;

  const inRange = available.filter((commission) =>
    isDateWithinRange(targetDate, commission.start, commission.end)
  );

  const candidates = inRange.length ? inRange : available;

  candidates.sort((a, b) => {
    if (inRange.length) {
      if (a.start?.getTime() !== b.start?.getTime()) {
        return b.start - a.start;
      }
    } else {
      const distA = a.start ? Math.abs(targetDate - a.start) : Number.MAX_SAFE_INTEGER;
      const distB = b.start ? Math.abs(targetDate - b.start) : Number.MAX_SAFE_INTEGER;
      if (distA !== distB) return distA - distB;
      if (a.start?.getTime() !== b.start?.getTime()) return b.start - a.start;
    }
    return (a.commission_number || 0) - (b.commission_number || 0);
  });

  return candidates[0]?.id || null;
}

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let password = "";
  for (let i = 0; i < 8; i += 1) {
    const index = bytes[i] % alphabet.length;
    password += alphabet[index];
  }
  return password;
}

function splitFullName(fullName) {
  const trimmed = fullName?.toString().trim();
  if (!trimmed) {
    return { first: null, last: null };
  }
  const parts = trimmed.split(/\s+/);
  const first = parts.shift() || null;
  const last = parts.length ? parts.join(" ") : null;
  return { first, last };
}

export async function generateStudentCode(enrollmentDate) {
  const service = ensureServiceClient();
  const baseDate = enrollmentDate ? new Date(enrollmentDate) : new Date();
  const year = baseDate.getFullYear();

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const randomPart = randomInt(1000, 10000);
    const code = `E${year}${randomPart}`;
    const { data } = await service
      .from("profiles")
      .select("id")
      .eq("student_code", code)
      .maybeSingle();

    let preEnrollmentCollision = null;
    try {
      const { data: preEnrollmentData } = await service
        .from("pre_enrollments")
        .select("id")
        .eq("student_code", code)
        .maybeSingle();
      preEnrollmentCollision = preEnrollmentData;
    } catch {
      preEnrollmentCollision = null;
    }

    if (!data && !preEnrollmentCollision) {
      return code;
    }
  }

  throw new Error("No se pudo generar un codigo de alumno unico. Intenta nuevamente.");
}

export async function saveStudentProfile({
  profileId,
  email,
  fullName,
  dni,
  phone,
  birthDate,
  courseLevel,
  levelNumber,
  isPremium,
  startMonth,
  enrollmentDate,
  preferredHour,
  commissionId,
  studentGrade,
  modalityKey,
  sendWelcomeEmail = false,
  forcePasswordReset = false,
  studentStatus = "enrolled",
}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("El correo es obligatorio.");
  }

  const resolvedStartMonth = normalizeMonthValue(startMonth);
  const resolvedEnrollmentDate = normalizeDateValue(enrollmentDate);
  const resolvedLevelNumber = parseLevelNumber(levelNumber);
  const resolvedCourseLevel = normalizeCourseLevel(courseLevel);
  const resolvedPremium = parseBooleanFlag(isPremium);
  const resolvedPreferredHour = parsePreferredHour(preferredHour);
  const hasStudentGradeInput = studentGrade !== undefined;
  const resolvedStudentStatus = normalizeStudentStatus(studentStatus);
  const resolvedRole = resolvedStudentStatus === "pre_registered" ? "non_student" : "student";
  const hasPhoneInput = phone !== undefined && phone !== null;
  const hasBirthDateInput = birthDate !== undefined && birthDate !== null;
  const nameParts = splitFullName(fullName);

  const service = ensureServiceClient();

  let targetProfile = null;
  if (profileId) {
    const { data } = await service
      .from("profiles")
      .select(
        "id, email, student_code, full_name, phone, birth_date, commission_id, commission_assigned_at, course_level, preferred_hour, student_grade"
      )
      .eq("id", profileId)
      .maybeSingle();
    if (data) {
      targetProfile = data;
    }
  }

  if (!targetProfile) {
    const { data } = await service
      .from("profiles")
      .select(
        "id, email, student_code, full_name, phone, birth_date, commission_id, commission_assigned_at, course_level, preferred_hour, student_grade"
      )
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (data) {
      targetProfile = data;
    }
  }

  const resolvedPhone = hasPhoneInput ? normalizePhoneValue(phone) : targetProfile?.phone || null;
  const resolvedBirthDate = hasBirthDateInput
    ? normalizeBirthDateValue(birthDate)
    : targetProfile?.birth_date || null;
  let resolvedStudentGrade = targetProfile?.student_grade ?? null;
  if (hasStudentGradeInput) {
    const rawGrade = String(studentGrade ?? "").trim();
    if (!rawGrade) {
      resolvedStudentGrade = null;
    } else {
      const parsedGrade = Number(rawGrade);
      if (!Number.isFinite(parsedGrade) || parsedGrade < 0 || parsedGrade > 100) {
        throw new Error("La nota admin debe estar entre 0 y 100.");
      }
      resolvedStudentGrade = Math.round((parsedGrade + Number.EPSILON) * 10) / 10;
    }
  }

  const wasExisting = Boolean(targetProfile);
  let supabaseUserId = targetProfile?.id;
  let studentCode = targetProfile?.student_code || null;
  let tempPassword = null;
  let createdUser = false;

  if (!supabaseUserId) {
    const existingUser = await findAuthUserByEmail(service, normalizedEmail);
    if (existingUser?.id) {
      supabaseUserId = existingUser.id;
    }
  }

  if (!supabaseUserId) {
    tempPassword = generateTempPassword();
    const { data, error } = await service.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName || normalizedEmail },
    });
    if (error || !data?.user?.id) {
      const duplicate =
        typeof error?.message === "string" &&
        error.message.toLowerCase().includes("already been registered");
      if (duplicate) {
        const existingAuth = await findAuthUserByEmail(service, normalizedEmail);
        if (existingAuth?.id) {
          supabaseUserId = existingAuth.id;
          tempPassword = null;
        } else {
          const { data: existingProfile } = await service
            .from("profiles")
            .select("id")
            .eq("email", normalizedEmail)
            .maybeSingle();
          if (existingProfile?.id) {
            supabaseUserId = existingProfile.id;
            tempPassword = null;
          } else {
            throw new Error("El correo ya existe en Supabase pero no se pudo vincular.");
          }
        }
      } else {
        throw new Error(error?.message || "No se pudo crear el usuario de Supabase.");
      }
    } else {
      supabaseUserId = data.user.id;
      createdUser = true;
    }
  } else if (normalizedEmail && targetProfile?.email !== normalizedEmail) {
    await service.auth.admin.updateUserById(supabaseUserId, {
      email: normalizedEmail,
      user_metadata: { full_name: fullName || normalizedEmail },
    });
  } else if (fullName && fullName !== targetProfile?.full_name) {
    await service.auth.admin.updateUserById(supabaseUserId, {
      user_metadata: { full_name: fullName },
    });
  }

  if (supabaseUserId && !createdUser && forcePasswordReset) {
    tempPassword = generateTempPassword();
    await service.auth.admin.updateUserById(supabaseUserId, {
      password: tempPassword,
    });
  }

  if (!studentCode) {
    studentCode = await generateStudentCode(resolvedEnrollmentDate);
  }

  let commissionOverride = commissionId || null;
  if (commissionOverride && commissionOverride === targetProfile?.commission_id) {
    const courseChanged = resolvedCourseLevel && resolvedCourseLevel !== targetProfile?.course_level;
    const hourChanged = resolvedPreferredHour !== targetProfile?.preferred_hour;
    if (courseChanged || hourChanged) {
      commissionOverride = null;
    }
  }

  const resolvedCommissionId = await resolveCommissionId({
    service,
    courseLevel: resolvedCourseLevel,
    preferredHour: resolvedPreferredHour,
    enrollmentDate: resolvedEnrollmentDate,
    commissionId: commissionOverride,
    modalityKey: modalityKey || null,
    currentCommissionId: targetProfile?.commission_id || null,
  });

  let resolvedModalityKey = modalityKey || null;
  if (!resolvedModalityKey && resolvedCommissionId) {
    const { data: commission } = await service
      .from("course_commissions")
      .select("modality_key")
      .eq("id", resolvedCommissionId)
      .maybeSingle();
    resolvedModalityKey = commission?.modality_key || null;
  }

  let commissionAssignedAt = targetProfile?.commission_assigned_at || null;
  if (resolvedCommissionId) {
    if (resolvedCommissionId !== targetProfile?.commission_id) {
      commissionAssignedAt = new Date().toISOString();
    }
  } else {
    commissionAssignedAt = null;
  }

  const payload = {
    id: supabaseUserId,
    email: normalizedEmail,
    full_name: fullName || [nameParts.first, nameParts.last].filter(Boolean).join(" ") || null,
    dni: dni || null,
    phone: resolvedPhone,
    birth_date: resolvedBirthDate,
    student_code: studentCode,
    course_level: resolvedCourseLevel,
    is_premium: resolvedPremium,
    start_month: resolvedStartMonth,
    enrollment_date: resolvedEnrollmentDate,
    role: resolvedRole,
    invited: true,
    status: resolvedStudentStatus,
    preferred_hour: resolvedPreferredHour,
    student_grade: resolvedStudentGrade,
    commission_id: resolvedCommissionId,
    commission_assigned_at: commissionAssignedAt,
    modality_key: resolvedModalityKey,
    ...(resolvedLevelNumber != null ? { level_number: resolvedLevelNumber } : {}),
    ...(tempPassword ? { password_set: true } : {}),
  };

  let { error: upsertError } = await service.from("profiles").upsert(payload, { onConflict: "id" });
  if (upsertError && String(upsertError.message || "").toLowerCase().includes("status")) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.status;
    const fallbackResult = await service.from("profiles").upsert(fallbackPayload, { onConflict: "id" });
    upsertError = fallbackResult.error;
  }
  if (upsertError && String(upsertError.message || "").toLowerCase().includes("student_grade")) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.student_grade;
    const fallbackResult = await service.from("profiles").upsert(fallbackPayload, { onConflict: "id" });
    upsertError = fallbackResult.error;
  }
  if (upsertError) {
    throw new Error(upsertError.message || "No se pudo guardar el alumno.");
  }

  return { id: supabaseUserId, student_code: studentCode, wasExisting, tempPassword };
}
