"use client";

import Link from "next/link";
import { memo, startTransition, useActionState, useMemo, useOptimistic, useState } from "react";
import {
  createManualCrmLeadAction,
  moveLeadStageAction,
  quickEditLeadAction,
  saveCrmStageAction,
} from "@/app/admin/crm/actions";
import CrmDialAction from "@/components/crm/crm-dial-action";
import FilterPopover, { FilterChipGroup, FilterPopoverSection } from "@/components/filter-popover";
import CrmModal from "@/components/crm/crm-modal";
import { UNIFIED_COURSE_PRICE } from "@/lib/course-config";
import {
  isCrmClosedStage,
  resolveCrmStageDisplayName,
  resolveCrmStageSystemKey,
} from "@/lib/crm/stage-metadata";
import {
  CrmBadge,
  CrmNotice,
  buildCrmDialHref,
  formatCallOutcomeLabel,
  formatCrmLeadSourceSummary,
  formatCrmPhoneDisplay,
  formatCurrency,
  formatLeadSourceLabel,
  formatPreEnrollmentStatus,
  resolveLeadSourceValue,
} from "@/components/crm/crm-ui";

const SOURCE_FILTER_OPTIONS = [
  { key: "meta", label: "Meta" },
  { key: "web_form", label: "Web forms" },
  { key: "formspree", label: "Formspree" },
  { key: "pre_enrollment", label: "Virtual classroom" },
  { key: "manual", label: "Manual" },
  { key: "other", label: "Other" },
];

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

function moveLeadInArray(leads, leadId, stageId, stageById) {
  const nextTimestamp = new Date().toISOString();
  return leads.map((lead) => {
    if (lead.id !== leadId) return lead;
    return {
      ...lead,
      current_stage_id: stageId,
      current_stage: stageById.get(stageId) || lead.current_stage || null,
      updated_at: nextTimestamp,
    };
  });
}

function formatRelativeTime(value) {
  if (!value) return "Just now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Just now";
  const diffMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes === 1) return "1 min ago";
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return diffHours === 1 ? "1 hr ago" : `${diffHours} hrs ago`;
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
}

