import {
  CRM_CALL_OUTCOME_VALUES,
  CRM_CALLING_SOURCE_DEFINITIONS,
  CRM_CALLING_CAMPAIGN_DEFINITIONS,
  normalizeCrmCallOutcome,
  normalizeCrmCallingCampaignKey,
  normalizeCrmLeadSourceOrigin,
  resolveCrmCallingCampaignDefinition,
} from "@/lib/crm/constants";
import { callCrmRpc, resolveCrmDb, selectCrmMany, selectCrmSingleOrNull } from "@/lib/crm/server";
import { CRM_STAGE_COLUMNS } from "@/lib/crm/stages";

const CRM_LEAD_QUEUE_COLUMNS =
  "id, queue_claimed_by_user_id, queue_claimed_at, queue_claim_expires_at, last_call_outcome, next_action_at, updated_at";
const CRM_CALLING_CAMPAIGN_LEAD_COLUMNS = `
  id,
  source_type,
  source_origin,
  current_stage_id,
  lead_status,
  next_action_at,
  queue_claimed_by_user_id,
  queue_claim_expires_at
`;
const CRM_CALLING_CAMPAIGN_STAGE_COLUMNS = "id, stage_key, is_won, is_lost";

function normalizeCrmCallingFilterList(values) {
  if (!values) return null;
  const rawValues = Array.isArray(values) ? values : [values];
  const normalizedValues = rawValues
    .map((value) => value?.toString().trim())
    .filter(Boolean);
  return normalizedValues.length ? normalizedValues : null;
}

function buildCrmCallingCampaignParams(campaignKey) {
  const campaign = resolveCrmCallingCampaignDefinition(campaignKey);
  return {
    campaignKey: campaign.key,
    stageKeys: campaign.stageKeys.length ? campaign.stageKeys : null,
    sourceTypes: campaign.sourceTypes.length ? campaign.sourceTypes : null,
    sourceOrigins: campaign.sourceOrigins.length ? campaign.sourceOrigins : null,
  };
}

function buildCrmCallingFilterParams({
  campaignKey = null,
  stageId = null,
  stageKey = null,
  sourceOrigin = null,
  sourceType = null,
} = {}) {
  const campaign = resolveCrmCallingCampaignDefinition(campaignKey);
  const normalizedStageId = stageId ? String(stageId).trim() : null;
  const normalizedStageKey = stageKey ? String(stageKey).trim().toLowerCase() : null;
  const normalizedSourceOrigin = normalizeCrmLeadSourceOrigin(sourceOrigin);
  const normalizedSourceType = sourceType ? String(sourceType).trim().toLowerCase() : null;

  return {
    campaignKey: campaign.key,
    stageId: normalizedStageId,
    stageKey: normalizedStageKey,
    stageKeys: normalizeCrmCallingFilterList(campaign.stageKeys),
    sourceType: normalizedSourceType,
    sourceTypes: normalizeCrmCallingFilterList(campaign.sourceTypes),
    sourceOrigin: normalizedSourceOrigin,
    sourceOrigins: normalizeCrmCallingFilterList(campaign.sourceOrigins),
  };
}

function isLeadQueueEligible(lead, stageById) {
  if (!lead || lead.lead_status !== "open") return false;

  const stage = lead.current_stage_id ? stageById.get(lead.current_stage_id) || null : null;
  if (stage?.is_won || stage?.is_lost) return false;

  const now = Date.now();
  const nextActionAt = lead.next_action_at ? new Date(lead.next_action_at).getTime() : null;
  if (Number.isFinite(nextActionAt) && nextActionAt > now) return false;

  const claimExpiresAt = lead.queue_claim_expires_at
    ? new Date(lead.queue_claim_expires_at).getTime()
    : null;
  if (lead.queue_claimed_by_user_id && Number.isFinite(claimExpiresAt) && claimExpiresAt > now) {
    return false;
  }

  return true;
}

function doesLeadMatchCampaign(lead, stageById, campaign) {
  if (!isLeadQueueEligible(lead, stageById)) return false;

  if (
    campaign.sourceOrigins?.length &&
    !campaign.sourceOrigins.includes(String(lead.source_origin || ""))
  ) {
    return false;
  }

  if (
    campaign.sourceTypes?.length &&
    !campaign.sourceTypes.includes(String(lead.source_type || ""))
  ) {
    return false;
  }

  if (campaign.stageKeys?.length) {
    const stageKey = lead.current_stage_id
      ? stageById.get(lead.current_stage_id)?.stage_key || null
      : null;
    if (!campaign.stageKeys.includes(stageKey)) {
      return false;
    }
  }

  return true;
}

export async function claimNextCrmLead(
  client,
  {
    operatorUserId = null,
    claimTimeoutSeconds = 900,
    campaignKey = null,
    stageId = null,
    stageKey = null,
    sourceOrigin = null,
    sourceType = null,
    excludeLeadIds = null,
  } = {}
) {
  const campaign = buildCrmCallingFilterParams({
    campaignKey,
    stageId,
    stageKey,
    sourceOrigin,
    sourceType,
  });
  const result = await callCrmRpc(client, "crm_claim_next_lead", {
    p_operator_user_id: operatorUserId,
    p_claim_timeout_seconds: claimTimeoutSeconds,
    p_campaign_key: campaign.campaignKey,
    p_stage_id: campaign.stageId,
    p_stage_key: campaign.stageKey,
    p_stage_keys: campaign.stageKeys,
    p_source_origin: campaign.sourceOrigin,
    p_source_type: campaign.sourceType,
    p_source_types: campaign.sourceTypes,
    p_source_origins: campaign.sourceOrigins,
    p_excluded_lead_ids: Array.isArray(excludeLeadIds) && excludeLeadIds.length ? excludeLeadIds : null,
  });

  if (Array.isArray(result)) {
    return result[0] || null;
  }
  return result || null;
}

