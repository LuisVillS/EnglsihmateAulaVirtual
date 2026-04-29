import { callCrmRpc, resolveCrmDb, selectCrmMany, selectCrmSingleOrNull } from "@/lib/crm/server";
import { CRM_STAGE_COLUMNS, selectCrmStageById, selectCrmStageByKey } from "@/lib/crm/stages";
import { getCrmAccessState } from "@/lib/crm/auth";
import { normalizeCrmPhoneInput } from "@/lib/crm/phones";

export const CRM_LEAD_COLUMNS = `
  id,
  source_type,
  source_label,
  source_origin,
  source_metadata,
  source_provider,
  source_event_id,
  source_payload,
  raw_source_type,
  raw_source_label,
  raw_source_event_id,
  raw_source_metadata,
  raw_source_payload,
  user_id,
  pre_enrollment_id,
  email,
  full_name,
  phone,
  phone_country_code,
  phone_national_number,
  phone_e164,
  phone_dialable,
  phone_validation_status,
  phone_validation_reason,
  phone_raw_input,
  site_key,
  host,
  form_key,
  form_label,
  page_path,
  landing_url,
  referrer_url,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_term,
  utm_content,
  first_submission_at,
  last_submission_at,
  latest_inbound_event_id,
  external_lead_id,
  meta_page_id,
  meta_form_id,
  meta_ad_id,
  meta_campaign_id,
  current_stage_id,
  lead_status,
  current_pre_enrollment_status,
  assigned_operator_user_id,
  queue_claimed_by_user_id,
  queue_claimed_at,
  queue_claim_expires_at,
  last_call_outcome,
  last_interaction_at,
  next_action_at,
  last_stage_change_at,
  approved_revenue_billing_month,
  approved_revenue_soles,
  approved_payment_count,
  latest_approved_payment_at,
  approved_pre_enrollment_at,
  won_at,
  lost_at,
  stage_follow_up_sent_at,
  stage_follow_up_stage_id,
  archived_at,
  archived_by_user_id,
  archive_reason,
  last_synced_at,
  created_at,
  updated_at
`;

export const CRM_LEAD_SOURCE_TAG_COLUMNS = `
  id,
  lead_id,
  source_key,
  source_origin,
  source_type,
  source_label,
  source_provider,
  source_event_id,
  source_metadata,
  is_primary,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
`;

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function normalizeSourceKeyPart(value) {
  return normalizeFreeText(value)?.toLowerCase().replace(/\s+/g, "_") || "unknown";
}

function buildCrmLeadSourceKey({
  sourceOrigin,
  sourceType,
  sourceProvider,
  sourceLabel,
  sourceMetadata = {},
} = {}) {
  const metadata = sourceMetadata && typeof sourceMetadata === "object" ? sourceMetadata : {};
  return [
    normalizeSourceKeyPart(sourceOrigin),
    normalizeSourceKeyPart(sourceType),
    normalizeSourceKeyPart(sourceProvider),
    normalizeSourceKeyPart(metadata.site_key),
    normalizeSourceKeyPart(metadata.form_key),
    normalizeSourceKeyPart(metadata.page_path),
    normalizeSourceKeyPart(sourceLabel || metadata.form_label || metadata.source_label),
  ].join(":");
}

function buildPhoneLookupFilters(phoneInput) {
  const normalized = normalizeCrmPhoneInput(
    typeof phoneInput === "string" ? { phone: phoneInput } : phoneInput || {}
  );

  return {
    normalized,
    hasDialablePhone: Boolean(normalized.phoneE164),
  };
}

export function isCrmLeadStudent(lead) {
  if (!lead || typeof lead !== "object") return false;

  if (String(lead.lead_status || "").toLowerCase() === "won") {
    return true;
  }

  if (String(lead.current_pre_enrollment_status || "").toUpperCase() === "APPROVED") {
    return true;
  }

  if (lead.approved_pre_enrollment_at || lead.won_at) {
    return true;
  }

  return false;
}