function initialsForLead(lead) {
  const raw = lead?.full_name || lead?.email || "Lead";
  const parts = String(raw).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "LD";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

function resolveContextChip(lead) {
  if (!lead) return null;
  if (lead.last_call_outcome) {
    return {
      label: formatCallOutcomeLabel(lead.last_call_outcome),
      tone:
        lead.last_call_outcome === "connected"
          ? "bg-[#e8efff] text-[#0d215c]"
          : lead.last_call_outcome === "callback_requested"
            ? "bg-[#fff2dd] text-[#915100]"
            : lead.last_call_outcome === "voicemail"
              ? "bg-[#eef1f7] text-[#586579]"
              : "bg-[#f4f2f8] text-[#586579]",
    };
  }

  if (lead.current_pre_enrollment_status) {
    return {
      label: formatPreEnrollmentStatus(lead.current_pre_enrollment_status),
      tone:
        lead.current_pre_enrollment_status === "APPROVED"
          ? "bg-[#e8fbf2] text-[#047857]"
          : lead.current_pre_enrollment_status === "PAYMENT_SUBMITTED"
            ? "bg-[#fff2dd] text-[#915100]"
            : "bg-[#eef1f7] text-[#586579]",
    };
  }

  return null;
}

function resolveTopBadge(lead) {
  return formatLeadSourceLabel(resolveLeadSourceValue(lead)) || "Lead";
}

function resolveStageTone(stage) {
  if (stage?.pipeline_state === "won") return "bg-[#5ab57f]";
  if (stage?.pipeline_state === "lost") return "bg-[#c16b54]";
  if (String(resolveCrmStageSystemKey(stage) || "").includes("attempt")) return "bg-[#52607a]";
  return "bg-[#7d8798]";
}

function computeBoardMetrics(leads, stages, summaryMetrics = null) {
  const safeLeads = Array.isArray(leads) ? leads : [];
  const stageById = new Map((Array.isArray(stages) ? stages : []).map((stage) => [stage.id, stage]));
  const openLeads = safeLeads.filter((lead) => lead?.lead_status === "open");
  const wonLeads = safeLeads.filter((lead) => lead?.lead_status === "won");
  const closedLeads = safeLeads.filter((lead) => {
    const stage = lead?.current_stage || stageById.get(lead?.current_stage_id) || null;
    return isCrmClosedStage(stage);
  });
  const totalLeadCount = Number(summaryMetrics?.totalLeadCount ?? safeLeads.length);
  const closedLeadCount = Number(summaryMetrics?.closedLeadCount ?? closedLeads.length);
  const totalPipelineValue = Math.max(0, totalLeadCount - closedLeadCount) * UNIFIED_COURSE_PRICE;
  const closeDurations = wonLeads
    .map((lead) => {
      const createdAt = lead?.created_at ? new Date(lead.created_at).getTime() : null;
      const wonAt = lead?.won_at ? new Date(lead.won_at).getTime() : null;
      if (!Number.isFinite(createdAt) || !Number.isFinite(wonAt) || wonAt < createdAt) return null;
      return (wonAt - createdAt) / (1000 * 60 * 60 * 24);
    })
    .filter((value) => Number.isFinite(value));

  return {
    totalPipelineValue,
    activeDeals: openLeads.length,
    wonDeals: wonLeads.length,
    closedDeals: closedLeads.length,
    averageCloseDays: closeDurations.length
      ? Math.max(1, Math.round(closeDurations.reduce((sum, value) => sum + value, 0) / closeDurations.length))
      : null,
    leadToWin: safeLeads.length ? (wonLeads.length / safeLeads.length) * 100 : 0,
  };
}

function TrendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M4 16l5-5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 7h-4" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

const QUICK_EDIT_INITIAL_STATE = {
  success: false,
  error: null,
  leadId: null,
  stageId: null,
};

const MANUAL_LEAD_INITIAL_STATE = {
  success: false,
  error: null,
  leadId: null,
  created: false,
  merged: false,
  message: null,
};

function StageEditForm({ stage, returnTo }) {
  const [followUpEnabled, setFollowUpEnabled] = useState(Boolean(stage?.stagnancy_follow_up_enabled));
  const excludedSources = Array.isArray(stage?.brevo_template_config?.source_rules?.exclude)
    ? stage.brevo_template_config.source_rules.exclude
    : [];

  return (
    <form action={saveCrmStageAction} className="space-y-4">
      <input type="hidden" name="stageId" value={stage.id} />
      <input type="hidden" name="systemKey" value={resolveCrmStageSystemKey(stage) || ""} />
      <input type="hidden" name="pipelineState" value={stage.pipeline_state || "open"} />
      <input type="hidden" name="position" value={stage.position || 1} />
      <input type="hidden" name="isActive" value={stage.is_active ? "1" : "0"} />
      <input type="hidden" name="isDefault" value={stage.is_default ? "1" : "0"} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="sourceExcludeValuesTouched" value="1" />
      <input type="hidden" name="initialDelayHoursTouched" value="1" />
      <input type="hidden" name="stagnancyFollowUpTouched" value="1" />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Display name</span>
          <input
            name="displayName"
            type="text"
            defaultValue={resolveCrmStageDisplayName(stage)}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Template ID</span>
          <input
            name="emailTemplateId"
            type="text"
            inputMode="numeric"
            defaultValue={stage?.email_template_id || stage?.brevo_template_id || ""}
            placeholder="123"
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          />
          <p className="text-xs text-[#64748b]">Enter the Brevo template number manually.</p>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Ignored lead sources</span>
          <select
            name="sourceExcludeValues"
            multiple
            defaultValue={excludedSources}
            className="min-h-36 w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          >
            {SOURCE_FILTER_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-[#64748b]">Selected lead sources will not trigger this email.</p>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Initial delay</span>
          <input
            name="initialDelayHours"
            type="number"
            min="0"
            step="1"
            defaultValue={stage?.initial_delay_hours || 0}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          />
          <p className="text-xs text-[#64748b]">Delay in hours before the first email is sent.</p>
        </label>
      </div>

      <div className="space-y-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
        <label className="inline-flex items-center gap-3 text-sm font-medium text-[#0f172a]">
          <input
            name="stagnancyFollowUpEnabled"
            type="checkbox"
            value="1"
            checked={followUpEnabled}
            onChange={(event) => setFollowUpEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-[rgba(15,23,42,0.2)]"
          />
          Send follow-up if lead remains in stage for 24 hours
        </label>

        {followUpEnabled ? (
          <label className="space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Follow-up template ID</span>
            <input
              name="followUpTemplateId"
              type="text"
              inputMode="numeric"
              defaultValue={stage?.follow_up_template_id || ""}
              placeholder="456"
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
            />
          </label>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[#64748b]">
          <p>
            System key:{" "}
            <span className="font-semibold text-[#334155]">{resolveCrmStageSystemKey(stage)}</span>
          </p>
          <p>The stable key stays fixed even if the display name changes.</p>
        </div>
        <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
          Save stage settings
        </button>
      </div>
    </form>
  );
}

const LeadCard = memo(function LeadCard({ lead, onDragStart, onDragEnd, onQuickEdit }) {
  const contextChip = resolveContextChip(lead);
  const badgeLabel = resolveTopBadge(lead);
  const emphasisClass =
    lead.lead_status === "won" || lead.current_pre_enrollment_status === "APPROVED"
      ? "border-l-[4px] border-l-[#d4872a]"
      : contextChip?.label === "Callback requested"
        ? "border-l-[4px] border-l-[#0d215c]"
        : "";

  return (
    <article
      draggable
      onDragStart={(event) => onDragStart(event, lead.id)}
      onDragEnd={onDragEnd}
      onClick={() => onQuickEdit(lead.id)}
      className={joinClasses(
        "cursor-pointer rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[0_18px_38px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px]",
        emphasisClass
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-[18px] font-bold tracking-[-0.03em] text-[#000d39]">
            {lead.full_name || lead.email || "Unnamed lead"}
          </h4>
          <p className="mt-2 text-[13px] text-[#5f6675]">
            {lead.source_label || lead.form_label || formatCrmLeadSourceSummary(lead)}
          </p>
        </div>
        <span className="shrink-0 rounded-[10px] bg-[#ffe1c9] px-3 py-1 text-[11px] font-bold text-[#c8752f]">
          {badgeLabel}
        </span>
      </div>

      {contextChip ? (
        <div className={joinClasses("mt-5 rounded-[14px] px-3 py-2 text-[12px] font-semibold", contextChip.tone)}>
          {contextChip.label}
        </div>
      ) : (
        <div className="mt-5 h-px bg-[rgba(15,23,42,0.08)]" />
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef2fa] text-[12px] font-bold text-[#52607a]">
          {initialsForLead(lead)}
        </div>
        <p className="text-[12px] font-medium text-[#7d8798]">{formatRelativeTime(lead.updated_at)}</p>
      </div>
    </article>
  );
});

const StageColumn = memo(function StageColumn({
  stage,
  leads,
  canManageStages,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  onQuickEdit,
  onEditStage,
}) {
  const stageLabel = resolveCrmStageDisplayName(stage);

  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={joinClasses(
        "w-[320px] shrink-0 rounded-[28px] border border-[rgba(15,23,42,0.06)] bg-transparent p-1.5 transition",
        isDropTarget ? "bg-[#edf3ff]" : ""
      )}
    >
      <div className="mb-3 flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <span className={joinClasses("h-2.5 w-2.5 rounded-full", resolveStageTone(stage))} />
          <h3 className="text-[18px] font-bold tracking-[-0.03em] text-[#000d39]">{stageLabel}</h3>
          <span className="rounded-full bg-[#ece8ef] px-2.5 py-1 text-[11px] font-bold text-[#666d7a]">
            {leads.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onEditStage(stage.id)}
          disabled={!canManageStages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#757681] transition hover:bg-white"
          aria-label={`${stageLabel} options`}
        >
          <MoreIcon />
        </button>
      </div>

      <div className="space-y-4">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onQuickEdit={onQuickEdit}
          />
        ))}

        {!leads.length ? (
          <div className="rounded-[22px] border border-dashed border-[rgba(15,23,42,0.12)] bg-white px-4 py-10 text-center text-[13px] text-[#7d8798]">
            Drop a lead here to move it into this stage.
          </div>
        ) : null}
      </div>
    </section>
  );
});

function KanbanFiltersPopover({ searchParams, activeFilterCount }) {
  const [searchValue, setSearchValue] = useState(searchParams?.q?.toString() || "");
  const [statusValue, setStatusValue] = useState(searchParams?.status?.toString() || "");
  const [sourceValue, setSourceValue] = useState(searchParams?.source?.toString() || "");

  return (
    <FilterPopover
      title="Filter Pipeline"
      buttonLabel="Filters"
      buttonIcon={<FilterIcon />}
      activeCount={activeFilterCount}
      width={470}
      buttonClassName="min-h-[58px] rounded-[20px] px-7 text-[16px] font-bold"
      footer={() => (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Link
            href="/admin/crm/kanban"
            className="inline-flex min-h-12 items-center justify-center rounded-[16px] border border-[rgba(16,52,116,0.14)] px-4 py-3 text-sm font-semibold text-[#103474] transition hover:bg-[#f5f8ff]"
          >
            Clear all
          </Link>
          <button
            type="submit"
            form="crm-kanban-filters-form"
            className="inline-flex min-h-12 items-center justify-center rounded-[18px] bg-[#103474] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(16,52,116,0.2)] transition hover:bg-[#0c295a]"
          >
            Apply Filters
          </button>
        </div>
      )}
    >
      <form id="crm-kanban-filters-form" method="get" className="space-y-5">
        <input type="hidden" name="status" value={statusValue} />
        <input type="hidden" name="source" value={sourceValue} />

        <FilterPopoverSection label="Search" description="Find leads by name, email, phone, or source tag.">
          <input
            type="search"
            name="q"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search lead details"
            className="w-full rounded-[16px] border border-[rgba(16,52,116,0.14)] bg-[#fbfcff] px-4 py-3 text-sm text-[#1f2432] placeholder:text-[#97a3ba] focus:border-[#103474] focus:outline-none"
          />
        </FilterPopoverSection>

        <FilterPopoverSection label="Status" description="Focus on the current pipeline outcome.">
          <FilterChipGroup
            options={[
              { value: "open", label: "Open" },
              { value: "won", label: "Won" },
              { value: "lost", label: "Lost" },
            ]}
            value={statusValue}
            onChange={setStatusValue}
          />
        </FilterPopoverSection>

        <FilterPopoverSection label="Source" description="Limit the board to a specific lead source.">
          <FilterChipGroup
            options={SOURCE_FILTER_OPTIONS.map((option) => ({
              value: option.key,
              label: option.label,
            }))}
            value={sourceValue}
            onChange={setSourceValue}
          />
        </FilterPopoverSection>
      </form>
    </FilterPopover>
  );
}

export default function CrmKanbanPipeline({
  stages,
  leads,
  summaryMetrics = null,
  canManageStages = false,
  returnTo,
  searchParams = {},
}) {
  const [dragLeadId, setDragLeadId] = useState("");
  const [dropStageId, setDropStageId] = useState("");
  const [editingLeadId, setEditingLeadId] = useState("");
  const [editingStageId, setEditingStageId] = useState("");
  const [manualLeadOpen, setManualLeadOpen] = useState(false);
  const [boardNotice, setBoardNotice] = useState("");

  const [quickEditState, quickEditFormAction, quickEditPending] = useActionState(
    quickEditLeadAction,
    QUICK_EDIT_INITIAL_STATE
  );
  const [manualLeadState, manualLeadFormAction, manualLeadPending] = useActionState(
    createManualCrmLeadAction,
    MANUAL_LEAD_INITIAL_STATE
  );

  const safeStages = useMemo(() => stages || [], [stages]);
  const stageById = useMemo(() => new Map(safeStages.map((stage) => [stage.id, stage])), [safeStages]);
  const baseBoardLeads = useMemo(() => leads || [], [leads]);
  const [boardLeads, applyBoardLeadMutation] = useOptimistic(
    baseBoardLeads,
    (currentLeads, mutation) => {
      if (!mutation || typeof mutation !== "object") return currentLeads;
      if (mutation.type === "replace") return mutation.leads || [];
      if (mutation.type === "move") {
        return moveLeadInArray(currentLeads, mutation.leadId, mutation.stageId, stageById);
      }
      return currentLeads;
    }
  );
  const hydratedBoardLeads = useMemo(() => {
    if (!quickEditState?.success || !quickEditState?.leadId) {
      return boardLeads;
    }

    return boardLeads.map((lead) =>
      lead.id === quickEditState.leadId
        ? {
            ...lead,
            current_stage_id: quickEditState.stageId || lead.current_stage_id,
            current_stage: quickEditState.stageId ? stageById.get(quickEditState.stageId) || lead.current_stage || null : lead.current_stage || null,
            latest_note:
              quickEditState.latestNote != null
                ? quickEditState.latestNote
                : lead.latest_note || "",
          }
        : lead
    );
  }, [boardLeads, quickEditState, stageById]);
  const boardMetrics = useMemo(
    () => computeBoardMetrics(hydratedBoardLeads, safeStages, summaryMetrics),
    [hydratedBoardLeads, safeStages, summaryMetrics]
  );

  const grouped = useMemo(() => {
    const fallbackStageId = safeStages?.[0]?.id || null;
    const stageBuckets = new Map(safeStages.map((stage) => [stage.id, []]));

    for (const lead of hydratedBoardLeads) {
      const stageId = lead?.current_stage_id || fallbackStageId;
      if (!stageBuckets.has(stageId)) stageBuckets.set(stageId, []);
      stageBuckets.get(stageId).push(lead);
    }

    for (const [stageId, stageLeads] of stageBuckets.entries()) {
      stageBuckets.set(
        stageId,
        stageLeads.slice().sort((left, right) => {
          const leftTime = left?.updated_at ? new Date(left.updated_at).getTime() : 0;
          const rightTime = right?.updated_at ? new Date(right.updated_at).getTime() : 0;
          return rightTime - leftTime;
        })
      );
    }

    return stageBuckets;
  }, [hydratedBoardLeads, safeStages]);

  const editingLead = useMemo(
    () => hydratedBoardLeads.find((lead) => lead.id === editingLeadId) || null,
    [editingLeadId, hydratedBoardLeads]
  );
  const editingStage = useMemo(
    () => safeStages.find((stage) => stage.id === editingStageId) || null,
    [editingStageId, safeStages]
  );

  const successNotice =
    quickEditState?.success && quickEditState?.leadId
      ? quickEditState.message || "Quick edit saved."
      : manualLeadState?.success
        ? manualLeadState.message || "Manual lead created."
        : "";
  const activeFilterCount = [
    Boolean(searchParams?.q),
    Boolean(searchParams?.status),
    Boolean(searchParams?.source),
  ].filter(Boolean).length;
  const filterStateKey = [
    searchParams?.q?.toString() || "",
    searchParams?.status?.toString() || "",
    searchParams?.source?.toString() || "",
  ].join("::");

  const handleDragStart = (event, leadId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", leadId);
    setDragLeadId(leadId);
  };

  const handleDrop = (event, stageId) => {
    event.preventDefault();
    const leadId = event.dataTransfer.getData("text/plain") || dragLeadId;
    if (!leadId) return;
    const previousLeads = boardLeads;

    setDropStageId(stageId);
    setBoardNotice("Saving board move...");
    startTransition(() => {
      applyBoardLeadMutation({ type: "move", leadId, stageId });
    });
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId);
      formData.set("stageId", stageId);
      formData.set("returnTo", returnTo);
      formData.set("reason", "crm_ui_drag_drop");
      formData.set("noRedirect", "1");

      try {
        await moveLeadStageAction(formData);
        setBoardNotice("Stage move saved.");
      } catch {
        startTransition(() => {
          applyBoardLeadMutation({ type: "replace", leads: previousLeads });
        });
        setBoardNotice("Stage move failed. The board was restored.");
      }
    });
  };

  const handleDragEnd = () => {
    setDragLeadId("");
    setDropStageId("");
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#fff1e7] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#d4872a]">
            <TrendIcon />
            Active pipeline
          </div>
          <h1 className="text-[42px] font-extrabold tracking-[-0.05em] text-[#000d39] sm:text-[56px]">
            Campaign Pipeline
          </h1>
          <p className="mt-4 max-w-3xl text-[18px] leading-9 text-[#4f5664]">
            Manage your lead journey through the sales funnel with real-time analytics and score tracking.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <KanbanFiltersPopover
            key={filterStateKey}
            searchParams={searchParams}
            activeFilterCount={activeFilterCount}
          />
          <button
            type="button"
            onClick={() => setManualLeadOpen(true)}
            className="inline-flex min-h-[58px] items-center justify-center gap-3 rounded-[20px] bg-[#000d39] px-8 text-[16px] font-bold text-white transition hover:opacity-95"
          >
            <PlusIcon />
            Add Lead
          </button>
        </div>
      </section>

      <CrmNotice searchParams={searchParams} />
      {boardNotice || successNotice ? (
        <div className="rounded-[20px] border border-[rgba(16,52,116,0.12)] bg-[#eef4ff] px-4 py-3 text-sm text-[#103474]">
          {boardNotice || successNotice}
        </div>
      ) : null}

      <section className="overflow-x-auto pb-8">
        <div className="flex min-w-max items-start gap-6">
          {safeStages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              leads={grouped.get(stage.id) || []}
              canManageStages={canManageStages}
              isDropTarget={dropStageId === stage.id}
              onDragOver={(event) => {
                event.preventDefault();
                setDropStageId(stage.id);
              }}
              onDragLeave={() => setDropStageId((current) => (current === stage.id ? "" : current))}
              onDrop={(event) => handleDrop(event, stage.id)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onQuickEdit={setEditingLeadId}
              onEditStage={setEditingStageId}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
        <div className="rounded-[34px] bg-[#0d215c] px-8 py-8 text-white shadow-[0_24px_56px_rgba(13,33,92,0.18)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-[#aebcf0]">Total Pipeline Value</p>
              <p className="mt-5 text-[58px] font-extrabold tracking-[-0.05em] text-white">
                {formatCurrency(boardMetrics.totalPipelineValue)}
              </p>
            </div>
            <div className="rounded-[18px] bg-white/10 p-4 text-[#8ea0db]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-9 w-9">
                <rect x="5" y="4" width="14" height="16" rx="2" />
                <path d="M9 10h6M9 14h4" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-10">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-[#8ea0db]">Won leads</p>
              <p className="mt-2 text-[20px] font-bold text-white">{boardMetrics.wonDeals}</p>
            </div>
            <div>
              <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-[#8ea0db]">Open pipeline</p>
              <p className="mt-2 text-[20px] font-bold text-white">{boardMetrics.activeDeals}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-[rgba(15,23,42,0.06)] bg-white px-8 py-7 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#ffe8d7] text-[#d4872a]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
            </svg>
          </div>
          <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-[#8a91a3]">Efficiency</p>
          <p className="mt-8 text-[18px] font-semibold tracking-[-0.02em] text-[#000d39]">Avg. Close Time</p>
          <p className="mt-3 text-[52px] font-extrabold tracking-[-0.05em] text-[#000d39]">
            {boardMetrics.averageCloseDays != null ? `${boardMetrics.averageCloseDays} Days` : "--"}
          </p>
          <div className="mt-8 h-2 rounded-full bg-[#edeaf0]">
            <div
              className="h-2 rounded-full bg-[#d97918]"
              style={{ width: `${Math.min(100, Math.max(20, (boardMetrics.averageCloseDays || 0) * 4))}%` }}
            />
          </div>
        </div>

        <div className="rounded-[30px] border border-[rgba(15,23,42,0.06)] bg-white px-8 py-7 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#e6ecff] text-[#4b63ba]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
              <path d="M4 19h16M7 15V9M12 15V5M17 15v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-[13px] font-bold uppercase tracking-[0.16em] text-[#8a91a3]">Conversion</p>
          <p className="mt-8 text-[18px] font-semibold tracking-[-0.02em] text-[#000d39]">Lead to Win</p>
          <p className="mt-3 text-[52px] font-extrabold tracking-[-0.05em] text-[#000d39]">
            {`${boardMetrics.leadToWin.toFixed(1)}%`}
          </p>
          <div className="mt-8 h-2 rounded-full bg-[#edeaf0]">
            <div
              className="h-2 rounded-full bg-[#0d215c]"
              style={{ width: `${Math.min(100, Math.max(10, boardMetrics.leadToWin))}%` }}
            />
          </div>
        </div>
      </section>

      <CrmModal
        open={Boolean(editingLead)}
        onClose={() => setEditingLeadId("")}
        title={editingLead ? `Quick edit: ${editingLead.full_name || editingLead.email || "Lead"}` : "Quick edit"}
        description="Edit the lead's name, phone, email, stage, and note without leaving the board."
      >
        {editingLead ? (
          <form key={`${editingLead.id}:${editingLead.latest_note || ""}`} action={quickEditFormAction} className="space-y-4">
            <input type="hidden" name="leadId" value={editingLead.id} />
            <input type="hidden" name="currentStageId" value={editingLead.current_stage_id || ""} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="noRedirect" value="1" />

            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[#111827]">{editingLead.email || "No email"}</p>
                <p className="text-sm text-[#64748b]">{formatCrmPhoneDisplay(editingLead)}</p>
                <div className="flex flex-wrap gap-2">
                  <CrmBadge tone="accent">{resolveCrmStageDisplayName(editingLead.current_stage) || "No stage"}</CrmBadge>
                </div>
              </div>
              <CrmDialAction
                href={buildCrmDialHref(editingLead)}
                label="Call"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#111827] px-5 text-sm font-semibold text-white transition hover:bg-[#020617]"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Name</span>
                <input
                  name="fullName"
                  type="text"
                  defaultValue={editingLead.full_name || ""}
                  placeholder="Lead name"
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Email</span>
                <input
                  name="email"
                  type="email"
                  defaultValue={editingLead.email || ""}
                  placeholder="lead@example.com"
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Phone</span>
                <input
                  name="phone"
                  type="text"
                  defaultValue={formatCrmPhoneDisplay(editingLead)}
                  placeholder="+51 999 888 777"
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Stage</span>
                <select
                  name="stageId"
                  defaultValue={editingLead.current_stage_id || safeStages[0]?.id || ""}
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                >
                  {safeStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {resolveCrmStageDisplayName(stage)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Note</label>
              <textarea
                name="note"
                rows={5}
                defaultValue={editingLead.latest_note || ""}
                placeholder="Capture what changed, what happened on the call, or what the next operator should do."
                className="w-full rounded-[20px] border border-[rgba(15,23,42,0.1)] bg-white px-3 py-3 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </div>

            {quickEditState?.error && quickEditState?.leadId === editingLead.id ? (
              <div className="rounded-[18px] border border-[rgba(239,68,68,0.16)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-sm text-[#b91c1c]">
                {quickEditState.error}
              </div>
            ) : quickEditState?.success && quickEditState?.leadId === editingLead.id ? (
              <div className="rounded-[18px] border border-[rgba(16,185,129,0.16)] bg-[rgba(16,185,129,0.06)] px-4 py-3 text-sm text-[#047857]">
                {quickEditState.message || "Quick edit saved."}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#64748b]">Phone edits are checked against other CRM leads before saving.</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingLeadId("")}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
                >
                  Cancel
                </button>
                <button
                  disabled={quickEditPending}
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {quickEditPending ? "Saving..." : "Save quick edit"}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </CrmModal>

      <CrmModal
        open={Boolean(editingStage)}
        onClose={() => setEditingStageId("")}
        title={editingStage ? `Stage settings: ${resolveCrmStageDisplayName(editingStage)}` : "Stage settings"}
        description="Rename the stage for the UI, enter the Brevo template IDs manually, exclude specific lead sources, and enable the 24-hour stagnancy follow-up while the stable system key stays unchanged."
      >
        {editingStage ? (
          <StageEditForm
            key={`${editingStage.id}:${editingStage.updated_at || ""}`}
            stage={editingStage}
            returnTo={returnTo}
          />
        ) : null}
      </CrmModal>

      <CrmModal
        open={manualLeadOpen}
        onClose={() => setManualLeadOpen(false)}
        title="Add manual lead"
        description="Creates a CRM lead through the same dedupe and source-tagging path used by inbound ingestion."
      >
        <form action={manualLeadFormAction} className="space-y-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="noRedirect" value="1" />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Name</span>
              <input
                name="fullName"
                type="text"
                placeholder="Lead name"
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Email</span>
              <input
                name="email"
                type="email"
                placeholder="lead@example.com"
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Phone</span>
            <input
              name="phone"
              type="text"
              placeholder="+51 999 888 777"
              className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
            />
          </label>

          <div className="rounded-[20px] border border-[rgba(16,52,116,0.12)] bg-[#eef4ff] px-4 py-3 text-sm text-[#103474]">
            Manual leads are tagged as manual internally. Approved source tags are still merged from the same ingestion path.
          </div>

          {manualLeadState?.error ? (
            <div className="rounded-[18px] border border-[rgba(239,68,68,0.16)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-sm text-[#b91c1c]">
              {manualLeadState.error}
            </div>
          ) : manualLeadState?.success ? (
            <div className="rounded-[18px] border border-[rgba(16,185,129,0.16)] bg-[rgba(16,185,129,0.06)] px-4 py-3 text-sm text-[#047857]">
              {manualLeadState.message || "Manual lead created."}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setManualLeadOpen(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Cancel
            </button>
            <button
              disabled={manualLeadPending}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {manualLeadPending ? "Creating..." : "Add lead"}
            </button>
          </div>
        </form>
      </CrmModal>
    </div>
  );
}
