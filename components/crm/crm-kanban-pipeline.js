"use client";

import Link from "next/link";
import { memo, startTransition, useActionState, useMemo, useOptimistic, useState } from "react";
import {
  createManualCrmLeadAction,
  moveLeadStageAction,
  quickEditLeadAction,
} from "@/app/admin/crm/actions";
import CrmDialAction from "@/components/crm/crm-dial-action";
import CrmModal from "@/components/crm/crm-modal";
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
  if (String(stage?.stage_key || "").toLowerCase().includes("attempt")) return "bg-[#52607a]";
  return "bg-[#7d8798]";
}

function computeBoardMetrics(leads) {
  const safeLeads = Array.isArray(leads) ? leads : [];
  const openLeads = safeLeads.filter((lead) => lead?.lead_status === "open");
  const wonLeads = safeLeads.filter((lead) => lead?.lead_status === "won");
  const totalPipelineValue = safeLeads.reduce(
    (sum, lead) => sum + Number(lead?.approved_revenue_soles || 0),
    0
  );
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
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  onQuickEdit,
}) {
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
          <h3 className="text-[18px] font-bold tracking-[-0.03em] text-[#000d39]">{stage.name}</h3>
          <span className="rounded-full bg-[#ece8ef] px-2.5 py-1 text-[11px] font-bold text-[#666d7a]">
            {leads.length}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#757681] transition hover:bg-white"
          aria-label={`${stage.name} options`}
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

function FilterPanel({ searchParams }) {
  return (
    <form
      method="get"
      className="grid gap-3 rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white px-5 py-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)] lg:grid-cols-[1.15fr_0.8fr_0.8fr_auto]"
    >
      <input
        type="search"
        name="q"
        defaultValue={searchParams?.q?.toString() || ""}
        placeholder="Search name, email, phone, or source"
        className="w-full rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[#fbfbfe] px-4 py-3 text-sm text-[#0f172a] outline-none transition focus:border-[#103474]/20"
      />
      <select
        name="status"
        defaultValue={searchParams?.status?.toString() || ""}
        className="w-full rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[#fbfbfe] px-4 py-3 text-sm text-[#0f172a] outline-none transition focus:border-[#103474]/20"
      >
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </select>
      <select
        name="source"
        defaultValue={searchParams?.source?.toString() || ""}
        className="w-full rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[#fbfbfe] px-4 py-3 text-sm text-[#0f172a] outline-none transition focus:border-[#103474]/20"
      >
        <option value="">All sources</option>
        <option value="pre_enrollment">Virtual classroom</option>
        <option value="meta">Meta</option>
        <option value="formspree">Formspree</option>
        <option value="manual">Manual</option>
        <option value="other">Other</option>
      </select>
      <div className="flex gap-2">
        <button className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-[#000d39] px-5 text-sm font-semibold text-white transition hover:opacity-95">
          Apply
        </button>
        <Link
          href="/admin/crm/kanban"
          className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-5 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}

export default function CrmKanbanPipeline({ stages, leads, returnTo, searchParams = {} }) {
  const [dragLeadId, setDragLeadId] = useState("");
  const [dropStageId, setDropStageId] = useState("");
  const [editingLeadId, setEditingLeadId] = useState("");
  const [manualLeadOpen, setManualLeadOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(searchParams?.q || searchParams?.status || searchParams?.source)
  );
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
  const boardMetrics = useMemo(() => computeBoardMetrics(hydratedBoardLeads), [hydratedBoardLeads]);

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

  const successNotice =
    quickEditState?.success && quickEditState?.leadId
      ? quickEditState.message || "Quick edit saved."
      : manualLeadState?.success
        ? manualLeadState.message || "Manual lead created."
        : "";

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
          <button
            type="button"
            onClick={() => setFiltersOpen((current) => !current)}
            className="inline-flex min-h-[58px] items-center justify-center gap-3 rounded-[20px] bg-[#ece8ef] px-7 text-[16px] font-bold text-[#2a2f39] transition hover:bg-[#e1dce7]"
          >
            <FilterIcon />
            Filters
          </button>
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

      {filtersOpen ? <FilterPanel searchParams={searchParams} /> : null}
      <CrmNotice searchParams={searchParams} />

      <section className="overflow-x-auto pb-8">
        <div className="flex min-w-max items-start gap-6">
          {safeStages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              leads={grouped.get(stage.id) || []}
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
              <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-[#8ea0db]">Active deals</p>
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
                  <CrmBadge tone="accent">{editingLead.current_stage?.name || "No stage"}</CrmBadge>
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
                      {stage.name}
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
