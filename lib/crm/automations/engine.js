import { sendCrmBrevoAutomation, resolveBrevoTemplateId, shouldSendBrevoAutomationForLead } from "./brevo.js";
import { resolveCrmStageDisplayName } from "@/lib/crm/stage-metadata";

const AUTOMATION_COLUMNS =
  "id, name, trigger_event, trigger_stage_id, delivery_channel, template_key, config, is_active, created_at, updated_at";

const AUTOMATION_JOB_COLUMNS =
  "id, automation_id, lead_id, status, scheduled_for, started_at, finished_at, attempt_count, payload, error_message, created_at, updated_at";

const BASE_LEAD_COLUMNS = `
  id,
  user_id,
  email,
  full_name,
  phone,
  lead_status,
  current_stage_id,
  current_pre_enrollment_status,
  approved_pre_enrollment_at,
  won_at,
  last_stage_change_at,
  stage_follow_up_sent_at,
  stage_follow_up_stage_id,
  approved_revenue_soles,
  approved_payment_count,
  latest_approved_payment_at,
  created_at,
  updated_at,
  current_stage:crm_stages!crm_leads_current_stage_id_fkey (
    id,
    stage_key,
    system_key,
    name,
    display_name,
    pipeline_state,
    is_won,
    is_lost,
    email_template_id,
    ignored_roles,
    initial_delay_hours,
    stagnancy_follow_up_enabled,
    follow_up_template_id
  )
`;

const OPTIONAL_LEAD_COLUMNS = [
  "source_type",
  "source_label",
  "source_provider",
  "source_event_id",
  "source_metadata",
  "source_payload",
  "raw_source_type",
  "raw_source_label",
  "raw_source_event_id",
  "raw_source_metadata",
  "raw_source_payload",
  "source_tags:crm_lead_source_tags ( id, source_key, source_origin, source_type, source_label, source_provider, source_event_id, source_metadata, is_primary, occurrence_count, first_seen_at, last_seen_at, created_at, updated_at )",
];

function normalizeTriggerEvent(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return normalized;
}

function normalizeSafeMode(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  return true;
}

function buildScheduledForFromDelayHours(delayHours, now = new Date()) {
  const numericDelay = Number(delayHours || 0);
  if (!Number.isFinite(numericDelay) || numericDelay <= 0) {
    return now.toISOString();
  }

  return new Date(now.getTime() + numericDelay * 60 * 60 * 1000).toISOString();
}

function extractAutomationDelayHours(automation = {}) {
  const config = automation?.config && typeof automation.config === "object" ? automation.config : {};
  const numericDelay = Number(config.initial_delay_hours || config.delay_hours || 0);
  if (!Number.isFinite(numericDelay) || numericDelay <= 0) {
    return 0;
  }
  return numericDelay;
}

function stringifyParamValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildAutomationEventKey({
  automationId,
  eventType,
  leadId,
  triggerStageId = null,
  stageHistoryId = null,
}) {
  return [
    automationId || "automation",
    eventType || "event",
    leadId || "lead",
    triggerStageId || "stage",
    stageHistoryId || "current",
  ].join(":");
}

function buildStageStagnancyEventKey({ leadId, stageId }) {
  return ["stage_stagnancy_follow_up", leadId || "lead", stageId || "stage"].join(":");
}

async function listActiveCrmAutomations(service) {
  const { data, error } = await service
    .from("crm_automations")
    .select(AUTOMATION_COLUMNS)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load CRM automations.");
  }

  return Array.isArray(data) ? data : [];
}

