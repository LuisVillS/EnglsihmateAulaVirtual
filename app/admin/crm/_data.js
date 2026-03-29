import { normalizeCrmCallingCampaignKey } from "@/lib/crm/constants";
import { listCrmStages } from "@/lib/crm/leads";
import { listCrmCallingCampaigns } from "@/lib/crm/queue";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

const FALLBACK_UUID = "00000000-0000-0000-0000-000000000000";

const CRM_STAGE_SETTINGS_SELECT = `
  id,
  stage_key,
  name,
  position,
  pipeline_state,
  is_active,
  is_default,
  is_won,
  is_lost,
  brevo_template_code,
  brevo_template_id,
  brevo_template_config,
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
  approved_revenue_billing_month,
  approved_revenue_soles,
  approved_payment_count,
  latest_approved_payment_at,
  approved_pre_enrollment_at,
  won_at,
  lost_at,
  archived_at,
  archived_by_user_id,
  archive_reason,
  last_synced_at,
  created_at,
  updated_at,
  current_stage:crm_stages (
    id,
    stage_key,
    name,
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

function getCrmReadClient(supabase) {
  return hasServiceRoleClient() ? getServiceSupabaseClient() : supabase;
}

function sanitizeSearchTerm(value) {
  return String(value || "").trim().replace(/,/g, " ");
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
  return attachCrmLeadSourceTags(client, Array.isArray(data) ? data : []);
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
  const [stages, leads] = await Promise.all([
    listCrmStages(client),
    loadCrmLeads(client, { search, leadStatus, sourceType, limit: 240, excludeArchived: true }),
  ]);

  return { stages, leads };
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

export async function loadCallingHubData(
  supabase,
  { operatorUserId, selectedLeadId = "", campaignKey = "", selectedStageId = "", selectedSourceOrigin = "" } = {}
) {
  const client = getCrmReadClient(supabase);
  const normalizedCampaignKey = normalizeCrmCallingCampaignKey(campaignKey);
  const normalizedStageId = String(selectedStageId || "").trim();
  const normalizedSourceOrigin = String(selectedSourceOrigin || "").trim();
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

  let activeLead = await loadLeadById(selectedLeadId);
  if (!activeLead?.id && operatorUserId) {
    const { data, error } = await client
      .from("crm_leads")
      .select(CRM_LEAD_WITH_STAGE_SELECT)
      .eq("queue_claimed_by_user_id", operatorUserId)
      .order("queue_claimed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || "Failed to load the claimed CRM lead.");
    activeLead = data || null;
  }

  const [queueLeadRows, activeLeadInteractionsResult] = await Promise.all([
    loadCrmLeads(client, { leadStatus: "open", limit: 120, excludeArchived: true }),
    activeLead?.id
      ? client
          .from("crm_interactions")
          .select("id, interaction_kind, summary, notes, call_outcome, created_at")
          .eq("lead_id", activeLead.id)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (activeLeadInteractionsResult.error) {
    throw new Error(
      activeLeadInteractionsResult.error.message || "Failed to load Calling Hub history."
    );
  }

  const stageOptions = buildCallingHubStageOptions(stages, queueLeadRows);
  const sourceOptions = buildCallingHubSourceOptions(queueLeadRows);
  const selectedStage = normalizedStageId ? stageById.get(normalizedStageId) || null : null;
  const selectedSource =
    sourceOptions.find((option) => option.value === normalizedSourceOrigin) ||
    sourceOptions[0] ||
    null;

  const queuePreview = (queueLeadRows || [])
    .filter((lead) => isLeadCampaignEligible(lead, { stageId: normalizedStageId, sourceOrigin: normalizedSourceOrigin }, stageById))
    .sort((left, right) => {
      const leftTime = left.next_action_at ? new Date(left.next_action_at).getTime() : 0;
      const rightTime = right.next_action_at ? new Date(right.next_action_at).getTime() : 0;
      return leftTime - rightTime;
    })
    .slice(0, 12);

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
    queuePreview,
  };
}
