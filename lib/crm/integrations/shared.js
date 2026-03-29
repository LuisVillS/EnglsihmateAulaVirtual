import { normalizeCrmLeadSourceOrigin } from "@/lib/crm/constants";
import { normalizeCrmPhoneInput } from "@/lib/crm/phones";
import {
  CRM_LEAD_COLUMNS,
  selectCrmLeadByPhone,
  upsertCrmLeadSourceTag,
} from "@/lib/crm/leads";
import { getServiceSupabaseClient, hasServiceRoleClient } from "../../supabase-service.js";

const EXTERNAL_SOURCE_TYPES = ["meta_lead", "meta_lead_ad", "web_form", "formspree", "manual"];
const OPTIONAL_LEAD_FIELD_CANDIDATES = [
  "raw_source_type",
  "raw_source_label",
  "raw_source_event_id",
  "raw_source_metadata",
  "raw_source_payload",
  "source_provider",
  "source_event_id",
  "source_metadata",
  "source_payload",
  "phone_country_code",
  "phone_national_number",
  "phone_e164",
  "phone_dialable",
  "phone_validation_status",
  "phone_validation_reason",
  "phone_raw_input",
  "site_key",
  "host",
  "form_key",
  "form_label",
  "page_path",
  "landing_url",
  "referrer_url",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "first_submission_at",
  "last_submission_at",
  "latest_inbound_event_id",
  "external_lead_id",
  "meta_page_id",
  "meta_form_id",
  "meta_ad_id",
  "meta_campaign_id",
];
const DEFAULT_EXTERNAL_COUNTRY_CODE = "51";
const COMMON_DIAL_CODES = ["598", "595", "593", "591", "58", "57", "56", "55", "54", "53", "52", "51", "34", "1"];

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

export function normalizeEmail(value) {
  const normalized = normalizeFreeText(value);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeDialableCandidate(value) {
  const raw = normalizeFreeText(value);
  if (!raw) return null;

  let cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (cleaned.includes("+")) {
    cleaned = `${cleaned.startsWith("+") ? "+" : ""}${cleaned.replace(/[^\d]/g, "")}`;
  }

  return cleaned || null;
}

function isRepeatedDigits(value) {
  return /^(\d)\1+$/.test(value);
}

function isSequentialDigits(value) {
  if (!value || value.length < 8) return false;

  let ascending = true;
  let descending = true;
  for (let index = 1; index < value.length; index += 1) {
    const current = Number(value[index]);
    const previous = Number(value[index - 1]);
    if (current !== previous + 1) ascending = false;
    if (current !== previous - 1) descending = false;
  }

  return ascending || descending;
}

function splitInternationalPhone(digits) {
  for (const code of COMMON_DIAL_CODES) {
    if (!digits.startsWith(code)) continue;
    const nationalNumber = digits.slice(code.length);
    if (nationalNumber.length >= 6 && nationalNumber.length <= 12) {
      return {
        countryCode: code,
        nationalNumber,
      };
    }
  }

  return {
    countryCode: null,
    nationalNumber: digits,
  };
}

export function normalizePhoneRecord(value, { defaultCountryCode = DEFAULT_EXTERNAL_COUNTRY_CODE } = {}) {
  const rawInput = normalizeFreeText(value);
  if (!rawInput) return null;

  const candidate = normalizeDialableCandidate(rawInput);
  if (!candidate) {
    return {
      rawInput,
      countryCode: null,
      nationalNumber: null,
      e164: null,
      dialable: null,
      validationStatus: "invalid",
      validationReason: "empty_after_cleaning",
    };
  }

  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 8) {
    return {
      rawInput,
      countryCode: null,
      nationalNumber: digits,
      e164: null,
      dialable: null,
      validationStatus: "invalid",
      validationReason: "too_short",
    };
  }

  if (digits.length > 15) {
    return {
      rawInput,
      countryCode: null,
      nationalNumber: digits,
      e164: null,
      dialable: null,
      validationStatus: "invalid",
      validationReason: "too_long",
    };
  }

  if (isRepeatedDigits(digits)) {
    return {
      rawInput,
      countryCode: null,
      nationalNumber: digits,
      e164: null,
      dialable: null,
      validationStatus: "invalid",
      validationReason: "repeated_digits",
    };
  }

  if (isSequentialDigits(digits)) {
    return {
      rawInput,
      countryCode: null,
      nationalNumber: digits,
      e164: null,
      dialable: null,
      validationStatus: "invalid",
      validationReason: "sequential_digits",
    };
  }

  let countryCode = null;
  let nationalNumber = digits;
  let e164 = null;

  if (candidate.startsWith("+")) {
    const split = splitInternationalPhone(digits);
    countryCode = split.countryCode;
    nationalNumber = split.nationalNumber;
    e164 = `+${digits}`;
  } else if (digits.length === 9 && defaultCountryCode) {
    countryCode = defaultCountryCode;
    nationalNumber = digits;
    e164 = `+${defaultCountryCode}${digits}`;
  } else if (digits.length > 9) {
    const split = splitInternationalPhone(digits);
    countryCode = split.countryCode;
    nationalNumber = split.nationalNumber;
    e164 = countryCode ? `+${digits}` : null;
  }

  return {
    rawInput,
    countryCode,
    nationalNumber,
    e164,
    dialable: e164 || (countryCode && nationalNumber ? `+${countryCode}${nationalNumber}` : candidate.startsWith("+") ? candidate : null),
    validationStatus: "valid",
    validationReason: null,
  };
}

