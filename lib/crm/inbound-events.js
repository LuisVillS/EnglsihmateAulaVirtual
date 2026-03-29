import { createHash } from "node:crypto";

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function extractForwardedIp(headersJson = {}) {
  const forwardedFor =
    headersJson["x-forwarded-for"] ||
    headersJson["cf-connecting-ip"] ||
    headersJson["x-real-ip"] ||
    "";

  const firstValue = String(forwardedFor)
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);

  return firstValue || null;
}

export function hashInboundIp(value) {
  const normalized = normalizeFreeText(value);
  if (!normalized) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

export function headersToJson(headersLike) {
  if (!headersLike) return {};

  if (typeof headersLike.entries === "function") {
    return Object.fromEntries(Array.from(headersLike.entries()));
  }

  if (typeof headersLike === "object") {
    return { ...headersLike };
  }

  return {};
}

export function resolveLeadSiteKey({ explicitSiteKey = null, host = null } = {}) {
  const normalizedExplicit = normalizeFreeText(explicitSiteKey)?.toLowerCase();
  if (normalizedExplicit === "main_site" || normalizedExplicit === "virtual_site") {
    return normalizedExplicit;
  }

  const normalizedHost = normalizeFreeText(host)?.toLowerCase();
  if (!normalizedHost) return null;
  if (normalizedHost === "virtual.englishmate.com.pe") return "virtual_site";
  if (normalizedHost === "englishmate.com.pe" || normalizedHost === "www.englishmate.com.pe") return "main_site";
  return null;
}

export async function recordCrmInboundEvent(
  client,
  {
    provider,
    eventType,
    sourceType = null,
    sourceProvider = null,
    siteKey = null,
    host = null,
    formKey = null,
    formLabel = null,
    pagePath = null,
    externalEventId = null,
    externalLeadId = null,
    payload = {},
    headers = {},
    validationStatus = "pending",
    processingStatus = "pending",
    processingError = null,
    signatureValid = null,
    turnstileValid = null,
    ipHash = null,
    userAgent = null,
  } = {}
) {
  if (!provider) {
    throw new Error("CRM inbound event requires a provider.");
  }
  if (!eventType) {
    throw new Error("CRM inbound event requires an eventType.");
  }

  const headersJson = headersToJson(headers);
  const derivedIpHash = ipHash || hashInboundIp(extractForwardedIp(headersJson));

  const insertPayload = {
    provider,
    event_type: eventType,
    source_type: sourceType,
    source_provider: sourceProvider,
    site_key: siteKey,
    host,
    form_key: formKey,
    form_label: formLabel,
    page_path: pagePath,
    external_event_id: externalEventId,
    external_lead_id: externalLeadId,
    payload_json: payload || {},
    headers_json: headersJson,
    validation_status: validationStatus,
    processing_status: processingStatus,
    processing_error: processingError,
    signature_valid: signatureValid,
    turnstile_valid: turnstileValid,
    ip_hash: derivedIpHash,
    user_agent: normalizeFreeText(userAgent) || normalizeFreeText(headersJson["user-agent"]),
  };

  const { data, error } = await client
    .from("crm_inbound_events")
    .insert(insertPayload)
    .select("*")
    .maybeSingle();

  if (error) {
    const message = String(error?.message || "").toLowerCase();
    if (externalEventId && (message.includes("duplicate") || message.includes("unique"))) {
      const { data: existing, error: existingError } = await client
        .from("crm_inbound_events")
        .select("*")
        .eq("provider", provider)
        .eq("external_event_id", externalEventId)
        .maybeSingle();

      if (!existingError && existing?.id) {
        return {
          ...existing,
          _deduped: true,
        };
      }
    }
    throw new Error(error.message || "Failed to record the CRM inbound event.");
  }

  return data ? { ...data, _deduped: false } : null;
}

export async function markCrmInboundEventProcessed(client, eventId, patch = {}) {
  if (!eventId) return null;

  const { error } = await client
    .from("crm_inbound_events")
    .update({
      validation_status: patch.validationStatus || "valid",
      processing_status: patch.processingStatus || "processed",
      processing_error: patch.processingError || null,
      signature_valid:
        typeof patch.signatureValid === "boolean" ? patch.signatureValid : patch.signature_valid,
      turnstile_valid:
        typeof patch.turnstileValid === "boolean" ? patch.turnstileValid : patch.turnstile_valid,
      external_lead_id: patch.externalLeadId || patch.external_lead_id || null,
      processed_at: patch.processedAt || new Date().toISOString(),
      payload_json: patch.payloadJson || patch.payload_json,
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(error.message || "Failed to mark the CRM inbound event as processed.");
  }

  return true;
}

export async function markCrmInboundEventFailed(
  client,
  eventId,
  {
    validationStatus = null,
    processingStatus = "failed",
    processingError = null,
    signatureValid = null,
    turnstileValid = null,
    payloadJson = null,
  } = {}
) {
  if (!eventId) return null;

  const { error } = await client
    .from("crm_inbound_events")
    .update({
      validation_status: validationStatus || "invalid",
      processing_status: processingStatus,
      processing_error: processingError || "CRM inbound event failed.",
      signature_valid: typeof signatureValid === "boolean" ? signatureValid : null,
      turnstile_valid: typeof turnstileValid === "boolean" ? turnstileValid : null,
      processed_at: new Date().toISOString(),
      payload_json: payloadJson || undefined,
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(error.message || "Failed to mark the CRM inbound event as failed.");
  }

  return true;
}

export async function createCrmLeadTouchpoint(
  client,
  {
    leadId,
    inboundEventId,
    touchType,
    sourceType,
    sourceProvider = null,
    siteKey = null,
    host = null,
    formKey = null,
    formLabel = null,
    pagePath = null,
  } = {}
) {
  if (!leadId || !inboundEventId || !touchType || !sourceType) {
    throw new Error("CRM lead touchpoint requires leadId, inboundEventId, touchType, and sourceType.");
  }

  const { data, error } = await client
    .from("crm_lead_touchpoints")
    .insert({
      lead_id: leadId,
      inbound_event_id: inboundEventId,
      touch_type: touchType,
      source_type: sourceType,
      source_provider: sourceProvider,
      site_key: siteKey,
      host,
      form_key: formKey,
      form_label: formLabel,
      page_path: pagePath,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to create the CRM lead touchpoint.");
  }

  return data || null;
}
