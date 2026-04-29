import { normalizeCrmLeadSourceOrigin } from "@/lib/crm/constants";
import { normalizeCrmIgnoredRoles } from "@/lib/crm/stage-metadata";
import { sendBrevoTemplateEmail } from "../../brevo.js";

function resolveNumericTemplateId(value) {
  const numeric = Number(value || 0);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeStageCandidate(stage = {}) {
  const id = stage.id != null ? String(stage.id).trim() : null;
  return {
    id: id || null,
  };
}

function collectStageCandidates(automation = {}, context = {}) {
  const jobPayload = context?.job?.payload && typeof context.job.payload === "object" ? context.job.payload : {};
  const leadStage = context?.lead?.current_stage && typeof context.lead.current_stage === "object" ? context.lead.current_stage : {};

  return [
    normalizeStageCandidate({
      id: jobPayload.trigger_stage_id || jobPayload.stage_id || automation?.trigger_stage_id || null,
    }),
    normalizeStageCandidate({
      id: context?.lead?.current_stage_id || leadStage.id || null,
    }),
  ].filter((stage) => stage.id);
}

function resolveTemplateReference(value) {
  if (value == null) return null;

  if (typeof value === "number" || typeof value === "string") {
    return resolveNumericTemplateId(value);
  }

  if (typeof value === "object") {
    return (
      resolveNumericTemplateId(value.brevo_template_id) ||
      resolveNumericTemplateId(value.template_id) ||
      resolveNumericTemplateId(value.templateId) ||
      resolveNumericTemplateId(value.id)
    );
  }

  return null;
}

function normalizeRuleList(values) {
  if (!values) return [];
  const rawValues = Array.isArray(values) ? values : [values];
  const normalized = new Set();

  for (const value of rawValues) {
    const origin = normalizeCrmLeadSourceOrigin(value);
    if (origin) normalized.add(origin);
  }

  return Array.from(normalized);
}

function extractSourceRules(config = {}) {
  const nested = config.source_rules && typeof config.source_rules === "object" ? config.source_rules : {};
  const include = [
    config.source_include,
    config.source_include_origins,
    nested.include,
    nested.include_origins,
  ].flat(Infinity);
  const exclude = [
    config.source_exclude,
    config.source_exclude_origins,
    nested.exclude,
    nested.exclude_origins,
  ].flat(Infinity);

  const booleanExcludes = [];
  if (config.ignore_meta_leads) booleanExcludes.push("meta");
  if (config.ignore_formspree_leads) booleanExcludes.push("formspree");
  if (config.ignore_virtual_classroom_leads || config.ignore_pre_enrollment_leads) {
    booleanExcludes.push("pre_enrollment");
  }
  if (config.ignore_manual_leads) booleanExcludes.push("manual");
  if (config.ignore_other_leads) booleanExcludes.push("other");

  return {
    include: normalizeRuleList(include),
    exclude: normalizeRuleList([...exclude, ...booleanExcludes]),
  };
}

function extractIgnoredRoles(config = {}) {
  return normalizeCrmIgnoredRoles([
    config.ignored_roles,
    config.ignore_roles,
    config.role_exclude,
  ].flat(Infinity));
}

function collectLeadSourceOrigins(lead = {}) {
  const origins = new Set();
  const primaryOrigin = normalizeCrmLeadSourceOrigin(
    lead?.source_origin || lead?.raw_source_type || lead?.source_type
  );
  if (primaryOrigin) origins.add(primaryOrigin);

  const sourceTags = Array.isArray(lead?.source_tags) ? lead.source_tags : [];
  for (const tag of sourceTags) {
    const origin = normalizeCrmLeadSourceOrigin(tag?.source_origin || tag?.source_type);
    if (origin) origins.add(origin);
  }

  return Array.from(origins);
}

export function shouldSendBrevoAutomationForLead(automation = {}, lead = {}, { leadRoles = [] } = {}) {
  const config = automation?.config && typeof automation.config === "object" ? automation.config : {};
  const rules = extractSourceRules(config);
  const ignoredRoles = extractIgnoredRoles(config);
  const leadOrigins = collectLeadSourceOrigins(lead);
  const normalizedLeadRoles = normalizeCrmIgnoredRoles(leadRoles);

  if (!rules.include.length && !rules.exclude.length && !ignoredRoles.length) {
    return { shouldSend: true, reason: null, leadOrigins, leadRoles: normalizedLeadRoles, rules, ignoredRoles };
  }

  if (rules.include.length && !leadOrigins.some((origin) => rules.include.includes(origin))) {
    return { shouldSend: false, reason: "source_not_included", leadOrigins, leadRoles: normalizedLeadRoles, rules, ignoredRoles };
  }

  if (rules.exclude.length && leadOrigins.some((origin) => rules.exclude.includes(origin))) {
    return { shouldSend: false, reason: "source_excluded", leadOrigins, leadRoles: normalizedLeadRoles, rules, ignoredRoles };
  }

  if (ignoredRoles.length && normalizedLeadRoles.some((role) => ignoredRoles.includes(role))) {
    return { shouldSend: false, reason: "role_excluded", leadOrigins, leadRoles: normalizedLeadRoles, rules, ignoredRoles };
  }

  return { shouldSend: true, reason: null, leadOrigins, leadRoles: normalizedLeadRoles, rules, ignoredRoles };
}

function resolveStageTemplateFromMapSource(mapSource, stageCandidates) {
  if (!mapSource) return null;

  const entries = Array.isArray(mapSource) ? mapSource : Object.entries(mapSource).map(([key, value]) => ({ key, value }));

  for (const entry of entries) {
    const candidateValue = Array.isArray(entry)
      ? { key: entry[0], value: entry[1] }
      : entry && typeof entry === "object"
        ? entry
        : null;

    if (!candidateValue) continue;

    const templateId =
      candidateValue.template_id ??
      candidateValue.brevo_template_id ??
      candidateValue.templateId ??
      candidateValue.id ??
      candidateValue.value ??
      candidateValue.template ??
      null;

    const stageIdentifiers = [
      candidateValue.stage_id,
      candidateValue.stageId,
      candidateValue.trigger_stage_id,
      candidateValue.key,
    ]
      .filter((value) => value != null)
      .map((value) => String(value).trim());

    for (const stageCandidate of stageCandidates) {
      if (stageIdentifiers.includes(stageCandidate.id)) {
        const resolved = resolveTemplateReference(templateId);
        if (resolved) {
          return resolved;
        }
      }
    }
  }

  return null;
}

function resolveConfiguredStageTemplateId(config, context, automation) {
  const stageCandidates = collectStageCandidates(automation, context);
  if (!stageCandidates.length) {
    return null;
  }

  const stageMaps = [
    config.stage_template_map,
    config.stage_templates,
    config.stage_template_id_map,
  ];

  for (const stageMap of stageMaps) {
    const resolved = resolveStageTemplateFromMapSource(stageMap, stageCandidates);
    if (resolved) {
      return resolved;
    }
  }

  return resolveTemplateReference(config.stage_template_id);
}

export function resolveBrevoTemplateId(automation = {}, context = {}) {
  const config = automation?.config && typeof automation.config === "object" ? automation.config : {};

  const stageTemplateId = resolveConfiguredStageTemplateId(config, context, automation);
  if (stageTemplateId) {
    return stageTemplateId;
  }

  return (
    resolveNumericTemplateId(config.email_template_id) ||
    resolveNumericTemplateId(config.follow_up_template_id) ||
    resolveNumericTemplateId(config.brevo_template_id) ||
    resolveNumericTemplateId(config.template_id) ||
    resolveNumericTemplateId(automation?.template_key)
  );
}

export async function sendCrmBrevoAutomation({ automation, lead, templateId, params = {} }) {
  if (!lead?.email) {
    throw new Error("CRM automation delivery requires a lead email address.");
  }
  if (!templateId) {
    throw new Error(`CRM automation "${automation?.name || automation?.id || "unknown"}" has no Brevo template id.`);
  }

  await sendBrevoTemplateEmail({
    toEmail: lead.email,
    toName: lead.full_name || lead.email,
    templateId,
    params,
  });
}