export function normalizePhone(value, options) {
  return normalizePhoneRecord(value, options)?.dialable || null;
}

export function normalizeName(value) {
  return normalizeFreeText(value);
}

export function buildExternalLeadFingerprint({ provider, externalEventId, email, phone, phoneInfo }) {
  const providerKey = normalizeFreeText(provider)?.toLowerCase() || "crm";
  const externalId = normalizeFreeText(externalEventId);
  if (externalId) {
    return `${providerKey}:${externalId}`;
  }

  const identity =
    normalizeEmail(email) ||
    normalizeFreeText(phoneInfo?.e164) ||
    normalizePhone(phone) ||
    "anonymous";

  return `${providerKey}:fallback:${identity}`;
}

export function getCrmIntegrationClient() {
  if (!hasServiceRoleClient()) {
    throw new Error("CRM integrations require SUPABASE_SERVICE_ROLE_KEY.");
  }
  return getServiceSupabaseClient();
}

function buildCanonicalPhoneLeadFields(phoneInfo) {
  if (!phoneInfo) return {};

  return {
    phone_country_code: phoneInfo.countryCode || null,
    phone_national_number: phoneInfo.nationalNumber || null,
    phone_e164: phoneInfo.e164 || null,
    phone_dialable: phoneInfo.dialable || null,
    phone_validation_status: phoneInfo.validationStatus || null,
    phone_validation_reason: phoneInfo.validationReason || null,
    phone_raw_input: phoneInfo.rawInput || null,
  };
}

export function buildRawSourceMetadata(normalized) {
  return {
    source_origin: normalized.sourceOrigin || null,
    provider: normalized.provider || null,
    source_provider: normalized.sourceProvider || normalized.provider || null,
    source_type: normalized.sourceType || null,
    source_label: normalized.sourceLabel || null,
    external_event_id: normalized.externalEventId || null,
    external_lead_id: normalized.externalLeadId || null,
    site_key: normalized.siteKey || null,
    host: normalized.host || null,
    form_key: normalized.formKey || null,
    form_label: normalized.formLabel || null,
    page_path: normalized.pagePath || null,
    landing_url: normalized.landingUrl || null,
    referrer_url: normalized.referrerUrl || null,
    utm_source: normalized.utmSource || null,
    utm_medium: normalized.utmMedium || null,
    utm_campaign: normalized.utmCampaign || null,
    utm_term: normalized.utmTerm || null,
    utm_content: normalized.utmContent || null,
    inbound_event_id: normalized.inboundEventId || null,
    meta_page_id: normalized.metaPageId || null,
    meta_form_id: normalized.metaFormId || null,
    meta_ad_id: normalized.metaAdId || null,
    meta_campaign_id: normalized.metaCampaignId || null,
    submitted_at: normalized.submittedAt || null,
    normalized_email: normalized.email || null,
    normalized_phone: normalized.phone || null,
    canonical_phone: normalized.phoneInfo
      ? {
          country_code: normalized.phoneInfo.countryCode || null,
          national_number: normalized.phoneInfo.nationalNumber || null,
          e164: normalized.phoneInfo.e164 || null,
          dialable: normalized.phoneInfo.dialable || null,
          validation_status: normalized.phoneInfo.validationStatus || null,
          validation_reason: normalized.phoneInfo.validationReason || null,
          raw_input: normalized.phoneInfo.rawInput || null,
        }
      : null,
    raw_payload: normalized.rawPayload || null,
  };
}

