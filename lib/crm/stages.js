import { resolveCrmDb, selectCrmMany, selectCrmSingleOrNull } from "@/lib/crm/server";
import {
  normalizeCrmIgnoredRoles,
  resolveCrmStageDisplayName,
  resolveCrmStageSystemKey,
} from "@/lib/crm/stage-metadata";

export const CRM_STAGE_COLUMNS = `
  id,
  stage_key,
  system_key,
  name,
  display_name,
  position,
  pipeline_state,
  is_active,
  is_default,
  is_won,
  is_lost,
  brevo_template_code,
  brevo_template_id,
  email_template_id,
  brevo_template_config,
  ignored_roles,
  initial_delay_hours,
  stagnancy_follow_up_enabled,
  follow_up_template_id,
  archived_at,
  archived_by_user_id,
  archive_reason,
  created_at,
  updated_at
`;

function toIsoTimestamp(value = new Date()) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function normalizeStageKey(value) {
  const normalized = value?.toString().trim().toLowerCase();
  return normalized || null;
}

function normalizeStageName(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

function normalizeOptionalInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.max(0, Math.trunc(parsed));
  }
  return Math.max(0, Math.trunc(Number(fallback || 0) || 0));
}

function normalizePipelineState(value) {
  const normalized = value?.toString().trim().toLowerCase();
  if (normalized === "won" || normalized === "lost") return normalized;
  return "open";
}

