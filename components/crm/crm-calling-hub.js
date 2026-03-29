import Link from "next/link";
import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import {
  claimNextLeadAction,
  leaveCallingCampaignAction,
  submitCallOutcomeAction,
} from "@/app/admin/crm/actions";
import CrmDialAction from "@/components/crm/crm-dial-action";
import CrmHistoryDeleteButton from "@/components/crm/crm-history-delete-button";
import {
  buildCrmDialHref,
  CrmBadge,
  CrmTagRow,
  formatCallOutcomeLabel,
  formatCrmDateTime,
  formatCurrency,
  formatCrmPhoneDisplay,
  formatLeadSourceLabel,
  formatPreEnrollmentStatus,
  deriveLeadSourceTags,
  resolveLeadSourceValue,
  resolveToneByLeadSource,
  resolveToneByStatus,
} from "@/components/crm/crm-ui";

const CALL_OUTCOMES = [
  "attempted",
  "connected",
  "no_answer",
  "voicemail",
  "callback_requested",
  "wrong_number",
  "not_interested",
];

function buildCampaignHref({ campaignKey = "", stageId = "", sourceOrigin = "", leadId = "" } = {}) {
  const params = new URLSearchParams();
  if (campaignKey) {
    params.set("campaign", campaignKey);
  }
  if (stageId) {
    params.set("stage", stageId);
  }
  if (sourceOrigin) {
    params.set("source", sourceOrigin);
  }
  if (leadId) {
    params.set("lead", leadId);
  }
  return `/admin/crm/callinghub${params.toString() ? `?${params.toString()}` : ""}`;
}

function CampaignStartScreen({ stages = [], sourceOptions = [], selectedStageId = "", selectedSourceOrigin = "" }) {
  return (
    <AdminCard className="overflow-hidden border border-[#d7e4ff] bg-[linear-gradient(135deg,#07111f_0%,#0f2d68_52%,#1d4ed8_100%)] text-white shadow-[0_24px_80px_rgba(17,24,39,0.28)]">
      <div className="grid gap-6 p-6 xl:grid-cols-[1.1fr_0.9fr] xl:p-8">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80">
            Start Campaign
          </div>
          <div className="space-y-3">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Pick a stage and source, then open the next lead directly into the calling workspace.
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-white/76 sm:text-base">
              The queue stays server-controlled, `tel:` remains the only call launcher, and the next eligible lead opens
              right after you start.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/14 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
              {stages.find((stage) => stage.id === selectedStageId)?.name || "All stages"}
            </span>
            <span className="rounded-full border border-white/14 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
              {sourceOptions.find((option) => option.value === selectedSourceOrigin)?.label || "All sources"}
            </span>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/12 bg-white/10 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/58">
            How it works
          </p>
          <div className="mt-4 space-y-3 text-sm leading-6 text-white/78">
            <p>Select a pipeline stage and a lead source.</p>
            <p>The next eligible lead opens in the workspace automatically.</p>
            <p>Use Call, Save, Save and Next, or Leave Campaign while staying in the queue.</p>
          </div>
        </div>
      </div>

      <form action={claimNextLeadAction} className="space-y-4 border-t border-white/10 p-6 xl:p-8">
        <div className="grid gap-4 xl:grid-cols-2">
          <label className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/58">
              Pipeline stage
            </span>
            <select
              name="stageId"
              defaultValue={selectedStageId}
              className="w-full rounded-[18px] border border-white/14 bg-white px-4 py-3 text-sm font-semibold text-[#0f172a] focus:border-white focus:outline-none"
            >
              <option value="">All stages</option>
              {(stages || []).map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name} ({stage.leadCount || 0})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/58">
              Lead source
            </span>
            <select
              name="sourceOrigin"
              defaultValue={selectedSourceOrigin}
              className="w-full rounded-[18px] border border-white/14 bg-white px-4 py-3 text-sm font-semibold text-[#0f172a] focus:border-white focus:outline-none"
            >
              {(sourceOptions || []).map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label} ({option.leadCount || 0})
                </option>
              ))}
            </select>
          </label>
        </div>

        <button className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-[#103474] transition hover:bg-[#e6eefc]">
          Start Campaign
        </button>
      </form>
    </AdminCard>
  );
}

