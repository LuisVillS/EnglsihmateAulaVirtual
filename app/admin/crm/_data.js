import { normalizeCrmCallingCampaignKey } from "@/lib/crm/constants";
import { listCrmStages } from "@/lib/crm/leads";
import { isCrmClosedStage } from "@/lib/crm/stage-metadata";
import { listCrmCallingCampaigns } from "@/lib/crm/queue";
import { listPausedCrmCallingSessions } from "@/lib/crm/calling-sessions";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

const FALLBACK_UUID = "00000000-0000-0000-0000-000000000000";

const CRM_STAGE_SETTINGS_SELECT = `
  id,
  stage_key,
  system_key,
  name,
  display_name,
  position,
  pipeline_state,
  is_active,
  is_default,
  is_won,
  is_lost,
  brevo_template_code,
  brevo_template_id,
  email_template_id,
  brevo_template_config,
  ignored_roles,
  initial_delay_hours,
  stagnancy_follow_up_enabled,
  follow_up_template_id,
  archived_at,
  archived_by_user_id,
  archive_reason,
  created_at,
  updated_at
`;

const CRM_AUTOMATION_SETTINGS_SELECT = `
  id,
  name,
  trigger_event,
  trigger_stage_id,
  delivery_channel,
  template_key,
  config,
  is_active,
  created_at,
  updated_at
`;

const CRM_OPERATOR_ROLE_SELECT = "user_id, email, role, is_active, created_at, updated_at";
const CRM_OPERATOR_PROFILE_SELECT = "user_id, email, full_name, phone, notes, is_active, created_at, updated_at";

const CRM_CALLING_SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "pre_enrollment", label: "Virtual classroom" },
  { value: "meta", label: "Meta" },
  { value: "web_form", label: "Web forms" },
  { value: "formspree", label: "Formspree (legacy)" },
  { value: "manual", label: "Manual / other" },
  { value: "other", label: "Other" },
];

const CRM_LEAD_WITH_STAGE_SELECT = `
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
  updated_at,
  current_stage:crm_stages!crm_leads_current_stage_id_fkey (
    id,
    stage_key,
    system_key,
    name,
    display_name,
    position,
    pipeline_state,
    is_won,
    is_lost
  ),
  pre_enrollment:pre_enrollments (
    id,
    period,
    step,
    status,
    selected_level,
    selected_course_type,
    price_total,
    payment_method,
    payment_submitted_at,
    reviewed_at,
    start_month
  )
`;

