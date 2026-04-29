"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCrmPageAccess } from "@/lib/admin/access";
import {
  normalizeCrmCallOutcome,
  normalizeCrmCallingCampaignKey,
  normalizeCrmLeadSourceOrigin,
} from "@/lib/crm/constants";
import { archiveCrmLead, deleteCrmLead, selectCrmLeadById } from "@/lib/crm/leads";
import { upsertManualCrmLead } from "@/lib/crm/integrations/shared";
import { ingestCrmWebhookLead } from "@/lib/crm/integrations/webhook-ingestion";
import { normalizeMetaWebhookPayload } from "@/lib/crm/integrations/meta";
import { submitCrmWebFormLead } from "@/lib/crm/integrations/web-form-ingestion";
import {
  createCrmLeadNote,
  deleteCrmInteraction,
  moveCrmLeadStage,
  updateCrmLeadContactDetails,
} from "@/lib/crm/mutations";
import {
  closePausedCrmCallingSession,
  upsertPausedCrmCallingSession,
} from "@/lib/crm/calling-sessions";
import { provisionCrmOperator } from "@/lib/crm/operators";
import {
  claimNextCrmLead,
  releaseCrmLeadClaim,
  submitCrmCallOutcome,
} from "@/lib/crm/queue";
import {
  archiveCrmStage,
  listCrmStagesForManagement,
  selectCrmStageById,
  upsertCrmStage,
} from "@/lib/crm/stages";
import {
  resolveCrmStageDisplayName,
  resolveCrmStageSystemKey,
} from "@/lib/crm/stage-metadata";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