export function normalizeManualCrmLeadInput(input = {}) {
  const rawPhone = input.phone ?? input.phoneE164 ?? input.phone_e164 ?? null;
  const rawCountryCode = input.phoneCountryCode ?? input.phone_country_code ?? null;
  const rawNationalNumber = input.phoneNationalNumber ?? input.phone_national_number ?? null;
  const rawPhoneE164 = input.phoneE164 ?? input.phone_e164 ?? null;
  const hasPhoneInput =
    Boolean(rawPhone) || Boolean(rawCountryCode) || Boolean(rawNationalNumber) || Boolean(rawPhoneE164);
  const phoneInfo = hasPhoneInput
    ? normalizeCrmPhoneInput({
        phone: rawPhone,
        phoneCountryCode: rawCountryCode,
        phoneNationalNumber: rawNationalNumber,
        phoneE164: rawPhoneE164,
        defaultCountryCode: input.defaultCountryCode || DEFAULT_EXTERNAL_COUNTRY_CODE,
      })
    : null;

  if (phoneInfo && !phoneInfo.isValid) {
    throw new Error(
      phoneInfo.validationErrors?.length
        ? `Invalid manual lead phone: ${phoneInfo.validationErrors.join(" ")}`
        : "Invalid manual lead phone."
    );
  }

  const sourceOrigin = normalizeCrmLeadSourceOrigin(input.sourceOrigin || "manual") || "manual";
  const sourceType = normalizeFreeText(input.sourceType) || "manual";
  const sourceLabel = normalizeFreeText(input.sourceLabel) || "Manual";
  const email = normalizeEmail(input.email);
  const fullName = normalizeFreeText(input.fullName || input.name);
  const provider = normalizeFreeText(input.provider) || "manual";
  const sourceProvider = normalizeFreeText(input.sourceProvider) || provider;
  const externalEventId = normalizeFreeText(input.externalEventId);
  const externalLeadId = normalizeFreeText(input.externalLeadId);
  const sourceMetadata =
    input.sourceMetadata && typeof input.sourceMetadata === "object"
      ? input.sourceMetadata
      : buildRawSourceMetadata({
          sourceOrigin,
          provider,
          sourceProvider,
          sourceType,
          sourceLabel,
          externalEventId,
          externalLeadId,
          submittedAt: input.submittedAt || null,
          email,
          phone: phoneInfo?.dialable || rawPhone || null,
          phoneInfo,
          siteKey: normalizeFreeText(input.siteKey),
          host: normalizeFreeText(input.host),
          formKey: normalizeFreeText(input.formKey),
          formLabel: normalizeFreeText(input.formLabel),
          pagePath: normalizeFreeText(input.pagePath),
          landingUrl: normalizeFreeText(input.landingUrl),
          referrerUrl: normalizeFreeText(input.referrerUrl),
          utmSource: normalizeFreeText(input.utmSource),
          utmMedium: normalizeFreeText(input.utmMedium),
          utmCampaign: normalizeFreeText(input.utmCampaign),
          utmTerm: normalizeFreeText(input.utmTerm),
          utmContent: normalizeFreeText(input.utmContent),
          inboundEventId: normalizeFreeText(input.inboundEventId),
          metaPageId: normalizeFreeText(input.metaPageId),
          metaFormId: normalizeFreeText(input.metaFormId),
          metaAdId: normalizeFreeText(input.metaAdId),
          metaCampaignId: normalizeFreeText(input.metaCampaignId),
          rawPayload: input.rawPayload || null,
        });

  return {
    provider,
    sourceProvider,
    sourceOrigin,
    sourceType,
    sourceLabel,
    externalEventId,
    externalLeadId,
    submittedAt: input.submittedAt || null,
    email,
    fullName,
    phone: phoneInfo?.dialable || normalizeFreeText(rawPhone),
    phoneInfo,
    siteKey: normalizeFreeText(input.siteKey),
    host: normalizeFreeText(input.host),
    formKey: normalizeFreeText(input.formKey),
    formLabel: normalizeFreeText(input.formLabel),
    pagePath: normalizeFreeText(input.pagePath),
    landingUrl: normalizeFreeText(input.landingUrl),
    referrerUrl: normalizeFreeText(input.referrerUrl),
    utmSource: normalizeFreeText(input.utmSource),
    utmMedium: normalizeFreeText(input.utmMedium),
    utmCampaign: normalizeFreeText(input.utmCampaign),
    utmTerm: normalizeFreeText(input.utmTerm),
    utmContent: normalizeFreeText(input.utmContent),
    inboundEventId: normalizeFreeText(input.inboundEventId),
    metaPageId: normalizeFreeText(input.metaPageId),
    metaFormId: normalizeFreeText(input.metaFormId),
    metaAdId: normalizeFreeText(input.metaAdId),
    metaCampaignId: normalizeFreeText(input.metaCampaignId),
    rawPayload: input.rawPayload || null,
    sourceMetadata,
    stageId: normalizeFreeText(input.stageId),
  };
}

