import { CRM_CALL_OUTCOME_VALUES } from "@/lib/crm/constants";
import { normalizeCrmPhoneInput } from "@/lib/crm/phones";
import { selectCrmLeadByPhone } from "@/lib/crm/leads";
import { resolveCrmStageDisplayName, resolveCrmStageSystemKey } from "@/lib/crm/stage-metadata";
import { CRM_STAGE_COLUMNS } from "@/lib/crm/stages";
import {
  resolveCrmDb,
  selectCrmMany,
  selectCrmSingleOrNull,
} from "@/lib/crm/server";

export const CRM_STAGE_SUMMARY_COLUMNS = CRM_STAGE_COLUMNS;

export const CRM_INTERACTION_COLUMNS = `
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
`;

export const CRM_STAGE_HISTORY_COLUMNS = `
  id,
  lead_id,
  from_stage_id,
  to_stage_id,
  changed_by_user_id,
  reason,
  metadata,
  created_at
`;

export const CRM_LEAD_MUTATION_COLUMNS = `
  id,
  source_type,
  source_label,
  source_origin,
  source_metadata,
  user_id,
  pre_enrollment_id,
  email,
  full_name,
  phone,
  phone_country_code,
  phone_national_number,
  phone_e164,
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

function toIsoTimestamp(value = new Date()) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function normalizeEmail(value) {
  const normalized = normalizeFreeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

export async function updateCrmLeadContactDetails(
  client,
  { leadId, fullName = null, email = null, phone = null, changedByUserId = null, reason = "manual_contact_update", metadata = {} } = {}
) {
  if (!leadId) {
    throw new Error("updateCrmLeadContactDetails requires a leadId.");
  }

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const lead = await selectCrmSingleOrNull(client, "crm_leads", CRM_LEAD_MUTATION_COLUMNS, [["id", leadId]]);
  if (!lead) return null;
  if (lead.lead_status === "archived" || lead.archived_at) {
    throw new Error("Archived CRM leads cannot be edited.");
  }

  const hasNameInput = fullName != null;
  const hasEmailInput = email != null;
  const hasPhoneInput = phone != null;
  const normalizedName = hasNameInput ? normalizeFreeText(fullName) : lead.full_name || null;
  const normalizedEmail = hasEmailInput ? normalizeEmail(email) : lead.email || null;
  let phoneParts = null;
  let normalizedPhone = null;

  if (hasPhoneInput) {
    const trimmedPhone = normalizeFreeText(phone);
    if (trimmedPhone) {
      phoneParts = normalizeCrmPhoneInput({ phone: trimmedPhone, defaultCountryCode: "51" });
      if (!phoneParts.isValid) {
        throw new Error(
          phoneParts.validationErrors?.length
            ? `Invalid phone number: ${phoneParts.validationErrors.join(" ")}`
            : "Invalid phone number."
        );
      }

      normalizedPhone = phoneParts.phoneE164 || null;
      if (normalizedPhone) {
        const existingPhoneLead = await selectCrmLeadByPhone(client, normalizedPhone, CRM_LEAD_MUTATION_COLUMNS);
        if (existingPhoneLead?.id && existingPhoneLead.id !== leadId) {
          throw new Error("Phone number already belongs to another CRM lead.");
        }
      }
    }
  }

  const nowIso = toIsoTimestamp();
  const nextPatch = {
    full_name: normalizedName,
    email: normalizedEmail,
    updated_at: nowIso,
    last_synced_at: nowIso,
  };

  if (hasPhoneInput) {
    nextPatch.phone = normalizedPhone;
    nextPatch.phone_country_code = normalizedPhone ? phoneParts?.phoneCountryCode || null : null;
    nextPatch.phone_national_number = normalizedPhone ? phoneParts?.phoneNationalNumber || null : null;
    nextPatch.phone_e164 = normalizedPhone;
  }

  const { data, error } = await db
    .from("crm_leads")
    .update(nextPatch)
    .eq("id", leadId)
    .select(CRM_LEAD_MUTATION_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update CRM lead contact details.");
  }

  return data || null;
}

function getStageLeadStatus(stage) {
  const pipelineState = String(stage?.pipeline_state || "").toLowerCase();
  if (pipelineState === "won") return "won";
  if (pipelineState === "lost") return "lost";
  return "open";
}

export async function listCrmLeads(
  client,
  {
    limit = 50,
    offset = 0,
    stageId = null,
    stageKey = null,
    leadStatus = null,
    search = null,
    assignedOperatorUserId = null,
    queueClaimedByUserId = null,
  } = {}
) {
  const db = resolveCrmDb(client);
  if (!db?.from) return [];

  let resolvedStageId = stageId;
  if (!resolvedStageId && stageKey) {
    const stage = await selectCrmLeadStageByKey(client, stageKey);
    resolvedStageId = stage?.id || null;
  }

  const stages = await selectCrmMany(client, "crm_stages", CRM_STAGE_SUMMARY_COLUMNS);
  const stageById = new Map((stages || []).map((stage) => [stage.id, stage]));

  let query = db
    .from("crm_leads")
    .select(CRM_LEAD_MUTATION_COLUMNS)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (resolvedStageId) query = query.eq("current_stage_id", resolvedStageId);
  if (leadStatus) query = query.eq("lead_status", leadStatus);
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
    if (isMissingCrmObjectError(error)) return [];
    throw new Error(error.message || "Failed to load CRM leads.");
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    ...row,
    stage: row.current_stage_id ? stageById.get(row.current_stage_id) || null : null,
  }));
}

export async function listCrmStagesWithLeads(client, { leadLimit = 20 } = {}) {
  const stages = await selectCrmMany(
    client,
    "crm_stages",
    CRM_STAGE_SUMMARY_COLUMNS,
    (query) => query.eq("is_active", true).order("position", { ascending: true })
  );

  if (!stages.length) return [];

  const leadRows = await selectCrmMany(
    client,
    "crm_leads",
    CRM_LEAD_MUTATION_COLUMNS,
    (query) =>
      query
        .in(
          "current_stage_id",
          stages.map((stage) => stage.id)
        )
        .order("last_interaction_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
  );

  const grouped = new Map(stages.map((stage) => [stage.id, []]));
  for (const lead of leadRows) {
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

export async function selectCrmLeadDetailById(client, leadId) {
  if (!leadId) return null;

  const [lead, interactions, stageHistory] = await Promise.all([
    selectCrmSingleOrNull(client, "crm_leads", CRM_LEAD_MUTATION_COLUMNS, [["id", leadId]]),
    selectCrmMany(client, "crm_interactions", CRM_INTERACTION_COLUMNS, (query) =>
      query.eq("lead_id", leadId).order("created_at", { ascending: false })
    ),
    selectCrmMany(client, "crm_stage_history", CRM_STAGE_HISTORY_COLUMNS, (query) =>
      query.eq("lead_id", leadId).order("created_at", { ascending: false })
    ),
  ]);

  if (!lead) return null;

  const currentStage = lead.current_stage_id
    ? await selectCrmLeadStageById(client, lead.current_stage_id)
    : null;

  return {
    lead,
    currentStage,
    interactions,
    stageHistory,
  };
}

export async function selectCrmLeadStageById(client, stageId) {
  if (!stageId) return null;
  return selectCrmSingleOrNull(client, "crm_stages", CRM_STAGE_SUMMARY_COLUMNS, [["id", stageId]]);
}

export async function selectCrmLeadStageByKey(client, stageKey) {
  if (!stageKey) return null;
  return selectCrmSingleOrNull(client, "crm_stages", CRM_STAGE_SUMMARY_COLUMNS, [["stage_key", stageKey]]);
}

export async function createCrmLeadNote(
  client,
  { leadId, note, summary = null, operatorUserId = null, metadata = {} } = {}
) {
  if (!leadId) {
    throw new Error("createCrmLeadNote requires a leadId.");
  }
  const noteInput = note == null ? "" : note.toString();
  const normalizedNote = noteInput.trim();

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const lead = await selectCrmSingleOrNull(client, "crm_leads", CRM_LEAD_MUTATION_COLUMNS, [["id", leadId]]);
  if (!lead) return null;
  if (lead.lead_status === "archived" || lead.archived_at) {
    throw new Error("Archived CRM leads cannot receive notes.");
  }

  const existingNoteRows = await selectCrmMany(client, "crm_interactions", CRM_INTERACTION_COLUMNS, (query) =>
    query
      .eq("lead_id", leadId)
      .eq("interaction_kind", "note")
      .order("created_at", { ascending: false })
      .limit(1)
  );
  const existingNote = existingNoteRows?.[0] || null;
  const noteSummary = normalizeFreeText(summary) || normalizedNote.slice(0, 120);

  if (!normalizedNote) {
    if (!existingNote?.id) {
      return null;
    }

    const { error: deleteError } = await db.from("crm_interactions").delete().eq("id", existingNote.id);
    if (deleteError) {
      throw new Error(deleteError.message || "Failed to clear CRM note.");
    }

    return null;
  }

  const query = existingNote?.id
    ? db
        .from("crm_interactions")
        .update({
          operator_user_id: operatorUserId,
          summary: noteSummary,
          notes: normalizedNote,
          metadata: {
            ...(existingNote.metadata && typeof existingNote.metadata === "object" ? existingNote.metadata : {}),
            ...(metadata || {}),
          },
        })
        .eq("id", existingNote.id)
    : db
        .from("crm_interactions")
        .insert({
          lead_id: leadId,
          interaction_kind: "note",
          direction: "system",
          operator_user_id: operatorUserId,
          summary: noteSummary,
          notes: normalizedNote,
          call_outcome: null,
          metadata: metadata || {},
          created_at: toIsoTimestamp(),
        });

  const { data, error } = await query.select(CRM_INTERACTION_COLUMNS).maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to create CRM note.");
  }

  return data || null;
}

async function refreshCrmLeadInteractionSummary(client, leadId) {
  if (!leadId) return null;

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const [latestInteraction, latestOutcomeInteraction] = await Promise.all([
    selectCrmMany(client, "crm_interactions", CRM_INTERACTION_COLUMNS, (query) =>
      query.eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1)
    ),
    selectCrmMany(client, "crm_interactions", CRM_INTERACTION_COLUMNS, (query) =>
      query
        .eq("lead_id", leadId)
        .not("call_outcome", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
    ),
  ]);

  const newestInteraction = latestInteraction?.[0] || null;
  const newestOutcome = latestOutcomeInteraction?.[0] || null;
  const nowIso = toIsoTimestamp();

  const { data, error } = await db
    .from("crm_leads")
    .update({
      last_interaction_at: newestInteraction?.created_at || null,
      last_call_outcome: newestOutcome?.call_outcome || null,
      last_synced_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", leadId)
    .select(CRM_LEAD_MUTATION_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to refresh CRM interaction summary.");
  }

  return data || null;
}

export async function deleteCrmInteraction(
  client,
  { interactionId, leadId = null } = {}
) {
  if (!interactionId) {
    throw new Error("deleteCrmInteraction requires an interactionId.");
  }

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  let query = db.from("crm_interactions").select(CRM_INTERACTION_COLUMNS).eq("id", interactionId);
  if (leadId) {
    query = query.eq("lead_id", leadId);
  }

  const { data: interaction, error: interactionError } = await query.maybeSingle();
  if (interactionError) {
    throw new Error(interactionError.message || "Failed to load CRM interaction.");
  }
  if (!interaction) {
    return null;
  }

  const { error: deleteError } = await db.from("crm_interactions").delete().eq("id", interaction.id);
  if (deleteError) {
    throw new Error(deleteError.message || "Failed to delete CRM interaction.");
  }

  await refreshCrmLeadInteractionSummary(client, interaction.lead_id);
  return interaction;
}

export async function moveCrmLeadStage(
  client,
  {
    leadId,
    stageId = null,
    stageKey = null,
    changedByUserId = null,
    reason = "manual_stage_move",
    metadata = {},
    note = null,
  } = {}
) {
  if (!leadId) {
    throw new Error("moveCrmLeadStage requires a leadId.");
  }

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const lead = await selectCrmSingleOrNull(client, "crm_leads", CRM_LEAD_MUTATION_COLUMNS, [["id", leadId]]);
  if (!lead) {
    return null;
  }

  if (lead.lead_status === "archived" || lead.archived_at) {
    throw new Error("Archived CRM leads cannot be moved between stages.");
  }

  const stage = stageId
    ? await selectCrmLeadStageById(client, stageId)
    : await selectCrmLeadStageByKey(client, stageKey);

  if (!stage) {
    throw new Error("Target CRM stage not found.");
  }

  if (stage.archived_at || stage.is_active === false) {
    throw new Error("Inactive or archived CRM stages cannot receive leads.");
  }

  const nowIso = toIsoTimestamp();
  const stageDisplayName = resolveCrmStageDisplayName(stage);
  const stageSystemKey = resolveCrmStageSystemKey(stage);
  const nextLeadStatus = getStageLeadStatus(stage);
  const nextLeadPatch = {
    current_stage_id: stage.id,
    lead_status: nextLeadStatus,
    last_synced_at: nowIso,
    updated_at: nowIso,
  };

  if (nextLeadStatus === "won") {
    nextLeadPatch.won_at = lead.won_at || nowIso;
    nextLeadPatch.lost_at = null;
  } else if (nextLeadStatus === "lost") {
    nextLeadPatch.lost_at = lead.lost_at || nowIso;
    nextLeadPatch.won_at = null;
  }

  const { data: updatedLead, error: updateError } = await db
    .from("crm_leads")
    .update(nextLeadPatch)
    .eq("id", leadId)
    .select(CRM_LEAD_MUTATION_COLUMNS)
    .maybeSingle();

  if (updateError) {
    throw new Error(updateError.message || "Failed to move CRM lead stage.");
  }

  if (lead.current_stage_id !== stage.id) {
    const { error: historyError } = await db.from("crm_stage_history").insert({
      lead_id: leadId,
      from_stage_id: lead.current_stage_id,
      to_stage_id: stage.id,
      changed_by_user_id: changedByUserId,
      reason: normalizeFreeText(reason) || "manual_stage_move",
      metadata: {
        ...(metadata || {}),
        stage_key: stageSystemKey,
        system_key: stageSystemKey,
        display_name: stageDisplayName,
        brevo_template_code: stage.brevo_template_code || null,
        brevo_template_id: stage.email_template_id || stage.brevo_template_id || null,
        brevo_template_config: stage.brevo_template_config || {},
      },
      created_at: nowIso,
    });

    if (historyError) {
      throw new Error(historyError.message || "Failed to record CRM stage history.");
    }
  }

  const noteText = normalizeFreeText(note);
  const noteInteraction = noteText
    ? await createCrmLeadNote(client, {
        leadId,
        note: noteText,
        summary: `Stage moved to ${stageDisplayName}`,
        operatorUserId: changedByUserId,
        metadata: {
          ...(metadata || {}),
          stage_id: stage.id,
          stage_key: stageSystemKey,
          system_key: stageSystemKey,
          display_name: stageDisplayName,
          brevo_template_code: stage.brevo_template_code || null,
          brevo_template_id: stage.email_template_id || stage.brevo_template_id || null,
          reason: normalizeFreeText(reason) || "manual_stage_move",
        },
      })
    : null;

  return {
    lead: updatedLead || lead,
    stage,
    noteInteraction,
  };
}

export async function setCrmLeadNextAction(
  client,
  { leadId, nextActionAt = null } = {}
) {
  if (!leadId) {
    throw new Error("setCrmLeadNextAction requires a leadId.");
  }

  const db = resolveCrmDb(client);
  if (!db?.from) return null;
  const lead = await selectCrmSingleOrNull(client, "crm_leads", CRM_LEAD_MUTATION_COLUMNS, [["id", leadId]]);
  if (!lead) return null;
  if (lead.lead_status === "archived" || lead.archived_at) {
    throw new Error("Archived CRM leads cannot receive follow-up scheduling.");
  }
  const nowIso = toIsoTimestamp();

  const { data, error } = await db
    .from("crm_leads")
    .update({
      next_action_at: nextActionAt,
      last_synced_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", leadId)
    .select(CRM_LEAD_MUTATION_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to update CRM lead next action.");
  }

  return data || null;
}

export { CRM_CALL_OUTCOME_VALUES };