function parseRequiredString(value, label) {
  const normalized = value?.toString().trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function parseOptionalString(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function parseOptionalDateTime(value) {
  const normalized = value?.toString().trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseOptionalInteger(value) {
  const normalized = value?.toString().trim();
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalIdList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOrderedLeadIds(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [values]).map((value) => String(value || "").trim()).filter(Boolean)));
}

function ensureActiveLeadAtFront(leadIds, activeLeadId) {
  const normalizedLeadIds = normalizeOrderedLeadIds(leadIds);
  const normalizedActiveLeadId = String(activeLeadId || "").trim();
  if (!normalizedActiveLeadId) return normalizedLeadIds;
  return [normalizedActiveLeadId, ...normalizedLeadIds.filter((leadId) => leadId !== normalizedActiveLeadId)];
}

function rotateLeadQueueForward(leadIds) {
  const normalizedLeadIds = normalizeOrderedLeadIds(leadIds);
  if (normalizedLeadIds.length <= 1) return normalizedLeadIds;
  const [firstLeadId, ...remainingLeadIds] = normalizedLeadIds;
  return [...remainingLeadIds, firstLeadId];
}

function parseBooleanFlag(value) {
  const normalized = value?.toString().trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseOptionalJson(value) {
  const normalized = value?.toString().trim();
  if (!normalized) return {};
  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error("The stage template JSON configuration is invalid.");
  }
}

function normalizeEmail(value) {
  return value?.toString().trim().toLowerCase() || "";
}

function buildReturnPath(formData, fallbackPath) {
  const value = formData.get("returnTo")?.toString().trim();
  return value && value.startsWith("/admin/crm") ? value : fallbackPath;
}

function buildRedirectWithFlag(path, flag, value = "1") {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${flag}=${encodeURIComponent(value)}`;
}

function getFormDataFromActionArgs(firstArg, secondArg) {
  return secondArg instanceof FormData ? secondArg : firstArg instanceof FormData ? firstArg : null;
}

function normalizeCallingHubSourceOrigin(value) {
  const normalized = value?.toString().trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "classroom" || normalized === "virtual_classroom") return "pre_enrollment";
  return normalized;
}

function buildCallingHubPath({
  campaignKey = "",
  leadId = "",
  stageId = "",
  sourceOrigin = "",
  sessionLeadIds = [],
  queueLeadIds = [],
  pausedSessionId = "",
  live = false,
} = {}) {
  const params = new URLSearchParams();
  const normalizedCampaign = normalizeCrmCallingCampaignKey(campaignKey);
  const normalizedStageId = parseOptionalString(stageId);
  const normalizedSourceOrigin = normalizeCallingHubSourceOrigin(sourceOrigin);
  const normalizedSessionLeadIds = Array.from(new Set(sessionLeadIds.map((value) => String(value || "").trim()).filter(Boolean)));
  const normalizedQueueLeadIds = normalizeOrderedLeadIds(queueLeadIds);
  const normalizedPausedSessionId = parseOptionalString(pausedSessionId);

  if (normalizedCampaign && normalizedCampaign !== "all_open") {
    params.set("campaign", normalizedCampaign);
  }
  if (normalizedStageId) {
    params.set("stage", normalizedStageId);
  }
  if (normalizedSourceOrigin) {
    params.set("source", normalizedSourceOrigin);
  }
  if (leadId) {
    params.set("lead", leadId);
  }
  if (normalizedSessionLeadIds.length) {
    params.set("history", normalizedSessionLeadIds.join(","));
  }
  if (normalizedQueueLeadIds.length) {
    params.set("queue", normalizedQueueLeadIds.join(","));
  }
  if (normalizedPausedSessionId) {
    params.set("pausedSessionId", normalizedPausedSessionId);
  }

  const query = params.toString();
  const pathname = leadId || live ? "/admin/crm/callinghub/live" : "/admin/crm/callinghub";
  return query ? `${pathname}?${query}` : pathname;
}

function parseCallingHubCriteria(formData) {
  return {
    campaignKey: normalizeCrmCallingCampaignKey(formData.get("campaignKey")),
    stageId: parseOptionalString(formData.get("stageId")),
    sourceOrigin: normalizeCallingHubSourceOrigin(formData.get("sourceOrigin")),
  };
}

function parseSourceRuleConfig(formData) {
  const sources = ["meta", "web_form", "formspree", "pre_enrollment", "manual", "other"];
  const supportedSources = new Set(sources);

  const exclude = new Set();

  for (const sourceKey of sources) {
    const excludeFlag = parseBooleanFlag(formData.get(`sourceExclude_${sourceKey}`));
    if (excludeFlag) exclude.add(sourceKey);
  }

  if (formData.has("sourceExcludeValuesTouched") || formData.has("sourceExcludeValues")) {
    for (const value of formData.getAll("sourceExcludeValues")) {
      const normalized = normalizeCrmLeadSourceOrigin(value);
      if (normalized && supportedSources.has(normalized)) {
        exclude.add(normalized);
      }
    }
  }

  return {
    exclude: Array.from(exclude),
  };
}

function stripLegacyRoleFilterConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }

  delete config.ignored_roles;
  delete config.ignore_roles;
  delete config.role_exclude;
  return config;
}

function parseStageDelayHours(formData) {
  if (!formData.has("initialDelayHours") && !formData.has("initialDelayHoursTouched")) {
    return null;
  }
  return Math.max(0, parseOptionalInteger(formData.get("initialDelayHours")) || 0);
}

function parseStagnancyFollowUpEnabled(formData) {
  if (!formData.has("stagnancyFollowUpTouched")) {
    return null;
  }
  return parseBooleanFlag(formData.get("stagnancyFollowUpEnabled"));
}

function parseStagnancyFollowUpTemplateId(formData, enabled) {
  if (!formData.has("stagnancyFollowUpTouched")) {
    return null;
  }
  return enabled ? parseOptionalString(formData.get("followUpTemplateId")) : null;
}

function getDefaultNextActionAt(callOutcome, explicitNextActionAt) {
  if (explicitNextActionAt) return explicitNextActionAt;

  const offsetsByOutcome = {
    no_answer: 30,
    voicemail: 60,
    callback_requested: 120,
  };

  const minutes = offsetsByOutcome[callOutcome];
  if (!minutes) return null;

  const nextAction = new Date(Date.now() + minutes * 60 * 1000);
  return nextAction.toISOString();
}

async function getMutationContext() {
  const { user, context } = await requireCrmPageAccess();
  if (!hasServiceRoleClient()) {
    throw new Error("CRM mutations require SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    user,
    context,
    service: getServiceSupabaseClient(),
  };
}

function revalidateCrmPaths(leadId) {
  revalidatePath("/admin/crm");
  revalidatePath("/admin/crm/settings");
  revalidatePath("/admin/crm/operators");
  revalidatePath("/admin/crm/kanban");
  revalidatePath("/admin/crm/callinghub");
  revalidatePath("/admin/crm/leads");
  revalidatePath("/admin/crm/statistics");
  if (leadId) {
    revalidatePath(`/admin/crm/leads/${leadId}`);
  }
}

function revalidateCrmLeadPaths(leadId) {
  revalidatePath("/admin/crm/leads");
  if (leadId) {
    revalidatePath(`/admin/crm/leads/${leadId}`);
  }
}

function canManageCrmStages(context) {
  return Boolean(context?.isCrmAdmin || context?.isClassicAdmin);
}

function canManageCrmOperators(context) {
  return Boolean(context?.isCrmAdmin || context?.isClassicAdmin);
}

function canRunCrmSimulations(context) {
  return Boolean(context?.isCrmAdmin || context?.isClassicAdmin);
}

function buildMetaSimulationPayload() {
  const stamp = Date.now();
  return {
    object: "leadgen",
    entry: [
      {
        changes: [
          {
            value: {
              leadgen_id: `crm-meta-test-${stamp}`,
              created_time: new Date().toISOString(),
              form_name: "CRM Settings Test Lead",
              ad_name: "Temporary Meta Simulation",
              field_data: [
                { name: "full_name", values: ["Meta Test Lead"] },
                { name: "email", values: [`meta-test-${stamp}@example.com`] },
                { name: "phone_number", values: ["+51999888777"] },
              ],
            },
          },
        ],
      },
    ],
  };
}

function buildWebFormSimulationPayload() {
  const stamp = Date.now();
  return {
    fullName: "WebForm Test Lead",
    email: `webform-test-${stamp}@example.com`,
    phone: "+51999777666",
    siteKey: "main_site",
    formKey: "crm_test_web_form",
    formLabel: "CRM Test WebForm",
    pagePath: "/admin/crm",
    landingUrl: "https://englishmate.com.pe/admin/crm",
    referrerUrl: "https://englishmate.com.pe/",
  };
}

function buildManualLeadInput(formData) {
  const fullName = parseOptionalString(formData.get("fullName"));
  const email = parseOptionalString(formData.get("email"))?.toLowerCase() || null;
  const phone = parseOptionalString(formData.get("phone"));
  const stageId = parseOptionalString(formData.get("stageId"));

  if (!email && !phone) {
    throw new Error("Manual lead requires at least an email or phone number.");
  }

  return {
    fullName,
    email,
    phone,
    stageId,
    sourceOrigin: "manual",
    sourceType: "manual",
    sourceLabel: "Manual lead",
    provider: "manual",
    submittedAt: new Date().toISOString(),
    rawPayload: {
      source: "crm_manual",
      full_name: fullName,
      email,
      phone,
      stage_id: stageId,
    },
  };
}

async function resequenceCrmStages(service) {
  const stages = await listCrmStagesForManagement(service, {
    includeInactive: true,
    includeArchived: true,
  });

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const nextPosition = index + 1;
    if (stage.position === nextPosition) continue;

    await upsertCrmStage(service, {
      stageId: stage.id,
      systemKey: resolveCrmStageSystemKey(stage),
      displayName: resolveCrmStageDisplayName(stage),
      position: nextPosition,
      pipelineState: stage.pipeline_state,
      isActive: stage.is_active,
      isDefault: stage.is_default,
      isWon: stage.is_won,
      isLost: stage.is_lost,
      brevoTemplateCode: null,
      emailTemplateId: stage.email_template_id || stage.brevo_template_id,
      brevoTemplateConfig: stage.brevo_template_config,
      initialDelayHours: stage.initial_delay_hours,
      stagnancyFollowUpEnabled: stage.stagnancy_follow_up_enabled,
      followUpTemplateId: stage.follow_up_template_id,
    });
  }
}

async function ensureActiveDefaultStage(service) {
  const stages = await listCrmStagesForManagement(service, {
    includeInactive: true,
    includeArchived: true,
  });

  const activeStages = stages.filter((stage) => stage.is_active && !stage.archived_at);
  if (!activeStages.length) return;

  const currentDefault = activeStages.find((stage) => stage.is_default);
  if (currentDefault) return;

  const fallbackStage = activeStages[0];
  await upsertCrmStage(service, {
    stageId: fallbackStage.id,
    systemKey: resolveCrmStageSystemKey(fallbackStage),
    displayName: resolveCrmStageDisplayName(fallbackStage),
    position: fallbackStage.position,
    pipelineState: fallbackStage.pipeline_state,
    isActive: true,
    isDefault: true,
    isWon: fallbackStage.is_won,
    isLost: fallbackStage.is_lost,
    brevoTemplateCode: null,
    emailTemplateId: fallbackStage.email_template_id || fallbackStage.brevo_template_id,
    brevoTemplateConfig: fallbackStage.brevo_template_config,
    initialDelayHours: fallbackStage.initial_delay_hours,
    stagnancyFollowUpEnabled: fallbackStage.stagnancy_follow_up_enabled,
    followUpTemplateId: fallbackStage.follow_up_template_id,
  });
}

async function normalizeDefaultStage(service, stageId, isDefault) {
  if (!stageId || !isDefault) {
    await ensureActiveDefaultStage(service);
    return;
  }

  const stages = await listCrmStagesForManagement(service, {
    includeInactive: true,
    includeArchived: true,
  });

  for (const stage of stages) {
    if (stage.id === stageId || !stage.is_default) continue;

    await upsertCrmStage(service, {
      stageId: stage.id,
      systemKey: resolveCrmStageSystemKey(stage),
      displayName: resolveCrmStageDisplayName(stage),
      position: stage.position,
      pipelineState: stage.pipeline_state,
      isActive: stage.is_active,
      isDefault: false,
      isWon: stage.is_won,
      isLost: stage.is_lost,
      brevoTemplateCode: null,
      emailTemplateId: stage.email_template_id || stage.brevo_template_id,
      brevoTemplateConfig: stage.brevo_template_config,
      initialDelayHours: stage.initial_delay_hours,
      stagnancyFollowUpEnabled: stage.stagnancy_follow_up_enabled,
      followUpTemplateId: stage.follow_up_template_id,
    });
  }
}

async function syncStageAutomation(service, stage, { isActive = true } = {}) {
  if (!stage?.id) return null;

  const templateId = parseOptionalString(stage.email_template_id || stage.brevo_template_id);
  const displayName = resolveCrmStageDisplayName(stage);
  const systemKey = resolveCrmStageSystemKey(stage);
  const baseConfig =
    stage.brevo_template_config && typeof stage.brevo_template_config === "object"
      ? stripLegacyRoleFilterConfig({ ...stage.brevo_template_config })
      : {};

  if (templateId) {
    baseConfig.stage_template_id = templateId;
  } else {
    delete baseConfig.stage_template_id;
  }

  baseConfig.stage_system_key = systemKey;
  baseConfig.stage_display_name = displayName;
  baseConfig.initial_delay_hours = Math.max(0, Number(stage.initial_delay_hours || 0) || 0);

  const { data: existingRows, error: selectError } = await service
    .from("crm_automations")
    .select("id, trigger_stage_id")
    .eq("trigger_event", "lead_stage_changed")
    .eq("delivery_channel", "brevo_email")
    .eq("trigger_stage_id", stage.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (selectError) {
    throw new Error(selectError.message || "Failed to inspect stage automation.");
  }

  const existing = existingRows?.[0] || null;
  const nowIso = new Date().toISOString();
  const shouldBeActive = Boolean(isActive && stage.is_active && !stage.archived_at && templateId);

  if (!existing?.id && !templateId) {
    return null;
  }

  const payload = {
    name: `${displayName} stage template`,
    trigger_event: "lead_stage_changed",
    trigger_stage_id: stage.id,
    delivery_channel: "brevo_email",
    template_key: templateId,
    config: baseConfig,
    is_active: shouldBeActive,
    updated_at: nowIso,
  };

  const query = existing?.id
    ? service.from("crm_automations").update(payload).eq("id", existing.id)
    : service.from("crm_automations").insert({
        ...payload,
        created_at: nowIso,
      });

  const { error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to sync the stage automation.");
  }

  return true;
}

async function saveStageWithTemplate(service, stageInput) {
  const stage = await upsertCrmStage(service, stageInput);
  if (!stage?.id) {
    throw new Error("Failed to save the CRM stage.");
  }

  await syncStageAutomation(service, stage, { isActive: true });
  return stage;
}

export async function claimNextLeadAction(formData) {
  const { user, service } = await getMutationContext();
  const { campaignKey, stageId, sourceOrigin } = parseCallingHubCriteria(formData);
  const lead = await claimNextCrmLead(service, {
    operatorUserId: user.id,
    claimTimeoutSeconds: 900,
    campaignKey,
    stageId,
    sourceOrigin,
  });

  if (!lead?.id) {
    redirect(buildRedirectWithFlag(buildCallingHubPath({ campaignKey, stageId, sourceOrigin }), "empty"));
  }

  revalidateCrmPaths(lead.id);
  redirect(
    buildRedirectWithFlag(buildCallingHubPath({ campaignKey, stageId, sourceOrigin, leadId: lead.id }), "claimed")
  );
}

export async function submitCallOutcomeAction(formData) {
  const { user, service } = await getMutationContext();
  const leadId = parseRequiredString(formData.get("leadId"), "Lead");
  const { campaignKey, stageId, sourceOrigin } = parseCallingHubCriteria(formData);
  const queueLeadIds = ensureActiveLeadAtFront(parseOptionalIdList(formData.get("queueLeadIds")), leadId);
  const sessionLeadIds = normalizeOrderedLeadIds([leadId, ...parseOptionalIdList(formData.get("sessionLeadIds"))]);
  const pausedSessionId = parseOptionalString(formData.get("pausedSessionId"));
  const returnTo = buildReturnPath(
    formData,
    buildCallingHubPath({
      campaignKey,
      stageId,
      sourceOrigin,
      leadId,
      sessionLeadIds,
      queueLeadIds,
      pausedSessionId,
    })
  );
  const actionMode =
    formData.get("actionMode")?.toString() === "save_next" ? "save_next" : "save";
  const callOutcome = normalizeCrmCallOutcome(formData.get("callOutcome")) || "attempted";
  const note = formData.get("note")?.toString() ?? "";
  const nextActionAt = getDefaultNextActionAt(
    callOutcome,
    parseOptionalDateTime(formData.get("nextActionAt"))
  );

  await submitCrmCallOutcome(service, {
    leadId,
    operatorUserId: user.id,
    callOutcome,
    note: null,
    nextActionAt,
    releaseClaim: actionMode === "save_next",
    metadata: { source: "crm_calling_hub", campaignKey, stageId, sourceOrigin },
  });

  if (formData.has("note")) {
    await createCrmLeadNote(service, {
      leadId,
      note,
      summary: note.trim().length > 96 ? `${note.trim().slice(0, 93)}...` : note.trim(),
      operatorUserId: user.id,
      metadata: { source: "crm_calling_hub_note", campaignKey, stageId, sourceOrigin },
    });
  }

  revalidateCrmPaths(leadId);
  if (actionMode === "save_next") {
    const rotatedQueueLeadIds = rotateLeadQueueForward(queueLeadIds);
    const nextLeadId = rotatedQueueLeadIds[0] || leadId;

    if (nextLeadId) {
      revalidateCrmPaths(nextLeadId);
      redirect(
        buildRedirectWithFlag(
          buildCallingHubPath({
            campaignKey,
            stageId,
            sourceOrigin,
            leadId: nextLeadId,
            sessionLeadIds,
            queueLeadIds: rotatedQueueLeadIds,
            pausedSessionId,
          }),
          "advanced"
        )
      );
    }

    redirect(
      buildRedirectWithFlag(buildCallingHubPath({ campaignKey, stageId, sourceOrigin }), "empty")
    );
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}saved=1`);
}