function buildRawSourceLeadFields(normalized) {
  const sourceMetadata = normalized.sourceMetadata || buildRawSourceMetadata(normalized);
  const sourceOrigin = normalizeCrmLeadSourceOrigin(
    normalized.sourceOrigin || normalized.sourceType || normalized.provider
  );
  return {
    source_origin: sourceOrigin,
    raw_source_type: normalized.sourceType || normalized.provider || null,
    raw_source_label: normalized.sourceLabel || null,
    raw_source_event_id: normalized.externalEventId || null,
    raw_source_metadata: sourceMetadata,
    raw_source_payload: normalized.rawPayload || null,
    source_provider: normalized.sourceProvider || normalized.provider || null,
    source_event_id: normalized.externalEventId || null,
    source_metadata: sourceMetadata,
    source_payload: normalized.rawPayload || null,
    site_key: normalized.siteKey || null,
    host: normalized.host || null,
    form_key: normalized.formKey || null,
    form_label: normalized.formLabel || normalized.sourceLabel || null,
    page_path: normalized.pagePath || null,
    landing_url: normalized.landingUrl || null,
    referrer_url: normalized.referrerUrl || null,
    utm_source: normalized.utmSource || null,
    utm_medium: normalized.utmMedium || null,
    utm_campaign: normalized.utmCampaign || null,
    utm_term: normalized.utmTerm || null,
    utm_content: normalized.utmContent || null,
    external_lead_id: normalized.externalLeadId || null,
    latest_inbound_event_id: normalized.inboundEventId || null,
    meta_page_id: normalized.metaPageId || null,
    meta_form_id: normalized.metaFormId || null,
    meta_ad_id: normalized.metaAdId || null,
    meta_campaign_id: normalized.metaCampaignId || null,
    ...buildCanonicalPhoneLeadFields(normalized.phoneInfo),
  };
}

function stripMissingLeadFieldFromPayload(error, payload) {
  const message = String(error?.message || error || "").toLowerCase();
  if (!message) return null;

  const missingField = OPTIONAL_LEAD_FIELD_CANDIDATES.find((field) => {
    const normalizedField = field.toLowerCase().replace(/_/g, " ");
    return message.includes(field) || message.includes(normalizedField);
  });

  if (!missingField || !(missingField in payload)) {
    return null;
  }

  const nextPayload = { ...payload };
  delete nextPayload[missingField];
  return nextPayload;
}

async function applyLeadMutationWithFallback(service, mutate, payload) {
  let currentPayload = { ...payload };

  for (;;) {
    const { data, error } = await mutate(currentPayload);
    if (!error) {
      return { data, error: null, payload: currentPayload };
    }

    const nextPayload = stripMissingLeadFieldFromPayload(error, currentPayload);
    if (!nextPayload) {
      return { data: null, error, payload: currentPayload };
    }

    currentPayload = nextPayload;
  }
}

async function findWebhookEventByProviderKey(service, { provider, externalEventId, dedupeKey }) {
  if (externalEventId) {
    const { data, error } = await service
      .from("crm_webhook_events")
      .select("id, provider, external_event_id, dedupe_key, status, processed_at, payload, error_message")
      .eq("provider", provider)
      .eq("external_event_id", externalEventId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to check CRM webhook replay state.");
    }
    if (data?.id) return data;
  }

  if (!dedupeKey) return null;

  const { data, error } = await service
    .from("crm_webhook_events")
    .select("id, provider, external_event_id, dedupe_key, status, processed_at, payload, error_message")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to check CRM webhook dedupe state.");
  }

  return data || null;
}