async function selectCrmLeadForAutomation(service, leadId) {
  if (!leadId) return null;

  let optionalColumns = [...OPTIONAL_LEAD_COLUMNS];

  for (;;) {
    const selectColumns =
      optionalColumns.length > 0 ? `${BASE_LEAD_COLUMNS}, ${optionalColumns.join(", ")}` : BASE_LEAD_COLUMNS;
    const { data, error } = await service.from("crm_leads").select(selectColumns).eq("id", leadId).maybeSingle();

    if (!error) {
      return data || null;
    }

    const missingColumn = optionalColumns.find((column) => {
      const message = String(error.message || "").toLowerCase();
      return message.includes(`crm_leads.${column}`) || message.includes(`column "${column}"`) || message.includes(`column ${column}`) || message.includes(column.replace(/_/g, " "));
    });

    if (!missingColumn) {
      throw new Error(error.message || "Failed to load the CRM lead for automation.");
    }

    optionalColumns = optionalColumns.filter((column) => column !== missingColumn);
  }
}

async function hasExistingAutomationJob(service, { automationId, leadId, eventKey }) {
  const { data, error } = await service
    .from("crm_automation_jobs")
    .select("id, status")
    .eq("automation_id", automationId)
    .eq("lead_id", leadId)
    .contains("payload", { event_key: eventKey })
    .limit(1);

  if (error) {
    throw new Error(error.message || "Failed to check CRM automation dedupe state.");
  }

  return Array.isArray(data) && data.length > 0;
}