export async function moveLeadStageAction(formData) {
  const { user, service } = await getMutationContext();
  const leadId = parseRequiredString(formData.get("leadId"), "Lead");
  const stageId = parseRequiredString(formData.get("stageId"), "Stage");
  const returnTo = buildReturnPath(formData, `/admin/crm/leads/${leadId}`);
  const reason = parseOptionalString(formData.get("reason")) || "crm_ui_stage_move";
  const noRedirect = parseBooleanFlag(formData.get("noRedirect"));

  await moveCrmLeadStage(service, {
    leadId,
    stageId,
    changedByUserId: user.id,
    reason,
    metadata: { source: "crm_ui" },
  });

  revalidateCrmLeadPaths(leadId);
  if (noRedirect) {
    return { success: true, leadId, stageId };
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}moved=1`);
}

export async function archiveLeadAction(formData) {
  const { user, service } = await getMutationContext();
  const leadId = parseRequiredString(formData.get("leadId"), "Lead");
  const returnTo = buildReturnPath(formData, `/admin/crm/leads/${leadId}`);

  await archiveCrmLead(service, {
    leadId,
    reason: parseOptionalString(formData.get("reason")) || "crm_ui_archive",
    actorUserId: user.id,
  });

  revalidateCrmPaths(leadId);
  redirect(buildRedirectWithFlag(returnTo, "lead_archived"));
}

export async function deleteLeadAction(formData) {
  const { user, service } = await getMutationContext();
  const leadId = parseRequiredString(formData.get("leadId"), "Lead");
  const returnTo = buildReturnPath(formData, "/admin/crm/leads");
  await deleteCrmLead(service, {
    leadId,
    reason: parseOptionalString(formData.get("reason")) || "crm_ui_delete",
    actorUserId: user.id,
  });

  revalidateCrmPaths(leadId);
  redirect(buildRedirectWithFlag(returnTo, "lead_deleted"));
}

export async function leaveCallingCampaignAction(formData) {
  const { user, service } = await getMutationContext();
  const leadId = parseOptionalString(formData.get("leadId"));
  const { campaignKey, stageId, sourceOrigin } = parseCallingHubCriteria(formData);
  const mode = parseOptionalString(formData.get("mode")) || "leave";
  const pausedSessionId = parseOptionalString(formData.get("pausedSessionId"));
  const sessionLeadIds = normalizeOrderedLeadIds([leadId, ...parseOptionalIdList(formData.get("sessionLeadIds"))]);
  const queueLeadIds = ensureActiveLeadAtFront(parseOptionalIdList(formData.get("queueLeadIds")), leadId);

  if (mode === "pause") {
    await upsertPausedCrmCallingSession(service, {
      sessionId: pausedSessionId,
      operatorUserId: user.id,
      campaignKey,
      selectedStageId: stageId,
      selectedSourceOrigin: sourceOrigin,
      activeLeadId: leadId,
      queueLeadIds,
      sessionLeadIds,
    });
  } else if (pausedSessionId) {
    await closePausedCrmCallingSession(service, {
      sessionId: pausedSessionId,
      operatorUserId: user.id,
    });
  }

  if (leadId) {
    await releaseCrmLeadClaim(service, { leadId });
    revalidateCrmPaths(leadId);
  }

  const nowIso = new Date().toISOString();
  const { error: releaseAllError } = await service
    .from("crm_leads")
    .update({
      queue_claimed_by_user_id: null,
      queue_claimed_at: null,
      queue_claim_expires_at: null,
      updated_at: nowIso,
    })
    .eq("queue_claimed_by_user_id", user.id);

  if (releaseAllError) {
    throw new Error(releaseAllError.message || "Failed to release the operator calling session.");
  }

  const targetPath = buildCallingHubPath({ campaignKey, stageId, sourceOrigin });
  if (mode === "pause") {
    redirect(buildRedirectWithFlag(targetPath, "paused"));
  }
  if (mode === "stop") {
    redirect(buildRedirectWithFlag(targetPath, "stopped"));
  }

  redirect(buildRedirectWithFlag(targetPath, "left"));
}

export async function closePausedCallingCampaignAction(formData) {
  const { user, service } = await getMutationContext();
  const sessionId = parseRequiredString(formData.get("pausedSessionId"), "Paused campaign");
  const returnTo = buildReturnPath(formData, "/admin/crm/callinghub");

  await closePausedCrmCallingSession(service, {
    sessionId,
    operatorUserId: user.id,
  });

  revalidateCrmPaths();
  redirect(buildRedirectWithFlag(returnTo, "stopped"));
}

export async function createLeadNoteAction(formData) {
  const { user, service } = await getMutationContext();
  const leadId = parseRequiredString(formData.get("leadId"), "Lead");
  const note = formData.get("note")?.toString() ?? "";
  const returnTo = buildReturnPath(formData, `/admin/crm/leads/${leadId}`);

  await createCrmLeadNote(service, {
    leadId,
    note,
    summary: note.trim().length > 96 ? `${note.trim().slice(0, 93)}...` : note.trim(),
    operatorUserId: user.id,
    metadata: { source: "crm_ui_note" },
  });

  revalidateCrmPaths(leadId);
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}noted=1`);
}