export async function submitCrmCallOutcome(
  client,
  {
    leadId,
    operatorUserId = null,
    callOutcome = "attempted",
    note = null,
    nextActionAt = null,
    releaseClaim = true,
    metadata = {},
  } = {}
) {
  if (!leadId) {
    throw new Error("submitCrmCallOutcome requires a leadId.");
  }

  const normalizedOutcome = normalizeCrmCallOutcome(callOutcome);
  if (!normalizedOutcome) {
    throw new Error(
      `Unsupported CRM call outcome. Expected one of: ${CRM_CALL_OUTCOME_VALUES.join(", ")}.`
    );
  }

  return callCrmRpc(client, "crm_submit_call_outcome", {
    p_lead_id: leadId,
    p_operator_user_id: operatorUserId,
    p_call_outcome: normalizedOutcome,
    p_note: note,
    p_next_action_at: nextActionAt,
    p_release_claim: releaseClaim,
    p_metadata: metadata || {},
  });
}

export async function releaseCrmLeadClaim(client, { leadId } = {}) {
  if (!leadId) {
    throw new Error("releaseCrmLeadClaim requires a leadId.");
  }

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const { data, error } = await db
    .from("crm_leads")
    .update({
      queue_claimed_by_user_id: null,
      queue_claimed_at: null,
      queue_claim_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select(CRM_LEAD_QUEUE_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to release CRM lead claim.");
  }

  return data || null;
}

export async function selectCrmLeadQueueState(client, leadId) {
  if (!leadId) return null;
  return selectCrmSingleOrNull(client, "crm_leads", CRM_LEAD_QUEUE_COLUMNS, [["id", leadId]]);
}

export async function listCrmCallingCampaigns(client) {
  const db = resolveCrmDb(client);
  if (!db?.from) {
    return CRM_CALLING_CAMPAIGN_DEFINITIONS.map((campaign) => ({
      ...campaign,
      leadCount: 0,
    }));
  }

  const [leads, stages] = await Promise.all([
    selectCrmMany(db, "crm_leads", CRM_CALLING_CAMPAIGN_LEAD_COLUMNS, (query) =>
      query.eq("lead_status", "open")
    ),
    selectCrmMany(db, "crm_stages", CRM_CALLING_CAMPAIGN_STAGE_COLUMNS),
  ]);

  const stageById = new Map((stages || []).map((stage) => [stage.id, stage]));

  return CRM_CALLING_CAMPAIGN_DEFINITIONS.map((campaign) => ({
    ...campaign,
    leadCount: (leads || []).filter((lead) => doesLeadMatchCampaign(lead, stageById, campaign))
      .length,
  }));
}

export async function listCrmCallingStageOptions(client) {
  const db = resolveCrmDb(client);
  if (!db?.from) {
    return [];
  }

  const [stages, leads] = await Promise.all([
    selectCrmMany(db, "crm_stages", CRM_STAGE_COLUMNS, (query) =>
      query.eq("is_active", true).eq("pipeline_state", "open").order("position", { ascending: true })
    ),
    selectCrmMany(db, "crm_leads", "id, current_stage_id, lead_status", (query) =>
      query.eq("lead_status", "open")
    ),
  ]);

  const counts = new Map();
  for (const lead of leads || []) {
    if (!lead?.current_stage_id) continue;
    counts.set(lead.current_stage_id, (counts.get(lead.current_stage_id) || 0) + 1);
  }

  return (stages || []).map((stage) => ({
    ...stage,
    leadCount: counts.get(stage.id) || 0,
  }));
}

export async function listCrmCallingSourceOptions(client) {
  const db = resolveCrmDb(client);
  if (!db?.from) {
    return CRM_CALLING_SOURCE_DEFINITIONS.map((source) => ({
      ...source,
      leadCount: 0,
    }));
  }

  const leads = await selectCrmMany(db, "crm_leads", "source_origin, source_type, lead_status", (query) =>
    query.eq("lead_status", "open")
  );

  const sourceCounts = new Map();
  for (const lead of leads || []) {
    const origin = normalizeCrmLeadSourceOrigin(lead?.source_origin || lead?.source_type);
    if (!origin) continue;
    sourceCounts.set(origin, (sourceCounts.get(origin) || 0) + 1);
  }

  return CRM_CALLING_SOURCE_DEFINITIONS.map((source) => ({
    ...source,
    leadCount: source.sourceOrigins.length
      ? source.sourceOrigins.reduce((sum, origin) => sum + (sourceCounts.get(origin) || 0), 0)
      : (sourceCounts.get(source.key) || 0),
  }));
}

export { buildCrmCallingFilterParams, normalizeCrmCallingFilterList };
export { normalizeCrmCallingCampaignKey };