async function insertAutomationJob(service, { automation, leadId, payload, scheduledFor = null }) {
  const nowIso = new Date().toISOString();
  const { data, error } = await service
    .from("crm_automation_jobs")
    .insert({
      automation_id: automation.id,
      lead_id: leadId,
      status: "pending",
      scheduled_for: scheduledFor || nowIso,
      attempt_count: 0,
      payload,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(AUTOMATION_JOB_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to enqueue the CRM automation job.");
  }

  return data || null;
}

async function hasExistingStageFollowUpJob(service, { leadId, eventKey }) {
  const { data, error } = await service
    .from("crm_automation_jobs")
    .select("id, status")
    .is("automation_id", null)
    .eq("lead_id", leadId)
    .contains("payload", { event_key: eventKey })
    .limit(1);

  if (error) {
    throw new Error(error.message || "Failed to check CRM stagnancy follow-up dedupe state.");
  }

  return Array.isArray(data) && data.length > 0;
}

async function insertStageFollowUpJob(service, { leadId, stageId, templateId, payload }) {
  const nowIso = new Date().toISOString();
  const { data, error } = await service
    .from("crm_automation_jobs")
    .insert({
      automation_id: null,
      lead_id: leadId,
      status: "pending",
      scheduled_for: nowIso,
      attempt_count: 0,
      payload: {
        ...(payload || {}),
        job_kind: "stage_stagnancy_follow_up",
        stage_id: stageId || null,
        template_id: templateId || null,
      },
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(AUTOMATION_JOB_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to enqueue the CRM stagnancy follow-up job.");
  }

  return data || null;
}

export async function enqueueAutomationJobsForLeadEvent(
  service,
  { leadId, eventType, source = "crm", stageId = null, stageHistoryId = null } = {}
) {
  if (!leadId) {
    return { enqueued: 0, skipped: 0, jobs: [] };
  }

  const normalizedEventType = normalizeTriggerEvent(eventType);
  if (!normalizedEventType) {
    return { enqueued: 0, skipped: 0, jobs: [] };
  }

  const automations = await listActiveCrmAutomations(service);
  const matchingAutomations = automations.filter((automation) => {
    if (normalizeTriggerEvent(automation.trigger_event) !== normalizedEventType) return false;
    if (automation.trigger_stage_id && stageId && automation.trigger_stage_id !== stageId) return false;
    if (automation.trigger_stage_id && !stageId) return false;
    return true;
  });

  let enqueued = 0;
  let skipped = 0;
  const jobs = [];

  for (const automation of matchingAutomations) {
    const eventKey = buildAutomationEventKey({
      automationId: automation.id,
      eventType: normalizedEventType,
      leadId,
      triggerStageId: automation.trigger_stage_id || stageId,
      stageHistoryId,
    });

    const exists = await hasExistingAutomationJob(service, {
      automationId: automation.id,
      leadId,
      eventKey,
    });

    if (exists) {
      skipped += 1;
      continue;
    }

    const job = await insertAutomationJob(service, {
      automation,
      leadId,
      payload: {
        event_type: normalizedEventType,
        event_key: eventKey,
        trigger_stage_id: automation.trigger_stage_id || stageId || null,
        stage_history_id: stageHistoryId || null,
        source,
      },
      scheduledFor: buildScheduledForFromDelayHours(extractAutomationDelayHours(automation)),
    });

    enqueued += 1;
    if (job?.id) jobs.push(job);
  }

  return { enqueued, skipped, jobs };
}

export async function enqueuePendingCrmAutomationJobs(service, { limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50) || 50));
  const automations = await listActiveCrmAutomations(service);
  let enqueued = 0;
  let skipped = 0;

  if (automations.some((automation) => normalizeTriggerEvent(automation.trigger_event) === "lead_created")) {
    const { data: leads, error } = await service
      .from("crm_leads")
      .select("id, current_stage_id, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error) {
      throw new Error(error.message || "Failed to scan CRM leads for lead_created automations.");
    }

    for (const lead of leads || []) {
      const summary = await enqueueAutomationJobsForLeadEvent(service, {
        leadId: lead.id,
        eventType: "lead_created",
        source: "automation_scan",
        stageId: lead.current_stage_id || null,
      });
      enqueued += summary.enqueued;
      skipped += summary.skipped;
    }
  }

  if (automations.some((automation) => normalizeTriggerEvent(automation.trigger_event) === "lead_stage_changed")) {
    const { data: historyRows, error } = await service
      .from("crm_stage_history")
      .select("id, lead_id, to_stage_id, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error) {
      throw new Error(error.message || "Failed to scan CRM stage history for automations.");
    }

    for (const row of historyRows || []) {
      const summary = await enqueueAutomationJobsForLeadEvent(service, {
        leadId: row.lead_id,
        eventType: "lead_stage_changed",
        source: "automation_scan",
        stageId: row.to_stage_id || null,
        stageHistoryId: row.id,
      });
      enqueued += summary.enqueued;
      skipped += summary.skipped;
    }
  }

  if (automations.some((automation) => normalizeTriggerEvent(automation.trigger_event) === "lead_won")) {
    const { data: wonLeads, error } = await service
      .from("crm_leads")
      .select("id, current_stage_id, won_at, updated_at")
      .eq("lead_status", "won")
      .order("won_at", { ascending: false, nullsFirst: false })
      .limit(safeLimit);

    if (error) {
      throw new Error(error.message || "Failed to scan CRM won leads for automations.");
    }

    for (const lead of wonLeads || []) {
      const summary = await enqueueAutomationJobsForLeadEvent(service, {
        leadId: lead.id,
        eventType: "lead_won",
        source: "automation_scan",
        stageId: lead.current_stage_id || null,
      });
      enqueued += summary.enqueued;
      skipped += summary.skipped;
    }
  }

  return { enqueued, skipped };
}

async function listStageStagnancyCandidates(service, { limit = 50, thresholdHours = 24 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50) || 50));
  const thresholdIso = new Date(Date.now() - Math.max(1, Number(thresholdHours || 24) || 24) * 60 * 60 * 1000).toISOString();
  const { data, error } = await service
    .from("crm_leads")
    .select(BASE_LEAD_COLUMNS)
    .eq("lead_status", "open")
    .not("current_stage_id", "is", null)
    .not("last_stage_change_at", "is", null)
    .lte("last_stage_change_at", thresholdIso)
    .order("last_stage_change_at", { ascending: true })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message || "Failed to scan CRM leads for stage stagnancy follow-ups.");
  }

  return Array.isArray(data) ? data : [];
}