const CRM_LEAD_SOURCE_TAG_SELECT = `
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

const LIMA_TIME_ZONE = "America/Lima";
const LIMA_UTC_OFFSET = "-05:00";

function getCrmReadClient(supabase) {
  return hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
}

function normalizeTemplateValue(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function formatTemplateLabelFromEnvKey(envKey) {
  return String(envKey || "")
    .replace(/^BREVO_TEMPLATE_/, "")
    .replace(/_ID$/, "")
    .split("_")
    .filter(Boolean)
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(" ");
}

function collectCrmTemplateOptions({ stages = [], automations = [] } = {}) {
  const optionsByValue = new Map();

  const addOption = (value, label) => {
    const normalizedValue = normalizeTemplateValue(value);
    if (!normalizedValue) return;
    if (!optionsByValue.has(normalizedValue)) {
      optionsByValue.set(normalizedValue, {
        value: normalizedValue,
        label: label || `Template ${normalizedValue}`,
      });
    }
  };

  for (const [envKey, envValue] of Object.entries(process.env || {})) {
    if (!/^BREVO_TEMPLATE_.+_ID$/.test(envKey)) continue;
    addOption(envValue, formatTemplateLabelFromEnvKey(envKey));
  }

  for (const stage of stages || []) {
    addOption(stage?.email_template_id || stage?.brevo_template_id, `${stage?.display_name || stage?.name || "Stage"} initial`);
    addOption(stage?.follow_up_template_id, `${stage?.display_name || stage?.name || "Stage"} follow-up`);
  }

  for (const automation of automations || []) {
    addOption(automation?.template_key, automation?.name || "CRM automation");
    addOption(automation?.config?.template_id, automation?.name || "CRM automation");
    addOption(automation?.config?.brevo_template_id, automation?.name || "CRM automation");
    addOption(automation?.config?.stage_template_id, automation?.name || "CRM automation");
  }

  return Array.from(optionsByValue.values()).sort((left, right) => {
    const leftValue = Number(left.value);
    const rightValue = Number(right.value);
    if (Number.isFinite(leftValue) && Number.isFinite(rightValue)) {
      return leftValue - rightValue;
    }
    return left.label.localeCompare(right.label);
  });
}

function sanitizeSearchTerm(value) {
  return String(value || "").trim().replace(/,/g, " ");
}

function normalizeLeadIdentityEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function normalizeLeadIdentityPhone(value) {
  const normalized = String(value || "").replace(/[^\d+]/g, "").trim();
  return normalized || null;
}

function applyLeadSearch(query, searchTerm) {
  const normalized = sanitizeSearchTerm(searchTerm);
  if (!normalized) return query;
  return query.or(
    `full_name.ilike.%${normalized}%,email.ilike.%${normalized}%,phone.ilike.%${normalized}%,source_label.ilike.%${normalized}%,source_type.ilike.%${normalized}%,source_origin.ilike.%${normalized}%`
  );
}

function applyLeadSourceFilter(query, sourceOrigin, sourceType) {
  const normalizedOrigin = String(sourceOrigin || "").trim();
  const normalizedType = String(sourceType || "").trim();

  if (normalizedOrigin) {
    return query.eq("source_origin", normalizedOrigin);
  }

  if (normalizedType) {
    return query.eq("source_type", normalizedType);
  }

  return query;
}

async function attachCrmLeadSourceTags(client, leads) {
  if (!Array.isArray(leads) || !leads.length) return Array.isArray(leads) ? leads : [];

  const leadIds = leads.map((lead) => lead?.id).filter(Boolean);
  if (!leadIds.length) {
    return leads.map((lead) => ({
      ...lead,
      source_tags: Array.isArray(lead?.source_tags) ? lead.source_tags : [],
    }));
  }

  const { data, error } = await client
    .from("crm_lead_source_tags")
    .select(CRM_LEAD_SOURCE_TAG_SELECT)
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
  for (const tag of Array.isArray(data) ? data : []) {
    const leadId = tag?.lead_id;
    if (!leadId) continue;
    if (!tagsByLeadId.has(leadId)) tagsByLeadId.set(leadId, []);
    tagsByLeadId.get(leadId).push(tag);
  }

  return leads.map((lead) => ({
    ...lead,
    source_tags: tagsByLeadId.get(lead?.id) || [],
  }));
}

function scoreLeadForMergePriority(lead) {
  if (!lead || typeof lead !== "object") return -1;

  let score = 0;
  if (lead.pre_enrollment_id) score += 8;
  if (lead.user_id) score += 6;
  if (lead.phone || lead.phone_e164) score += 4;
  if (lead.email) score += 3;
  if (lead.full_name) score += 2;
  if (lead.latest_note) score += 1;
  if (lead.lead_status === "open") score += 1;

  const updatedAt = lead.updated_at ? new Date(lead.updated_at).getTime() : 0;
  return score * 1_000_000_000_000 + updatedAt;
}

function pickPreferredLeadValue(leads, ...fieldNames) {
  for (const fieldName of fieldNames) {
    for (const lead of leads) {
      const value = lead?.[fieldName];
      if (value !== null && value !== undefined && value !== "") {
        return value;
      }
    }
  }

  return null;
}

function mergeSourceTags(leads) {
  const merged = [];
  const seen = new Set();

  for (const lead of leads) {
    for (const tag of Array.isArray(lead?.source_tags) ? lead.source_tags : []) {
      const key = String(tag?.source_key || tag?.id || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(tag);
    }
  }

  return merged;
}

function mergeDuplicateLeadCluster(leads) {
  const rankedLeads = [...leads].sort((left, right) => scoreLeadForMergePriority(right) - scoreLeadForMergePriority(left));
  const primaryLead = rankedLeads[0] || null;
  if (!primaryLead) return null;

  return {
    ...primaryLead,
    email: pickPreferredLeadValue(rankedLeads, "email") || primaryLead.email || null,
    full_name: pickPreferredLeadValue(rankedLeads, "full_name") || primaryLead.full_name || null,
    phone: pickPreferredLeadValue(rankedLeads, "phone", "phone_e164") || primaryLead.phone || null,
    phone_country_code:
      pickPreferredLeadValue(rankedLeads, "phone_country_code") || primaryLead.phone_country_code || null,
    phone_national_number:
      pickPreferredLeadValue(rankedLeads, "phone_national_number") || primaryLead.phone_national_number || null,
    phone_e164: pickPreferredLeadValue(rankedLeads, "phone_e164", "phone") || primaryLead.phone_e164 || null,
    phone_dialable:
      pickPreferredLeadValue(rankedLeads, "phone_dialable", "phone_e164", "phone") || primaryLead.phone_dialable || null,
    phone_validation_status:
      pickPreferredLeadValue(rankedLeads, "phone_validation_status") || primaryLead.phone_validation_status || null,
    phone_validation_reason:
      pickPreferredLeadValue(rankedLeads, "phone_validation_reason") || primaryLead.phone_validation_reason || null,
    phone_raw_input: pickPreferredLeadValue(rankedLeads, "phone_raw_input", "phone") || primaryLead.phone_raw_input || null,
    latest_note: pickPreferredLeadValue(rankedLeads, "latest_note") || primaryLead.latest_note || "",
    source_tags: mergeSourceTags(rankedLeads),
    duplicate_lead_ids: rankedLeads.map((lead) => lead.id).filter(Boolean),
  };
}

function dedupeCrmLeads(leads) {
  if (!Array.isArray(leads) || leads.length < 2) {
    return Array.isArray(leads) ? leads : [];
  }

  const parent = new Map();

  function ensureNode(id) {
    if (!parent.has(id)) parent.set(id, id);
  }

  function find(id) {
    ensureNode(id);
    let root = parent.get(id);
    while (root !== parent.get(root)) {
      root = parent.get(root);
    }

    let current = id;
    while (parent.get(current) !== root) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }

    return root;
  }

  function union(leftId, rightId) {
    const leftRoot = find(leftId);
    const rightRoot = find(rightId);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  }

  const emailOwner = new Map();
  const phoneOwner = new Map();

  for (const lead of leads) {
    const leadId = lead?.id;
    if (!leadId) continue;
    ensureNode(leadId);

    const emailKey = normalizeLeadIdentityEmail(lead?.email);
    if (emailKey) {
      const existingLeadId = emailOwner.get(emailKey);
      if (existingLeadId) {
        union(existingLeadId, leadId);
      } else {
        emailOwner.set(emailKey, leadId);
      }
    }

    const phoneKey = normalizeLeadIdentityPhone(lead?.phone_e164 || lead?.phone);
    if (phoneKey) {
      const existingLeadId = phoneOwner.get(phoneKey);
      if (existingLeadId) {
        union(existingLeadId, leadId);
      } else {
        phoneOwner.set(phoneKey, leadId);
      }
    }
  }

  const clusters = new Map();
  for (const lead of leads) {
    const leadId = lead?.id;
    if (!leadId) continue;
    const root = find(leadId);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(lead);
  }

  return Array.from(clusters.values())
    .map((cluster) => mergeDuplicateLeadCluster(cluster))
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = left?.updated_at ? new Date(left.updated_at).getTime() : 0;
      const rightTime = right?.updated_at ? new Date(right.updated_at).getTime() : 0;
      return rightTime - leftTime;
    });
}

function isLeadCampaignEligible(lead, campaign, stageById) {
  if (!lead || lead.lead_status !== "open") return false;

  const stage = lead.current_stage_id ? stageById.get(lead.current_stage_id) || null : null;
  if (stage?.is_won || stage?.is_lost) return false;

  const now = Date.now();
  const nextActionAt = lead.next_action_at ? new Date(lead.next_action_at).getTime() : null;
  if (Number.isFinite(nextActionAt) && nextActionAt > now) return false;

  const queueExpiresAt = lead.queue_claim_expires_at
    ? new Date(lead.queue_claim_expires_at).getTime()
    : null;
  if (lead.queue_claimed_by_user_id && Number.isFinite(queueExpiresAt) && queueExpiresAt > now) {
    return false;
  }

  if (campaign?.sourceOrigins?.length && !campaign.sourceOrigins.includes(String(lead.source_origin || ""))) {
    return false;
  }

  if (campaign?.sourceTypes?.length && !campaign.sourceTypes.includes(String(lead.source_type || ""))) {
    return false;
  }

  if (campaign?.stageKeys?.length) {
    const stageKey = stage?.stage_key || null;
    if (!campaign.stageKeys.includes(stageKey)) {
      return false;
    }
  }

  if (campaign?.stageId && String(lead.current_stage_id || "") !== String(campaign.stageId)) {
    return false;
  }

  if (campaign?.sourceOrigin && !matchesCallingHubSourceFilter(lead, campaign.sourceOrigin)) {
    return false;
  }

  return true;
}

async function loadCrmLeads(
  client,
  {
    search = "",
    stageId = "",
    leadStatus = "",
    sourceOrigin = "",
    sourceType = "",
    limit = 120,
    excludeArchived = false,
  } = {}
) {
  let query = client
    .from("crm_leads")
    .select(CRM_LEAD_WITH_STAGE_SELECT)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (stageId) query = query.eq("current_stage_id", stageId);
  if (leadStatus) query = query.eq("lead_status", leadStatus);
  if (excludeArchived) query = query.neq("lead_status", "archived");
  query = applyLeadSourceFilter(query, sourceOrigin, sourceType);
  query = applyLeadSearch(query, search);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to load CRM leads.");
  }
  const leadsWithTags = await attachCrmLeadSourceTags(client, Array.isArray(data) ? data : []);
  return dedupeCrmLeads(leadsWithTags);
}

async function attachLatestLeadNotes(client, leads) {
  if (!Array.isArray(leads) || !leads.length) return Array.isArray(leads) ? leads : [];

  const leadIds = leads.map((lead) => lead?.id).filter(Boolean);
  if (!leadIds.length) {
    return leads.map((lead) => ({ ...lead, latest_note: lead?.latest_note || "" }));
  }

  const { data, error } = await client
    .from("crm_interactions")
    .select("id, lead_id, notes, created_at")
    .eq("interaction_kind", "note")
    .in("lead_id", leadIds)
    .not("notes", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load CRM lead notes.");
  }

  const latestNoteByLeadId = new Map();
  for (const entry of Array.isArray(data) ? data : []) {
    if (!entry?.lead_id || latestNoteByLeadId.has(entry.lead_id)) continue;
    latestNoteByLeadId.set(entry.lead_id, entry.notes || "");
  }

  return leads.map((lead) => ({
    ...lead,
    latest_note: latestNoteByLeadId.get(lead?.id) || "",
  }));
}

async function loadCrmKanbanSummary(client, stages) {
  const closedStageIds = (Array.isArray(stages) ? stages : [])
    .filter((stage) => isCrmClosedStage(stage))
    .map((stage) => stage.id)
    .filter(Boolean);

  const totalCountResult = await client
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .neq("lead_status", "archived");

  if (totalCountResult.error) {
    throw new Error(totalCountResult.error.message || "Failed to load the CRM pipeline summary.");
  }

  let closedLeadCount = 0;
  if (closedStageIds.length) {
    const closedCountResult = await client
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .neq("lead_status", "archived")
      .in("current_stage_id", closedStageIds);

    if (closedCountResult.error) {
      throw new Error(closedCountResult.error.message || "Failed to load the CRM closed-stage summary.");
    }

    closedLeadCount = Number(closedCountResult.count || 0);
  }

  return {
    totalLeadCount: Number(totalCountResult.count || 0),
    closedLeadCount,
  };
}

export async function loadCrmDashboardData(supabase) {
  const client = getCrmReadClient(supabase);
  const [stages, leads] = await Promise.all([listCrmStages(client), loadCrmLeads(client, { limit: 160 })]);

  const openLeads = leads.filter((lead) => lead?.lead_status === "open");
  const wonLeads = leads.filter((lead) => lead?.lead_status === "won");
  const queueReady = openLeads.filter((lead) => {
    const nextActionAt = lead?.next_action_at ? new Date(lead.next_action_at) : null;
    const claimExpiresAt = lead?.queue_claim_expires_at ? new Date(lead.queue_claim_expires_at) : null;
    const isDue = !nextActionAt || Number.isNaN(nextActionAt.getTime()) || nextActionAt.getTime() <= Date.now();
    const isAvailable =
      !lead?.queue_claimed_by_user_id ||
      !claimExpiresAt ||
      Number.isNaN(claimExpiresAt.getTime()) ||
      claimExpiresAt.getTime() <= Date.now();
    return isDue && isAvailable;
  });

  return {
    stages,
    leads,
    totals: {
      total: leads.length,
      open: openLeads.length,
      won: wonLeads.length,
      revenue: wonLeads.reduce((sum, lead) => sum + Number(lead?.approved_revenue_soles || 0), 0),
      queueReady: queueReady.length,
    },
    recentLeads: leads.slice(0, 8),
    recentWon: wonLeads.slice(0, 5),
  };
}

export async function loadCrmKanbanData(supabase, { search = "", leadStatus = "", sourceType = "" } = {}) {
  const client = getCrmReadClient(supabase);
  const [stages, leads, automationsResult] = await Promise.all([
    listCrmStages(client),
    loadCrmLeads(client, { search, leadStatus, sourceType, limit: 240, excludeArchived: true }),
    client
      .from("crm_automations")
      .select(CRM_AUTOMATION_SETTINGS_SELECT)
      .order("updated_at", { ascending: false }),
  ]);

  if (automationsResult.error) {
    throw new Error(automationsResult.error.message || "Failed to load CRM automations.");
  }

  return {
    stages,
    leads: await attachLatestLeadNotes(client, leads),
    summaryMetrics: await loadCrmKanbanSummary(client, stages),
    templateOptions: collectCrmTemplateOptions({
      stages,
      automations: automationsResult.data || [],
    }),
  };
}

export async function loadCrmLeadsPageData(
  supabase,
  { search = "", stageId = "", leadStatus = "", sourceType = "" } = {}
) {
  const client = getCrmReadClient(supabase);
  const [stages, leads] = await Promise.all([
    listCrmStages(client),
    loadCrmLeads(client, { search, stageId, leadStatus, sourceType, limit: 240 }),
  ]);

  return { stages, leads };
}

export async function loadCrmSettingsData(supabase) {
  const client = getCrmReadClient(supabase);

  const [stagesResult, automationsResult, roleRowsResult, profileRowsResult] = await Promise.all([
    client
      .from("crm_stages")
      .select(CRM_STAGE_SETTINGS_SELECT)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("crm_automations")
      .select(CRM_AUTOMATION_SETTINGS_SELECT)
      .order("updated_at", { ascending: false }),
    client
      .from("crm_user_roles")
      .select(CRM_OPERATOR_ROLE_SELECT)
      .order("created_at", { ascending: false }),
    client
      .from("crm_operator_profiles")
      .select(CRM_OPERATOR_PROFILE_SELECT)
      .order("created_at", { ascending: false }),
  ]);

  if (stagesResult.error) throw new Error(stagesResult.error.message || "Failed to load CRM stages.");
  if (automationsResult.error) throw new Error(automationsResult.error.message || "Failed to load CRM automations.");
  if (roleRowsResult.error) throw new Error(roleRowsResult.error.message || "Failed to load CRM user roles.");
  if (profileRowsResult.error) throw new Error(profileRowsResult.error.message || "Failed to load CRM operator profiles.");

  const operatorsByUserId = new Map((profileRowsResult.data || []).map((row) => [row.user_id, row]));
  const operators = (roleRowsResult.data || []).map((roleRow) => {
    const profile = operatorsByUserId.get(roleRow.user_id) || null;
    return {
      ...roleRow,
      profile,
    };
  });

  const automationsByStageId = new Map();
  for (const automation of automationsResult.data || []) {
    const stageId = automation.trigger_stage_id || null;
    if (!stageId) continue;
    if (!automationsByStageId.has(stageId)) automationsByStageId.set(stageId, []);
    automationsByStageId.get(stageId).push(automation);
  }

  return {
    stages: stagesResult.data || [],
    automations: automationsResult.data || [],
    automationsByStageId,
    templateOptions: collectCrmTemplateOptions({
      stages: stagesResult.data || [],
      automations: automationsResult.data || [],
    }),
    operators,
  };
}

export async function loadCrmOperatorsData(supabase) {
  const client = getCrmReadClient(supabase);
  const [roleRowsResult, profileRowsResult] = await Promise.all([
    client
      .from("crm_user_roles")
      .select(CRM_OPERATOR_ROLE_SELECT)
      .order("created_at", { ascending: false }),
    client
      .from("crm_operator_profiles")
      .select(CRM_OPERATOR_PROFILE_SELECT)
      .order("created_at", { ascending: false }),
  ]);

  if (roleRowsResult.error) throw new Error(roleRowsResult.error.message || "Failed to load CRM user roles.");
  if (profileRowsResult.error) throw new Error(profileRowsResult.error.message || "Failed to load CRM operator profiles.");

  const profilesByUserId = new Map((profileRowsResult.data || []).map((row) => [row.user_id, row]));
  const operators = (roleRowsResult.data || []).map((roleRow) => ({
    ...roleRow,
    profile: profilesByUserId.get(roleRow.user_id) || null,
  }));

  return {
    operators,
  };
}

export async function loadCrmLeadDetailData(supabase, leadId) {
  const client = getCrmReadClient(supabase);
  const { data: lead, error: leadError } = await client
    .from("crm_leads")
    .select(CRM_LEAD_WITH_STAGE_SELECT)
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) {
    throw new Error(leadError.message || "Failed to load the CRM lead.");
  }
  if (!lead?.id) return null;

  const [stages, interactionsResult, stageHistoryResult] = await Promise.all([
    listCrmStages(client),
    client
      .from("crm_interactions")
      .select("id, interaction_kind, direction, operator_user_id, summary, notes, call_outcome, metadata, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false }),
    client
      .from("crm_stage_history")
      .select("id, from_stage_id, to_stage_id, changed_by_user_id, reason, metadata, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false }),
  ]);

  if (interactionsResult.error) throw new Error(interactionsResult.error.message || "Failed to load CRM interactions.");
  if (stageHistoryResult.error) throw new Error(stageHistoryResult.error.message || "Failed to load CRM stage history.");

  const stageIds = Array.from(
    new Set((stageHistoryResult.data || []).flatMap((row) => [row?.from_stage_id, row?.to_stage_id]).filter(Boolean))
  );
  const userIds = Array.from(
    new Set(
      [
        lead.user_id,
        lead.assigned_operator_user_id,
        lead.queue_claimed_by_user_id,
        ...(interactionsResult.data || []).map((row) => row.operator_user_id),
      ].filter(Boolean)
    )
  );

  const [profileResult, preEnrollmentResult, paymentResult, stageRowsResult, operatorProfilesResult] = await Promise.all([
    lead.user_id
      ? client
          .from("profiles")
          .select("id, email, full_name, phone, status, course_level, student_code")
          .eq("id", lead.user_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lead.pre_enrollment_id
      ? client
          .from("pre_enrollments")
          .select("id, period, step, status, selected_level, selected_course_type, payment_method, payment_submitted_at, reviewed_at, review_notes, start_month")
          .eq("id", lead.pre_enrollment_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lead.user_id
      ? client
          .from("payments")
          .select("id, billing_month, amount_soles, status, approved_at, created_at")
          .eq("student_id", lead.user_id)
          .order("billing_month", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    stageIds.length
      ? client.from("crm_stages").select("id, stage_key, name, pipeline_state").in("id", stageIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? client
          .from("crm_operator_profiles")
          .select("user_id, full_name, email, phone")
          .in("user_id", userIds.length ? userIds : [FALLBACK_UUID])
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profileResult.error || preEnrollmentResult.error || paymentResult.error || stageRowsResult.error || operatorProfilesResult.error) {
    throw new Error("Failed to hydrate the CRM lead detail.");
  }

  return {
    lead,
    stages,
    interactions: interactionsResult.data || [],
    latestNote:
      (interactionsResult.data || []).find((entry) => entry?.interaction_kind === "note" && entry?.notes)?.notes || "",
    stageHistory: stageHistoryResult.data || [],
    profile: profileResult.data || null,
    preEnrollment: preEnrollmentResult.data || null,
    payments: paymentResult.data || [],
    stageMap: new Map((stageRowsResult.data || []).map((row) => [row.id, row])),
    operatorMap: new Map((operatorProfilesResult.data || []).map((row) => [row.user_id, row])),
  };
}

function matchesCallingHubSourceFilter(lead, sourceOrigin) {
  const normalized = String(sourceOrigin || "").trim();
  if (!normalized) return true;

  const leadSourceOrigin = String(lead?.source_origin || "").trim();
  const leadSourceType = String(lead?.source_type || "").trim();

  if (normalized === "pre_enrollment") {
    return ["pre_enrollment", "classroom_pre_enrollment"].includes(leadSourceOrigin) || leadSourceType === "pre_enrollment";
  }

  if (normalized === "meta") {
    return leadSourceOrigin === "meta" || ["meta_lead", "meta_lead_ad"].includes(leadSourceType);
  }

  if (normalized === "web_form") {
    return leadSourceOrigin === "web_form" || leadSourceType === "web_form";
  }

  if (normalized === "formspree") {
    return leadSourceOrigin === "formspree" || leadSourceType === "formspree";
  }

  if (normalized === "manual") {
    return leadSourceOrigin === "manual" || leadSourceType === "manual";
  }

  if (normalized === "other") {
    return !["pre_enrollment", "classroom_pre_enrollment", "meta", "web_form", "formspree", "manual"].includes(leadSourceOrigin) &&
      !["pre_enrollment", "meta_lead", "meta_lead_ad", "web_form", "formspree", "manual"].includes(leadSourceType);
  }

  return leadSourceOrigin === normalized || leadSourceType === normalized;
}

function buildCallingHubStageOptions(stages, queueLeadRows) {
  const countsByStageId = new Map();
  for (const lead of queueLeadRows || []) {
    const stageId = lead?.current_stage_id || null;
    if (!stageId) continue;
    countsByStageId.set(stageId, (countsByStageId.get(stageId) || 0) + 1);
  }

  return (stages || []).map((stage) => ({
    ...stage,
    leadCount: countsByStageId.get(stage.id) || 0,
  }));
}

function buildCallingHubSourceOptions(queueLeadRows) {
  const counts = new Map(CRM_CALLING_SOURCE_OPTIONS.map((option) => [option.value, 0]));

  for (const lead of queueLeadRows || []) {
    for (const option of CRM_CALLING_SOURCE_OPTIONS) {
      if (matchesCallingHubSourceFilter(lead, option.value)) {
        counts.set(option.value, (counts.get(option.value) || 0) + 1);
      }
    }
  }

  return CRM_CALLING_SOURCE_OPTIONS.map((option) => ({
    ...option,
    leadCount: counts.get(option.value) || 0,
  }));
}

function getLimaDayRange(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const dayStamp = `${year}-${month}-${day}`;

  return {
    startIso: new Date(`${dayStamp}T00:00:00${LIMA_UTC_OFFSET}`).toISOString(),
    endIso: new Date(`${dayStamp}T23:59:59.999${LIMA_UTC_OFFSET}`).toISOString(),
  };
}

function formatTalkTimeLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function extractTalkTimeSeconds(interaction) {
  const metadata = interaction?.metadata && typeof interaction.metadata === "object" ? interaction.metadata : {};
  const candidates = [
    metadata.duration_seconds,
    metadata.call_duration_seconds,
    metadata.talk_time_seconds,
    metadata.duration,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

export async function loadCallingHubData(
  supabase,
  {
    operatorUserId,
    selectedLeadId = "",
    campaignKey = "",
    selectedStageId = "",
    selectedSourceOrigin = "",
    sessionLeadIds = [],
    queueLeadIds = [],
    suspendAutoSelection = false,
  } = {}
) {
  const client = getCrmReadClient(supabase);
  const normalizedCampaignKey = normalizeCrmCallingCampaignKey(campaignKey);
  const normalizedStageId = String(selectedStageId || "").trim();
  const normalizedSourceOrigin = String(selectedSourceOrigin || "").trim();
  const normalizedSessionLeadIds = Array.from(
    new Set((Array.isArray(sessionLeadIds) ? sessionLeadIds : [sessionLeadIds]).map((value) => String(value || "").trim()).filter(Boolean))
  );
  const normalizedQueueLeadIds = Array.from(
    new Set((Array.isArray(queueLeadIds) ? queueLeadIds : [queueLeadIds]).map((value) => String(value || "").trim()).filter(Boolean))
  );
  const [stages, campaigns] = await Promise.all([
    listCrmStages(client),
    listCrmCallingCampaigns(client),
  ]);
  const stageById = new Map((stages || []).map((stage) => [stage.id, stage]));

  const loadLeadById = async (leadId) => {
    if (!leadId) return null;
    const { data, error } = await client
      .from("crm_leads")
      .select(CRM_LEAD_WITH_STAGE_SELECT)
      .eq("id", leadId)
      .maybeSingle();
    if (error) throw new Error(error.message || "Failed to load the selected CRM lead.");
    return data || null;
  };

  const { startIso, endIso } = getLimaDayRange();

  const [queueLeadRows, todayInteractionsResult, todayStageHistoryResult, pausedSessions] = await Promise.all([
    loadCrmLeads(client, { leadStatus: "open", limit: 120, excludeArchived: true }),
    operatorUserId
      ? client
          .from("crm_interactions")
          .select("id, lead_id, interaction_kind, call_outcome, summary, notes, metadata, created_at")
          .eq("operator_user_id", operatorUserId)
          .eq("interaction_kind", "call")
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    operatorUserId
      ? client
          .from("crm_stage_history")
          .select("id, lead_id, to_stage_id, changed_by_user_id, created_at")
          .eq("changed_by_user_id", operatorUserId)
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    listPausedCrmCallingSessions(client, { operatorUserId }),
  ]);

  if (todayInteractionsResult.error || todayStageHistoryResult.error) {
    throw new Error(
      todayInteractionsResult.error?.message ||
        todayStageHistoryResult.error?.message ||
        "Failed to load Calling Hub history."
    );
  }

  const stageOptions = buildCallingHubStageOptions(stages, queueLeadRows);
  const sourceOptions = buildCallingHubSourceOptions(queueLeadRows);
  const selectedStage = normalizedStageId ? stageById.get(normalizedStageId) || null : null;
  const selectedSource =
    sourceOptions.find((option) => option.value === normalizedSourceOrigin) ||
    sourceOptions[0] ||
    null;

  const eligibleQueueRows = (queueLeadRows || [])
    .filter((lead) => isLeadCampaignEligible(lead, { stageId: normalizedStageId, sourceOrigin: normalizedSourceOrigin }, stageById))
    .sort((left, right) => {
      const leftTime = left.next_action_at ? new Date(left.next_action_at).getTime() : 0;
      const rightTime = right.next_action_at ? new Date(right.next_action_at).getTime() : 0;
      return leftTime - rightTime;
    });

  const orderedQueueLeadIds = normalizedQueueLeadIds.length
    ? normalizedQueueLeadIds
    : suspendAutoSelection
      ? []
      : eligibleQueueRows.map((lead) => lead?.id).filter(Boolean);
  const orderedQueueLeadSet = new Set(orderedQueueLeadIds);
  const queueRowMap = new Map();

  if (orderedQueueLeadIds.length) {
    const queueSnapshotResult = await client
      .from("crm_leads")
      .select(CRM_LEAD_WITH_STAGE_SELECT)
      .in("id", orderedQueueLeadIds);

    if (queueSnapshotResult.error) {
      throw new Error(queueSnapshotResult.error.message || "Failed to load the Calling Hub queue snapshot.");
    }

    for (const lead of Array.isArray(queueSnapshotResult.data) ? queueSnapshotResult.data : []) {
      if (lead?.id) queueRowMap.set(lead.id, lead);
    }
  }

  for (const lead of eligibleQueueRows) {
    if (lead?.id && !queueRowMap.has(lead.id)) {
      queueRowMap.set(lead.id, lead);
    }
  }

  let activeLead =
    (selectedLeadId && queueRowMap.get(selectedLeadId)) ||
    (orderedQueueLeadIds.length ? queueRowMap.get(orderedQueueLeadIds[0]) : null) ||
    null;

  if (!activeLead?.id && selectedLeadId) {
    activeLead = await loadLeadById(selectedLeadId);
    if (activeLead?.id) {
      queueRowMap.set(activeLead.id, activeLead);
    }
  }

  if (!activeLead?.id && operatorUserId && !suspendAutoSelection) {
    const { data, error } = await client
      .from("crm_leads")
      .select(CRM_LEAD_WITH_STAGE_SELECT)
      .eq("queue_claimed_by_user_id", operatorUserId)
      .order("queue_claimed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || "Failed to load the claimed CRM lead.");
    activeLead = data || null;
    if (activeLead?.id) {
      queueRowMap.set(activeLead.id, activeLead);
    }
  }

  if (!activeLead?.id && !suspendAutoSelection) {
    activeLead = eligibleQueueRows[0] || null;
    if (activeLead?.id) {
      queueRowMap.set(activeLead.id, activeLead);
    }
  }

  const queueRows = activeLead?.id
    ? [
        activeLead,
        ...orderedQueueLeadIds
          .filter((leadId) => leadId && leadId !== activeLead.id)
          .map((leadId) => queueRowMap.get(leadId))
          .filter(Boolean),
        ...eligibleQueueRows.filter((lead) => lead?.id && lead.id !== activeLead.id && !orderedQueueLeadSet.has(lead.id)),
      ]
    : orderedQueueLeadIds.map((leadId) => queueRowMap.get(leadId)).filter(Boolean);

  const normalizedQueueRows = Array.from(
    new Map(queueRows.filter((lead) => lead?.id).map((lead) => [lead.id, lead])).values()
  );
  const normalizedQueueLeadOrder = normalizedQueueRows.map((lead) => lead.id);

  const activeLeadInteractionsResult = activeLead?.id
    ? await client
        .from("crm_interactions")
        .select("id, interaction_kind, summary, notes, call_outcome, created_at")
        .eq("lead_id", activeLead.id)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [], error: null };

  if (activeLeadInteractionsResult.error) {
    throw new Error(activeLeadInteractionsResult.error.message || "Failed to load Calling Hub lead history.");
  }

  const todayInteractions = Array.isArray(todayInteractionsResult.data) ? todayInteractionsResult.data : [];
  const sessionHistoryLeadIds = Array.from(new Set(todayInteractions.map((interaction) => interaction.lead_id).filter(Boolean)));
  const talkTimeValues = todayInteractions.map(extractTalkTimeSeconds).filter((value) => Number.isFinite(value));
  const averageTalkTimeSeconds = talkTimeValues.length
    ? Math.round(talkTimeValues.reduce((sum, value) => sum + value, 0) / talkTimeValues.length)
    : null;
  const callsToday = todayInteractions.length;
  const connectedToday = todayInteractions.filter((interaction) => interaction.call_outcome === "connected").length;
  const noAnswerCallsToday = todayInteractions.filter((interaction) => interaction.call_outcome === "no_answer").length;
  const conversionsToday = todayInteractions.filter((interaction) =>
    ["connected", "callback_requested"].includes(interaction.call_outcome)
  ).length;
  const latestTodayInteraction = todayInteractions[0] || null;
  const queuePreview = normalizedQueueRows.slice(1, 13);
  const selectedSegmentLeadCount = normalizedQueueRows.length;
  const selectedStageLeadCount = selectedStage?.leadCount || 0;
  const selectedSourceLeadCount = selectedSource?.leadCount || 0;
  const liveConversionRate = callsToday ? Math.round((connectedToday / callsToday) * 1000) / 10 : 0;
  const stageIdsFromHistory = Array.from(
    new Set((Array.isArray(todayStageHistoryResult.data) ? todayStageHistoryResult.data : []).map((entry) => entry?.to_stage_id).filter(Boolean))
  );
  const sessionHistoryLeads = sessionHistoryLeadIds.length
    ? await client
        .from("crm_leads")
        .select("id, full_name, email, current_stage_id, current_stage:crm_stages(name)")
        .in("id", sessionHistoryLeadIds)
    : { data: [], error: null };

  if (sessionHistoryLeads.error) {
    throw new Error(sessionHistoryLeads.error.message || "Failed to load Calling Hub session history.");
  }

  const stageRowsResult = stageIdsFromHistory.length
    ? await client.from("crm_stages").select("id, name").in("id", stageIdsFromHistory)
    : { data: [], error: null };

  if (stageRowsResult.error) {
    throw new Error(stageRowsResult.error.message || "Failed to load Calling Hub stage history.");
  }

  const sessionHistoryLeadMap = new Map(
    (Array.isArray(sessionHistoryLeads.data) ? sessionHistoryLeads.data : []).map((lead) => [lead.id, lead])
  );
  const stageNameById = new Map((Array.isArray(stageRowsResult.data) ? stageRowsResult.data : []).map((stage) => [stage.id, stage.name]));
  const latestMoveByLeadId = new Map();
  for (const entry of Array.isArray(todayStageHistoryResult.data) ? todayStageHistoryResult.data : []) {
    if (!entry?.lead_id || latestMoveByLeadId.has(entry.lead_id)) continue;
    latestMoveByLeadId.set(entry.lead_id, entry);
  }
  const sessionHistory = todayInteractions.slice(0, 6).map((interaction) => ({
    ...interaction,
    lead: sessionHistoryLeadMap.get(interaction.lead_id) || null,
    movedToStageName: latestMoveByLeadId.get(interaction.lead_id)?.to_stage_id
      ? stageNameById.get(latestMoveByLeadId.get(interaction.lead_id).to_stage_id) || null
      : null,
  }));
  const latestLeadNote =
    (Array.isArray(activeLeadInteractionsResult.data) ? activeLeadInteractionsResult.data : []).find(
      (entry) => entry?.interaction_kind === "note" && entry?.notes
    )?.notes || "";

  return {
    stages,
    campaigns,
    selectedCampaignKey: normalizedCampaignKey,
    selectedStageId: normalizedStageId,
    selectedSourceOrigin: normalizedSourceOrigin,
    selectedStage,
    selectedSource,
    stageOptions,
    sourceOptions,
    activeLead,
    activeLeadInteractions: activeLeadInteractionsResult.data || [],
    latestLeadNote,
    queuePreview,
    sessionHistory,
    todayMetrics: {
      callsToday,
      connectedToday,
      noAnswerCallsToday,
      conversionsToday,
      liveConversionRate,
      averageTalkTimeSeconds,
      averageTalkTimeLabel: formatTalkTimeLabel(averageTalkTimeSeconds),
      latestCallAt: latestTodayInteraction?.created_at || null,
      selectedSegmentLeadCount,
      selectedStageLeadCount,
      selectedSourceLeadCount,
    },
    pausedSessions,
    sessionLeadIds: normalizedSessionLeadIds,
    queueLeadIds: normalizedQueueLeadOrder,
  };
}