export async function deleteCrmInteractionAction(formData) {
  const { service } = await getMutationContext();
  const interactionId = parseRequiredString(formData.get("interactionId"), "Interaction");
  const leadId = parseRequiredString(formData.get("leadId"), "Lead");
  const returnTo = buildReturnPath(formData, buildCallingHubPath({ leadId }));

  await deleteCrmInteraction(service, {
    interactionId,
    leadId,
  });

  revalidateCrmPaths(leadId);
  redirect(buildRedirectWithFlag(returnTo, "history_deleted"));
}

export async function quickEditLeadAction(prevStateOrFormData, maybeFormData) {
  let leadId = null;
  try {
    const formData = getFormDataFromActionArgs(prevStateOrFormData, maybeFormData);
    if (!formData) {
      throw new Error("Quick edit form data was not provided.");
    }

    const { user, service } = await getMutationContext();
    leadId = parseRequiredString(formData.get("leadId"), "Lead");
    const currentStageId = parseOptionalString(formData.get("currentStageId"));
    const nextStageId = parseOptionalString(formData.get("stageId"));
    const note = formData.has("note") ? formData.get("note")?.toString() ?? "" : null;
    const returnTo = buildReturnPath(formData, "/admin/crm/kanban");
    const noRedirect = parseBooleanFlag(formData.get("noRedirect"));
    const fullName = parseOptionalString(formData.get("fullName"));
    const email = parseOptionalString(formData.get("email"))?.toLowerCase() || null;
    const phoneInput = parseOptionalString(formData.get("phone"));

    if (fullName !== null || email !== null || phoneInput !== null) {
      await updateCrmLeadContactDetails(service, {
        leadId,
        fullName,
        email,
        phone: phoneInput,
        changedByUserId: user.id,
        reason: "crm_kanban_quick_edit",
        metadata: { source: "crm_kanban_quick_edit" },
      });
    }

    if (nextStageId && nextStageId !== currentStageId) {
      await moveCrmLeadStage(service, {
        leadId,
        stageId: nextStageId,
        changedByUserId: user.id,
        reason: "crm_kanban_quick_edit",
        metadata: { source: "crm_kanban_quick_edit" },
      });
    }

    if (note !== null) {
      await createCrmLeadNote(service, {
        leadId,
        note,
        summary: note.trim().length > 96 ? `${note.trim().slice(0, 93)}...` : note.trim(),
        operatorUserId: user.id,
        metadata: { source: "crm_kanban_quick_edit" },
      });
    }

    revalidateCrmPaths(leadId);
    if (noRedirect) {
      const selectedLead = await selectCrmLeadById(service, leadId);
      return {
        success: true,
        leadId,
        stageId: nextStageId || currentStageId || null,
        lead: selectedLead ? { ...selectedLead, latest_note: note ?? "" } : null,
        latestNote: note ?? "",
        message: "Quick edit saved.",
        error: null,
      };
    }

    redirect(buildRedirectWithFlag(returnTo, "edited"));
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Failed to save the CRM lead.",
      leadId,
      stageId: null,
      lead: null,
      message: null,
    };
  }
}

