import { normalizeCrmCallingCampaignKey, normalizeCrmLeadSourceOrigin } from "@/lib/crm/constants";
import {
  isMissingCrmObjectError,
  resolveCrmDb,
  selectCrmMany,
  selectCrmSingleOrNull,
} from "@/lib/crm/server";

const CRM_CALLING_SESSION_COLUMNS = `
  id,
  operator_user_id,
  campaign_key,
  selected_stage_id,
  selected_source_origin,
  active_lead_id,
  queue_lead_ids,
  session_lead_ids,
  paused_at,
  created_at,
  updated_at
`;

const CRM_CALLING_SESSION_LEAD_COLUMNS = `
  id,
  full_name,
  email,
  phone,
  source_label,
  source_origin,
  current_stage_id,
  current_stage:crm_stages!crm_leads_current_stage_id_fkey (
    id,
    name
  )
`;

function normalizeStoredLeadIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function serializeLeadIds(values) {
  return normalizeStoredLeadIds(values);
}

function parseLeadIds(values) {
  if (Array.isArray(values)) return normalizeStoredLeadIds(values);
  if (!values || typeof values !== "object") return [];
  return [];
}

export async function upsertPausedCrmCallingSession(
  client,
  {
    sessionId = null,
    operatorUserId,
    campaignKey = "",
    selectedStageId = "",
    selectedSourceOrigin = "",
    activeLeadId = "",
    queueLeadIds = [],
    sessionLeadIds = [],
  } = {}
) {
  if (!operatorUserId) {
    throw new Error("Paused CRM calling session requires an operator.");
  }

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const nowIso = new Date().toISOString();
  const payload = {
    operator_user_id: operatorUserId,
    campaign_key: normalizeCrmCallingCampaignKey(campaignKey),
    selected_stage_id: String(selectedStageId || "").trim() || null,
    selected_source_origin: normalizeCrmLeadSourceOrigin(selectedSourceOrigin) || null,
    active_lead_id: String(activeLeadId || "").trim() || null,
    queue_lead_ids: serializeLeadIds(queueLeadIds),
    session_lead_ids: serializeLeadIds(sessionLeadIds),
    paused_at: nowIso,
    updated_at: nowIso,
  };

  const query = sessionId
    ? db.from("crm_calling_sessions").update(payload).eq("id", sessionId).select(CRM_CALLING_SESSION_COLUMNS).maybeSingle()
    : db
        .from("crm_calling_sessions")
        .insert({
          ...payload,
          created_at: nowIso,
        })
        .select(CRM_CALLING_SESSION_COLUMNS)
        .maybeSingle();

  try {
    const { data, error } = await query;
    if (error) {
      if (isMissingCrmObjectError(error)) return null;
      throw new Error(error.message || "Failed to save the paused CRM calling campaign.");
    }

    return data || null;
  } catch (error) {
    if (isMissingCrmObjectError(error)) return null;
    throw error;
  }
}

export async function closePausedCrmCallingSession(
  client,
  { sessionId = null, operatorUserId = null } = {}
) {
  if (!sessionId) return null;

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  let query = db.from("crm_calling_sessions").delete().eq("id", sessionId);
  if (operatorUserId) {
    query = query.eq("operator_user_id", operatorUserId);
  }

  try {
    const { error } = await query;
    if (error) {
      if (isMissingCrmObjectError(error)) return true;
      throw new Error(error.message || "Failed to close the paused CRM calling campaign.");
    }

    return true;
  } catch (error) {
    if (isMissingCrmObjectError(error)) return true;
    throw error;
  }
}

export async function selectPausedCrmCallingSession(client, sessionId) {
  if (!sessionId) return null;
  return selectCrmSingleOrNull(client, "crm_calling_sessions", CRM_CALLING_SESSION_COLUMNS, [["id", sessionId]]);
}

export async function listPausedCrmCallingSessions(client, { operatorUserId = null } = {}) {
  if (!operatorUserId) return [];

  const rows = await selectCrmMany(client, "crm_calling_sessions", CRM_CALLING_SESSION_COLUMNS, (query) =>
    query.eq("operator_user_id", operatorUserId).order("paused_at", { ascending: false })
  );

  if (!rows.length) return [];

  const leadIds = Array.from(new Set(rows.map((row) => row?.active_lead_id).filter(Boolean)));
  const stageIds = Array.from(new Set(rows.map((row) => row?.selected_stage_id).filter(Boolean)));
  const db = resolveCrmDb(client);

  const [leadsResult, stagesResult] = await Promise.all([
    leadIds.length
      ? db.from("crm_leads").select(CRM_CALLING_SESSION_LEAD_COLUMNS).in("id", leadIds)
      : Promise.resolve({ data: [], error: null }),
    stageIds.length
      ? db.from("crm_stages").select("id, name").in("id", stageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (leadsResult.error || stagesResult.error) {
    throw new Error(
      leadsResult.error?.message ||
        stagesResult.error?.message ||
        "Failed to load paused CRM calling campaigns."
    );
  }

  const leadById = new Map((Array.isArray(leadsResult.data) ? leadsResult.data : []).map((lead) => [lead.id, lead]));
  const stageById = new Map((Array.isArray(stagesResult.data) ? stagesResult.data : []).map((stage) => [stage.id, stage]));

  return rows.map((row) => ({
    ...row,
    queue_lead_ids: parseLeadIds(row.queue_lead_ids),
    session_lead_ids: parseLeadIds(row.session_lead_ids),
    active_lead: row.active_lead_id ? leadById.get(row.active_lead_id) || null : null,
    selected_stage: row.selected_stage_id ? stageById.get(row.selected_stage_id) || null : null,
  }));
}
