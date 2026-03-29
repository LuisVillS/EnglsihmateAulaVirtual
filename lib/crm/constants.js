export const CRM_STAGE_KEYS = Object.freeze({
  NEW_LEAD: "new_lead",
  ATTEMPTING_CONTACT: "attempting_contact",
  QUALIFIED: "qualified",
  WON_ENROLLED: "won_enrolled",
  LOST_CLOSED: "lost_closed",
});

export const CRM_LEAD_STATUS_VALUES = Object.freeze(["open", "won", "lost", "archived"]);

export const CRM_LEAD_SOURCE_ORIGINS = Object.freeze([
  "meta",
  "web_form",
  "formspree",
  "pre_enrollment",
  "manual",
  "other",
]);

export const CRM_CALL_OUTCOME_VALUES = Object.freeze([
  "attempted",
  "connected",
  "no_answer",
  "voicemail",
  "callback_requested",
  "wrong_number",
  "not_interested",
]);

export const CRM_CALLING_CAMPAIGN_KEYS = Object.freeze({
  ALL_OPEN: "all_open",
  NEW_LEADS: "new_leads",
  FOLLOW_UPS: "follow_ups",
  CLASSROOM: "classroom",
  META: "meta",
  WEB_FORM: "web_form",
  FORMSPREE: "formspree",
});

export const CRM_CALLING_CAMPAIGN_DEFINITIONS = Object.freeze([
  {
    key: CRM_CALLING_CAMPAIGN_KEYS.ALL_OPEN,
    label: "All open leads",
    stageKeys: [],
    sourceTypes: [],
    sourceOrigins: [],
  },
  {
    key: CRM_CALLING_CAMPAIGN_KEYS.NEW_LEADS,
    label: "New leads",
    stageKeys: [CRM_STAGE_KEYS.NEW_LEAD],
    sourceTypes: [],
    sourceOrigins: [],
  },
  {
    key: CRM_CALLING_CAMPAIGN_KEYS.FOLLOW_UPS,
    label: "Follow-ups",
    stageKeys: [CRM_STAGE_KEYS.ATTEMPTING_CONTACT, CRM_STAGE_KEYS.QUALIFIED],
    sourceTypes: [],
    sourceOrigins: [],
  },
  {
    key: CRM_CALLING_CAMPAIGN_KEYS.CLASSROOM,
    label: "Virtual classroom",
    stageKeys: [],
    sourceTypes: [],
    sourceOrigins: ["pre_enrollment"],
  },
  {
    key: CRM_CALLING_CAMPAIGN_KEYS.META,
    label: "Meta",
    stageKeys: [],
    sourceTypes: ["meta_lead", "meta_lead_ad"],
    sourceOrigins: [],
  },
  {
    key: CRM_CALLING_CAMPAIGN_KEYS.WEB_FORM,
    label: "Web forms",
    stageKeys: [],
    sourceTypes: ["web_form"],
    sourceOrigins: ["web_form"],
  },
  {
    key: CRM_CALLING_CAMPAIGN_KEYS.FORMSPREE,
    label: "Formspree (legacy)",
    stageKeys: [],
    sourceTypes: ["formspree"],
    sourceOrigins: [],
  },
]);

export const CRM_CALLING_SOURCE_DEFINITIONS = Object.freeze([
  {
    key: "all_sources",
    label: "All sources",
    sourceOrigins: [],
    sourceTypes: [],
  },
  {
    key: "meta",
    label: "Meta",
    sourceOrigins: ["meta"],
    sourceTypes: ["meta_lead", "meta_lead_ad"],
  },
  {
    key: "web_form",
    label: "Web forms",
    sourceOrigins: ["web_form"],
    sourceTypes: ["web_form"],
  },
  {
    key: "formspree",
    label: "Formspree (legacy)",
    sourceOrigins: ["formspree"],
    sourceTypes: ["formspree"],
  },
  {
    key: "pre_enrollment",
    label: "Virtual classroom / pre-enrollment / registration",
    sourceOrigins: ["pre_enrollment"],
    sourceTypes: ["classroom_pre_enrollment"],
  },
  {
    key: "manual",
    label: "Manual",
    sourceOrigins: ["manual"],
    sourceTypes: ["manual"],
  },
  {
    key: "other",
    label: "Other",
    sourceOrigins: ["other"],
    sourceTypes: [],
  },
]);

const CRM_CALL_OUTCOME_SET = new Set(CRM_CALL_OUTCOME_VALUES);
const CRM_CALLING_CAMPAIGN_SET = new Set(
  CRM_CALLING_CAMPAIGN_DEFINITIONS.map((campaign) => campaign.key)
);

export function normalizeCrmCallOutcome(value) {
  const normalized = value?.toString().trim().toLowerCase();
  if (!normalized) return null;
  return CRM_CALL_OUTCOME_SET.has(normalized) ? normalized : null;
}

export function normalizeCrmCallingCampaignKey(value) {
  const normalized = value?.toString().trim().toLowerCase();
  if (!normalized) return CRM_CALLING_CAMPAIGN_KEYS.ALL_OPEN;
  return CRM_CALLING_CAMPAIGN_SET.has(normalized)
    ? normalized
    : CRM_CALLING_CAMPAIGN_KEYS.ALL_OPEN;
}

export function resolveCrmCallingCampaignDefinition(value) {
  const key = normalizeCrmCallingCampaignKey(value);
  return (
    CRM_CALLING_CAMPAIGN_DEFINITIONS.find((campaign) => campaign.key === key) ||
    CRM_CALLING_CAMPAIGN_DEFINITIONS[0]
  );
}

export function normalizeCrmLeadSourceOrigin(value) {
  const normalized = value?.toString().trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "classroom_pre_enrollment" || normalized === "registration") {
    return "pre_enrollment";
  }

  if (normalized === "meta_lead_ad") {
    return "meta";
  }

  if (normalized === "meta_lead") {
    return "meta";
  }

  if (normalized === "web_form" || normalized === "internal") {
    return "web_form";
  }

  if (normalized === "formspree") {
    return "formspree";
  }

  if (normalized === "manual") {
    return "manual";
  }

  if (normalized === "other") {
    return "other";
  }

  return CRM_LEAD_SOURCE_ORIGINS.includes(normalized) ? normalized : "other";
}

export function formatCrmLeadSourceOriginLabel(value) {
  const normalized = normalizeCrmLeadSourceOrigin(value);
  const map = {
    meta: "Meta",
    web_form: "WebForm",
    formspree: "Formspree",
    pre_enrollment: "Virtual classroom / pre-enrollment / registration",
    manual: "Manual",
    other: "Other",
  };

  return map[normalized] || "Other";
}