export async function recordIncomingWebhookEvent(service, normalized) {
  const existing = await findWebhookEventByProviderKey(service, normalized);
  if (existing?.id) {
    return {
      event: existing,
      deduped: true,
    };
  }

  const nowIso = new Date().toISOString();
  const sourceMetadata = normalized.sourceMetadata || buildRawSourceMetadata(normalized);
  const payload = {
    source_provider: normalized.provider,
    source_type: normalized.sourceType,
    normalized_email: normalized.email,
    normalized_phone: normalized.phone,
    canonical_phone: sourceMetadata.canonical_phone || null,
    source_label: normalized.sourceLabel,
    source_event_id: normalized.externalEventId,
    submitted_at: normalized.submittedAt,
    source_metadata: sourceMetadata,
    raw_source_metadata: sourceMetadata,
  };

  const { data, error } = await service
    .from("crm_webhook_events")
    .insert({
      provider: normalized.provider,
      event_type: normalized.eventType,
      external_event_id: normalized.externalEventId,
      dedupe_key: normalized.dedupeKey,
      payload: {
        ...payload,
        raw: normalized.rawPayload,
      },
      status: "received",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id, provider, external_event_id, dedupe_key, status, processed_at, payload, error_message")
    .maybeSingle();

  if (error) {
    const raceExisting = await findWebhookEventByProviderKey(service, normalized);
    if (raceExisting?.id) {
      return {
        event: raceExisting,
        deduped: true,
      };
    }
    throw new Error(error.message || "Failed to record CRM webhook event.");
  }

  return {
    event: data,
    deduped: false,
  };
}

export async function markWebhookEventProcessed(service, eventId, extraPayload = {}) {
  if (!eventId) return null;
  const nowIso = new Date().toISOString();
  const { error } = await service
    .from("crm_webhook_events")
    .update({
      status: "processed",
      processed_at: nowIso,
      updated_at: nowIso,
      payload: extraPayload,
      error_message: null,
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(error.message || "Failed to mark CRM webhook event as processed.");
  }

  return true;
}

export async function markWebhookEventFailed(service, eventId, errorMessage, payload = {}) {
  if (!eventId) return null;
  const nowIso = new Date().toISOString();
  const { error } = await service
    .from("crm_webhook_events")
    .update({
      status: "failed",
      updated_at: nowIso,
      error_message: errorMessage || "CRM webhook failure",
      payload,
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(error.message || "Failed to mark CRM webhook event as failed.");
  }

  return true;
}

async function resolveNewLeadStageId(service) {
  const { data, error } = await service
    .from("crm_stages")
    .select("id")
    .eq("stage_key", "new_lead")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load the CRM new lead stage.");
  }

  return data?.id || null;
}

async function findExistingExternalLead(service, { email, phone }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedEmail && !normalizedPhone) return null;

  if (normalizedPhone) {
    const phoneMatch = await selectCrmLeadByPhone(service, normalizedPhone, CRM_LEAD_COLUMNS);

    if (phoneMatch?.id) {
      return phoneMatch;
    }
  }

  if (!normalizedEmail) return null;

  const { data, error } = await service
    .from("crm_leads")
    .select(CRM_LEAD_COLUMNS)
    .is("pre_enrollment_id", null)
    .in("source_type", EXTERNAL_SOURCE_TYPES)
    .eq("email", normalizedEmail)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) {
    throw new Error(error.message || "Failed to check existing CRM external leads.");
  }

  const rows = Array.isArray(data) ? data : [];
  return rows.find((lead) => lead.lead_status === "open") || rows[0] || null;
}

function buildLeadPhonePayload(normalized) {
  if (normalized.phoneInfo?.validationStatus === "valid" && normalized.phoneInfo?.dialable) {
    return {
      phone: normalized.phoneInfo.dialable,
    };
  }

  return {
    phone: null,
  };
}

export async function upsertExternalCrmLead(service, normalized) {
  const nowIso = new Date().toISOString();
  const stageId = normalized.stageId || (await resolveNewLeadStageId(service));
  const existing = await findExistingExternalLead(service, normalized);
  const leadSourceFields = buildRawSourceLeadFields(normalized);
  const leadPhoneFields = buildLeadPhonePayload(normalized);
  const sourceOrigin = normalizeCrmLeadSourceOrigin(
    normalized.sourceOrigin || normalized.sourceType || normalized.provider
  );

  if (existing?.id) {
    const mutation = await applyLeadMutationWithFallback(
      service,
      (candidatePayload) =>
        service
          .from("crm_leads")
          .update(candidatePayload)
          .eq("id", existing.id)
          .select("id, source_type, source_origin, source_label, email, full_name, phone, lead_status, current_stage_id, created_at, updated_at")
          .maybeSingle(),
      {
        source_type: existing.source_type || normalized.sourceType || normalized.provider || null,
        source_origin: normalized.sourceOrigin || existing.source_origin || sourceOrigin,
        source_label: normalized.sourceLabel || existing.source_label || null,
        email: existing.email || normalized.email || null,
        full_name: normalized.fullName || existing.full_name || null,
        phone: existing.phone || leadPhoneFields.phone || null,
        current_stage_id: existing.current_stage_id || stageId,
        updated_at: nowIso,
        last_synced_at: nowIso,
        source_metadata: leadSourceFields.source_metadata || existing.source_metadata || null,
        source_provider: normalized.sourceProvider || existing.source_provider || normalized.provider || null,
        source_event_id: normalized.externalEventId || existing.source_event_id || null,
        source_payload: normalized.rawPayload || existing.source_payload || null,
        raw_source_type: normalized.sourceType || existing.raw_source_type || normalized.provider || null,
        raw_source_label: normalized.sourceLabel || existing.raw_source_label || null,
        raw_source_event_id: normalized.externalEventId || existing.raw_source_event_id || null,
        raw_source_metadata: leadSourceFields.raw_source_metadata || existing.raw_source_metadata || null,
        raw_source_payload: normalized.rawPayload || existing.raw_source_payload || null,
        first_submission_at: existing.first_submission_at || normalized.submittedAt || nowIso,
        last_submission_at: normalized.submittedAt || nowIso,
        ...leadSourceFields,
      }
    );

    if (mutation.error) {
      throw new Error(mutation.error.message || "Failed to update CRM external lead.");
    }

    const sourceTag = await upsertCrmLeadSourceTag(service, {
      leadId: existing.id,
      sourceOrigin,
      sourceType: normalized.sourceType || normalized.provider || null,
      sourceLabel: normalized.sourceLabel || existing.source_label || null,
      sourceProvider: normalized.sourceProvider || normalized.provider || null,
      sourceEventId: normalized.externalEventId || null,
      sourceMetadata: leadSourceFields.source_metadata || {},
      isPrimary: !existing.source_origin && !existing.source_type,
    });

    return {
      lead: mutation.data,
      created: false,
      sourceTag,
    };
  }

  const mutation = await applyLeadMutationWithFallback(
    service,
    (candidatePayload) =>
        service
          .from("crm_leads")
          .insert(candidatePayload)
          .select("id, source_type, source_origin, source_label, email, full_name, phone, lead_status, current_stage_id, created_at, updated_at")
          .maybeSingle(),
    {
      source_type: normalized.sourceType,
      source_label: normalized.sourceLabel,
      source_origin: sourceOrigin,
      email: normalized.email,
      full_name: normalized.fullName,
      ...leadPhoneFields,
      current_stage_id: stageId,
      lead_status: "open",
      approved_revenue_soles: 0,
      approved_payment_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
      last_synced_at: nowIso,
      first_submission_at: normalized.submittedAt || nowIso,
      last_submission_at: normalized.submittedAt || nowIso,
      ...leadSourceFields,
    }
  );

  if (mutation.error) {
    throw new Error(mutation.error.message || "Failed to create CRM external lead.");
  }

  const sourceTag = await upsertCrmLeadSourceTag(service, {
    leadId: mutation.data?.id,
    sourceOrigin,
    sourceType: normalized.sourceType || normalized.provider || null,
    sourceLabel: normalized.sourceLabel || null,
    sourceProvider: normalized.sourceProvider || normalized.provider || null,
    sourceEventId: normalized.externalEventId || null,
    sourceMetadata: leadSourceFields.source_metadata || {},
    isPrimary: true,
  });

  return {
    lead: mutation.data,
    created: true,
    sourceTag,
  };
}

export async function upsertManualCrmLead(service, input = {}) {
  const normalized = normalizeManualCrmLeadInput(input);
  return upsertExternalCrmLead(service, normalized);
}