export function deriveCrmLeadAudienceTags(lead) {
  return isCrmLeadStudent(lead) ? ["Student"] : [];
}

async function attachCrmLeadSourceTags(client, leads) {
  const db = resolveCrmDb(client);
  if (!Array.isArray(leads) || !leads.length || !db?.from) {
    return Array.isArray(leads) ? leads : [];
  }

  const leadIds = leads.map((lead) => lead?.id).filter(Boolean);
  if (!leadIds.length) {
    return leads.map((lead) => ({
      ...lead,
      source_tags: Array.isArray(lead?.source_tags) ? lead.source_tags : [],
    }));
  }

  const { data, error } = await db
    .from("crm_lead_source_tags")
    .select(CRM_LEAD_SOURCE_TAG_COLUMNS)
    .in("lead_id", leadIds)
    .order("is_primary", { ascending: false })
    .order("last_seen_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (String(error?.message || "").toLowerCase().includes("does not exist")) {
      return leads.map((lead) => ({
        ...lead,
        source_tags: Array.isArray(lead?.source_tags) ? lead.source_tags : [],
      }));
    }
    throw new Error(error.message || "Failed to load CRM lead source tags.");
  }

  const tagsByLeadId = new Map();
  for (const row of Array.isArray(data) ? data : []) {
    const leadId = row?.lead_id;
    if (!leadId) continue;
    if (!tagsByLeadId.has(leadId)) tagsByLeadId.set(leadId, []);
    tagsByLeadId.get(leadId).push(row);
  }

  return leads.map((lead) => ({
    ...lead,
    source_tags: tagsByLeadId.get(lead?.id) || [],
  }));
}

async function assertCrmLeadActionAccess(client, actorUserId) {
  if (!actorUserId) return;

  const state = await getCrmAccessState(resolveCrmDb(client), actorUserId);
  if (state?.isClassicAdmin || state?.isCrmActive) {
    return;
  }

  throw new Error("CRM lead actions require a CRM admin, CRM operator, or classic admin account.");
}

export async function listCrmStages(client, columns = CRM_STAGE_COLUMNS) {
  return selectCrmMany(client, "crm_stages", columns, (query) =>
    query.eq("is_active", true).order("position", { ascending: true }).order("created_at", { ascending: true })
  );
}

export async function listCrmLeads(
  client,
  {
    limit = 50,
    offset = 0,
    stageId = null,
    stageKey = null,
    leadStatus = null,
    sourceOrigin = null,
    sourceType = null,
    search = null,
    assignedOperatorUserId = null,
    queueClaimedByUserId = null,
    includeArchived = false,
  } = {}
) {
  const db = resolveCrmDb(client);
  if (!db?.from) return [];

  let resolvedStageId = stageId;
  if (!resolvedStageId && stageKey) {
    const stage = await selectCrmStageByKey(db, stageKey);
    resolvedStageId = stage?.id || null;
  }

  const stages = await selectCrmMany(db, "crm_stages", CRM_STAGE_COLUMNS);
  const stageById = new Map((stages || []).map((stage) => [stage.id, stage]));

  let query = db
    .from("crm_leads")
    .select(CRM_LEAD_COLUMNS)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (resolvedStageId) query = query.eq("current_stage_id", resolvedStageId);
  if (leadStatus) query = query.eq("lead_status", leadStatus);
  if (!includeArchived && leadStatus !== "archived") query = query.neq("lead_status", "archived");
  if (sourceOrigin) query = query.eq("source_origin", sourceOrigin);
  if (sourceType) query = query.eq("source_type", sourceType);
  if (assignedOperatorUserId) query = query.eq("assigned_operator_user_id", assignedOperatorUserId);
  if (queueClaimedByUserId) query = query.eq("queue_claimed_by_user_id", queueClaimedByUserId);

  const normalizedSearch = normalizeFreeText(search);
  if (normalizedSearch) {
    const safeSearch = normalizedSearch.replace(/[%_]/g, "\\$&");
    query = query.or(
      [
        `full_name.ilike.%${safeSearch}%`,
        `email.ilike.%${safeSearch}%`,
        `phone.ilike.%${safeSearch}%`,
        `phone_e164.ilike.%${safeSearch}%`,
        `phone_national_number.ilike.%${safeSearch}%`,
      ].join(",")
    );
  }

  query = query.range(Math.max(0, offset), Math.max(0, offset) + Math.max(1, limit) - 1);

  const { data, error } = await query;
  if (error) {
    if (String(error?.message || "").toLowerCase().includes("does not exist")) return [];
    throw new Error(error.message || "Failed to load CRM leads.");
  }

  const rows = await attachCrmLeadSourceTags(db, Array.isArray(data) ? data : []);
  return rows.map((row) => ({
    ...row,
    stage: row.current_stage_id ? stageById.get(row.current_stage_id) || null : null,
  }));
}