function normalizeStageConfig(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function deriveStageFlags(pipelineState, isWon, isLost) {
  const normalizedState = normalizePipelineState(pipelineState);
  const derivedIsWon = normalizedState === "won";
  const derivedIsLost = normalizedState === "lost";

  return {
    pipelineState: normalizedState,
    isWon: typeof isWon === "boolean" ? isWon : derivedIsWon,
    isLost: typeof isLost === "boolean" ? isLost : derivedIsLost,
  };
}

function normalizeStageOrder(position, fallbackPosition = 0) {
  const parsed = Number(position);
  if (Number.isFinite(parsed)) return Math.trunc(parsed);
  const fallback = Number(fallbackPosition);
  if (Number.isFinite(fallback)) return Math.trunc(fallback);
  return 0;
}

export async function listCrmStagesForManagement(
  client,
  { includeInactive = true, includeArchived = true } = {}
) {
  return selectCrmMany(client, "crm_stages", CRM_STAGE_COLUMNS, (query) => {
    let nextQuery = query;
    if (!includeInactive) {
      nextQuery = nextQuery.eq("is_active", true);
    }
    if (!includeArchived) {
      nextQuery = nextQuery.is("archived_at", null);
    }
    return nextQuery.order("position", { ascending: true }).order("created_at", { ascending: true });
  });
}

export async function selectCrmStageById(client, stageId, columns = CRM_STAGE_COLUMNS) {
  if (!stageId) return null;
  return selectCrmSingleOrNull(client, "crm_stages", columns, [["id", stageId]]);
}

export async function selectCrmStageByKey(client, stageKey, columns = CRM_STAGE_COLUMNS) {
  const normalizedStageKey = normalizeStageKey(stageKey);
  if (!normalizedStageKey) return null;
  return selectCrmSingleOrNull(client, "crm_stages", columns, [["system_key", normalizedStageKey]]);
}

export async function upsertCrmStage(
  client,
  {
    stageId = null,
    stageKey = null,
    systemKey = null,
    name = null,
    displayName = null,
    position = null,
    pipelineState = null,
    isActive = null,
    isDefault = null,
    isWon = null,
    isLost = null,
    brevoTemplateCode = null,
    brevoTemplateId = null,
    emailTemplateId = null,
    brevoTemplateConfig = null,
    ignoredRoles = null,
    initialDelayHours = null,
    stagnancyFollowUpEnabled = null,
    followUpTemplateId = null,
    clearEmailTemplateId = false,
    clearFollowUpTemplateId = false,
  } = {}
) {
  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const normalizedStageId = stageId || null;
  const normalizedStageKey = normalizeStageKey(systemKey || stageKey);
  const existing = normalizedStageId
    ? await selectCrmStageById(client, normalizedStageId)
    : normalizedStageKey
      ? await selectCrmStageByKey(client, normalizedStageKey)
      : null;

  if (!existing && !normalizedStageKey) {
    throw new Error("upsertCrmStage requires a stageKey for new stages.");
  }

  const stageName =
    normalizeStageName(displayName) ||
    normalizeStageName(name) ||
    resolveCrmStageDisplayName(existing) ||
    null;
  if (!stageName) {
    throw new Error("upsertCrmStage requires a stage name.");
  }

  const stageOrder = normalizeStageOrder(position, existing?.position ?? 0);
  const { pipelineState: nextPipelineState, isWon: nextIsWon, isLost: nextIsLost } = deriveStageFlags(
    pipelineState ?? existing?.pipeline_state ?? "open",
    isWon,
    isLost
  );
  const nextIsActive = typeof isActive === "boolean" ? isActive : existing?.is_active ?? true;
  const nextIsDefault = typeof isDefault === "boolean" ? isDefault : existing?.is_default ?? false;
  const nextConfig = normalizeStageConfig(brevoTemplateConfig ?? existing?.brevo_template_config ?? {});
  const nextTemplateCode = normalizeFreeText(brevoTemplateCode) ?? existing?.brevo_template_code ?? null;
  const nextTemplateId = clearEmailTemplateId
    ? null
    : normalizeFreeText(emailTemplateId) ??
      normalizeFreeText(brevoTemplateId) ??
      existing?.email_template_id ??
      existing?.brevo_template_id ??
      null;
  const nextIgnoredRoles = normalizeCrmIgnoredRoles(
    ignoredRoles ?? existing?.ignored_roles ?? []
  );
  const nextInitialDelayHours = normalizeOptionalInteger(
    initialDelayHours,
    existing?.initial_delay_hours ?? 0
  );
  const nextStagnancyFollowUpEnabled =
    typeof stagnancyFollowUpEnabled === "boolean"
      ? stagnancyFollowUpEnabled
      : existing?.stagnancy_follow_up_enabled ?? false;
  const nextFollowUpTemplateId = clearFollowUpTemplateId
    ? null
    : normalizeFreeText(followUpTemplateId) ?? existing?.follow_up_template_id ?? null;
  const nowIso = toIsoTimestamp();
  const payload = {
    stage_key: normalizedStageKey || resolveCrmStageSystemKey(existing) || null,
    system_key: normalizedStageKey || resolveCrmStageSystemKey(existing) || null,
    name: stageName,
    display_name: stageName,
    position: stageOrder,
    pipeline_state: nextPipelineState,
    is_active: nextIsActive,
    is_default: nextIsDefault,
    is_won: nextIsWon,
    is_lost: nextIsLost,
    brevo_template_code: nextTemplateCode,
    brevo_template_id: nextTemplateId,
    email_template_id: nextTemplateId,
    brevo_template_config: nextConfig,
    ignored_roles: nextIgnoredRoles,
    initial_delay_hours: nextInitialDelayHours,
    stagnancy_follow_up_enabled: nextStagnancyFollowUpEnabled,
    follow_up_template_id: nextFollowUpTemplateId,
    updated_at: nowIso,
  };

  if (existing?.archived_at && nextIsActive) {
    payload.archived_at = null;
    payload.archived_by_user_id = null;
    payload.archive_reason = null;
  } else if (existing && Object.prototype.hasOwnProperty.call(existing, "archived_at")) {
    payload.archived_at = existing.archived_at;
    payload.archived_by_user_id = existing.archived_by_user_id;
    payload.archive_reason = existing.archive_reason;
  }

  if (!existing) {
    payload.created_at = nowIso;
  }

  const query = existing
    ? db.from("crm_stages").update(payload).eq("id", existing.id)
    : db.from("crm_stages").insert(payload);

  const { data, error } = await query.select(CRM_STAGE_COLUMNS).maybeSingle();
  if (error) {
    throw new Error(error.message || "Failed to save CRM stage.");
  }

  return data || null;
}

export async function reorderCrmStage(client, { stageId, position } = {}) {
  if (!stageId) {
    throw new Error("reorderCrmStage requires a stageId.");
  }

  const stage = await selectCrmStageById(client, stageId);
  if (!stage) return null;
  return upsertCrmStage(client, {
    stageId,
    systemKey: resolveCrmStageSystemKey(stage),
    displayName: resolveCrmStageDisplayName(stage),
    position,
    pipelineState: stage.pipeline_state,
    isActive: stage.is_active,
    isDefault: stage.is_default,
    isWon: stage.is_won,
    isLost: stage.is_lost,
    brevoTemplateCode: stage.brevo_template_code,
    emailTemplateId: stage.email_template_id || stage.brevo_template_id,
    brevoTemplateConfig: stage.brevo_template_config,
    ignoredRoles: stage.ignored_roles,
    initialDelayHours: stage.initial_delay_hours,
    stagnancyFollowUpEnabled: stage.stagnancy_follow_up_enabled,
    followUpTemplateId: stage.follow_up_template_id,
  });
}

export async function setCrmStageActive(client, { stageId, isActive = true } = {}) {
  if (!stageId) {
    throw new Error("setCrmStageActive requires a stageId.");
  }

  const stage = await selectCrmStageById(client, stageId);
  if (!stage) return null;
  return upsertCrmStage(client, {
    stageId,
    systemKey: resolveCrmStageSystemKey(stage),
    displayName: resolveCrmStageDisplayName(stage),
    position: stage.position,
    pipelineState: stage.pipeline_state,
    isActive,
    isDefault: stage.is_default,
    isWon: stage.is_won,
    isLost: stage.is_lost,
    brevoTemplateCode: stage.brevo_template_code,
    emailTemplateId: stage.email_template_id || stage.brevo_template_id,
    brevoTemplateConfig: stage.brevo_template_config,
    ignoredRoles: stage.ignored_roles,
    initialDelayHours: stage.initial_delay_hours,
    stagnancyFollowUpEnabled: stage.stagnancy_follow_up_enabled,
    followUpTemplateId: stage.follow_up_template_id,
  });
}

export async function archiveCrmStage(client, { stageId, reason = null, actorUserId = null } = {}) {
  if (!stageId) {
    throw new Error("archiveCrmStage requires a stageId.");
  }

  const db = resolveCrmDb(client);
  if (!db?.from) return null;

  const stage = await selectCrmStageById(client, stageId);
  if (!stage) return null;

  const nowIso = toIsoTimestamp();
  const { data, error } = await db
    .from("crm_stages")
    .update({
      is_active: false,
      archived_at: nowIso,
      archived_by_user_id: actorUserId || stage.archived_by_user_id || null,
      archive_reason: normalizeFreeText(reason) || stage.archive_reason || "archived",
      updated_at: nowIso,
    })
    .eq("id", stageId)
    .select(CRM_STAGE_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to archive CRM stage.");
  }

  return data || null;
}
