import { headersToJson, markCrmInboundEventFailed, markCrmInboundEventProcessed, recordCrmInboundEvent } from "../inbound-events.js";
import { verifyTurnstileToken } from "@/lib/turnstile/verify";
import { getCrmIntegrationClient } from "./shared.js";
import { normalizeWebFormSubmission } from "./web-form.js";
import { ingestNormalizedCrmLead } from "./webhook-ingestion.js";

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

export async function submitCrmWebFormLead({
  payload = {},
  headers = {},
  service = null,
  skipTurnstile = false,
} = {}) {
  const crmService = service || getCrmIntegrationClient();
  const headerJson = headersToJson(headers);
  const host =
    normalizeFreeText(headerJson["x-forwarded-host"]) ||
    normalizeFreeText(headerJson.host) ||
    normalizeFreeText(payload.host);

  const inboundEvent = await recordCrmInboundEvent(crmService, {
    provider: "web_form",
    eventType: "form_submission",
    sourceType: "web_form",
    sourceProvider: "internal",
    siteKey: payload.siteKey || payload.site_key || null,
    host,
    formKey: payload.formKey || payload.form_key || null,
    formLabel: payload.formLabel || payload.form_label || null,
    pagePath: payload.pagePath || payload.page_path || null,
    payload,
    headers: headerJson,
    validationStatus: skipTurnstile ? "skipped" : "pending",
    processingStatus: "pending",
  });

  let turnstileVerified = Boolean(skipTurnstile);

  try {
    if (!skipTurnstile) {
      const verification = await verifyTurnstileToken({
        token: payload.turnstileToken || payload.turnstile_token,
        remoteIp: headerJson["cf-connecting-ip"] || headerJson["x-forwarded-for"] || null,
        idempotencyKey: inboundEvent?.id || null,
      });

      if (!verification.ok) {
        await markCrmInboundEventFailed(crmService, inboundEvent?.id, {
          validationStatus: "invalid",
          processingStatus: "failed",
          processingError: verification.reason || "Turnstile validation failed.",
          turnstileValid: false,
        });
        throw new Error("Turnstile validation failed.");
      }

      turnstileVerified = true;
    }

    const normalized = normalizeWebFormSubmission(payload, {
      host,
    });
    const result = await ingestNormalizedCrmLead(
      {
        ...normalized,
        inboundEventId: inboundEvent?.id || null,
        touchType: "web_form_submit",
      },
      { service: crmService, touchType: "web_form_submit" }
    );

    await markCrmInboundEventProcessed(crmService, inboundEvent?.id, {
      validationStatus: skipTurnstile ? "skipped" : "valid",
      processingStatus: "processed",
      turnstileValid: skipTurnstile ? null : true,
      externalLeadId: normalized.externalLeadId || null,
      payloadJson: {
        ...payload,
        lead_id: result.leadId || null,
      },
    });

    return {
      ...result,
      inboundEventId: inboundEvent?.id || null,
      normalized,
    };
  } catch (error) {
    if (inboundEvent?.id) {
      await markCrmInboundEventFailed(crmService, inboundEvent.id, {
        validationStatus: skipTurnstile ? "skipped" : turnstileVerified ? "valid" : "invalid",
        processingStatus: "failed",
        processingError: error?.message || "Web form ingestion failed.",
      }).catch(() => null);
    }
    throw error;
  }
}
