"use client";

import Link from "next/link";
import { memo, startTransition, useActionState, useMemo, useOptimistic, useState } from "react";
import { createManualCrmLeadAction, moveLeadStageAction, quickEditLeadAction } from "@/app/admin/crm/actions";
import CrmModal from "@/components/crm/crm-modal";
import { CrmBadge, deriveLeadCardTags, formatCrmPhoneDisplay } from "@/components/crm/crm-ui";
import { UNIFIED_COURSE_PRICE } from "@/lib/course-config";

const QUICK_EDIT_INITIAL_STATE = { success: false, error: null, leadId: null };
const MANUAL_LEAD_INITIAL_STATE = { success: false, error: null, leadId: null, message: null };

function cx(...v) { return v.filter(Boolean).join(" "); }
function money(v) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(Number(v || 0)); }
function initials(lead) { return String(lead?.full_name || lead?.email || "Lead").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase() || "").join("") || "LD"; }
function company(lead) { return lead?.source_label || lead?.form_label || lead?.host || lead?.utm_campaign || lead?.source_origin || "CRM lead"; }
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function firstNumeric(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}
function normalizeCourseTypeValue(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  return normalized;
}
function leadPotentialValue(lead) {
  const sourceMetadata = asObject(lead?.source_metadata);
  const sourcePayload = asObject(lead?.source_payload);
  const rawSourceMetadata = asObject(lead?.raw_source_metadata);
  const rawSourcePayload = asObject(lead?.raw_source_payload);
  const explicitPrice = firstNumeric(
    lead?.pre_enrollment?.price_total,
    lead?.price_total,
    sourceMetadata?.price_total,
    sourceMetadata?.priceTotal,
    sourceMetadata?.amount,
    sourceMetadata?.amount_soles,
    sourcePayload?.price_total,
    sourcePayload?.priceTotal,
    sourcePayload?.amount,
    sourcePayload?.amount_soles,
    rawSourceMetadata?.price_total,
    rawSourceMetadata?.priceTotal,
    rawSourceMetadata?.amount,
    rawSourceMetadata?.amount_soles,
    rawSourcePayload?.price_total,
    rawSourcePayload?.priceTotal,
    rawSourcePayload?.amount,
    rawSourcePayload?.amount_soles,
    lead?.approved_revenue_soles
  );
  if (explicitPrice > 0) {
    return explicitPrice === 99 || explicitPrice === 139 ? UNIFIED_COURSE_PRICE : explicitPrice;
  }
  const selectedType = normalizeCourseTypeValue(
    lead?.pre_enrollment?.selected_course_type ||
    sourceMetadata?.selected_course_type ||
    sourceMetadata?.course_type ||
    sourceMetadata?.courseType ||
    sourcePayload?.selected_course_type ||
    sourcePayload?.course_type ||
    sourcePayload?.courseType ||
    rawSourceMetadata?.selected_course_type ||
    rawSourceMetadata?.course_type ||
    rawSourceMetadata?.courseType ||
    rawSourcePayload?.selected_course_type ||
    rawSourcePayload?.course_type ||
    rawSourcePayload?.courseType
  );
  if (selectedType) return UNIFIED_COURSE_PRICE;
  return UNIFIED_COURSE_PRICE;
}
function age(value) {
  const t = new Date(value || "").getTime();
  if (!Number.isFinite(t)) return "Recently updated";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}
function tone(stage, i) {
  if (stage?.is_won || stage?.pipeline_state === "won") return { dot: "bg-[#3b5cb8]", badge: "bg-[#dbe5ff] text-[#1f3f97]", column: "bg-[#eef3ff]" };
  if (stage?.is_lost || stage?.pipeline_state === "lost") return { dot: "bg-[#d97706]", badge: "bg-[#ffe8cc] text-[#b45309]", column: "bg-[#fffaf2]" };
  return [
    { dot: "bg-[#7d8798]", badge: "bg-[#ece9f3] text-[#5f6372]", column: "" },
    { dot: "bg-[#69758a]", badge: "bg-[#ece9f3] text-[#5f6372]", column: "" },
    { dot: "bg-[#4b2a0b]", badge: "bg-[#ece9f3] text-[#5f6372]", column: "" },
  ][i % 3];
}
function moveLeadInArray(leads, leadId, stageId, stageById) {
  const now = new Date().toISOString();
  return leads.map((lead) => lead.id !== leadId ? lead : { ...lead, current_stage_id: stageId, current_stage: stageById.get(stageId) || null, updated_at: now });
}