export async function listCrmStagesWithLeads(client, { leadLimit = 20 } = {}) {
  const stages = await selectCrmMany(
    client,
    "crm_stages",
    CRM_STAGE_COLUMNS,
    (query) => query.eq("is_active", true).order("position", { ascending: true })
  );

  if (!stages.length) return [];

  const leadRows = await selectCrmMany(
    client,
    "crm_leads",
    CRM_LEAD_COLUMNS,
    (query) =>
      query
        .in(
          "current_stage_id",
          stages.map((stage) => stage.id)
        )
        .eq("lead_status", "open")
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
  );

  const leadRowsWithTags = await attachCrmLeadSourceTags(client, leadRows);

  const grouped = new Map(stages.map((stage) => [stage.id, []]));
  for (const lead of leadRowsWithTags) {
    const stageId = lead?.current_stage_id;
    const bucket = grouped.get(stageId);
    if (!bucket) continue;
    if (bucket.length < Math.max(1, leadLimit)) {
      bucket.push(lead);
    }
  }

  return stages.map((stage) => ({
    ...stage,
    leads: grouped.get(stage.id) || [],
  }));
}

export async function selectCrmLeadById(client, leadId, columns = CRM_LEAD_COLUMNS) {
  if (!leadId) return null;
  const lead = await selectCrmSingleOrNull(client, "crm_leads", columns, [["id", leadId]]);
  if (!lead) return null;
  const [leadWithTags] = await attachCrmLeadSourceTags(client, [lead]);
  return leadWithTags || lead;
}

export async function selectCrmLeadByPreEnrollmentId(
  client,
  preEnrollmentId,
  columns = CRM_LEAD_COLUMNS
) {
  if (!preEnrollmentId) return null;
  const lead = await selectCrmSingleOrNull(client, "crm_leads", columns, [["pre_enrollment_id", preEnrollmentId]]);
  if (!lead) return null;
  const [leadWithTags] = await attachCrmLeadSourceTags(client, [lead]);
  return leadWithTags || lead;
}

export async function selectCrmLeadByPhone(client, phoneInput, columns = CRM_LEAD_COLUMNS) {
  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const { normalized, hasDialablePhone } = buildPhoneLookupFilters(phoneInput);
  if (!hasDialablePhone) return null;

  const queries = [
    db
      .from("crm_leads")
      .select(columns)
      .eq("phone_e164", normalized.phoneE164)
      .order("updated_at", { ascending: false })
      .limit(10),
    db
      .from("crm_leads")
      .select(columns)
      .eq("phone", normalized.phoneE164)
      .order("updated_at", { ascending: false })
      .limit(10),
  ];

  const results = await Promise.all(queries);
  const rowsById = new Map();

  for (const result of results) {
    if (result?.error) {
      if (String(result.error.message || "").toLowerCase().includes("does not exist")) {
        continue;
      }
      throw new Error(result.error.message || "Failed to load CRM lead by phone.");
    }

    for (const row of Array.isArray(result.data) ? result.data : []) {
      if (row?.id && !rowsById.has(row.id)) {
        rowsById.set(row.id, row);
      }
    }
  }

  const rows = await attachCrmLeadSourceTags(db, Array.from(rowsById.values()));
  const matched = rows.find((row) => row?.lead_status === "open") || rows[0] || null;
  return matched ? { ...matched, phone_lookup: normalized } : null;
}