export async function enqueueStageStagnancyFollowUpJobs(
  service,
  { limit = 50, thresholdHours = 24 } = {}
) {
  const candidates = await listStageStagnancyCandidates(service, { limit, thresholdHours });
  let enqueued = 0;
  let skipped = 0;

  for (const lead of candidates) {
    const stage = lead?.current_stage || null;
    const stageId = stage?.id || lead?.current_stage_id || null;
    const templateId = stage?.follow_up_template_id || null;

    if (!stageId || !templateId || !stage?.stagnancy_follow_up_enabled) {
      skipped += 1;
      continue;
    }

    if (stage?.pipeline_state === "won" || stage?.pipeline_state === "lost" || stage?.is_won || stage?.is_lost) {
      skipped += 1;
      continue;
    }

    if (
      lead?.stage_follow_up_sent_at &&
      String(lead?.stage_follow_up_stage_id || "") === String(stageId)
    ) {
      skipped += 1;
      continue;
    }

    const sourceDecision = shouldSendBrevoAutomationForLead(
      { config: stage?.brevo_template_config || {} },
      lead
    );

    if (!sourceDecision.shouldSend) {
      skipped += 1;
      continue;
    }

    const eventKey = buildStageStagnancyEventKey({
      leadId: lead.id,
      stageId,
    });

    const exists = await hasExistingStageFollowUpJob(service, {
      leadId: lead.id,
      eventKey,
    });
    if (exists) {
      skipped += 1;
      continue;
    }

    await insertStageFollowUpJob(service, {
      leadId: lead.id,
      stageId,
      templateId,
      payload: {
        event_type: "lead_stage_stagnant",
        event_key: eventKey,
        source: "stagnancy_scan",
        source_origins: sourceDecision.leadOrigins,
        stage_display_name: resolveCrmStageDisplayName(stage),
      },
    });

    enqueued += 1;
  }

  return { enqueued, skipped };
}

async function markAutomationJobProcessing(service, job) {
  const startedAt = new Date().toISOString();
  const { data, error } = await service
    .from("crm_automation_jobs")
    .update({
      status: "processing",
      started_at: startedAt,
      attempt_count: Number(job?.attempt_count || 0) + 1,
      updated_at: startedAt,
    })
    .eq("id", job.id)
    .eq("status", job.status)
    .select(AUTOMATION_JOB_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to mark CRM automation job as processing.");
  }

  return data || null;
}

async function markAutomationJobCompleted(service, jobId, payload) {
  const finishedAt = new Date().toISOString();
  const { error } = await service
    .from("crm_automation_jobs")
    .update({
      status: "completed",
      finished_at: finishedAt,
      updated_at: finishedAt,
      payload,
      error_message: null,
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message || "Failed to mark CRM automation job as completed.");
  }
}

async function markAutomationJobFailed(service, jobId, payload, errorMessage) {
  const finishedAt = new Date().toISOString();
  const { error } = await service
    .from("crm_automation_jobs")
    .update({
      status: "failed",
      finished_at: finishedAt,
      updated_at: finishedAt,
      payload,
      error_message: errorMessage || "CRM automation job failed.",
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message || "Failed to mark CRM automation job as failed.");
  }
}

async function markLeadStageFollowUpSent(service, { leadId, stageId }) {
  const nowIso = new Date().toISOString();
  const { error } = await service
    .from("crm_leads")
    .update({
      stage_follow_up_sent_at: nowIso,
      stage_follow_up_stage_id: stageId || null,
      updated_at: nowIso,
      last_synced_at: nowIso,
    })
    .eq("id", leadId);

  if (error) {
    throw new Error(error.message || "Failed to mark the CRM stage follow-up as sent.");
  }
}

