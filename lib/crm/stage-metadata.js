export const CRM_STAGE_IGNORED_ROLE_OPTIONS = Object.freeze([
  { value: "lead", label: "Prospects" },
  { value: "student", label: "Students" },
  { value: "crm_operator", label: "CRM operators" },
  { value: "crm_admin", label: "CRM admins" },
  { value: "classic_admin", label: "Classic admins" },
]);

const CRM_STAGE_IGNORED_ROLE_SET = new Set(
  CRM_STAGE_IGNORED_ROLE_OPTIONS.map((option) => option.value)
);

function normalizeFreeText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function normalizeCrmIgnoredRoles(values) {
  const rawValues = Array.isArray(values) ? values : [values];
  const normalized = new Set();

  for (const value of rawValues) {
    const key = String(value || "").trim().toLowerCase();
    if (CRM_STAGE_IGNORED_ROLE_SET.has(key)) {
      normalized.add(key);
    }
  }

  return Array.from(normalized);
}

export function resolveCrmStageSystemKey(stage = {}) {
  const systemKey = normalizeFreeText(stage.system_key);
  if (systemKey) return systemKey.toLowerCase();

  const stageKey = normalizeFreeText(stage.stage_key);
  if (stageKey) return stageKey.toLowerCase();

  return null;
}

export function resolveCrmStageDisplayName(stage = {}) {
  const displayName = normalizeFreeText(stage.display_name);
  if (displayName) return displayName;

  const name = normalizeFreeText(stage.name);
  if (name) return name;

  const systemKey = resolveCrmStageSystemKey(stage);
  if (!systemKey) return "Stage";

  return systemKey
    .split(/[_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export function isCrmClosedStage(stage = {}) {
  const pipelineState = String(stage.pipeline_state || "").trim().toLowerCase();
  if (pipelineState === "won" || pipelineState === "lost") {
    return true;
  }

  if (stage.is_won || stage.is_lost) {
    return true;
  }

  const values = [
    resolveCrmStageSystemKey(stage),
    normalizeFreeText(stage.stage_key),
    resolveCrmStageDisplayName(stage),
    normalizeFreeText(stage.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(closed|won|lost)\b/.test(values);
}
