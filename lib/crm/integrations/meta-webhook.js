import { NextResponse } from "next/server";
import {
  fetchMetaLeadDetails,
  normalizeMetaLeadPayload,
  parseMetaWebhookNotifications,
  verifyMetaWebhookSignature,
} from "./meta.js";
import {
  headersToJson,
  markCrmInboundEventFailed,
  markCrmInboundEventProcessed,
  recordCrmInboundEvent,
} from "../inbound-events.js";
import { ingestNormalizedCrmLead } from "./webhook-ingestion.js";
import { getCrmIntegrationClient } from "./shared.js";

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function buildWebhookEventKey(notification) {
  return ["meta_webhook", notification.pageId || "page", notification.leadgenId || "lead"].join(":");
}

function buildFetchEventKey(notification) {
  return ["meta_fetch", notification.leadgenId || "lead"].join(":");
}

export function buildMetaSimulationWebhookPayload() {
  const stamp = Date.now();
  return {
    object: "page",
    entry: [
      {
        id: "meta-page-sim",
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: `meta-sim-${stamp}`,
              page_id: "meta-page-sim",
              form_id: "meta-form-sim",
              ad_id: "meta-ad-sim",
              campaign_id: "meta-campaign-sim",
              created_time: new Date().toISOString(),
            },
          },
        ],
      },
    ],
  };
}

export async function processMetaWebhookPayload({
  payload,
  headers = {},
  signatureValid = true,
  service = null,
  allowMissingSignature = false,
} = {}) {
  const crmService = service || getCrmIntegrationClient();
  const headerJson = headersToJson(headers);
  const notifications = parseMetaWebhookNotifications(payload);

  if (!notifications.length) {
    return { ok: true, notifications: 0, processed: 0, ignored: true };
  }

  let processed = 0;

  for (const notification of notifications) {
    const webhookEvent = await recordCrmInboundEvent(crmService, {
      provider: "meta",
      eventType: "meta_webhook",
      sourceType: "meta_lead",
      sourceProvider: "meta",
      host: normalizeFreeText(headerJson["x-forwarded-host"]) || normalizeFreeText(headerJson.host),
      externalEventId: buildWebhookEventKey(notification),
      externalLeadId: notification.leadgenId,
      payload: payload,
      headers: headerJson,
      validationStatus: signatureValid || allowMissingSignature ? "valid" : "invalid",
      processingStatus: "pending",
      signatureValid,
    });

    try {
      if (webhookEvent?._deduped && webhookEvent?.processing_status === "processed") {
        processed += 1;
        continue;
      }

      if (!signatureValid && !allowMissingSignature) {
        throw new Error("Invalid Meta webhook signature.");
      }

      const leadPayload = await fetchMetaLeadDetails({
        leadgenId: notification.leadgenId,
      });

      const fetchEvent = await recordCrmInboundEvent(crmService, {
        provider: "meta",
        eventType: "meta_lead_fetch",
        sourceType: "meta_lead",
        sourceProvider: "meta",
        externalEventId: buildFetchEventKey(notification),
        externalLeadId: notification.leadgenId,
        payload: leadPayload,
        headers: {},
        validationStatus: "valid",
        processingStatus: "pending",
      });

      if (fetchEvent?._deduped && fetchEvent?.processing_status === "processed") {
        await markCrmInboundEventProcessed(crmService, webhookEvent?.id, {
          validationStatus: signatureValid ? "valid" : "skipped",
          processingStatus: "processed",
          signatureValid,
          externalLeadId: notification.leadgenId,
          payloadJson: {
            raw: payload,
            deduped: true,
            leadgen_id: notification.leadgenId,
          },
        });
        processed += 1;
        continue;
      }

      const normalized = normalizeMetaLeadPayload(leadPayload, {
        externalEventId: notification.leadgenId,
        inboundEventId: fetchEvent?.id || null,
        pageId: notification.pageId,
        formId: notification.formId,
        adId: notification.adId,
        campaignId: notification.campaignId,
        createdTime: notification.createdTime,
      });

      const result = await ingestNormalizedCrmLead(
        {
          ...normalized,
          touchType: "meta_fetch",
        },
        { service: crmService, touchType: "meta_fetch" }
      );

      await markCrmInboundEventProcessed(crmService, fetchEvent?.id, {
        validationStatus: "valid",
        processingStatus: "processed",
        externalLeadId: notification.leadgenId,
        payloadJson: {
          lead_id: result.leadId || null,
          payload: leadPayload,
        },
      });

      await markCrmInboundEventProcessed(crmService, webhookEvent?.id, {
        validationStatus: signatureValid ? "valid" : "skipped",
        processingStatus: "processed",
        signatureValid,
        externalLeadId: notification.leadgenId,
        payloadJson: {
          raw: payload,
          lead_id: result.leadId || null,
          leadgen_id: notification.leadgenId,
        },
      });

      processed += 1;
    } catch (error) {
      await markCrmInboundEventFailed(crmService, webhookEvent?.id, {
        validationStatus: signatureValid ? "valid" : "invalid",
        processingStatus: "failed",
        processingError: error?.message || "Meta webhook processing failed.",
        signatureValid,
      }).catch(() => null);
      throw error;
    }
  }

  return {
    ok: true,
    notifications: notifications.length,
    processed,
  };
}

export async function handleMetaWebhookGet(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = normalizeFreeText(process.env.META_WEBHOOK_VERIFY_TOKEN);

  if (mode !== "subscribe" || !challenge || !expectedToken || verifyToken !== expectedToken) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

export async function handleMetaWebhookPost(request, { allowMissingSignature = false } = {}) {
  const rawBody = await request.text();
  let payload = null;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const signatureHeader =
    request.headers.get("x-hub-signature-256") ||
    request.headers.get("x-hub-signature") ||
    "";
  const appSecret = process.env.META_APP_SECRET || "";
  const signatureValid = verifyMetaWebhookSignature({
    rawBody,
    signatureHeader,
    appSecret,
  });

  if (!allowMissingSignature && (!appSecret || !signatureValid)) {
    try {
      await processMetaWebhookPayload({
        payload,
        headers: request.headers,
        signatureValid: false,
        allowMissingSignature: false,
      });
    } catch {
      // no-op: the failure was already captured in the inbound-event flow when possible
    }

    return NextResponse.json({ error: "Invalid Meta signature." }, { status: 401 });
  }

  try {
    const result = await processMetaWebhookPayload({
      payload,
      headers: request.headers,
      signatureValid,
      allowMissingSignature,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.message || "Meta webhook processing failed.",
      },
      { status: 400 }
    );
  }
}
