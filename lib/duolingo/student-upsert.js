import { randomBytes } from "node:crypto";

let serviceHelpersPromise = null;

async function getServiceSupabaseHelpers() {
  if (!serviceHelpersPromise) {
    serviceHelpersPromise = import("../supabase-service.js");
  }
  return serviceHelpersPromise;
}

function cleanText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeStudentCode(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizeDocument(value) {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

function buildGeneratedEmail(studentCode) {
  const safeCode = normalizeStudentCode(studentCode).toLowerCase() || "student";
  return `${safeCode}@students.englishmate.local`;
}

function createTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let output = "";
  for (let idx = 0; idx < 12; idx += 1) {
    output += chars[bytes[idx] % chars.length];
  }
  return output;
}

async function loadStudentProfileById(client, profileId) {
  const columns = [
    "id, student_code, id_document, dni, full_name, email, role, status, course_level, xp_total, current_streak",
    "id, student_code, dni, full_name, email, role, status, course_level, xp_total, current_streak",
    "id, student_code, dni, full_name, email, role, status, course_level",
  ];

  for (const selectColumns of columns) {
    const result = await client.from("profiles").select(selectColumns).eq("id", profileId).maybeSingle();
    if (!result.error) {
      const profile = result.data || null;
      if (!profile) return null;
      return {
        ...profile,
        id_document: profile.id_document || profile.dni || null,
        course_level: profile.course_level || null,
        xp_total: Number(profile.xp_total || 0) || 0,
        current_streak: Number(profile.current_streak || 0) || 0,
      };
    }
  }

  return null;
}

async function loadStudentProfileByEmail(client, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const columns = [
    "id, student_code, id_document, dni, full_name, email, role, status, course_level, xp_total, current_streak",
    "id, student_code, dni, full_name, email, role, status, course_level, xp_total, current_streak",
    "id, student_code, dni, full_name, email, role, status, course_level",
  ];

  for (const selectColumns of columns) {
    const result = await client
      .from("profiles")
      .select(selectColumns)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!result.error) {
      const profile = result.data || null;
      if (!profile) return null;
      return {
        ...profile,
        id_document: profile.id_document || profile.dni || null,
        course_level: profile.course_level || null,
        xp_total: Number(profile.xp_total || 0) || 0,
        current_streak: Number(profile.current_streak || 0) || 0,
      };
    }
  }

  return null;
}

async function findByStudentCode(client, studentCode) {
  const code = normalizeStudentCode(studentCode);
  if (!code) return null;
  const { data } = await client.from("profiles").select("id").eq("student_code", code).maybeSingle();
  if (!data?.id) return null;
  return loadStudentProfileById(client, data.id);
}

async function findByDocument(client, idDocument) {
  const document = normalizeDocument(idDocument);
  if (!document) return null;

  const attempts = [
    () => client.from("profiles").select("id").eq("id_document", document).maybeSingle(),
    () => client.from("profiles").select("id").eq("dni", document).maybeSingle(),
  ];

  for (const run of attempts) {
    const result = await run();
    if (!result.error && result.data?.id) {
      return loadStudentProfileById(client, result.data.id);
    }
  }

  return null;
}

async function findAuthUserByEmail(client, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const perPage = 100;
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || "No se pudo validar usuario auth.");
    }

    const users = data?.users || [];
    const match = users.find((user) => normalizeEmail(user.email) === normalizedEmail);
    if (match) return match;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function ensureAuthUser(client, { email, fullName }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("No se pudo resolver email del alumno.");
  }

  const existing = await findAuthUserByEmail(client, normalizedEmail);
  if (existing?.id) {
    return existing.id;
  }

  const tempPassword = createTempPassword();
  const { data, error } = await client.auth.admin.createUser({
    email: normalizedEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || normalizedEmail,
    },
  });

  if (error || !data?.user?.id) {
    throw new Error(error?.message || "No se pudo crear usuario auth para alumno.");
  }

  return data.user.id;
}

export async function upsertStudentByCode({
  studentCode,
  idDocument,
  fullName,
  email,
  serviceClient,
  allowProvisioning = false,
}) {
  const code = normalizeStudentCode(studentCode);
  const document = normalizeDocument(idDocument);

  if (!code) {
    throw new Error("student_code es obligatorio.");
  }

  const client = serviceClient || (await getServiceClientIfAvailable());
  if (!client) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY para autenticar por student_code.");
  }

  if (!allowProvisioning) {
    return null;
  }

  let existing = await findByStudentCode(client, code);
  if (!existing && document) {
    existing = await findByDocument(client, document);
  }

  if (existing?.id) {
    const updatePayload = {
      student_code: code,
      updated_at: new Date().toISOString(),
    };

    const normalizedName = cleanText(fullName);
    const normalizedEmail = normalizeEmail(email);

    if (normalizedName) {
      updatePayload.full_name = normalizedName;
    }

    if (document) {
      updatePayload.id_document = document;
      updatePayload.dni = document;
    }

    if (normalizedEmail) {
      updatePayload.email = normalizedEmail;
      try {
        await client.auth.admin.updateUserById(existing.id, {
          email: normalizedEmail,
          user_metadata: {
            full_name: normalizedName || existing.full_name || normalizedEmail,
          },
        });
      } catch (error) {
        console.error("No se pudo actualizar email auth del alumno", error);
      }
    }

    const { error: updateError } = await client
      .from("profiles")
      .update(updatePayload)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(updateError.message || "No se pudo actualizar estudiante existente.");
    }

    return loadStudentProfileById(client, existing.id);
  }

  const normalizedName = cleanText(fullName) || `Student ${code}`;
  const normalizedEmail = normalizeEmail(email) || buildGeneratedEmail(code);
  const authUserId = await ensureAuthUser(client, { email: normalizedEmail, fullName: normalizedName });

  const insertPayload = {
    id: authUserId,
    email: normalizedEmail,
    full_name: normalizedName,
    student_code: code,
    id_document: document || null,
    dni: document || null,
    role: "student",
    status: "enrolled",
    invited: true,
    password_set: true,
  };

  const { error: insertError } = await client
    .from("profiles")
    .upsert(insertPayload, { onConflict: "student_code" });

  if (insertError) {
    throw new Error(insertError.message || "No se pudo crear estudiante por student_code.");
  }

  return findByStudentCode(client, code);
}

export async function resolveStudentIdentity({
  userId,
  userEmail,
  serviceClient,
}) {
  const client = serviceClient || (await getServiceClientIfAvailable());
  if (!client || !userId) {
    return null;
  }

  const profile = await loadStudentProfileById(client, userId);
  if (profile?.id) {
    return profile;
  }

  if (userEmail) {
    return loadStudentProfileByEmail(client, userEmail);
  }

  return null;
}

export { normalizeStudentCode };

async function getServiceClientIfAvailable() {
  const { getServiceSupabaseClient, hasServiceRoleClient } = await getServiceSupabaseHelpers();
  return hasServiceRoleClient() ? getServiceSupabaseClient() : null;
}
