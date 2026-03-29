import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

function crmMissingPattern(message) {
  return (
    message.includes("crm_") ||
    message.includes('relation "crm_') ||
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    message.includes("function public.crm_") ||
    message.includes("function crm_")
  );
}

export function isMissingCrmObjectError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (!message) return false;
  return crmMissingPattern(message);
}

export function resolveCrmDb(db) {
  if (hasServiceRoleClient()) {
    return getServiceSupabaseClient();
  }
  return db;
}

export async function selectCrmSingleOrNull(client, table, columns, filters = []) {
  const db = resolveCrmDb(client);
  if (!db?.from || !table) return null;

  try {
    let query = db.from(table).select(columns);
    for (const [column, value] of filters) {
      query = query.eq(column, value);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      if (isMissingCrmObjectError(error)) return null;
      throw new Error(error.message || `Failed to load ${table}.`);
    }
    return data || null;
  } catch (error) {
    if (isMissingCrmObjectError(error)) return null;
    throw error;
  }
}

export async function selectCrmMany(client, table, columns, buildQuery) {
  const db = resolveCrmDb(client);
  if (!db?.from || !table) return [];

  try {
    let query = db.from(table).select(columns);
    if (typeof buildQuery === "function") {
      query = buildQuery(query) || query;
    }
    const { data, error } = await query;
    if (error) {
      if (isMissingCrmObjectError(error)) return [];
      throw new Error(error.message || `Failed to load ${table}.`);
    }
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (isMissingCrmObjectError(error)) return [];
    throw error;
  }
}

export async function callCrmRpc(client, fn, params = {}) {
  const db = resolveCrmDb(client);
  if (!db?.rpc || !fn) return null;

  try {
    const { data, error } = await db.rpc(fn, params);
    if (error) {
      if (isMissingCrmObjectError(error)) return null;
      throw new Error(error.message || `Failed to call ${fn}.`);
    }
    return data ?? null;
  } catch (error) {
    if (isMissingCrmObjectError(error)) return null;
    throw error;
  }
}