function buildAutomationParams({ automation, lead, job }) {
  const config = automation?.config && typeof automation.config === "object" ? automation.config : {};
  return {
    lead_name: lead?.full_name || lead?.email || "",
    lead_email: lead?.email || "",
    lead_phone: lead?.phone || "",
    lead_status: lead?.lead_status || "",
    lead_stage: lead?.current_stage?.display_name || lead?.current_stage?.name || "",
    lead_stage_key: lead?.current_stage?.system_key || lead?.current_stage?.stage_key || "",
    lead_source_type: lead?.source_type || lead?.raw_source_type || "",
    lead_source_label: lead?.source_label || lead?.raw_source_label || "",
    lead_source_provider: lead?.source_provider || "",
    lead_source_event_id: lead?.source_event_id || lead?.raw_source_event_id || "",
    lead_source_metadata: stringifyParamValue(lead?.source_metadata || lead?.raw_source_metadata || null),
    lead_source_payload: stringifyParamValue(lead?.source_payload || lead?.raw_source_payload || null),
    lead_source_tags: stringifyParamValue(lead?.source_tags || []),
    approved_revenue_soles: Number(lead?.approved_revenue_soles || 0),
    approved_payment_count: Number(lead?.approved_payment_count || 0),
    trigger_event: job?.payload?.event_type || automation?.trigger_event || "",
    ...((config.params && typeof config.params === "object") ? config.params : {}),
  };
}

async function listPendingAutomationJobs(service, { limit = 25 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit || 25) || 25));
  const { data, error } = await service
    .from("crm_automation_jobs")
    .select(AUTOMATION_JOB_COLUMNS)
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message || "Failed to load pending CRM automation jobs.");
  }

  return Array.isArray(data) ? data : [];
}

