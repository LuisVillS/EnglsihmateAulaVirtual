import {
  buildExternalLeadFingerprint,
  buildRawSourceMetadata,
  normalizeEmail,
  normalizeName,
  normalizePhoneRecord,
  normalizePhone,
} from "./shared.js";

function firstPresent(...values) {
  for (const value of values) {
    const normalized = value?.toString().trim();
    if (normalized) return normalized;
  }
  return null;
}

export function normalizeFormspreeWebhookPayload(payload = {}) {
  const submission = payload?.submission || payload;
  const fields = submission?.data || submission?.fields || payload?.data || payload?.fields || {};

  const fullName = firstPresent(
    fields?.full_name,
    fields?.name,
    [fields?.first_name, fields?.last_name].filter(Boolean).join(" ")
  );

  const phoneRaw = firstPresent(fields?.phone, fields?.phone_number, submission?.phone);
  const phoneInfo = normalizePhoneRecord(phoneRaw);
  const normalized = {
    provider: "formspree",
    sourceType: "formspree",
    sourceLabel: firstPresent(submission?.form_name, submission?.project_name, "Formspree"),
    eventType: firstPresent(payload?.type, submission?.type, "submission"),
    externalEventId: firstPresent(submission?.submissionId, submission?.id, payload?.id),
    email: normalizeEmail(firstPresent(fields?.email, submission?.email)),
    phone: normalizePhone(phoneRaw),
    phoneInfo,
    fullName: normalizeName(fullName),
    submittedAt: firstPresent(submission?.submitted_at, payload?.created_at, submission?.created_at),
    rawPayload: payload,
    sourceMetadata: buildRawSourceMetadata({
      provider: "formspree",
      sourceType: "formspree",
      sourceLabel: firstPresent(submission?.form_name, submission?.project_name, "Formspree"),
      externalEventId: firstPresent(submission?.submissionId, submission?.id, payload?.id),
      email: normalizeEmail(firstPresent(fields?.email, submission?.email)),
      phone: normalizePhone(phoneRaw),
      phoneInfo,
      submittedAt: firstPresent(submission?.submitted_at, payload?.created_at, submission?.created_at),
      rawPayload: payload,
    }),
  };

  return {
    ...normalized,
    dedupeKey: buildExternalLeadFingerprint(normalized),
  };
}
