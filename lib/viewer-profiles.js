import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

const ADMIN_PROFILE_SELECT = "id, email, full_name, dni";
const STUDENT_PROFILE_SELECT_FULL = `
  id,
  email,
  role,
  student_code,
  full_name,
  dni,
  enrollment_date,
  commission_assigned_at,
  commission_id,
  commission:course_commissions (
    id,
    course_level,
    commission_number,
    start_date,
    end_date,
    start_time,
    end_time,
    modality_key,
    status,
    is_active
  )
`;
const STUDENT_PROFILE_SELECT_MINIMAL = "full_name, email, role, student_code, dni";

function buildStudentSelect({ includeDiscord = false, minimalStudent = false } = {}) {
  const base = minimalStudent ? STUDENT_PROFILE_SELECT_MINIMAL : STUDENT_PROFILE_SELECT_FULL;
  if (!includeDiscord || minimalStudent) {
    return base;
  }
  return `${base}, discord_user_id, discord_username, discord_connected_at`;
}

async function selectById(client, table, columns, id) {
  if (!client || !id) return null;
  const { data } = await client.from(table).select(columns).eq("id", id).maybeSingle();
  return data || null;
}

async function selectByEmail(client, table, columns, email) {
  if (!client || !email) return null;
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await client.from(table).select(columns).eq("email", normalized).maybeSingle();
  return data || null;
}

function normalizeFallbackStudentProfile(profile, { includeDiscord = false } = {}) {
  if (!profile) return null;
  return {
    id: profile.id || null,
    email: null,
    role: profile.role || null,
    student_code: null,
    full_name: profile.full_name || null,
    dni: null,
    enrollment_date: null,
    commission_assigned_at: null,
    commission_id: null,
    commission: null,
    ...(includeDiscord
      ? {
          discord_user_id: null,
          discord_username: null,
          discord_connected_at: null,
        }
      : {}),
  };
}

export async function loadViewerProfiles({
  supabase,
  user,
  contextProfile = null,
  isAdmin = false,
  includeDiscord = false,
  minimalStudent = false,
} = {}) {
  if (!supabase || !user?.id) {
    return {
      adminProfile: null,
      studentProfile: null,
    };
  }

  const studentSelect = buildStudentSelect({ includeDiscord, minimalStudent });
  const normalizedEmail = String(user.email || "").trim().toLowerCase();

  if (hasServiceRoleClient()) {
    const service = getServiceSupabaseClient();

    if (isAdmin) {
      const adminProfile =
        (await selectById(service, "admin_profiles", ADMIN_PROFILE_SELECT, user.id)) ||
        (await selectByEmail(service, "admin_profiles", ADMIN_PROFILE_SELECT, normalizedEmail));
      return {
        adminProfile,
        studentProfile: null,
      };
    }

    const studentProfile =
      (await selectById(service, "profiles", studentSelect, user.id)) ||
      (await selectByEmail(service, "profiles", studentSelect, normalizedEmail)) ||
      normalizeFallbackStudentProfile(contextProfile, { includeDiscord });

    return {
      adminProfile: null,
      studentProfile,
    };
  }

  if (isAdmin) {
    return {
      adminProfile: await selectById(supabase, "admin_profiles", ADMIN_PROFILE_SELECT, user.id),
      studentProfile: null,
    };
  }

  const studentProfile =
    (await selectById(supabase, "profiles", studentSelect, user.id)) ||
    normalizeFallbackStudentProfile(contextProfile, { includeDiscord });

  return {
    adminProfile: null,
    studentProfile,
  };
}
