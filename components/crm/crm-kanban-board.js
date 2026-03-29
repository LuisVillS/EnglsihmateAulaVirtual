"use client";

import Link from "next/link";
import { memo, startTransition, useActionState, useMemo, useRef, useState } from "react";
import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import { createManualCrmLeadAction, moveLeadStageAction, quickEditLeadAction } from "@/app/admin/crm/actions";
import CrmDialAction from "@/components/crm/crm-dial-action";
import CrmModal from "@/components/crm/crm-modal";
import {
  CrmBadge,
  CrmTagRow,
  buildCrmDialHref,
  deriveLeadCardTags,
  formatCrmDateTime,
  formatCrmPhoneDisplay,
} from "@/components/crm/crm-ui";

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
  return (
    <article
      draggable
      onDragStart={(event) => onDragStart(event, lead.id)}
      onDragEnd={onDragEnd}
      className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fbfcff] p-4 shadow-[0_12px_24px_rgba(15,23,42,0.04)] transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#111827]">{lead.full_name || lead.email || "Unnamed lead"}</p>
          <p className="mt-1 text-xs text-[#64748b]">{lead.email || "No email"}</p>
          <p className="mt-1 text-xs text-[#64748b]">{formatCrmPhoneDisplay(lead)}</p>
        </div>
      </div>

      <CrmTagRow tags={deriveLeadCardTags(lead)} className="mt-3" />

      <p className="mt-3 text-xs text-[#64748b]">
        Updated {formatCrmDateTime(lead.updated_at)} | Next action{" "}
        {lead.next_action_at ? formatCrmDateTime(lead.next_action_at) : "now"}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onQuickEdit(lead.id)}
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
        >
          Quick edit
        </button>
        <CrmDialAction
          href={buildCrmDialHref(lead)}
          label="Call"
          className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[#111827] px-3 text-xs font-semibold text-white transition hover:bg-[#020617]"
          disabledClassName="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#94a3b8]"
        />
        <Link
          href={`/admin/crm/leads/${lead.id}`}
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#103474] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
        >
          Open detail
        </Link>
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
      className={`w-[20rem] shrink-0 rounded-[24px] border p-4 shadow-[0_18px_34px_rgba(15,23,42,0.05)] transition ${
        isDropTarget ? "border-[#103474] bg-[#eff4ff]" : "border-[rgba(15,23,42,0.08)] bg-white"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#111827]">{stage.name}</p>
          <p className="text-xs text-[#64748b]">
            {stage.pipeline_state} {stage.is_active ? "| active" : "| archived"}
          </p>
        </div>
        <CrmBadge
          tone={
            stage.pipeline_state === "won" ? "success" : stage.pipeline_state === "lost" ? "danger" : "accent"
          }
        >
          {leads.length}
        </CrmBadge>
      </div>

      <div className="space-y-3">
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
          <div className="rounded-[18px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#64748b]">
            Drop a lead here to move it into this stage.
          </div>
        ) : null}
      </div>
    </section>
  );
});

export default function CrmKanbanBoard({ stages, leads, returnTo }) {
  const scrollRef = useRef(null);
  const [dragLeadId, setDragLeadId] = useState("");
  const [dropStageId, setDropStageId] = useState("");
  const [editingLeadId, setEditingLeadId] = useState("");
  const [manualLeadOpen, setManualLeadOpen] = useState(false);
  const [boardLeads, setBoardLeads] = useState(leads || []);
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

  const grouped = useMemo(() => {
    const fallbackStageId = safeStages?.[0]?.id || null;
    const stageBuckets = new Map(safeStages.map((stage) => [stage.id, []]));

    for (const lead of boardLeads) {
      const stageId = lead?.current_stage_id || fallbackStageId;
      if (!stageBuckets.has(stageId)) {
        stageBuckets.set(stageId, []);
      }
      stageBuckets.get(stageId).push(lead);
    }

    return stageBuckets;
  }, [boardLeads, safeStages]);

  const editingLead = useMemo(
    () => boardLeads.find((lead) => lead.id === editingLeadId) || null,
    [editingLeadId, boardLeads]
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
    setBoardLeads((current) => moveLeadInArray(current, leadId, stageId, stageById));
    setBoardNotice("Saving board move...");
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
        setBoardLeads(previousLeads);
        setBoardNotice("Stage move failed. The board was restored.");
      }
    });
  };

  const handleDragEnd = () => {
    setDragLeadId("");
    setDropStageId("");
  };

  return (
    <div className="space-y-4">
      <AdminCard className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <AdminSectionHeader
            eyebrow="Board"
            title="Kanban pipeline"
            description="Drag and drop stays primary. The board keeps one horizontal row, and the native horizontal scrollbar handles sideways navigation."
            meta={<CrmBadge tone="accent">{boardLeads.length} visible lead(s)</CrmBadge>}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setManualLeadOpen(true)}
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Add manual lead
            </button>
          </div>
        </div>
        <p className="text-sm text-[#64748b]">
          If the viewport is narrow, scroll sideways instead of wrapping the pipeline into another row.
        </p>
        {boardNotice || successNotice ? (
          <div className="rounded-[18px] border border-[rgba(16,52,116,0.12)] bg-[#eef4ff] px-4 py-3 text-sm font-medium text-[#103474]">
            {boardNotice || successNotice}
          </div>
        ) : null}
      </AdminCard>

      <div className="overflow-x-auto pb-3" ref={scrollRef}>
        <div className="flex min-w-max items-start gap-4">
          {safeStages.map((stage) => {
            const stageLeads = grouped.get(stage.id) || [];
            const isDropTarget = dropStageId === stage.id;

            return (
              <StageColumn
                key={stage.id}
                stage={stage}
                leads={stageLeads}
                isDropTarget={isDropTarget}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropStageId(stage.id);
                }}
                onDragLeave={() => {
                  setDropStageId((current) => (current === stage.id ? "" : current));
                }}
                onDrop={(event) => handleDrop(event, stage.id)}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onQuickEdit={setEditingLeadId}
              />
            );
          })}
        </div>
      </div>

      <CrmModal
        open={Boolean(editingLead)}
        onClose={() => setEditingLeadId("")}
        title={editingLead ? `Quick edit: ${editingLead.full_name || editingLead.email || "Lead"}` : "Quick edit"}
        description="Edit the lead's name, phone, email, stage, and note without leaving the board."
      >
        {editingLead ? (
          <form action={quickEditFormAction} className="space-y-4">
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
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
                Note
              </label>
              <textarea
                name="note"
                rows={5}
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
              <p className="text-xs text-[#64748b]">
                Phone edits are checked against other CRM leads before saving.
              </p>
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