export async function createCrmOperatorAction(_prevState, formData) {
  try {
    const { user, context, service } = await getMutationContext();
    if (!canManageCrmOperators(context)) {
      return {
        success: false,
        error: "Only CRM admins or classic admins can create CRM operators.",
        tempPassword: null,
      };
    }

    const email = normalizeEmail(parseRequiredString(formData.get("email"), "Email"));
    const fullName = parseOptionalString(formData.get("fullName"));
    const phone = parseOptionalString(formData.get("phone"));
    const notes = parseOptionalString(formData.get("notes"));
    const role = parseOptionalString(formData.get("role")) || "crm_operator";

    const result = await provisionCrmOperator(service, {
      email,
      fullName,
      phone,
      notes,
      role,
      actorUserId: user.id,
    });

    revalidateCrmPaths();
    return {
      success: true,
      error: null,
      message: result.authUserCreated
        ? "CRM operator created with a one-time password."
        : "CRM operator linked to the existing auth account.",
      tempPassword: result.temporaryPassword,
      email,
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Failed to create the CRM operator.",
      tempPassword: null,
    };
  }
}

export async function simulateCrmWebhookLeadAction(prevStateOrFormData, maybeFormData) {
  const { context } = await getMutationContext();
  if (!canRunCrmSimulations(context)) {
    throw new Error("CRM lead simulation is restricted to CRM admins.");
  }

  const formData = getFormDataFromActionArgs(prevStateOrFormData, maybeFormData);
  if (!formData) {
    throw new Error("CRM simulation form data was not provided.");
  }

  const provider = parseRequiredString(formData.get("provider"), "Provider").toLowerCase();
  const returnTo = buildReturnPath(formData, "/admin/crm/settings");
  const noRedirect = parseBooleanFlag(formData.get("noRedirect"));
  const runSimulation = async () => {
    if (provider === "meta") {
      await ingestCrmWebhookLead(normalizeMetaWebhookPayload(buildMetaSimulationPayload()));
      revalidateCrmPaths();
      return {
        success: true,
        provider: "meta",
        message: "Meta sample lead created through the CRM ingestion flow.",
      };
    }

    if (provider === "web_form") {
      await submitCrmWebFormLead({
        payload: buildWebFormSimulationPayload(),
        headers: {},
        skipTurnstile: true,
      });
      revalidateCrmPaths();
      return {
        success: true,
        provider: "web_form",
        message: "WebForm sample lead created through the CRM ingestion flow.",
      };
    }

    throw new Error("Unsupported CRM simulation provider.");
  };

  try {
    const result = await runSimulation();
    if (noRedirect) {
      return result;
    }

    redirect(buildRedirectWithFlag(returnTo, "simulated", provider));
  } catch (error) {
    if (noRedirect) {
      return {
        success: false,
        provider,
        message: null,
        error: error?.message || "Failed to simulate the CRM lead.",
      };
    }

    throw error;
  }
}