function LeadFactCard({ label, value, detail }) {
  return (
    <div className="rounded-[20px] border border-[rgba(15,23,42,0.06)] bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[#111827]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[#64748b]">{detail}</p> : null}
    </div>
  );
}

function InteractionItem({ entry, leadId, returnTo }) {
  return (
    <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CrmBadge tone="accent">{entry.interaction_kind}</CrmBadge>
          {entry.call_outcome ? (
            <CrmBadge tone="warning">{formatCallOutcomeLabel(entry.call_outcome)}</CrmBadge>
          ) : null}
          <CrmBadge tone="neutral">{formatCrmDateTime(entry.created_at)}</CrmBadge>
        </div>
        <CrmHistoryDeleteButton interactionId={entry.id} leadId={leadId} returnTo={returnTo} />
      </div>
      {entry.summary ? <p className="mt-3 text-sm font-semibold text-[#111827]">{entry.summary}</p> : null}
      {entry.notes ? <p className="mt-2 text-sm leading-6 text-[#475569]">{entry.notes}</p> : null}
    </div>
  );
}

function ActiveWorkspace({
  activeLead,
  activeLeadInteractions,
  selectedStage,
  selectedSource,
  selectedStageId,
  selectedSourceOrigin,
  activeLeadHref,
  activeLeadSource,
}) {
  const historyReturnTo = buildCampaignHref({
    stageId: selectedStageId,
    sourceOrigin: selectedSourceOrigin,
    leadId: activeLead.id,
  });

  return (
    <AdminCard className="space-y-4 overflow-hidden border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,#f9fbff_0%,#eef4ff_100%)] p-5 shadow-[0_20px_50px_rgba(8,15,35,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7c8ca8]">
            Campaign active
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] sm:text-3xl">
            {selectedStage?.name || "Calling workspace"}
          </h2>
          <p className="text-sm text-[#475569]">
            {selectedSource?.label || "All sources"} | {selectedStageId ? "Filtered stage" : "All stages"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={leaveCallingCampaignAction}>
            <input type="hidden" name="leadId" value={activeLead.id} />
            <input type="hidden" name="stageId" value={selectedStageId} />
            <input type="hidden" name="sourceOrigin" value={selectedSourceOrigin} />
            <button className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.08)] px-5 text-sm font-semibold text-[#b45309] transition hover:bg-[rgba(245,158,11,0.12)]">
              Leave Campaign
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-4">
          <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
                    Lead
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#111827]">
                    {activeLead.full_name || activeLead.email || "Unnamed lead"}
                  </h3>
                  <p className="mt-2 text-sm text-[#475569]">{activeLead.email || "No email"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CrmBadge tone={resolveToneByStatus(activeLead.lead_status)}>
                    {activeLead.lead_status}
                  </CrmBadge>
                  <CrmBadge tone="neutral">
                    {activeLead.current_stage?.name || "No stage"}
                  </CrmBadge>
                  <CrmBadge tone={resolveToneByLeadSource(activeLeadSource)}>
                    {formatLeadSourceLabel(activeLeadSource)}
                  </CrmBadge>
                  <CrmBadge tone="neutral">
                    {formatPreEnrollmentStatus(activeLead.current_pre_enrollment_status)}
                  </CrmBadge>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <LeadFactCard
                  label="Revenue"
                  value={formatCurrency(activeLead.approved_revenue_soles || 0)}
                />
                <LeadFactCard
                  label="Next action"
                  value={activeLead.next_action_at ? formatCrmDateTime(activeLead.next_action_at) : "Now"}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr]">
              <LeadFactCard
                label="Contact"
                value={formatCrmPhoneDisplay(activeLead)}
                detail={`Updated ${formatCrmDateTime(activeLead.updated_at)}`}
              />
              <LeadFactCard
                label="Source"
                value={activeLead.source_label || activeLead.source_type || "Unknown source"}
                detail={formatLeadSourceLabel(activeLeadSource)}
              />
            </div>

            <CrmTagRow
              tags={deriveLeadSourceTags(activeLead)}
              className="mt-4"
            />

            <div className="mt-5 flex flex-wrap gap-2">
              <CrmDialAction
                href={activeLeadHref}
                label="Call"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#111827] px-5 text-sm font-semibold text-white transition hover:bg-[#020617]"
              />
              <Link
                href={`/admin/crm/leads/${activeLead.id}`}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-5 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
              >
                Open lead detail
              </Link>
            </div>
          </div>

          <form
            action={submitCallOutcomeAction}
            className="space-y-4 rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-5"
          >
            <input type="hidden" name="leadId" value={activeLead.id} />
            <input
              type="hidden"
              name="returnTo"
              value={buildCampaignHref({ stageId: selectedStageId, sourceOrigin: selectedSourceOrigin, leadId: activeLead.id })}
            />
            <input type="hidden" name="stageId" value={selectedStageId} />
            <input type="hidden" name="sourceOrigin" value={selectedSourceOrigin} />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
                  Disposition
                </label>
                <select
                  name="callOutcome"
                  defaultValue={activeLead.last_call_outcome || "attempted"}
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                >
                  {CALL_OUTCOMES.map((option) => (
                    <option key={option} value={option}>
                      {formatCallOutcomeLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
                  Next action at
                </label>
                <input
                  type="datetime-local"
                  name="nextActionAt"
                  className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">
                Notes
              </label>
              <textarea
                name="note"
                rows={7}
                placeholder="Capture context, objections, next step, and anything the next operator should see."
                className="w-full rounded-[22px] border border-[rgba(15,23,42,0.1)] bg-white px-4 py-3 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="actionMode"
                value="save"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-5 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
              >
                Save
              </button>
              <button
                type="submit"
                name="actionMode"
                value="save_next"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#103474] px-5 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
              >
                Save and Next
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#94a3b8]">
              Contact history
            </p>
            <div className="mt-4 space-y-3">
              {(activeLeadInteractions || []).map((entry) => (
                <InteractionItem key={entry.id} entry={entry} leadId={activeLead.id} returnTo={historyReturnTo} />
              ))}

              {!activeLeadInteractions.length ? (
                <div className="rounded-[20px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[#f8fafc] px-4 py-10 text-center text-sm text-[#64748b]">
                  No previous contact history was found for this lead.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </AdminCard>
  );
}

export default function CrmCallingHub({
  activeLead,
  activeLeadInteractions = [],
  stages = [],
  sourceOptions = [],
  selectedStageId = "",
  selectedSourceOrigin = "",
}) {
  const activeLeadHref = buildCrmDialHref(activeLead);
  const activeLeadSource = resolveLeadSourceValue(activeLead);
  const hasActiveLead = Boolean(activeLead?.id);
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) || null;
  const selectedSource =
    sourceOptions.find((option) => option.value === selectedSourceOrigin) || sourceOptions[0] || null;

  return (
    <div className="space-y-4">
      {!hasActiveLead ? (
        <CampaignStartScreen
          stages={stages}
          sourceOptions={sourceOptions}
          selectedStageId={selectedStageId}
          selectedSourceOrigin={selectedSourceOrigin}
        />
      ) : (
        <ActiveWorkspace
          activeLead={activeLead}
          activeLeadInteractions={activeLeadInteractions}
          selectedStage={selectedStage}
          selectedSource={selectedSource}
          selectedStageId={selectedStageId}
          selectedSourceOrigin={selectedSourceOrigin}
          activeLeadHref={activeLeadHref}
          activeLeadSource={activeLeadSource}
        />
      )}
    </div>
  );
}
