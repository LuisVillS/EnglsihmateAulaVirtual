import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import { moveCrmStageAction, saveCrmStageAction, toggleCrmStageActiveAction } from "@/app/admin/crm/actions";
import { CrmBadge } from "@/components/crm/crm-ui";
import { resolveCrmStageDisplayName, resolveCrmStageSystemKey } from "@/lib/crm/stage-metadata";

const SOURCE_RULE_OPTIONS = [
  { key: "meta", label: "Meta" },
  { key: "web_form", label: "WebForm" },
  { key: "formspree", label: "Formspree (legacy)" },
  { key: "pre_enrollment", label: "Virtual classroom" },
  { key: "manual", label: "Manual / other" },
  { key: "other", label: "Other" },
];

const SOURCE_RULE_LABELS = new Map(SOURCE_RULE_OPTIONS.map((source) => [source.key, source.label]));

function normalizeSourceRuleSet(value) {
  const values = Array.isArray(value) ? value : [];
  return new Set(values.map((item) => String(item || "").trim()).filter(Boolean));
}

function formatSourceRuleNames(values) {
  return values.map((value) => SOURCE_RULE_LABELS.get(value) || value).join(", ");
}

function renderSourceRuleGroup({ prefix, title, description, selectedValues = [] }) {
  const selected = normalizeSourceRuleSet(selectedValues);

  return (
    <div className="space-y-2 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
      <div>
        <p className="text-sm font-semibold text-[#111827]">{title}</p>
        <p className="text-xs text-[#64748b]">{description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {SOURCE_RULE_OPTIONS.map((source) => (
          <label key={`${prefix}-${source.key}`} className="inline-flex items-center gap-2 text-sm text-[#334155]">
            <input
              type="checkbox"
              name={`${prefix}_${source.key}`}
              defaultChecked={selected.has(source.key)}
              className="h-4 w-4 rounded border-[rgba(15,23,42,0.2)]"
            />
            {source.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function StageCard({ stage, returnTo, canEdit }) {
  const sourceRules = stage.brevo_template_config?.source_rules || {};
  const excludeRules = Array.isArray(sourceRules.exclude) ? sourceRules.exclude : [];
  const stageLabel = resolveCrmStageDisplayName(stage);
  const stageKey = resolveCrmStageSystemKey(stage);

  return (
    <div className="space-y-3 rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#111827]">{stageLabel}</p>
            <CrmBadge tone={stage.pipeline_state === "won" ? "success" : stage.pipeline_state === "lost" ? "danger" : "accent"}>
              {stage.pipeline_state}
            </CrmBadge>
            <CrmBadge tone={stage.is_active ? "success" : "neutral"}>{stage.is_active ? "Active" : "Archived"}</CrmBadge>
            <CrmBadge tone={stage.email_template_id || stage.brevo_template_id ? "accent" : "neutral"}>
              {stage.email_template_id || stage.brevo_template_id ? "Auto-send enabled" : "No template"}
            </CrmBadge>
          </div>
          <div className="flex flex-wrap gap-2">
            {excludeRules.length ? (
              <CrmBadge tone="warning">Ignore: {formatSourceRuleNames(excludeRules)}</CrmBadge>
            ) : (
              <CrmBadge tone="neutral">All sources included</CrmBadge>
            )}
          </div>
          <p className="text-xs text-[#64748b]">
            Key: <span className="font-medium text-[#334155]">{stageKey}</span> | Position {stage.position}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={moveCrmStageAction}>
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="direction" value="up" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              disabled={!canEdit}
              className="inline-flex min-h-9 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Up
            </button>
          </form>
          <form action={moveCrmStageAction}>
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="direction" value="down" />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              disabled={!canEdit}
              className="inline-flex min-h-9 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Down
            </button>
          </form>
        </div>
      </div>

      <form action={saveCrmStageAction} className="space-y-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-4">
        <input type="hidden" name="stageId" value={stage.id} />
        <input type="hidden" name="systemKey" value={stageKey} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Stage name</span>
              <input
                type="text"
                name="displayName"
                defaultValue={stageLabel}
                disabled={!canEdit}
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none disabled:bg-[#f8fafc]"
              />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Pipeline state</span>
            <select
              name="pipelineState"
              defaultValue={stage.pipeline_state}
              disabled={!canEdit}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none disabled:bg-[#f8fafc]"
            >
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Position</span>
            <input
              type="number"
              min="1"
              name="position"
              defaultValue={stage.position}
              disabled={!canEdit}
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none disabled:bg-[#f8fafc]"
            />
          </label>
          <label className="inline-flex items-center gap-2 self-end text-sm text-[#334155]">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={stage.is_active}
              disabled={!canEdit}
              className="h-4 w-4 rounded border-[rgba(15,23,42,0.2)]"
            />
            Active
          </label>
          <label className="inline-flex items-center gap-2 self-end text-sm text-[#334155]">
            <input
              type="checkbox"
              name="isDefault"
              defaultChecked={stage.is_default}
              disabled={!canEdit}
              className="h-4 w-4 rounded border-[rgba(15,23,42,0.2)]"
            />
            Default stage
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-1">
          <label className="space-y-1 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Template ID</span>
              <input
                type="text"
                name="emailTemplateId"
                defaultValue={stage.email_template_id || stage.brevo_template_id || ""}
                placeholder="123"
                disabled={!canEdit}
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none disabled:bg-[#f8fafc]"
            />
          </label>
        </div>

        {renderSourceRuleGroup({
          prefix: "sourceExclude",
          title: "Ignore sources",
          description: "Any source not selected here is included by default and can trigger this stage automation.",
          selectedValues: excludeRules,
        })}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#64748b]">
            Add a Brevo template ID here and the email sends automatically when a lead enters this stage. Source rules
            only store ignored sources; any source not ignored is included automatically.
          </p>
          {canEdit ? (
            <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
              Save stage
            </button>
          ) : null}
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <form action={toggleCrmStageActiveAction}>
          <input type="hidden" name="stageId" value={stage.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="isActive" value={stage.is_active ? "0" : "1"} />
          <input type="hidden" name="isDefault" value={stage.is_default ? "1" : "0"} />
          <button
            type="submit"
            disabled={!canEdit}
            className="inline-flex min-h-9 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stage.is_active ? "Archive / deactivate" : "Activate"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CrmStageManagementPanel({ stages, canEdit, returnTo }) {
  const activeStages = stages.filter((stage) => stage.is_active);

  return (
    <AdminCard className="space-y-4">
      <AdminSectionHeader
        eyebrow="Pipeline settings"
        title="Stage management"
        description="Admins can add, edit, reorder, activate, deactivate, and archive stages here. A stage template ID sends automatically when a lead enters that stage."
        meta={<CrmBadge tone="accent">{stages.length} stage(s)</CrmBadge>}
      />

      {canEdit ? (
        <form action={saveCrmStageAction} className="space-y-3 rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#111827]">Add a new stage</p>
              <p className="text-xs text-[#64748b]">Use a stable key and keep the position numeric for safer ordering.</p>
            </div>
            <CrmBadge tone="neutral">Editable by admins only</CrmBadge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Stage key</span>
              <input
                type="text"
                name="systemKey"
                placeholder="crm_stage_follow_up"
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Stage name</span>
              <input
                type="text"
                name="displayName"
                placeholder="Follow up"
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Pipeline state</span>
              <select
                name="pipelineState"
                defaultValue="open"
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              >
                <option value="open">Open</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Position</span>
              <input
                type="number"
                min="1"
                name="position"
                defaultValue={stages.length + 1}
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Template ID</span>
              <input
                type="text"
                name="emailTemplateId"
                placeholder="123"
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </label>
          </div>
          <div className="grid gap-3">
            {renderSourceRuleGroup({
              prefix: "sourceExclude",
              title: "Ignore sources",
              description: "Any source not selected here is included by default and can trigger this stage automation.",
            })}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-[#334155]">
              <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-[rgba(15,23,42,0.2)]" />
              Active stage
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[#334155]">
              <input type="checkbox" name="isDefault" className="h-4 w-4 rounded border-[rgba(15,23,42,0.2)]" />
              Default stage
            </label>
            <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
              Create stage
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4 text-sm text-[#475569]">
          Stage editing is read-only for non-admin CRM users.
        </div>
      )}

      <div className="space-y-3">
        {stages.map((stage) => (
          <StageCard key={stage.id} stage={stage} returnTo={returnTo} canEdit={canEdit} />
        ))}
        {!activeStages.length ? (
          <div className="rounded-[20px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[#f8fafc] px-4 py-10 text-center text-sm text-[#64748b]">
            No active stages are configured yet.
          </div>
        ) : null}
      </div>
    </AdminCard>
  );
}