export async function selectCrmLeadDetailById(client, leadId) {
  if (!leadId) return null;

  const [leadRow, interactions, stageHistory] = await Promise.all([
    selectCrmSingleOrNull(client, "crm_leads", CRM_LEAD_COLUMNS, [["id", leadId]]),
    selectCrmMany(client, "crm_interactions", `
      id,
      lead_id,
      interaction_kind,
      direction,
      operator_user_id,
      summary,
      notes,
      call_outcome,
      metadata,
      created_at
    `, (query) => query.eq("lead_id", leadId).order("created_at", { ascending: false })),
    selectCrmMany(client, "crm_stage_history", `
      id,
      lead_id,
      from_stage_id,
      to_stage_id,
      changed_by_user_id,
      reason,
      metadata,
      created_at
    `, (query) => query.eq("lead_id", leadId).order("created_at", { ascending: false })),
  ]);

  if (!leadRow) return null;

  const [lead] = await attachCrmLeadSourceTags(client, [leadRow]);

  const currentStage = lead.current_stage_id ? await selectCrmStageById(client, lead.current_stage_id) : null;

  return {
    lead,
    currentStage,
    interactions,
    stageHistory,
  };
}

export async function upsertCrmLeadFromPreEnrollment(
  client,
  { preEnrollmentId, reason = "pre_enrollment_sync", actorUserId = null } = {}
) {
  if (!preEnrollmentId) return null;
  return callCrmRpc(client, "crm_upsert_lead_from_pre_enrollment", {
    p_pre_enrollment_id: preEnrollmentId,
    p_reason: reason,
    p_actor_user_id: actorUserId,
  });
}

export async function syncApprovedCrmLeadFromPreEnrollment(
  client,
  { preEnrollmentId, reason = "approved_sync", actorUserId = null } = {}
) {
  if (!preEnrollmentId) return null;
  return callCrmRpc(client, "crm_sync_approved_pre_enrollment", {
    p_pre_enrollment_id: preEnrollmentId,
    p_reason: reason,
    p_actor_user_id: actorUserId,
  });
}

