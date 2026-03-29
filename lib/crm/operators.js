import { randomBytes } from "node:crypto";

import { fetchCrmAccessProfileByEmail, selectCrmOperatorProfileByUserId, selectCrmUserRoleByUserId } from "@/lib/crm/auth";
import { CRM_ROLE_VALUES, isCrmAdminRole, normalizeCrmRole } from "@/lib/crm/roles";
import { resolveCrmDb, selectCrmMany } from "@/lib/crm/server";

const CRM_USER_ROLE_COLUMNS =
  "user_id, email, role, is_active, provisioned_by_user_id, provisioned_at, created_at, updated_at";

const CRM_OPERATOR_COLUMNS =
  "user_id, email, full_name, phone, notes, is_active, created_at, updated_at";

function normalizeEmail(value) {
  return value?.toString().trim().toLowerCase() || "";
}

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function generateTemporaryPassword() {
  return `${randomBytes(10).toString("base64url")}A1!`;
}

async function findAuthUserByEmail(service, email) {
  if (!service?.auth?.admin) return null;

  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || "Failed to inspect CRM auth users.");
    }

    const users = data?.users || [];
    const match = users.find((user) => normalizeEmail(user.email) === email);
    if (match) return match;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function loadCrmOperatorRows(client, { includeInactive = true } = {}) {
  const db = resolveCrmDb(client);
  if (!db?.from) return [];

  const roles = await selectCrmMany(db, "crm_user_roles", CRM_USER_ROLE_COLUMNS, (query) => {
    let nextQuery = query.order("created_at", { ascending: false });
    if (!includeInactive) {
      nextQuery = nextQuery.eq("is_active", true);
    }
    return nextQuery;
  });

  const rows = [];
  for (const role of roles) {
    const profile = await selectCrmOperatorProfileByUserId(db, role.user_id, CRM_OPERATOR_COLUMNS);
    rows.push({
      ...role,
      profile,
      crmRole: normalizeCrmRole(role.role),
      isCrmAdmin: isCrmAdminRole(role.role),
    });
  }

  return rows;
}

export async function listCrmOperators(client, options = {}) {
  return loadCrmOperatorRows(client, options);
}

export async function provisionCrmOperator(
  client,
  {
    email,
    fullName = null,
    phone = null,
    notes = null,
    role = "crm_operator",
    isActive = true,
    temporaryPassword = null,
    actorUserId = null,
  } = {}
) {
  const db = resolveCrmDb(client);
  if (!db?.auth?.admin) {
    throw new Error("CRM operator provisioning requires the Supabase service role client.");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("provisionCrmOperator requires an email.");
  }

  const normalizedRole = normalizeCrmRole(role);
  if (!normalizedRole) {
    throw new Error(`Unsupported CRM role: ${role}`);
  }

  const existingAccess = await fetchCrmAccessProfileByEmail(normalizedEmail);
  if (existingAccess?.adminProfile && !existingAccess?.crmUserRole) {
    throw new Error("This email already belongs to a classic admin account and cannot be provisioned as CRM-only.");
  }

  let authUser = null;
  let authUserCreated = false;
  const existingAuthUser = await findAuthUserByEmail(db, normalizedEmail);
  if (existingAuthUser) {
    authUser = existingAuthUser;
  } else {
    const password = normalizeFreeText(temporaryPassword) || generateTemporaryPassword();
    const { data, error } = await db.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: normalizeFreeText(fullName) || normalizedEmail,
        account_type: "crm",
      },
    });

    if (error || !data?.user?.id) {
      throw new Error(error?.message || "Failed to create CRM operator auth user.");
    }

    authUser = data.user;
    authUserCreated = true;
    if (!temporaryPassword) {
      authUser.temporaryPassword = password;
    }
  }

  const nowIso = new Date().toISOString();
  const rolePayload = {
    user_id: authUser.id,
    email: normalizedEmail,
    role: normalizedRole,
    is_active: Boolean(isActive),
    provisioned_by_user_id: actorUserId || null,
    provisioned_at: nowIso,
    updated_at: nowIso,
  };

  const profilePayload = {
    user_id: authUser.id,
    email: normalizedEmail,
    full_name: normalizeFreeText(fullName) || authUser.user_metadata?.full_name || normalizedEmail,
    phone: normalizeFreeText(phone),
    notes: normalizeFreeText(notes),
    is_active: Boolean(isActive),
    updated_at: nowIso,
  };

  const [roleResult, profileResult] = await Promise.all([
    db
      .from("crm_user_roles")
      .upsert(rolePayload, { onConflict: "user_id" })
      .select(CRM_USER_ROLE_COLUMNS)
      .maybeSingle(),
    db
      .from("crm_operator_profiles")
      .upsert(profilePayload, { onConflict: "user_id" })
      .select(CRM_OPERATOR_COLUMNS)
      .maybeSingle(),
  ]);

  if (roleResult.error) {
    throw new Error(roleResult.error.message || "Failed to save CRM operator role.");
  }

  if (profileResult.error) {
    throw new Error(profileResult.error.message || "Failed to save CRM operator profile.");
  }

  return {
    authUser,
    authUserCreated,
    temporaryPassword: authUserCreated ? authUser.temporaryPassword || null : null,
    crmUserRole: roleResult.data || null,
    crmOperatorProfile: profileResult.data || null,
  };
}

