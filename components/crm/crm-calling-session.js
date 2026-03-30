import Link from "next/link";
import {
  leaveCallingCampaignAction,
  moveLeadStageAction,
  submitCallOutcomeAction,
} from "@/app/admin/crm/actions";
import CrmDialAction from "@/components/crm/crm-dial-action";
import {
  buildCrmDialHref,
  CrmBadge,
  formatCallOutcomeLabel,
  formatCrmDateTime,
  formatLeadSourceLabel,
  resolveLeadSourceValue,
} from "@/components/crm/crm-ui";
import CrmAutoSubmitSelect from "@/components/crm/crm-auto-submit-select";
import CrmRouteButton from "@/components/crm/crm-route-button";

const CALL_OUTCOMES = [
  "attempted",
  "connected",
  "no_answer",
  "voicemail",
  "callback_requested",
  "wrong_number",
  "not_interested",
];

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

function normalizeLeadIdOrder(leadIds = []) {
  return Array.from(new Set((leadIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function ensureActiveLeadFirst(leadIds = [], activeLeadId = "") {
  const normalizedLeadIds = normalizeLeadIdOrder(leadIds);
  const normalizedActiveLeadId = String(activeLeadId || "").trim();
  if (!normalizedActiveLeadId) return normalizedLeadIds;
  return [normalizedActiveLeadId, ...normalizedLeadIds.filter((leadId) => leadId !== normalizedActiveLeadId)];
}

function rotateQueueForward(leadIds = [], activeLeadId = "") {
  const normalizedLeadIds = ensureActiveLeadFirst(leadIds, activeLeadId);
  if (normalizedLeadIds.length <= 1) return normalizedLeadIds;
  const [currentLeadId, ...remainingLeadIds] = normalizedLeadIds;
  return [...remainingLeadIds, currentLeadId];
}

function rotateQueueBackward(leadIds = [], activeLeadId = "") {
  const normalizedLeadIds = ensureActiveLeadFirst(leadIds, activeLeadId);
  if (normalizedLeadIds.length <= 1) return normalizedLeadIds;
  const lastLeadId = normalizedLeadIds[normalizedLeadIds.length - 1];
  return [lastLeadId, ...normalizedLeadIds.slice(0, -1)];
}

function buildLiveSessionPath({
  campaignKey = "",
  stageId = "",
  sourceOrigin = "",
  leadId = "",
  sessionLeadIds = [],
  queueLeadIds = [],
  pausedSessionId = "",
} = {}) {
  const params = new URLSearchParams();
  const normalizedSessionLeadIds = Array.from(new Set((sessionLeadIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  const normalizedQueueLeadIds = normalizeLeadIdOrder(queueLeadIds);
  if (campaignKey) params.set("campaign", campaignKey);
  if (stageId) params.set("stage", stageId);
  if (sourceOrigin) params.set("source", sourceOrigin);
  if (leadId) params.set("lead", leadId);
  if (normalizedSessionLeadIds.length) params.set("history", normalizedSessionLeadIds.join(","));
  if (normalizedQueueLeadIds.length) params.set("queue", normalizedQueueLeadIds.join(","));
  if (pausedSessionId) params.set("pausedSessionId", pausedSessionId);
  return `/admin/crm/callinghub/live${params.toString() ? `?${params.toString()}` : ""}`;
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M18.65 16.98c-1.25 0-2.46-.2-3.59-.57a1 1 0 0 0-.98.24l-1.57 1.98a15.33 15.33 0 0 1-7.14-7.14l1.98-1.57a1 1 0 0 0 .24-.98 11.8 11.8 0 0 1-.57-3.59A1 1 0 0 0 6 4H3.5a1 1 0 0 0-1 1A18.5 18.5 0 0 0 21 23a1 1 0 0 0 1-1v-2.52a1 1 0 0 0-1-1.5h-2.35z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  return diffHours === 1 ? "1 hr ago" : `${diffHours} hrs ago`;
}

function initialsForLead(lead) {
  const raw = lead?.full_name || lead?.email || "Lead";
  const parts = String(raw).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "LD";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "LD";
}

function HeroCard({
  activeLead,
  selectedStageName,
  selectedSourceName,
  remainingLeadCount,
  campaignKey,
  selectedStageId,
  selectedSourceOrigin,
  sessionLeadIds = [],
  queueLeadIds = [],
  pausedSessionId = "",
}) {
  const campaignLabel = selectedSourceName && selectedSourceName !== "All sources"
    ? selectedSourceName
    : selectedStageName && selectedStageName !== "All stages"
      ? selectedStageName
      : "All Open Leads";

  return (
    <section className="relative overflow-hidden rounded-[32px] bg-[#0d215c] px-8 py-8 text-white shadow-[0_24px_60px_rgba(13,33,92,0.25)] lg:px-10 lg:py-9">
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute -right-16 -top-20 h-80 w-80 rounded-full bg-[#dce1ff] blur-[120px]" />
        <div className="absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-[#000d39] blur-[80px]" />
      </div>

      <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-4xl">
          <div className="mb-3 flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[#4ade80]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#9fb2e5]">Live session running</span>
          </div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.04em] text-white sm:text-[34px] lg:text-[40px]">
            Campaign: {campaignLabel} - <span className="text-[#dce1ff]">ACTIVE</span>
          </h1>
          <p className="mt-4 max-w-3xl text-[13px] leading-6 text-[#9fb2e5] sm:text-[14px]">
            Working the live queue for {selectedStageName}. {remainingLeadCount} lead{remainingLeadCount === 1 ? "" : "s"} remain in the current segment, and {activeLead.full_name || "the active lead"} is ready for action now.
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <form action={leaveCallingCampaignAction}>
            <input type="hidden" name="leadId" value={activeLead.id} />
            <input type="hidden" name="campaignKey" value={campaignKey} />
            <input type="hidden" name="stageId" value={selectedStageId} />
            <input type="hidden" name="sourceOrigin" value={selectedSourceOrigin} />
            <input type="hidden" name="sessionLeadIds" value={sessionLeadIds.join(",")} />
            <input type="hidden" name="queueLeadIds" value={queueLeadIds.join(",")} />
            <input type="hidden" name="pausedSessionId" value={pausedSessionId} />
            <input type="hidden" name="mode" value="pause" />
            <button className="inline-flex min-h-[62px] min-w-[200px] items-center justify-center gap-3 rounded-[18px] bg-white px-7 text-[15px] font-bold text-[#000d39] shadow-[0_14px_30px_rgba(2,6,23,0.12)] transition hover:bg-[#f8fbff]">
              <PauseIcon />
              Pause Session
            </button>
          </form>
          <form action={leaveCallingCampaignAction}>
            <input type="hidden" name="leadId" value={activeLead.id} />
            <input type="hidden" name="campaignKey" value={campaignKey} />
            <input type="hidden" name="stageId" value={selectedStageId} />
            <input type="hidden" name="sourceOrigin" value={selectedSourceOrigin} />
            <input type="hidden" name="pausedSessionId" value={pausedSessionId} />
            <input type="hidden" name="mode" value="stop" />
            <button className="inline-flex min-h-[62px] min-w-[200px] items-center justify-center gap-3 rounded-[18px] bg-[#c81f1a] px-7 text-[15px] font-bold text-white shadow-[0_16px_34px_rgba(200,31,26,0.25)] transition hover:bg-[#b11a16]">
              <StopIcon />
              Stop Campaign
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function KpiCard({ label, value, sparkBars }) {
  return (
    <div className="rounded-[24px] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d8798]">{label}</p>
      <div className="flex items-end justify-between gap-4">
        <p className="text-[24px] font-extrabold tracking-[-0.04em] text-[#000d39]">{value}</p>
        <div className="flex h-12 w-[72px] items-end gap-1">
          {sparkBars.map((height, index) => (
            <span
              key={`${label}-${index}`}
              className={joinClasses(
                "block w-full rounded-t-sm",
                index === sparkBars.length - 1 ? "bg-[#000d39]" : index === sparkBars.length - 2 ? "bg-[#cfd9f3]" : "bg-[#e5e7ef]"
              )}
              style={{ height }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProgressKpiCard({ remainingLeadCount }) {
  const totalQueue = Math.max(1, remainingLeadCount);
  const progressPercent = Math.max(1, Math.round((1 / totalQueue) * 100));

  return (
    <div className="rounded-[24px] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7d8798]">Campaign Progress</p>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[24px] font-extrabold tracking-[-0.04em] text-[#000d39]">1 of {totalQueue}</p>
          <p className="text-[13px] font-bold text-[#0d215c]">{progressPercent}%</p>
        </div>
        <div className="h-2 rounded-full bg-[#edf0f6]">
          <div className="h-2 rounded-full bg-[#0d215c]" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    </div>
  );
}

function UpNextCard({ activeLead, activeLeadHref }) {
  const activeSource = resolveLeadSourceValue(activeLead);
  const roleLine = activeLead?.email || activeLead?.source_label || "Current lead";
  const sourceLabel = formatLeadSourceLabel(activeSource);

  return (
    <div className="rounded-[28px] border-2 border-[#000d39]/10 bg-white px-8 py-7 shadow-[0_18px_40px_rgba(13,33,92,0.08)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[18px] font-bold tracking-[-0.03em] text-[#000d39]">
                {activeLead.full_name || activeLead.email || "Unnamed lead"}
              </h3>
              <span className="rounded-[10px] bg-[#d6e3fb] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#586579]">
                {sourceLabel}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-6 text-[#677185]">{roleLine}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-8 xl:gap-10">
          <div className="text-left xl:text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa2b1]">Stage</p>
            <p className="mt-2 max-w-[140px] text-[14px] font-semibold leading-6 text-[#000d39]">
              {activeLead.current_stage?.name || "Open"}
            </p>
          </div>
          <CrmDialAction
            href={activeLeadHref}
            label={<PhoneIcon />}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#000d39] text-white shadow-[0_14px_28px_rgba(13,33,92,0.2)] transition hover:scale-[1.02]"
            disabledClassName="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#e8edf8] text-[#9aa2b1]"
            disabledLabel="No phone"
          />
        </div>
      </div>
    </div>
  );
}

function QueueRow({ lead, faded = false }) {
  return (
    <div className={joinClasses("rounded-[24px] bg-white px-6 py-5 transition-opacity", faded ? "opacity-70" : "")}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h4 className="text-[15px] font-bold tracking-[-0.02em] text-[#000d39]">
              {lead.full_name || lead.email || "Unnamed lead"}
            </h4>
            <p className="text-[13px] text-[#7d8798]">{lead.email || lead.source_label || "Queued lead"}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9aa2b1]">Stage</p>
            <p className="mt-1 text-[13px] font-semibold text-[#000d39]">{lead.current_stage?.name || "Open"}</p>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[#d2d9e7]">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="h-1.5 w-1.5 rounded-full bg-current" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QueuePanel({ activeLead, activeLeadHref, queuePreview = [] }) {
  const visibleQueue = queuePreview.slice(0, 4);

  return (
    <section className="rounded-[32px] bg-[#f4f2f8] px-6 py-7 shadow-[0_14px_34px_rgba(15,23,42,0.04)] lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[17px] font-bold tracking-[-0.02em] text-[#000d39]">Active Queue: Next {Math.max(1, visibleQueue.length + 1)} Leads</h2>
        <span className="inline-flex w-fit items-center rounded-full bg-white px-4 py-2 text-[13px] font-medium text-[#7d8798]">
          Refreshed just now
        </span>
      </div>

      <div className="space-y-4">
        <UpNextCard activeLead={activeLead} activeLeadHref={activeLeadHref} />
        {visibleQueue.length ? visibleQueue.map((lead, index) => <QueueRow key={lead.id} lead={lead} faded={index > 0} />) : (
          <div className="rounded-[24px] border border-dashed border-[#d8dde9] bg-white px-6 py-10 text-center text-sm text-[#7d8798]">
            No additional leads are queued right now. Save and Next will pull the next eligible lead as soon as one is available.
          </div>
        )}
      </div>
    </section>
  );
}

function NotesCard({ formId, defaultNote, noteSaved = false }) {
  return (
    <section className="relative overflow-hidden rounded-[32px] bg-[#0d215c] px-8 py-7 text-white shadow-[0_20px_50px_rgba(13,33,92,0.18)]">
      <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#3f5ca8]/20 blur-3xl" />
      <div className="relative z-10 space-y-5">
        <h2 className="text-[18px] font-bold tracking-[-0.03em]">Notes</h2>
        <textarea
          name="note"
          form={formId}
          rows={6}
          defaultValue={defaultNote || ""}
          placeholder="Add or update notes for this lead..."
          className="min-h-[170px] w-full resize-none rounded-[20px] border border-white/15 bg-white/10 px-5 py-4 text-[14px] leading-7 text-white placeholder:text-[#9fb2e5] outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/10"
        />
        <button
          type="submit"
          form={formId}
          name="actionMode"
          value="save"
          className={joinClasses(
            "inline-flex min-h-[62px] w-full items-center justify-center gap-3 rounded-[18px] px-6 text-[16px] font-bold transition",
            noteSaved ? "bg-[#dff6e8] text-[#0b6b3a]" : "bg-white text-[#0d215c] hover:bg-[#f7f9ff]"
          )}
        >
          {noteSaved ? <CheckIcon /> : null}
          {noteSaved ? "Note Saved" : "Save Notes"}
        </button>
      </div>
    </section>
  );
}

function RecentOutcomesCard({ sessionHistory = [] }) {
  const items = sessionHistory.slice(0, 3);

  return (
    <section className="rounded-[32px] border border-[rgba(117,118,129,0.12)] bg-white px-8 py-7 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
      <h2 className="mb-7 text-[17px] font-bold tracking-[-0.02em] text-[#000d39]">Recent Outcomes</h2>
      <div className="space-y-6">
        {items.length ? items.map((entry) => {
          const outcomeTone =
            entry.call_outcome === "connected"
              ? "success"
              : entry.call_outcome === "voicemail"
                ? "neutral"
                : entry.call_outcome === "callback_requested"
                  ? "warning"
                  : "accent";
          return (
            <div key={entry.id} className="relative border-l-2 border-[#d6e3fb] pl-7">
              <span className="absolute -left-[6px] top-1 h-3 w-3 rounded-full bg-[#4ade80]" />
              <p className="text-xs text-[#94a3b8]">{formatRelativeTime(entry.created_at)}</p>
              <h4 className="mt-2 text-[15px] font-bold tracking-[-0.02em] text-[#000d39]">{entry.lead?.full_name || entry.lead?.email || "Unknown lead"}</h4>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <CrmBadge tone={outcomeTone}>{formatCallOutcomeLabel(entry.call_outcome)}</CrmBadge>
                {entry.movedToStageName ? <CrmBadge tone="neutral">Moved to {entry.movedToStageName}</CrmBadge> : null}
              </div>
            </div>
          );
        }) : (
          <div className="rounded-[24px] border border-dashed border-[#d8dde9] bg-[#faf9fc] px-5 py-10 text-center text-sm text-[#7d8798]">
            No call outcomes have been logged in this live session yet.
          </div>
        )}
      </div>

      <div className="mt-8 text-center">
        <Link href="/admin/crm/leads" className="text-sm font-bold text-[#0d215c]">
          View Full History
        </Link>
      </div>
    </section>
  );
}

function BottomSessionBar({
  activeLead,
  sessionHistory = [],
  sessionLeadIds = [],
  queueLeadIds = [],
  stages = [],
  selectedStageId,
  selectedSourceOrigin,
  campaignKey,
  remainingLeadCount,
  formId,
  pausedSessionId = "",
}) {
  const orderedQueueLeadIds = ensureActiveLeadFirst(
    queueLeadIds.length ? queueLeadIds : [activeLead.id],
    activeLead.id
  );
  const previousQueueLeadIds = rotateQueueBackward(orderedQueueLeadIds, activeLead.id);
  const previousLeadId = previousQueueLeadIds[0] || null;
  const currentStageId = activeLead.current_stage_id || activeLead.current_stage?.id || selectedStageId || "";
  const returnTo = buildLiveSessionPath({
    campaignKey,
    stageId: selectedStageId,
    sourceOrigin: selectedSourceOrigin,
      leadId: activeLead.id,
      sessionLeadIds,
      queueLeadIds: orderedQueueLeadIds,
      pausedSessionId,
    });

  return (
    <>
      <form id="calling-stage-form" action={moveLeadStageAction} className="hidden">
        <input type="hidden" name="leadId" value={activeLead.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="reason" value="crm_calling_session_stage_move" />
      </form>

      <div className="sticky bottom-0 left-0 right-0 z-20 mt-4 border-t border-[rgba(117,118,129,0.12)] bg-[rgba(251,248,254,0.88)] px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          {previousLeadId ? (
            <CrmRouteButton
              href={buildLiveSessionPath({
                campaignKey,
                stageId: selectedStageId,
                sourceOrigin: selectedSourceOrigin,
                leadId: previousLeadId,
                sessionLeadIds,
                queueLeadIds: previousQueueLeadIds,
                pausedSessionId,
              })}
              className="inline-flex min-h-[60px] items-center justify-center gap-3 rounded-[20px] border border-[#757681] px-6 text-[16px] font-bold text-[#000d39] transition hover:bg-white"
            >
              <ArrowLeftIcon />
              Previous Call
            </CrmRouteButton>
          ) : (
            <span className="inline-flex min-h-[60px] items-center justify-center gap-3 rounded-[20px] border border-[#d6d8df] px-6 text-[16px] font-bold text-[#9aa2b1]">
              <ArrowLeftIcon />
              Previous Call
            </span>
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-[24px] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] xl:flex-row xl:items-center xl:justify-between xl:gap-6">

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <CrmAutoSubmitSelect
                  name="stageId"
                  defaultValue={currentStageId}
                  form="calling-stage-form"
                  className="appearance-none rounded-[16px] border border-[#d9deea] bg-white px-4 py-3 pr-10 text-[13px] font-semibold text-[#000d39] outline-none"
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </CrmAutoSubmitSelect>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa2b1]">
                  <ChevronDownIcon />
                </span>
              </div>
              <div className="relative">
                <CrmAutoSubmitSelect
                  name="callOutcome"
                  defaultValue={activeLead.last_call_outcome || "attempted"}
                  form={formId}
                  className="appearance-none rounded-[16px] border border-[#d9deea] bg-white px-4 py-3 pr-10 text-[13px] font-semibold text-[#000d39] outline-none"
                >
                  {CALL_OUTCOMES.map((option) => (
                    <option key={option} value={option}>
                      {formatCallOutcomeLabel(option)}
                    </option>
                  ))}
                </CrmAutoSubmitSelect>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa2b1]">
                  <ChevronDownIcon />
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="submit"
              form={formId}
              name="actionMode"
              value="save_next"
              className="inline-flex min-h-[60px] items-center justify-center gap-3 rounded-[20px] bg-[#000d39] px-8 text-[17px] font-bold text-white shadow-[0_14px_30px_rgba(13,33,92,0.2)] transition hover:opacity-95"
            >
              Next Call
              <ArrowRightIcon />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function CrmCallingSession({
  searchParams = {},
  activeLead,
  sessionHistory = [],
  queuePreview = [],
  queueLeadIds = [],
  stages = [],
  selectedStageId = "",
  selectedSourceOrigin = "",
  todayMetrics = null,
  latestLeadNote = "",
  noteSaved = false,
  sessionLeadIds = [],
  pausedSessionId = "",
}) {
  const activeLeadHref = buildCrmDialHref(activeLead);
  const activeSource = resolveLeadSourceValue(activeLead);
  const selectedStageName = activeLead.current_stage?.name || stages.find((stage) => stage.id === selectedStageId)?.name || "All stages";
  const selectedSourceName = formatLeadSourceLabel(activeSource || selectedSourceOrigin);
  const campaignKey = searchParams?.campaign?.toString() || "";
  const returnTo = buildLiveSessionPath({
    campaignKey,
    stageId: selectedStageId,
    sourceOrigin: selectedSourceOrigin,
    leadId: activeLead.id,
    sessionLeadIds,
    pausedSessionId,
  });
  const orderedQueueLeadIds = ensureActiveLeadFirst(
    queueLeadIds.length ? queueLeadIds : [activeLead.id, ...(queuePreview || []).map((lead) => lead?.id).filter(Boolean)],
    activeLead.id
  );
  const remainingLeadCount = Math.max(1, orderedQueueLeadIds.length);
  const formId = "calling-session-outcome-form";
  const serializedSessionLeadIds = Array.from(new Set(sessionLeadIds.map((value) => String(value || "").trim()).filter(Boolean))).join(",");
  const serializedQueueLeadIds = orderedQueueLeadIds.join(",");

  return (
    <div className="space-y-8">
      <form id={formId} action={submitCallOutcomeAction} className="hidden">
        <input type="hidden" name="leadId" value={activeLead.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="campaignKey" value={campaignKey} />
        <input type="hidden" name="stageId" value={selectedStageId} />
        <input type="hidden" name="sourceOrigin" value={selectedSourceOrigin} />
        <input type="hidden" name="sessionLeadIds" value={serializedSessionLeadIds} />
        <input type="hidden" name="queueLeadIds" value={serializedQueueLeadIds} />
        <input type="hidden" name="pausedSessionId" value={pausedSessionId} />
        <input type="hidden" name="nextActionAt" value="" />
      </form>

      <HeroCard
        activeLead={activeLead}
        selectedStageName={selectedStageName}
        selectedSourceName={selectedSourceName}
        remainingLeadCount={remainingLeadCount}
        campaignKey={campaignKey}
        selectedStageId={selectedStageId}
        selectedSourceOrigin={selectedSourceOrigin}
        sessionLeadIds={sessionLeadIds}
        queueLeadIds={orderedQueueLeadIds}
        pausedSessionId={pausedSessionId}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.9fr)_380px] xl:items-start">
        <div className="space-y-8">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <KpiCard label="Calls Connected" value={todayMetrics?.connectedToday || 0} sparkBars={["34%", "56%", "28%", "78%", "100%"]} />
            <ProgressKpiCard remainingLeadCount={remainingLeadCount} />
            <KpiCard label="Conversion (Live)" value={`${todayMetrics?.liveConversionRate ?? 0}%`} sparkBars={["22%", "18%", "36%", "30%", "68%"]} />
            <KpiCard label="Leads Remaining" value={remainingLeadCount.toLocaleString("en-US")} sparkBars={["100%", "92%", "88%", "84%", "78%"]} />
          </div>

          <QueuePanel activeLead={activeLead} activeLeadHref={activeLeadHref} queuePreview={queuePreview} />
        </div>

        <div className="space-y-8">
          <NotesCard formId={formId} defaultNote={latestLeadNote} noteSaved={noteSaved} />
          <RecentOutcomesCard sessionHistory={sessionHistory} />
        </div>
      </div>

      <BottomSessionBar
        activeLead={activeLead}
        sessionHistory={sessionHistory}
        sessionLeadIds={sessionLeadIds}
        queueLeadIds={orderedQueueLeadIds}
        stages={stages}
        selectedStageId={selectedStageId}
        selectedSourceOrigin={selectedSourceOrigin}
        campaignKey={campaignKey}
        remainingLeadCount={remainingLeadCount}
        formId={formId}
        pausedSessionId={pausedSessionId}
      />
    </div>
  );
}