export async function createManualCrmLeadAction(prevStateOrFormData, maybeFormData) {
  try {
    const formData = getFormDataFromActionArgs(prevStateOrFormData, maybeFormData);
    if (!formData) {
      throw new Error("Manual lead form data was not provided.");
    }

    const { user, service } = await getMutationContext();
    const returnTo = buildReturnPath(formData, "/admin/crm/kanban");
    const noRedirect = parseBooleanFlag(formData.get("noRedirect"));
    const manualLead = buildManualLeadInput(formData);
    const result = await upsertManualCrmLead(service, {
      ...manualLead,
      sourceMetadata: {
        origin: "crm_kanban_manual_create",
        actor_user_id: user.id,
      },
    });
    const leadId = result?.lead?.id || null;

    revalidateCrmPaths(leadId);

    const response = {
      success: true,
      error: null,
      leadId,
      created: Boolean(result?.created),
      merged: Boolean(leadId && !result?.created),
      message: result?.created ? "Manual lead created." : "Manual lead merged into an existing record.",
      lead: leadId ? await selectCrmLeadById(service, leadId) : null,
    };

    if (noRedirect) {
      return response;
    }

    redirect(buildRedirectWithFlag(returnTo, "manual_created"));
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Failed to create the manual lead.",
      leadId: null,
      created: false,
      merged: false,
      message: null,
    };
  }
}