export async function setCrmOperatorActive(
  client,
  { userId, isActive = true, actorUserId = null } = {}
) {
  if (!userId) {
    throw new Error("setCrmOperatorActive requires a userId.");
  }

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const [role, profile] = await Promise.all([
    selectCrmUserRoleByUserId(db, userId),
    selectCrmOperatorProfileByUserId(db, userId),
  ]);

  if (!role && !profile) return null;

  const nowIso = new Date().toISOString();

  const updates = [];
  if (role) {
    updates.push(
      db
        .from("crm_user_roles")
        .update({
          is_active: Boolean(isActive),
          provisioned_by_user_id: actorUserId || role.provisioned_by_user_id || null,
          provisioned_at: role.provisioned_at || nowIso,
          updated_at: nowIso,
        })
        .eq("user_id", userId)
        .select(CRM_USER_ROLE_COLUMNS)
        .maybeSingle()
    );
  }

  if (profile) {
    updates.push(
      db
        .from("crm_operator_profiles")
        .update({
          is_active: Boolean(isActive),
          updated_at: nowIso,
        })
        .eq("user_id", userId)
        .select(CRM_OPERATOR_COLUMNS)
        .maybeSingle()
    );
  }

  const [roleResult, profileResult] = await Promise.all(updates);
  if (roleResult?.error) {
    throw new Error(roleResult.error.message || "Failed to update CRM operator role.");
  }
  if (profileResult?.error) {
    throw new Error(profileResult.error.message || "Failed to update CRM operator profile.");
  }

  return {
    crmUserRole: roleResult?.data || role || null,
    crmOperatorProfile: profileResult?.data || profile || null,
  };
}

export async function updateCrmOperatorProfile(
  client,
  { userId, fullName = null, phone = null, notes = null } = {}
) {
  if (!userId) {
    throw new Error("updateCrmOperatorProfile requires a userId.");
  }

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const existing = await selectCrmOperatorProfileByUserId(db, userId);
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("crm_operator_profiles")
    .update({
      full_name: normalizeFreeText(fullName) || existing.full_name || existing.email,
      phone: normalizeFreeText(phone),
      notes: normalizeFreeText(notes),
      updated_at: nowIso,
    })
    .eq("user_id", userId)
    .select(CRM_OPERATOR_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update CRM operator profile.");
  }

  return data || existing;
}

export async function listCrmOperatorsByRole(client, role = null) {
  const operators = await listCrmOperators(client);
  if (!role) return operators;

  const normalizedRole = normalizeCrmRole(role);
  if (!normalizedRole) return [];

  return operators.filter((item) => item.crmRole === normalizedRole);
}

export { CRM_ROLE_VALUES };