export async function runCrmAutomationJobs(service, { limit = 25, safeMode = true } = {}) {
  const pendingJobs = await listPendingAutomationJobs(service, { limit });
  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (const job of pendingJobs) {
    let processingJob = null;
    try {
      processingJob = await markAutomationJobProcessing(service, job);
      if (!processingJob?.id) continue;

      const lead = await selectCrmLeadForAutomation(service, processingJob.lead_id);
      if (!lead?.id) {
        throw new Error("CRM automation lead not found.");
      }

      const isStageStagnancyJob = processingJob?.payload?.job_kind === "stage_stagnancy_follow_up";

      if (isStageStagnancyJob) {
        const currentStage = lead?.current_stage || null;
        const stageId = processingJob?.payload?.stage_id || null;
        if (!currentStage?.id || String(currentStage.id) !== String(stageId || "")) {
          await markAutomationJobCompleted(service, processingJob.id, {
            ...(processingJob.payload || {}),
            skipped: true,
            skip_reason: "lead_left_stage",
          });
          completed += 1;
          continue;
        }

        if (
          !currentStage?.stagnancy_follow_up_enabled ||
          !currentStage?.follow_up_template_id ||
          currentStage?.pipeline_state === "won" ||
          currentStage?.pipeline_state === "lost" ||
          currentStage?.is_won ||
          currentStage?.is_lost
        ) {
          await markAutomationJobCompleted(service, processingJob.id, {
            ...(processingJob.payload || {}),
            skipped: true,
            skip_reason: "stage_follow_up_disabled",
          });
          completed += 1;
          continue;
        }

        if (
          lead?.stage_follow_up_sent_at &&
          String(lead?.stage_follow_up_stage_id || "") === String(currentStage.id)
        ) {
          await markAutomationJobCompleted(service, processingJob.id, {
            ...(processingJob.payload || {}),
            skipped: true,
            skip_reason: "follow_up_already_sent",
          });
          completed += 1;
          continue;
        }

        const sourceDecision = shouldSendBrevoAutomationForLead(
          { config: currentStage?.brevo_template_config || {} },
          lead
        );
        if (!sourceDecision.shouldSend) {
          await markAutomationJobCompleted(service, processingJob.id, {
            ...(processingJob.payload || {}),
            skipped: true,
            skip_reason: sourceDecision.reason,
            source_origins: sourceDecision.leadOrigins,
          });
          completed += 1;
          continue;
        }

        const automationDescriptor = {
          id: `stage-follow-up:${currentStage.id}`,
          name: `${resolveCrmStageDisplayName(currentStage)} stagnancy follow-up`,
          config: {
            follow_up_template_id: currentStage.follow_up_template_id,
          },
        };
        const templateId = resolveBrevoTemplateId(automationDescriptor, {
          lead,
          job: processingJob,
        });
        const deliveryPayload = {
          ...(processingJob.payload || {}),
          lead_id: lead.id,
          lead_email: lead.email || null,
          stage_id: currentStage.id,
          stage_display_name: resolveCrmStageDisplayName(currentStage),
          template_id: templateId,
        };

        if (normalizeSafeMode(safeMode)) {
          await markAutomationJobCompleted(service, processingJob.id, {
            ...deliveryPayload,
            safe_mode: true,
            delivery_status: "skipped_safe_mode",
          });
        } else {
          await sendCrmBrevoAutomation({
            automation: automationDescriptor,
            lead,
            templateId,
            params: buildAutomationParams({
              automation: automationDescriptor,
              lead,
              job: processingJob,
            }),
          });
          await markLeadStageFollowUpSent(service, {
            leadId: lead.id,
            stageId: currentStage.id,
          });
          await markAutomationJobCompleted(service, processingJob.id, {
            ...deliveryPayload,
            safe_mode: false,
            delivery_status: "sent",
          });
        }
      } else {
        const automation = await service
          .from("crm_automations")
          .select(AUTOMATION_COLUMNS)
          .eq("id", processingJob.automation_id)
          .maybeSingle();

        if (automation.error || !automation.data?.id) {
          throw new Error(automation.error?.message || "CRM automation not found.");
        }

        if (
          processingJob?.payload?.event_type === "lead_stage_changed" &&
          automation.data?.trigger_stage_id &&
          String(lead?.current_stage_id || "") !== String(automation.data.trigger_stage_id)
        ) {
          await markAutomationJobCompleted(service, processingJob.id, {
            ...(processingJob.payload || {}),
            skipped: true,
            skip_reason: "lead_left_stage",
          });
          completed += 1;
          continue;
        }

        const sourceDecision = shouldSendBrevoAutomationForLead(automation.data, lead);
        if (!sourceDecision.shouldSend) {
          await markAutomationJobCompleted(service, processingJob.id, {
            ...(processingJob.payload || {}),
            skipped: true,
            skip_reason: sourceDecision.reason,
            source_origins: sourceDecision.leadOrigins,
          });
          completed += 1;
          continue;
        }

        const templateId = resolveBrevoTemplateId(automation.data, {
          lead,
          job: processingJob,
        });
        const deliveryPayload = {
          ...(processingJob.payload || {}),
          lead_id: lead.id,
          lead_email: lead.email || null,
          lead_source_type: lead.source_type || lead.raw_source_type || null,
          lead_source_label: lead.source_label || lead.raw_source_label || null,
          automation_name: automation.data.name || null,
          template_id: templateId,
        };

        if (normalizeSafeMode(safeMode)) {
          await markAutomationJobCompleted(service, processingJob.id, {
            ...deliveryPayload,
            safe_mode: true,
            delivery_status: "skipped_safe_mode",
          });
        } else {
          await sendCrmBrevoAutomation({
            automation: automation.data,
            lead,
            templateId,
            params: buildAutomationParams({
              automation: automation.data,
              lead,
              job: processingJob,
            }),
          });

          await markAutomationJobCompleted(service, processingJob.id, {
            ...deliveryPayload,
            safe_mode: false,
            delivery_status: "sent",
          });
        }
      }

      processed += 1;
      completed += 1;
    } catch (error) {
      const payload = {
        ...(processingJob?.payload || job?.payload || {}),
        failed_at: new Date().toISOString(),
      };
      await markAutomationJobFailed(
        service,
        processingJob?.id || job.id,
        payload,
        error?.message || "CRM automation delivery failed."
      );
      processed += 1;
      failed += 1;
    }
  }

  return {
    pending: pendingJobs.length,
    processed,
    completed,
    failed,
    safeMode: normalizeSafeMode(safeMode),
  };
}