export async function saveCrmStageAction(formData) {
  const { context, service } = await getMutationContext();
  if (!canManageCrmStages(context)) {
    throw new Error("CRM stage management is restricted to CRM admins.");
  }

  const stageId = parseOptionalString(formData.get("stageId"));
  const stageKey = parseOptionalString(formData.get("stageKey"));
  const systemKey = parseOptionalString(formData.get("systemKey")) || stageKey;
  const name =
    parseOptionalString(formData.get("displayName")) ||
    parseRequiredString(formData.get("name"), "Stage name");
  const pipelineState = parseRequiredString(formData.get("pipelineState"), "Pipeline state");
  const isActive = parseBooleanFlag(formData.get("isActive"));
  const isDefault = isActive && parseBooleanFlag(formData.get("isDefault"));
  const position = Math.max(1, parseOptionalInteger(formData.get("position")) || 1);
  const brevoTemplateId =
    parseOptionalString(formData.get("emailTemplateId")) ||
    parseOptionalString(formData.get("brevoTemplateId"));
  const brevoTemplateConfig = stripLegacyRoleFilterConfig(parseOptionalJson(formData.get("configJson")));
  const sourceRules = parseSourceRuleConfig(formData);
  const initialDelayHours = parseStageDelayHours(formData);
  const stagnancyFollowUpEnabled = parseStagnancyFollowUpEnabled(formData);
  const followUpTemplateId = parseStagnancyFollowUpTemplateId(formData, stagnancyFollowUpEnabled);
  const clearEmailTemplateId =
    (formData.has("emailTemplateId") || formData.has("brevoTemplateId")) && !brevoTemplateId;
  const clearFollowUpTemplateId =
    formData.has("stagnancyFollowUpTouched") && (!stagnancyFollowUpEnabled || !followUpTemplateId);

  if (sourceRules.exclude.length) {
    brevoTemplateConfig.source_rules = {
      exclude: sourceRules.exclude,
    };
  } else if (brevoTemplateConfig.source_rules && typeof brevoTemplateConfig.source_rules === "object") {
    delete brevoTemplateConfig.source_rules;
  }

  if (initialDelayHours !== null) {
    brevoTemplateConfig.initial_delay_hours = initialDelayHours;
  }
  if (stagnancyFollowUpEnabled !== null) {
    if (stagnancyFollowUpEnabled && followUpTemplateId) {
      brevoTemplateConfig.follow_up_template_id = followUpTemplateId;
      brevoTemplateConfig.stagnancy_follow_up_enabled = true;
    } else {
      delete brevoTemplateConfig.follow_up_template_id;
      brevoTemplateConfig.stagnancy_follow_up_enabled = false;
    }
  }

  if (!stageId && !systemKey) {
    throw new Error("Stage key is required when creating a new stage.");
  }

  const savedStage = await saveStageWithTemplate(service, {
    stageId,
    systemKey,
    displayName: name,
    position,
    pipelineState,
    isActive,
    isDefault,
    brevoTemplateCode: null,
    emailTemplateId: brevoTemplateId,
    brevoTemplateConfig,
    initialDelayHours,
    stagnancyFollowUpEnabled,
    followUpTemplateId,
    clearEmailTemplateId,
    clearFollowUpTemplateId,
  });

  await resequenceCrmStages(service);
  await normalizeDefaultStage(service, savedStage.id, isDefault);
  await ensureActiveDefaultStage(service);

  revalidateCrmPaths(savedStage.id);
  const returnTo = buildReturnPath(formData, "/admin/crm/settings");
  redirect(buildRedirectWithFlag(returnTo, "stage_saved"));
}

