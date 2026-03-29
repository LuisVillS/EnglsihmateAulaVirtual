import {
  buildExternalLeadFingerprint,
  buildRawSourceMetadata,
  normalizeEmail,
  normalizeName,
  normalizePhoneRecord,
  normalizePhone,
} from "./shared.js";
import { resolveLeadSiteKey } from "../inbound-events";

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

export function normalizeWebFormSubmission(input = {}, context = {}) {
  const host = normalizeFreeText(context.host || input.host)?.toLowerCase() || null;
  const siteKey = resolveLeadSiteKey({
    explicitSiteKey: input.siteKey || input.site_key,
    host,
  });
  const formKey = normalizeFreeText(input.formKey || input.form_key);
  const formLabel = normalizeFreeText(input.formLabel || input.form_label) || formKey || "Web form";
  const pagePath = normalizeFreeText(input.pagePath || input.page_path) || "/";
  const landingUrl = normalizeFreeText(input.landingUrl || input.landing_url);
  const referrerUrl = normalizeFreeText(input.referrerUrl || input.referrer_url);
  const submittedAt = normalizeFreeText(input.submittedAt || input.submitted_at) || new Date().toISOString();
  const phoneRaw = normalizeFreeText(input.phone || input.phone_number);
  const phoneInfo = normalizePhoneRecord(phoneRaw);
  const normalized = {
    provider: "web_form",
    sourceProvider: "internal",
    sourceOrigin: "web_form",
    sourceType: "web_form",
    sourceLabel: formLabel,
    eventType: "form_submission",
    externalEventId: null,
    externalLeadId: null,
    fullName: normalizeName(input.fullName || input.full_name || input.name),
    email: normalizeEmail(input.email),
    phone: normalizePhone(phoneRaw),
    phoneInfo,
    siteKey,
    host,
    formKey,
    formLabel,
    pagePath,
    landingUrl,
    referrerUrl,
    utmSource: normalizeFreeText(input.utmSource || input.utm_source),
    utmMedium: normalizeFreeText(input.utmMedium || input.utm_medium),
    utmCampaign: normalizeFreeText(input.utmCampaign || input.utm_campaign),
    utmTerm: normalizeFreeText(input.utmTerm || input.utm_term),
    utmContent: normalizeFreeText(input.utmContent || input.utm_content),
    submittedAt,
    rawPayload: input,
  };

  return {
    ...normalized,
    sourceMetadata: buildRawSourceMetadata(normalized),
    dedupeKey: buildExternalLeadFingerprint({
      ...normalized,
      externalEventId: `${siteKey || "unknown"}:${formKey || "unknown"}:${normalized.email || normalized.phone || submittedAt}`,
    }),
  };
}
