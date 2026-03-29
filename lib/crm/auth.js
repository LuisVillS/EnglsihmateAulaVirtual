import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import {
  CRM_ROLE_VALUES,
  isCrmAdminRole,
  isCrmOperatorRole,
  isCrmPath,
  isCrmRole,
  normalizeCrmRole,
} from "@/lib/crm/roles";

const CRM_USER_ROLE_COLUMNS =
  "user_id, email, role, is_active, provisioned_by_user_id, provisioned_at, created_at, updated_at";
const CRM_OPERATOR_PROFILE_COLUMNS = "user_id, email, full_name, phone, notes, is_active, created_at, updated_at";
const ADMIN_PROFILE_COLUMNS = "id, email, full_name, invited, password_set";

function normalizeEmail(value) {
  return value?.toString().trim().toLowerCase() || "";
}

function isMissingCrmRelationError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("crm_user_roles") ||
    message.includes("crm_operator_profiles") ||
    message.includes('relation "crm_user_roles"') ||
    message.includes('relation "crm_operator_profiles"') ||
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

async function selectSingleOrNull(client, table, columns, filters = []) {
  if (!client?.from || !table) return null;

  try {
    let query = client.from(table).select(columns);
    for (const [column, value] of filters) {
      query = query.eq(column, value);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      if (isMissingCrmRelationError(error)) return null;
      return null;
    }
    return data || null;
  } catch (error) {
    if (isMissingCrmRelationError(error)) return null;
    return null;
  }
}

export async function selectCrmUserRoleByUserId(client, userId, columns = CRM_USER_ROLE_COLUMNS) {
  if (!client?.from || !userId) return null;
  return selectSingleOrNull(client, "crm_user_roles", columns, [["user_id", userId]]);
}

export async function selectCrmOperatorProfileByUserId(
  client,
  userId,
  columns = CRM_OPERATOR_PROFILE_COLUMNS
) {
  if (!client?.from || !userId) return null;
  return selectSingleOrNull(client, "crm_operator_profiles", columns, [["user_id", userId]]);
}

export async function getCrmAccessState(client, userId) {
  if (!client?.from || !userId) {
    return {
      userId: userId || null,
      email: null,
      isClassicAdmin: false,
      isCrmRole: false,
      isCrmAdmin: false,
      isCrmOperator: false,
      crmRole: null,
      adminProfile: null,
      crmUserRole: null,
      crmOperatorProfile: null,
      landingPath: null,
    };
  }

  const [adminProfile, crmUserRole, crmOperatorProfile] = await Promise.all([
    selectSingleOrNull(client, "admin_profiles", ADMIN_PROFILE_COLUMNS, [["id", userId]]),
    selectCrmUserRoleByUserId(client, userId),
    selectCrmOperatorProfileByUserId(client, userId),
  ]);

  const crmRole = crmUserRole?.is_active === false ? null : normalizeCrmRole(crmUserRole?.role);
  const isClassicAdmin = Boolean(adminProfile?.id);
  const isCrmRoleValue = isCrmRole(crmRole);
  const isCrmAdmin = isCrmAdminRole(crmRole);
  const isCrmOperator = isCrmOperatorRole(crmRole);

  return {
    userId,
    email: adminProfile?.email || crmUserRole?.email || crmOperatorProfile?.email || null,
    isClassicAdmin,
    isCrmRole: isCrmRoleValue,
    isCrmAdmin,
    isCrmOperator,
    isCrmActive: Boolean(crmUserRole?.is_active !== false && crmRole),
    crmRole,
    adminProfile,
    crmUserRole,
    crmOperatorProfile,
    landingPath: isClassicAdmin ? "/admin" : isCrmRoleValue ? "/admin/crm" : null,
  };
}

export async function resolveAdminLandingPath(client, userId) {
  const state = await getCrmAccessState(client, userId);
  return state?.landingPath || null;
}

export async function fetchCrmAccessProfileByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  if (!hasServiceRoleClient()) return null;

  const client = getServiceSupabaseClient();
  const [adminProfile, crmUserRole, crmOperatorProfile] = await Promise.all([
    selectSingleOrNull(client, "admin_profiles", ADMIN_PROFILE_COLUMNS, [["email", normalizedEmail]]),
    selectSingleOrNull(client, "crm_user_roles", CRM_USER_ROLE_COLUMNS, [["email", normalizedEmail]]),
    selectSingleOrNull(client, "crm_operator_profiles", CRM_OPERATOR_PROFILE_COLUMNS, [["email", normalizedEmail]]),
  ]);

  if (!adminProfile && !crmUserRole && !crmOperatorProfile) {
    return null;
  }

  const crmRole = crmUserRole?.is_active === false ? null : normalizeCrmRole(crmUserRole?.role);
  const isClassicAdmin = Boolean(adminProfile?.id);
  const isCrmRoleValue = isCrmRole(crmRole);

  return {
    email: normalizedEmail,
    userId: adminProfile?.id || crmUserRole?.user_id || crmOperatorProfile?.user_id || null,
    adminProfile,
    crmUserRole,
    crmOperatorProfile,
    crmRole,
    isClassicAdmin,
    isCrmRole: isCrmRoleValue,
    isCrmAdmin: isCrmAdminRole(crmRole),
    isCrmOperator: isCrmOperatorRole(crmRole),
    isCrmActive: Boolean(crmUserRole?.is_active !== false && crmRole),
    landingPath: isClassicAdmin ? "/admin" : isCrmRoleValue ? "/admin/crm" : null,
  };
}

export { CRM_ROLE_VALUES, isCrmAdminRole, isCrmOperatorRole, isCrmPath, isCrmRole, normalizeCrmRole };