export async function moveCrmStageAction(formData) {
  const { context, service } = await getMutationContext();
  if (!canManageCrmStages(context)) {
    throw new Error("CRM stage management is restricted to CRM admins.");
  }

  const stageId = parseRequiredString(formData.get("stageId"), "Stage");
  const direction = formData.get("direction")?.toString().trim().toLowerCase() || "";
  const returnTo = buildReturnPath(formData, "/admin/crm/settings");
  const stages = await listCrmStagesForManagement(service, {
    includeInactive: true,
    includeArchived: true,
  });

  const currentIndex = stages.findIndex((stage) => stage.id === stageId);
  if (currentIndex === -1) {
    throw new Error("The CRM stage to reorder was not found.");
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : direction === "down" ? currentIndex + 1 : currentIndex;
  if (nextIndex < 0 || nextIndex >= stages.length || nextIndex === currentIndex) {
    redirect(buildRedirectWithFlag(returnTo, "stage_moved"));
  }

  const reordered = [...stages];
  const [movedStage] = reordered.splice(currentIndex, 1);
  reordered.splice(nextIndex, 0, movedStage);

  for (let index = 0; index < reordered.length; index += 1) {
    const stage = reordered[index];
    await upsertCrmStage(service, {
      stageId: stage.id,
      systemKey: resolveCrmStageSystemKey(stage),
      displayName: resolveCrmStageDisplayName(stage),
      position: index + 1,
      pipelineState: stage.pipeline_state,
      isActive: stage.is_active,
      isDefault: stage.is_default,
      isWon: stage.is_won,
      isLost: stage.is_lost,
      brevoTemplateCode: null,
      emailTemplateId: stage.email_template_id || stage.brevo_template_id,
      brevoTemplateConfig: stage.brevo_template_config,
      initialDelayHours: stage.initial_delay_hours,
      stagnancyFollowUpEnabled: stage.stagnancy_follow_up_enabled,
      followUpTemplateId: stage.follow_up_template_id,
    });
  }

  revalidateCrmPaths(stageId);
  redirect(buildRedirectWithFlag(returnTo, "stage_moved"));
}

export async function toggleCrmStageActiveAction(formData) {
  const { user, context, service } = await getMutationContext();
  if (!canManageCrmStages(context)) {
    throw new Error("CRM stage management is restricted to CRM admins.");
  }

  const stageId = parseRequiredString(formData.get("stageId"), "Stage");
  const isActive = parseBooleanFlag(formData.get("isActive"));
  const isDefault = parseBooleanFlag(formData.get("isDefault"));
  const returnTo = buildReturnPath(formData, "/admin/crm/settings");
  const stage = await selectCrmStageById(service, stageId);

  if (!stage?.id) {
    throw new Error("The CRM stage was not found.");
  }

  if (!isActive) {
    const archivedStage = await archiveCrmStage(service, {
      stageId,
      reason: "settings_archive",
      actorUserId: user.id,
    });
    await syncStageAutomation(service, archivedStage, { isActive: false });
  } else {
    await saveStageWithTemplate(service, {
      stageId: stage.id,
      systemKey: resolveCrmStageSystemKey(stage),
      displayName: resolveCrmStageDisplayName(stage),
      position: stage.position,
      pipelineState: stage.pipeline_state,
      isActive: true,
      isDefault,
      isWon: stage.is_won,
      isLost: stage.is_lost,
      brevoTemplateCode: null,
      emailTemplateId: stage.email_template_id || stage.brevo_template_id,
      brevoTemplateConfig: stage.brevo_template_config,
      initialDelayHours: stage.initial_delay_hours,
      stagnancyFollowUpEnabled: stage.stagnancy_follow_up_enabled,
      followUpTemplateId: stage.follow_up_template_id,
    });
  }

  await normalizeDefaultStage(service, stageId, isActive && isDefault);
  await ensureActiveDefaultStage(service);
  revalidateCrmPaths(stageId);
  redirect(buildRedirectWithFlag(returnTo, "stage_toggled"));
}

export async function saveCrmStageAutomationAction(formData) {
  const { context, service } = await getMutationContext();
  if (!canManageCrmStages(context)) {
    throw new Error("CRM stage management is restricted to CRM admins.");
  }

  const stageId = parseRequiredString(formData.get("stageId"), "Stage");
  const returnTo = buildReturnPath(formData, "/admin/crm/settings");
  const stage = await selectCrmStageById(service, stageId);
  if (!stage?.id) {
    throw new Error("The CRM stage was not found.");
  }

  const updatedStage = await saveStageWithTemplate(service, {
    stageId: stage.id,
    systemKey: resolveCrmStageSystemKey(stage),
    displayName: resolveCrmStageDisplayName(stage),
    position: stage.position,
    pipelineState: stage.pipeline_state,
    isActive: stage.is_active,
    isDefault: stage.is_default,
    isWon: stage.is_won,
    isLost: stage.is_lost,
    brevoTemplateCode: null,
    emailTemplateId:
      parseOptionalString(formData.get("emailTemplateId")) ||
      parseOptionalString(formData.get("brevoTemplateId")),
    brevoTemplateConfig: (() => {
      const config = stripLegacyRoleFilterConfig(parseOptionalJson(formData.get("configJson")));
      const sourceRules = parseSourceRuleConfig(formData);
      const initialDelayHours = parseStageDelayHours(formData);
      const stagnancyFollowUpEnabled = parseStagnancyFollowUpEnabled(formData);
      const followUpTemplateId = parseStagnancyFollowUpTemplateId(formData, stagnancyFollowUpEnabled);
      if (sourceRules.exclude.length) {
        config.source_rules = {
          exclude: sourceRules.exclude,
        };
      } else if (config.source_rules && typeof config.source_rules === "object") {
        delete config.source_rules;
      }
      if (initialDelayHours !== null) {
        config.initial_delay_hours = initialDelayHours;
      }
      if (stagnancyFollowUpEnabled !== null) {
        if (stagnancyFollowUpEnabled && followUpTemplateId) {
          config.follow_up_template_id = followUpTemplateId;
          config.stagnancy_follow_up_enabled = true;
        } else {
          delete config.follow_up_template_id;
          config.stagnancy_follow_up_enabled = false;
        }
      }
      return config;
    })(),
    initialDelayHours: parseStageDelayHours(formData),
    stagnancyFollowUpEnabled: parseStagnancyFollowUpEnabled(formData),
    followUpTemplateId: parseStagnancyFollowUpTemplateId(
      formData,
      parseStagnancyFollowUpEnabled(formData)
    ),
    clearEmailTemplateId:
      (formData.has("emailTemplateId") || formData.has("brevoTemplateId")) &&
      !(
        parseOptionalString(formData.get("emailTemplateId")) ||
        parseOptionalString(formData.get("brevoTemplateId"))
      ),
    clearFollowUpTemplateId:
      formData.has("stagnancyFollowUpTouched") &&
      !(
        parseStagnancyFollowUpEnabled(formData) &&
        parseStagnancyFollowUpTemplateId(formData, parseStagnancyFollowUpEnabled(formData))
      ),
  });

  const isAutomationActive = parseBooleanFlag(formData.get("isActive"));
  await syncStageAutomation(service, updatedStage, { isActive: isAutomationActive });

  revalidateCrmPaths(stageId);
  redirect(buildRedirectWithFlag(returnTo, "automation_saved"));
}