export async function upsertCrmLeadSourceTag(
  client,
  {
    leadId,
    sourceOrigin = null,
    sourceType = null,
    sourceLabel = null,
    sourceProvider = null,
    sourceEventId = null,
    sourceMetadata = {},
    isPrimary = false,
  } = {}
) {
  if (!leadId) {
    throw new Error("upsertCrmLeadSourceTag requires a leadId.");
  }
  const db = resolveCrmDb(client);
  const metadata = sourceMetadata && typeof sourceMetadata === "object" ? sourceMetadata : {};
  const normalizedOrigin = normalizeFreeText(sourceOrigin) || "other";
  const sourceKey = buildCrmLeadSourceKey({
    sourceOrigin: normalizedOrigin,
    sourceType,
    sourceProvider,
    sourceLabel,
    sourceMetadata: metadata,
  });
  const nowIso = new Date().toISOString();

  try {
    const { data: existing, error: existingError } = await db
      .from("crm_lead_source_tags")
      .select(CRM_LEAD_SOURCE_TAG_COLUMNS)
      .eq("lead_id", leadId)
      .eq("source_key", sourceKey)
      .maybeSingle();

    if (existingError && !String(existingError?.message || "").toLowerCase().includes("does not exist")) {
      throw new Error(existingError.message || "Failed to inspect CRM lead source tags.");
    }

    if (existing?.id) {
      const { data, error } = await db
        .from("crm_lead_source_tags")
        .update({
          source_origin: normalizedOrigin,
          source_type: sourceType || existing.source_type || null,
          source_label: sourceLabel || existing.source_label || null,
          source_provider: sourceProvider || existing.source_provider || null,
          source_event_id: sourceEventId || existing.source_event_id || null,
          source_metadata: {
            ...(existing.source_metadata && typeof existing.source_metadata === "object" ? existing.source_metadata : {}),
            ...metadata,
          },
          is_primary: Boolean(isPrimary || existing.is_primary),
          occurrence_count: Math.max(1, Number(existing.occurrence_count || 1) + 1),
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", existing.id)
        .select(CRM_LEAD_SOURCE_TAG_COLUMNS)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to update the CRM lead source tag.");
      }

      if (isPrimary) {
        await db
          .from("crm_lead_source_tags")
          .update({ is_primary: false, updated_at: nowIso })
          .eq("lead_id", leadId)
          .neq("id", existing.id);
      }

      return data || existing;
    }

    if (isPrimary) {
      await db.from("crm_lead_source_tags").update({ is_primary: false, updated_at: nowIso }).eq("lead_id", leadId);
    }

    const { data, error } = await db
      .from("crm_lead_source_tags")
      .insert({
        lead_id: leadId,
        source_key: sourceKey,
        source_origin: normalizedOrigin,
        source_type: sourceType,
        source_label: sourceLabel,
        source_provider: sourceProvider,
        source_event_id: sourceEventId,
        source_metadata: metadata,
        is_primary: Boolean(isPrimary),
        occurrence_count: 1,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select(CRM_LEAD_SOURCE_TAG_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to insert the CRM lead source tag.");
    }

    return data || null;
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("does not exist")) {
      return callCrmRpc(client, "crm_upsert_lead_source_tag", {
        p_lead_id: leadId,
        p_source_origin: sourceOrigin,
        p_source_type: sourceType,
        p_source_label: sourceLabel,
        p_source_provider: sourceProvider,
        p_source_event_id: sourceEventId,
        p_source_metadata: metadata,
        p_is_primary: Boolean(isPrimary),
      });
    }
    throw error;
  }
}

export async function archiveCrmLead(client, { leadId, reason = null, actorUserId = null } = {}) {
  if (!leadId) {
    throw new Error("archiveCrmLead requires a leadId.");
  }

  await assertCrmLeadActionAccess(client, actorUserId);

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const lead = await selectCrmSingleOrNull(client, "crm_leads", CRM_LEAD_COLUMNS, [["id", leadId]]);
  if (!lead) return null;

  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("crm_leads")
    .update({
      lead_status: "archived",
      archived_at: lead.archived_at || nowIso,
      archived_by_user_id: actorUserId || lead.archived_by_user_id || null,
      archive_reason: normalizeFreeText(reason) || lead.archive_reason || "archived",
      queue_claimed_by_user_id: null,
      queue_claimed_at: null,
      queue_claim_expires_at: null,
      next_action_at: null,
      last_synced_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", leadId)
    .select(CRM_LEAD_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to archive CRM lead.");
  }

  return data || null;
}

export async function deleteCrmLead(client, { leadId, reason = null, actorUserId = null } = {}) {
  if (!leadId) {
    throw new Error("deleteCrmLead requires a leadId.");
  }

  await assertCrmLeadActionAccess(client, actorUserId);

  const deletedLead = await callCrmRpc(client, "crm_hard_delete_lead", {
    p_lead_id: leadId,
    p_actor_user_id: actorUserId,
    p_reason: normalizeFreeText(reason),
  });

  if (Array.isArray(deletedLead)) {
    return deletedLead[0] || null;
  }

  return deletedLead || null;
}

export { CRM_CALL_OUTCOME_VALUES } from "@/lib/crm/constants";
