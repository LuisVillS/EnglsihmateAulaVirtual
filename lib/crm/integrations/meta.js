import { createHmac, timingSafeEqual } from "node:crypto";
import {
  buildExternalLeadFingerprint,
  buildRawSourceMetadata,
  normalizeEmail,
  normalizeName,
  normalizePhoneRecord,
  normalizePhone,
} from "./shared.js";

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function getMetaFieldValue(fieldData, names) {
  const candidates = Array.isArray(fieldData) ? fieldData : [];
  const targetNames = new Set(names.map((value) => String(value || "").trim().toLowerCase()));

  for (const item of candidates) {
    const fieldName = String(item?.name || "").trim().toLowerCase();
    if (!targetNames.has(fieldName)) continue;
    const values = Array.isArray(item?.values) ? item.values : [];
    const firstValue = values[0];
    if (typeof firstValue === "string") {
      return firstValue;
    }
    if (firstValue && typeof firstValue === "object") {
      return firstValue.name || firstValue.value || null;
    }
    return null;
  }

  return null;
}

function normalizeMetaNotification(entry = {}, change = {}) {
  const value = change?.value && typeof change.value === "object" ? change.value : {};
  const leadgenId = normalizeFreeText(value.leadgen_id || value.leadgenId);
  if (!leadgenId) return null;

  return {
    object: normalizeFreeText(change.field || "leadgen") || "leadgen",
    pageId: normalizeFreeText(value.page_id || entry.id),
    pageName: normalizeFreeText(value.page_name),
    leadgenId,
    formId: normalizeFreeText(value.form_id),
    adId: normalizeFreeText(value.ad_id),
    campaignId: normalizeFreeText(value.campaign_id),
    createdTime: normalizeFreeText(value.created_time),
    rawValue: value,
  };
}

export function parseMetaWebhookNotifications(payload = {}) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const notifications = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const normalized = normalizeMetaNotification(entry, change);
      if (normalized) {
        notifications.push(normalized);
      }
    }
  }

  return notifications;
}

export function verifyMetaWebhookSignature({ rawBody = "", signatureHeader = "", appSecret = "" } = {}) {
  const normalizedSecret = normalizeFreeText(appSecret);
  const normalizedHeader = normalizeFreeText(signatureHeader);
  if (!normalizedSecret || !normalizedHeader) {
    return false;
  }

  const match = normalizedHeader.match(/^sha256=(.+)$/i);
  if (!match?.[1]) return false;

  const expected = createHmac("sha256", normalizedSecret).update(rawBody).digest("hex");
  const provided = match[1].trim().toLowerCase();

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

export function buildMetaAppSecretProof(accessToken, appSecret) {
  const normalizedToken = normalizeFreeText(accessToken);
  const normalizedSecret = normalizeFreeText(appSecret);
  if (!normalizedToken || !normalizedSecret) return null;
  return createHmac("sha256", normalizedSecret).update(normalizedToken).digest("hex");
}

export async function fetchMetaLeadDetails({
  leadgenId,
  pageAccessToken,
  appSecret = process.env.META_APP_SECRET,
  apiVersion = process.env.META_GRAPH_API_VERSION || "v22.0",
} = {}) {
  const normalizedLeadgenId = normalizeFreeText(leadgenId);
  const normalizedToken = normalizeFreeText(pageAccessToken || process.env.META_PAGE_ACCESS_TOKEN);
  if (!normalizedLeadgenId) {
    throw new Error("Meta lead retrieval requires a leadgen_id.");
  }
  if (!normalizedToken) {
    throw new Error("Meta lead retrieval requires META_PAGE_ACCESS_TOKEN.");
  }

  const params = new URLSearchParams();
  params.set(
    "fields",
    [
      "id",
      "created_time",
      "field_data",
      "ad_id",
      "form_id",
      "campaign_id",
      "is_organic",
      "platform",
    ].join(",")
  );
  params.set("access_token", normalizedToken);

  const appSecretProof = buildMetaAppSecretProof(normalizedToken, appSecret);
  if (appSecretProof) {
    params.set("appsecret_proof", appSecretProof);
  }

  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(normalizedLeadgenId)}?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Failed to fetch Meta lead details.");
  }

  return payload || null;
}

export function normalizeMetaLeadPayload(payload = {}, context = {}) {
  const fieldData = Array.isArray(payload?.field_data) ? payload.field_data : [];
  const firstName = getMetaFieldValue(fieldData, ["first_name", "firstname"]);
  const lastName = getMetaFieldValue(fieldData, ["last_name", "lastname"]);
  const phoneRaw = getMetaFieldValue(fieldData, ["phone_number", "phone", "mobile_phone"]);
  const phoneInfo = normalizePhoneRecord(phoneRaw);
  const externalLeadId = normalizeFreeText(payload?.id || context.leadgenId);
  const fullName =
    getMetaFieldValue(fieldData, ["full_name", "fullname", "name"]) ||
    [firstName, lastName].filter(Boolean).join(" ");

  const normalized = {
    provider: "meta",
    sourceProvider: "meta",
    sourceOrigin: "meta",
    sourceType: "meta_lead",
    sourceLabel: normalizeFreeText(context.formLabel || payload?.form_name) || "Meta Lead Form",
    eventType: "meta_lead_fetch",
    externalEventId: normalizeFreeText(context.externalEventId),
    externalLeadId,
    email: normalizeEmail(getMetaFieldValue(fieldData, ["email", "email_address"])),
    phone: normalizePhone(phoneRaw),
    phoneInfo,
    fullName: normalizeName(fullName),
    submittedAt: normalizeFreeText(payload?.created_time || context.createdTime) || null,
    host: normalizeFreeText(context.host),
    siteKey: normalizeFreeText(context.siteKey),
    formKey: normalizeFreeText(context.formKey),
    formLabel: normalizeFreeText(context.formLabel || payload?.form_name),
    pagePath: normalizeFreeText(context.pagePath),
    inboundEventId: normalizeFreeText(context.inboundEventId),
    metaPageId: normalizeFreeText(context.pageId || payload?.page_id),
    metaFormId: normalizeFreeText(payload?.form_id || context.formId),
    metaAdId: normalizeFreeText(payload?.ad_id || context.adId),
    metaCampaignId: normalizeFreeText(payload?.campaign_id || context.campaignId),
    rawPayload: payload,
  };

  return {
    ...normalized,
    sourceMetadata: buildRawSourceMetadata(normalized),
    dedupeKey: buildExternalLeadFingerprint({
      ...normalized,
      externalEventId: externalLeadId || normalized.externalEventId,
    }),
  };
}

export function normalizeMetaWebhookPayload(payload = {}) {
  const entryValue = payload?.entry?.[0]?.changes?.[0]?.value || payload;
  return normalizeMetaLeadPayload(entryValue, {
    leadgenId: entryValue?.leadgen_id || payload?.leadgen_id,
    formLabel: entryValue?.form_name || entryValue?.ad_name || "Meta Lead Ad",
    externalEventId: entryValue?.leadgen_id || payload?.leadgen_id || entryValue?.id || payload?.id,
  });
}
