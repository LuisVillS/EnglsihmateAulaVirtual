import {
  getCrmIntegrationClient,
  markWebhookEventFailed,
  markWebhookEventProcessed,
  recordIncomingWebhookEvent,
  upsertExternalCrmLead,
} from "./shared.js";
import { enqueueAutomationJobsForLeadEvent } from "../automations/engine.js";
import { createCrmLeadTouchpoint } from "../inbound-events.js";

export async function ingestNormalizedCrmLead(normalized, { service: providedService = null, touchType = null } = {}) {
  if (!normalized?.email && !normalized?.phone) {
    throw new Error("CRM webhook lead requires at least one usable contact field after normalization.");
  }

  const service = providedService || getCrmIntegrationClient();
  const hasInboundEvent = Boolean(normalized?.inboundEventId);
  const intake = hasInboundEvent
    ? { event: null, deduped: false }
    : await recordIncomingWebhookEvent(service, normalized);

  if (intake.deduped && intake.event?.status === "processed") {
    return {
      ok: true,
      deduped: true,
      eventId: intake.event.id,
      leadId: intake.event?.payload?.lead_id || null,
    };
  }

  try {
    const leadResult = await upsertExternalCrmLead(service, normalized);

    if (normalized?.inboundEventId && leadResult.lead?.id) {
      await createCrmLeadTouchpoint(service, {
        leadId: leadResult.lead.id,
        inboundEventId: normalized.inboundEventId,
        touchType: touchType || normalized.touchType || "external_ingest",
        sourceType: normalized.sourceType || normalized.provider || "external",
        sourceProvider: normalized.sourceProvider || normalized.provider || null,
        siteKey: normalized.siteKey || null,
        host: normalized.host || null,
        formKey: normalized.formKey || null,
        formLabel: normalized.formLabel || normalized.sourceLabel || null,
        pagePath: normalized.pagePath || null,
      });
    }

    await enqueueAutomationJobsForLeadEvent(service, {
      leadId: leadResult.lead?.id || null,
      eventType: "lead_created",
      source: normalized.provider,
    });

    if (intake.event?.id) {
      await markWebhookEventProcessed(service, intake.event?.id, {
        lead_id: leadResult.lead?.id || null,
        created: Boolean(leadResult.created),
        provider: normalized.provider,
        source_provider: normalized.sourceProvider || normalized.provider,
        source_type: normalized.sourceType,
        source_label: normalized.sourceLabel,
        source_event_id: normalized.externalEventId,
        normalized_email: normalized.email,
        normalized_phone: normalized.phone,
        canonical_phone: normalized.phoneInfo || null,
        submitted_at: normalized.submittedAt,
        source_metadata: normalized.sourceMetadata || null,
        raw: normalized.rawPayload,
      });
    }

    return {
      ok: true,
      deduped: false,
      created: Boolean(leadResult.created),
      eventId: intake.event?.id || null,
      leadId: leadResult.lead?.id || null,
    };
  } catch (error) {
    if (intake.event?.id) {
      await markWebhookEventFailed(service, intake.event?.id, error?.message || "CRM webhook error", {
        provider: normalized.provider,
        source_provider: normalized.sourceProvider || normalized.provider,
        source_type: normalized.sourceType,
        canonical_phone: normalized.phoneInfo || null,
        raw: normalized.rawPayload,
        source_metadata: normalized.sourceMetadata || null,
      });
    }
    throw error;
  }
}

export async function ingestCrmWebhookLead(normalized, options = {}) {
  return ingestNormalizedCrmLead(normalized, options);
}