const LeadCard = memo(function LeadCard({ lead, onDragStart, onDragEnd, onQuickEdit }) {
  const primaryTag = deriveLeadCardTags(lead)[0];
  return (
    <article
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      onClick={() => onQuickEdit(lead.id)}
      className={cx(
        "cursor-pointer rounded-[28px] border border-[rgba(15,23,42,0.06)] bg-white p-6 shadow-[0_18px_34px_rgba(15,23,42,0.06)] transition hover:-translate-y-[2px] hover:shadow-[0_22px_40px_rgba(15,23,42,0.08)]",
        lead?.lead_status === "won" ? "border-l-4 border-l-[#d97706]" : ""
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="truncate text-[16px] font-bold tracking-[-0.03em] text-[#000d39]">{lead.full_name || lead.email || "Unnamed lead"}</h4>
          <p className="mt-2.5 text-[13px] text-[#535865]">{company(lead)}</p>
        </div>
        <CrmBadge tone="warning" className="shrink-0 border-0 bg-[#ffd8bf] text-[#d77315]">
          {lead.lead_status === "won" ? "Closed" : formatCrmPhoneDisplay(lead) === "No phone" ? "No phone" : "Open"}
        </CrmBadge>
      </div>
      {primaryTag ? <div className="mt-4 rounded-[14px] bg-[#eef3ff] px-3 py-3 text-[12px] font-semibold text-[#586579]">{primaryTag}</div> : null}
      <div className="mt-4 flex items-center justify-between border-t border-[rgba(15,23,42,0.06)] pt-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef1f7] text-[11px] font-bold text-[#586579]">{initials(lead)}</div>
        <div className="text-[12px] font-medium text-[#7d8798]">{age(lead?.updated_at || lead?.last_interaction_at || lead?.created_at)}</div>
      </div>
    </article>
  );
});

const StageColumn = memo(function StageColumn({ stage, stageIndex, leads, isDropTarget, onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, onQuickEdit }) {
  const t = tone(stage, stageIndex);
  return (
    <section onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={cx("w-[320px] shrink-0 rounded-[28px] p-2 transition", t.column, isDropTarget && "bg-[#eff4ff]")}>
      <div className="mb-4 flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <span className={cx("h-3 w-3 rounded-full", t.dot)} />
          <h3 className="text-[16px] font-bold tracking-[-0.03em] text-[#000d39]">{stage.name}</h3>
          <span className={cx("rounded-full px-3 py-1 text-[11px] font-bold", t.badge)}>{leads.length}</span>
        </div>
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#8e95a3] transition hover:bg-white hover:text-[#000d39]" aria-label={`Stage options for ${stage.name}`}>...</button>
      </div>
      <div className="space-y-4">
        {leads.map((lead) => <LeadCard key={lead.id} lead={lead} onDragStart={onDragStart} onDragEnd={onDragEnd} onQuickEdit={onQuickEdit} />)}
        {!leads.length ? <div className="rounded-[24px] border border-dashed border-[rgba(15,23,42,0.12)] bg-white px-5 py-12 text-center text-[13px] text-[#7d8798]">Drop a lead here to move it into this stage.</div> : null}
      </div>
    </section>
  );
});

function FiltersPanel({ search, leadStatus, sourceType }) {
  return (
    <details className="group relative">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 rounded-[20px] bg-[#ece9f3] px-6 text-[16px] font-semibold text-[#1b1b1f] transition hover:bg-[#e6e2ed]">Filters</summary>
      <div className="absolute right-0 top-[calc(100%+12px)] z-20 w-[320px] rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_24px_50px_rgba(15,23,42,0.08)]">
        <form method="get" className="space-y-4">
          <input type="search" name="q" defaultValue={search} placeholder="Search campaign leads..." className="w-full rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-[14px] text-[#111827] outline-none focus:border-[#103474]" />
          <select name="status" defaultValue={leadStatus} className="w-full rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-[14px] text-[#111827] outline-none focus:border-[#103474]">
            <option value="">All statuses</option><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option>
          </select>
          <select name="source" defaultValue={sourceType} className="w-full rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-[14px] text-[#111827] outline-none focus:border-[#103474]">
            <option value="">All sources</option><option value="pre_enrollment">Virtual classroom</option><option value="meta">Meta</option><option value="formspree">Formspree</option><option value="manual">Manual</option><option value="other">Other</option>
          </select>
          <div className="flex gap-2">
            <button className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-[18px] bg-[#000d39] px-4 text-[14px] font-semibold text-white transition hover:bg-[#0d215c]">Apply</button>
            <Link href="/admin/crm/kanban" className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 text-[14px] font-semibold text-[#111827] transition hover:bg-[#f8fbff]">Clear</Link>
          </div>
        </form>
      </div>
    </details>
  );
}

function BentoMetrics({ leads }) {
  const totalPipelineValue = leads.reduce((s, l) => s + leadPotentialValue(l), 0);
  const activeDeals = leads.filter((l) => l?.lead_status === "open").length;
  const wonDeals = leads.filter((l) => l?.lead_status === "won").length;
  const closeDurations = leads.filter((l) => l?.won_at && l?.created_at).map((l) => {
    const a = new Date(l.created_at).getTime(); const b = new Date(l.won_at).getTime();
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? (b - a) / 86400000 : null;
  }).filter(Boolean);
  const averageCloseDays = closeDurations.length ? Math.max(1, Math.round(closeDurations.reduce((s, v) => s + v, 0) / closeDurations.length)) : null;
  const leadToWin = leads.length ? (wonDeals / leads.length) * 100 : 0;
  const closeProgress = averageCloseDays ? Math.min(100, Math.round((14 / averageCloseDays) * 100)) : 0;
  const conversionProgress = Math.min(100, Math.round(leadToWin));

  return (
    <section className="grid gap-6 md:grid-cols-4">
      <div className="relative overflow-hidden rounded-[34px] bg-[#0d215c] p-8 text-white shadow-[0_28px_60px_rgba(13,33,92,0.22)] md:col-span-2">
        <p className="text-[14px] font-semibold text-[#9fb2e5]">Total Pipeline Value</p>
        <p className="mt-3 text-[46px] font-extrabold tracking-[-0.06em]">{money(totalPipelineValue)}</p>
        <div className="mt-10 flex gap-10">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9fb2e5]">Open Leads</p><p className="mt-2 text-[18px] font-bold">{activeDeals}</p></div>
          <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9fb2e5]">Won Leads</p><p className="mt-2 text-[18px] font-bold">{wonDeals}</p></div>
        </div>
        <div className="absolute right-8 top-8 text-[40px] font-bold text-white/20">$</div>
      </div>
      <div className="rounded-[34px] border border-[rgba(15,23,42,0.08)] bg-[#f4f2f8] p-6">
        <div className="mb-8 flex items-center justify-between"><span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#ffd8bf] text-[22px] font-bold text-[#d77315]">+</span><span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7d8798]">Efficiency</span></div>
        <h3 className="text-[15px] font-bold text-[#1b1b1f]">Avg. Close Time</h3>
        <p className="mt-2 text-[36px] font-extrabold tracking-[-0.05em] text-[#000d39]">{averageCloseDays ? `${averageCloseDays} Days` : "--"}</p>
        <div className="mt-6 h-2 rounded-full bg-[#dcd7e4]"><div className="h-2 rounded-full bg-[#d77315]" style={{ width: `${closeProgress}%` }} /></div>
      </div>
      <div className="rounded-[34px] border border-[rgba(15,23,42,0.08)] bg-[#f4f2f8] p-6">
        <div className="mb-8 flex items-center justify-between"><span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#dce1ff] text-[20px] font-bold text-[#0d215c]">%</span><span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7d8798]">Conversion</span></div>
        <h3 className="text-[15px] font-bold text-[#1b1b1f]">Lead to Win</h3>
        <p className="mt-2 text-[36px] font-extrabold tracking-[-0.05em] text-[#000d39]">{leadToWin.toFixed(1)}%</p>
        <div className="mt-6 h-2 rounded-full bg-[#dcd7e4]"><div className="h-2 rounded-full bg-[#0d215c]" style={{ width: `${conversionProgress}%` }} /></div>
      </div>
    </section>
  );
}

export default function CrmKanbanBoard({ searchParams = {}, stages, leads, search = "", leadStatus = "", sourceType = "", returnTo }) {
  const [dragLeadId, setDragLeadId] = useState("");
  const [dropStageId, setDropStageId] = useState("");
  const [editingLeadId, setEditingLeadId] = useState("");
  const [manualLeadOpen, setManualLeadOpen] = useState(false);
  const [boardNotice, setBoardNotice] = useState("");
  const [quickEditState, quickEditFormAction, quickEditPending] = useActionState(quickEditLeadAction, QUICK_EDIT_INITIAL_STATE);
  const [manualLeadState, manualLeadFormAction, manualLeadPending] = useActionState(createManualCrmLeadAction, MANUAL_LEAD_INITIAL_STATE);
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
    if (!quickEditState?.success || !quickEditState?.lead?.id) {
      return boardLeads;
    }

    return boardLeads.map((lead) =>
      lead.id === quickEditState.lead.id
        ? {
            ...lead,
            ...quickEditState.lead,
            latest_note:
              quickEditState.latestNote != null
                ? quickEditState.latestNote
                : quickEditState.lead.latest_note || lead.latest_note || "",
          }
        : lead
    );
  }, [boardLeads, quickEditState]);
  const grouped = useMemo(() => {
    const fallback = safeStages?.[0]?.id || null;
    const buckets = new Map(safeStages.map((stage) => [stage.id, []]));
    for (const lead of hydratedBoardLeads) {
      const stageId = lead?.current_stage_id || fallback;
      if (!buckets.has(stageId)) buckets.set(stageId, []);
      buckets.get(stageId).push(lead);
    }
    return buckets;
  }, [hydratedBoardLeads, safeStages]);
  const editingLead = useMemo(() => hydratedBoardLeads.find((lead) => lead.id === editingLeadId) || null, [editingLeadId, hydratedBoardLeads]);
  const successNotice = quickEditState?.success ? quickEditState.message || "Quick edit saved." : manualLeadState?.success ? manualLeadState.message || "Manual lead created." : "";

  const handleDrop = (event, stageId) => {
    event.preventDefault();
    const leadId = event.dataTransfer.getData("text/plain") || dragLeadId;
    if (!leadId) return;
    const previousLeads = boardLeads;
    setDropStageId(stageId);
    applyBoardLeadMutation({ type: "move", leadId, stageId });
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
        applyBoardLeadMutation({ type: "replace", leads: previousLeads });
        setBoardNotice("Stage move failed. The board was restored.");
      }
    });
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#fff0e6] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#d77315]"><span className="h-2 w-2 rounded-full bg-[#d77315]" />Active Pipeline</div>
          <h1 className="text-[40px] font-extrabold tracking-[-0.06em] text-[#000d39]">Campaign Pipeline</h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-8 text-[#4e5563]">Manage your lead journey through the sales funnel with real-time analytics and score tracking.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <FiltersPanel search={search} leadStatus={leadStatus} sourceType={sourceType} />
          <button type="button" onClick={() => setManualLeadOpen(true)} className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-[20px] bg-[#000d39] px-8 text-[16px] font-bold text-white transition hover:bg-[#0d215c]">+ Add Lead</button>
        </div>
      </section>

      {boardNotice || successNotice ? <div className="rounded-[20px] border border-[rgba(16,52,116,0.12)] bg-[#eef4ff] px-4 py-3 text-sm font-medium text-[#103474]">{boardNotice || successNotice}</div> : null}

      <section className="overflow-x-auto pb-6">
        <div className="flex min-w-max items-start gap-8">
          {safeStages.map((stage, index) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              stageIndex={index}
              leads={grouped.get(stage.id) || []}
              isDropTarget={dropStageId === stage.id}
              onDragOver={(e) => { e.preventDefault(); setDropStageId(stage.id); }}
              onDragLeave={() => setDropStageId((current) => current === stage.id ? "" : current)}
              onDrop={(e) => handleDrop(e, stage.id)}
              onDragStart={(e, leadId) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", leadId); setDragLeadId(leadId); }}
              onDragEnd={() => { setDragLeadId(""); setDropStageId(""); }}
              onQuickEdit={setEditingLeadId}
            />
          ))}
        </div>
      </section>

      <BentoMetrics leads={hydratedBoardLeads} />

      <CrmModal open={Boolean(editingLead)} onClose={() => setEditingLeadId("")} title={editingLead ? `Quick edit: ${editingLead.full_name || editingLead.email || "Lead"}` : "Quick edit"} description="Edit the lead's name, phone, email, stage, and note without leaving the board.">
        {editingLead ? (
          <form key={`${editingLead.id}:${editingLead.latest_note || ""}`} action={quickEditFormAction} className="space-y-4">
            <input type="hidden" name="leadId" value={editingLead.id} />
            <input type="hidden" name="currentStageId" value={editingLead.current_stage_id || ""} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="noRedirect" value="1" />
            <div className="grid gap-3 md:grid-cols-2">
              <input name="fullName" type="text" defaultValue={editingLead.full_name || ""} placeholder="Lead name" className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none" />
              <input name="email" type="email" defaultValue={editingLead.email || ""} placeholder="lead@example.com" className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input name="phone" type="text" defaultValue={formatCrmPhoneDisplay(editingLead)} placeholder="+51 999 888 777" className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none" />
              <select name="stageId" defaultValue={editingLead.current_stage_id || safeStages[0]?.id || ""} className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none">
                {safeStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </div>
            <textarea name="note" rows={5} defaultValue={editingLead.latest_note || ""} placeholder="Capture what changed or what the next operator should do." className="w-full rounded-[20px] border border-[rgba(15,23,42,0.1)] bg-white px-3 py-3 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none" />
            {quickEditState?.error ? <div className="rounded-[18px] border border-[rgba(239,68,68,0.16)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-sm text-[#b91c1c]">{quickEditState.error}</div> : null}
            <div className="flex flex-wrap justify-between gap-2">
              <Link href={`/admin/crm/leads/${editingLead.id}`} className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#103474] transition hover:bg-[#f8fbff]">Open detail</Link>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditingLeadId("")} className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]">Cancel</button>
                <button disabled={quickEditPending} className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a] disabled:opacity-60">{quickEditPending ? "Saving..." : "Save quick edit"}</button>
              </div>
            </div>
          </form>
        ) : null}
      </CrmModal>

      <CrmModal open={manualLeadOpen} onClose={() => setManualLeadOpen(false)} title="Add manual lead" description="Creates a CRM lead through the same dedupe and source-tagging path used by inbound ingestion.">
        <form action={manualLeadFormAction} className="space-y-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="noRedirect" value="1" />
          <div className="grid gap-3 md:grid-cols-2">
            <input name="fullName" type="text" placeholder="Lead name" className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none" />
            <input name="email" type="email" placeholder="lead@example.com" className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none" />
          </div>
          <input name="phone" type="text" placeholder="+51 999 888 777" className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none" />
          <div className="rounded-[20px] border border-[rgba(16,52,116,0.12)] bg-[#eef4ff] px-4 py-3 text-sm text-[#103474]">Manual leads are tagged as manual internally. Approved source tags are still merged from the same ingestion path.</div>
          {manualLeadState?.error ? <div className="rounded-[18px] border border-[rgba(239,68,68,0.16)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-sm text-[#b91c1c]">{manualLeadState.error}</div> : manualLeadState?.success ? <div className="rounded-[18px] border border-[rgba(16,185,129,0.16)] bg-[rgba(16,185,129,0.06)] px-4 py-3 text-sm text-[#047857]">{manualLeadState.message || "Manual lead created."}</div> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setManualLeadOpen(false)} className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]">Cancel</button>
            <button disabled={manualLeadPending} className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a] disabled:opacity-60">{manualLeadPending ? "Creating..." : "Add lead"}</button>
          </div>
        </form>
      </CrmModal>
    </div>
  );
}
