import Link from "next/link";
import {
  createLeadNoteAction,
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
  formatCrmPhoneDisplay,
  formatLeadSourceLabel,
  resolveLeadSourceValue,
  resolveToneByLeadSource,
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

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

function buildLivePath({ campaignKey = "", stageId = "", sourceOrigin = "", leadId = "" } = {}) {
  const params = new URLSearchParams();
  if (campaignKey) params.set("campaign", campaignKey);
  if (stageId) params.set("stage", stageId);
  if (sourceOrigin) params.set("source", sourceOrigin);
  if (leadId) params.set("lead", leadId);
  return `/admin/crm/callinghub/live${params.toString() ? `?${params.toString()}` : ""}`;
}

function initialsFromName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "LD";
  const parts = raw.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "LD";
}

function formatMinutesAgo(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const diffMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes === 1) return "1 min ago";
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="7" y="6" width="3.5" height="12" rx="1" />
      <rect x="13.5" y="6" width="3.5" height="12" rx="1" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M17.5 19.5c-4.9-1.8-8.7-5.6-10.5-10.5l2.4-2.4c.3-.3.8-.4 1.2-.2l2.5 1c.5.2.7.7.6 1.2l-.4 2.1c-.1.4.1.8.4 1.1l1.5 1.5c.3.3.7.5 1.1.4l2.1-.4c.5-.1 1 .1 1.2.6l1 2.5c.2.4.1.9-.2 1.2l-2.4 2.4z" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M14.5 6.5L9 12l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 12h8.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M9.5 6.5L15 12l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 12H6" strokeLinecap="round" />
    </svg>
  );
}

function QueueGripIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-[#d4d9e4]">
      <circle cx="6" cy="5" r="1.4" />
      <circle cx="6" cy="10" r="1.4" />
      <circle cx="6" cy="15" r="1.4" />
      <circle cx="13" cy="5" r="1.4" />
      <circle cx="13" cy="10" r="1.4" />
      <circle cx="13" cy="15" r="1.4" />
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

function HeroCard({
  title,
  subtitle,
  activeLead,
  selectedStageId,
  selectedSourceOrigin,
  selectedCampaignKey,
}) {
  return (
    <section className="relative overflow-hidden rounded-[32px] bg-[#0d215c] px-7 py-8 shadow-[0_28px_70px_rgba(13,33,92,0.22)] sm:px-9 sm:py-9">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute right-[-7rem] top-[-8rem] h-80 w-80 rounded-full bg-[#dce1ff] blur-[120px]" />
        <div className="absolute bottom-[-5rem] left-[-2rem] h-56 w-56 rounded-full bg-[#000d39] blur-[80px]" />
      </div>

      <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[#4ade80]" />
            <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-[#95a7d5]">Live session running</span>
          </div>
          <h1 className="max-w-[42rem] text-[38px] font-extrabold leading-[1.02] tracking-[-0.06em] text-white sm:text-[52px]">
            {title}
            <span className="text-[#b6c4ff]"> - ACTIVE</span>
          </h1>
          <p className="max-w-[40rem] text-lg leading-8 text-[#91a4d3]">{subtitle}</p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end xl:w-auto">
          <form action={leaveCallingCampaignAction}>
            <input type="hidden" name="leadId" value={activeLead.id} />
            <input type="hidden" name="campaignKey" value={selectedCampaignKey} />
            <input type="hidden" name="stageId" value={selectedStageId} />
            <input type="hidden" name="sourceOrigin" value={selectedSourceOrigin} />
            <button className="inline-flex min-h-[92px] w-full items-center justify-center gap-3 rounded-2xl bg-white px-8 text-[17px] font-bold text-[#000d39] shadow-[0_12px_24px_rgba(0,0,0,0.08)] sm:min-w-[220px]">
              <PauseIcon />
              Pause Session
            </button>
          </form>

          <form action={leaveCallingCampaignAction}>
            <input type="hidden" name="leadId" value={activeLead.id} />
            <button className="inline-flex min-h-[92px] w-full items-center justify-center gap-3 rounded-2xl bg-[#c81d1a] px-8 text-[17px] font-bold text-white shadow-[0_18px_34px_rgba(200,29,26,0.22)] sm:min-w-[220px]">
              <StopIcon />
              Stop Campaign
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function KpiCard({ label, value, miniBars, hint }) {
  return (
    <div className="rounded-[24px] bg-white px-6 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7f8da8]">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[30px] font-extrabold tracking-[-0.04em] text-[#000d39]">{value}</p>
          {hint ? <p className="mt-1 text-[11px] text-[#8d97aa]">{hint}</p> : null}
        </div>
        <div className="flex h-12 w-16 items-end gap-1">
          {miniBars.map((height, index) => (
            <div
              key={index}
              className={joinClasses("w-full rounded-t-sm", index === miniBars.length - 1 ? "bg-[#000d39]" : index >= miniBars.length - 2 ? "bg-[#b8c4e6]" : "bg-[#e5e8f0]")}
              style={{ height }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function QueuePrimaryRow({ lead, activeLeadHref }) {
  return (
    <div className="flex flex-col gap-5 rounded-[26px] border-2 border-[#dbe5fb] bg-white px-6 py-6 shadow-[0_18px_34px_rgba(13,33,92,0.08)] xl:flex-row xl:items-center xl:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#0d215c] text-[30px] font-bold text-white">
          {initialsFromName(lead.full_name || lead.email)}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-[21px] font-bold tracking-[-0.03em] text-[#0d215c]">
              {lead.full_name || lead.email || "Unnamed lead"}
            </h3>
            <span className="rounded-lg bg-[#d6e3fb] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#586579]">
              Up Next
            </span>
          </div>
          <p className="mt-1 text-[17px] text-[#6c778d]">
            {lead.source_label || lead.email || formatCrmPhoneDisplay(lead)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-8">
        <div className="text-left xl:text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9ca5b5]">Stage</p>
          <p className="mt-1 text-[17px] font-semibold leading-7 text-[#0d215c]">
            {lead.current_stage?.name || "Open"}
          </p>
        </div>
        <div className="text-left xl:text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9ca5b5]">Source</p>
          <p className="mt-1 text-[17px] font-semibold leading-7 text-[#0d215c]">
            {formatLeadSourceLabel(resolveLeadSourceValue(lead))}
          </p>
        </div>
        <CrmDialAction
          href={activeLeadHref}
          label={<span className="sr-only">Call lead</span>}
          className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#0d215c] text-white shadow-[0_18px_32px_rgba(13,33,92,0.22)]"
          disabledClassName="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#d7deee] text-[#7c86a1]"
          disabledLabel="No phone"
        />
      </div>
    </div>
  );
}

function QueueSecondaryRow({ lead }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[24px] bg-white px-5 py-4 opacity-80 transition-opacity hover:opacity-100">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#f2f5fb] text-[18px] font-bold text-[#9ca6ba]">
          {initialsFromName(lead.full_name || lead.email)}
        </div>
        <div className="min-w-0">
          <h4 className="truncate text-[17px] font-bold tracking-[-0.02em] text-[#33415f]">
            {lead.full_name || lead.email || "Unnamed lead"}
          </h4>
          <p className="truncate text-sm text-[#8d97aa]">{lead.source_label || lead.email || formatCrmPhoneDisplay(lead)}</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#c0c7d6]">Stage</p>
          <p className="mt-1 text-[17px] font-semibold text-[#495675]">{lead.current_stage?.name || "Open"}</p>
        </div>
        <QueueGripIcon />
      </div>
    </div>
  );
}

function QueuePanel({ activeLead, queuePreview = [], activeLeadHref }) {
  const queued = [activeLead, ...queuePreview.filter((lead) => lead?.id && lead.id !== activeLead.id)].slice(0, 5);
  const primaryLead = queued[0];
  const secondaryLeads = queued.slice(1);

  return (
    <section className="rounded-[32px] bg-[#f5f3f8] px-6 py-6 shadow-[0_10px_24px_rgba(15,23,42,0.03)] sm:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[22px] font-bold tracking-[-0.04em] text-[#0d215c]">Active Queue: Next 5 Leads</h2>
        <span className="inline-flex rounded-full bg-white px-4 py-2 text-[13px] font-medium text-[#7c86a1] shadow-[0_6px_18px_rgba(15,23,42,0.03)]">
          Refreshed just now
        </span>
      </div>

      <div className="space-y-4">
        {primaryLead ? <QueuePrimaryRow lead={primaryLead} activeLeadHref={activeLeadHref} /> : null}
        {secondaryLeads.map((lead) => (
          <QueueSecondaryRow key={lead.id} lead={lead} />
        ))}
      </div>
    </section>
  );
}

function SessionNotesCard({ activeLead, returnTo }) {
  return (
    <section className="relative overflow-hidden rounded-[32px] bg-[#0d215c] px-6 py-6 text-white shadow-[0_18px_40px_rgba(13,33,92,0.18)]">
      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[#3b82f6]/10 blur-3xl" />
      <div className="relative z-10">
        <h2 className="text-[22px] font-bold tracking-[-0.03em]">Session Notes</h2>
        <form action={createLeadNoteAction} className="mt-5 space-y-4">
          <input type="hidden" name="leadId" value={activeLead.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <textarea
            name="note"
            rows={6}
            placeholder="Add internal notes about the current session leads..."
            className="min-h-[156px] w-full resize-none rounded-[18px] border border-white/20 bg-white/10 px-4 py-4 text-sm text-white placeholder:text-white/45 outline-none focus:border-white/30 focus:ring-2 focus:ring-white/20"
          />
          <button className="inline-flex min-h-[64px] w-full items-center justify-center gap-3 rounded-[18px] bg-white px-5 text-[18px] font-bold text-[#0d215c]">
            Save Notes
          </button>
        </form>
      </div>
    </section>
  );
}

function HistoryItem({ entry, index }) {
  const tones = {
    connected: "border-green-200 bg-green-500 text-green-700 bg-green-50",
    voicemail: "border-slate-200 bg-slate-400 text-slate-600 bg-slate-100",
    callback_requested: "border-[#ffd5b3] bg-[#47210a] text-[#8a4a18] bg-[#ffdcc5]",
    no_answer: "border-slate-200 bg-slate-400 text-slate-600 bg-slate-100",
    attempted: "border-slate-200 bg-slate-400 text-slate-600 bg-slate-100",
    wrong_number: "border-red-200 bg-red-400 text-red-700 bg-red-50",
    not_interested: "border-red-200 bg-red-400 text-red-700 bg-red-50",
  };

  const tone = tones[entry.call_outcome] || tones.attempted;
  const [borderTone, dotTone, badgeText, badgeBg] = tone.split(" ");

  return (
    <div className={joinClasses("relative pl-6", index !== 0 ? "pt-1" : "")}>
      <div className={joinClasses("absolute left-0 top-0 h-full border-l-2", borderTone)} />
      <div className={joinClasses("absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full", dotTone)} />
      <p className="text-xs text-[#9aa3b3]">{formatMinutesAgo(entry.created_at)}</p>
      <h4 className="mt-1 text-[18px] font-bold tracking-[-0.02em] text-[#0d215c]">
        {entry.lead?.full_name || entry.lead?.email || "Lead"}
      </h4>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={joinClasses("rounded-md px-2.5 py-1 text-[11px] font-bold uppercase", badgeBg, badgeText)}>
          {formatCallOutcomeLabel(entry.call_outcome)}
        </span>
        {entry.summary ? <span className="text-[11px] italic text-[#6f7890]">&quot;{entry.summary}&quot;</span> : null}
      </div>
    </div>
  );
}

function RecentOutcomesCard({ sessionHistory = [], activeLead }) {
  return (
    <section className="rounded-[32px] bg-white px-6 py-6 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[#0d215c]">Recent Outcomes</h2>
      <div className="mt-6 space-y-6">
        {sessionHistory.length ? (
          sessionHistory.slice(0, 3).map((entry, index) => <HistoryItem key={entry.id} entry={entry} index={index} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-[#d8ddea] bg-[#fafbfe] px-4 py-8 text-center text-sm text-[#7d8798]">
            No outcomes logged yet in this live session.
          </div>
        )}
      </div>

      {activeLead?.id ? (
        <div className="mt-8 text-center">
          <Link href={`/admin/crm/leads/${activeLead.id}`} className="text-sm font-bold text-[#0d215c]">
            View Full History
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function StageUpdatePanel({ activeLead, stages = [], returnTo }) {
  const openStages = stages.filter((stage) => !stage.is_won && !stage.is_lost);
  return (
    <form action={moveLeadStageAction} className="rounded-[24px] border border-[#e1e6f0] bg-[#fafbfe] px-4 py-4">
      <input type="hidden" name="leadId" value={activeLead.id} />
      <input type="hidden" name="currentStageId" value={activeLead.current_stage_id || ""} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b95a8]">Stage update</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <select
            name="stageId"
            defaultValue={activeLead.current_stage_id || ""}
            className="w-full appearance-none rounded-[16px] border border-[#d8deeb] bg-white px-4 py-3 pr-10 text-sm font-semibold text-[#0d215c] outline-none"
          >
            {openStages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8d97aa]">
            <ChevronDownIcon />
          </span>
        </div>
        <button className="inline-flex min-h-[50px] items-center justify-center rounded-[16px] bg-[#0d215c] px-5 text-sm font-bold text-white">
          Save Stage
        </button>
      </div>
    </form>
  );
}

function StickySessionBar({
  activeLead,
  previousLead,
  selectedStage,
  selectedSource,
  selectedStageId,
  selectedSourceOrigin,
  selectedCampaignKey,
  queueCount,
}) {
  const returnTo = buildLivePath({
    campaignKey: selectedCampaignKey,
    stageId: selectedStageId,
    sourceOrigin: selectedSourceOrigin,
    leadId: activeLead.id,
  });
  const progressPercent = queueCount > 0 ? Math.round((1 / queueCount) * 100) : 100;

  return (
    <div className="sticky bottom-0 z-30 rounded-t-[28px] border border-[#d8deeb] bg-[rgba(251,248,254,0.88)] px-4 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur-md sm:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {previousLead?.lead?.id ? (
          <Link
            href={`/admin/crm/leads/${previousLead.lead.id}`}
            className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[18px] border border-[#8d97aa] px-6 text-[17px] font-bold text-[#0d215c]"
          >
            <ArrowLeftIcon />
            Previous Call
          </Link>
        ) : (
          <span className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[18px] border border-[#d8deeb] px-6 text-[17px] font-bold text-[#a2aabc]">
            <ArrowLeftIcon />
            Previous Call
          </span>
        )}

        <form
          id="sticky-session-form"
          action={submitCallOutcomeAction}
          className="flex min-w-0 flex-1 flex-col gap-4 xl:flex-row xl:items-center xl:justify-center"
        >
          <input type="hidden" name="leadId" value={activeLead.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="stageId" value={selectedStageId} />
          <input type="hidden" name="sourceOrigin" value={selectedSourceOrigin} />

          <div className="flex min-w-0 flex-col items-center gap-4 xl:flex-row xl:border-x xl:border-[#e1e6f0] xl:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#0d215c] text-[13px] font-bold text-white">
                {initialsFromName(activeLead.full_name || activeLead.email)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[18px] font-bold tracking-[-0.03em] text-[#0d215c]">
                  {activeLead.full_name || activeLead.email || "Lead"}
                </p>
                <p className="truncate text-[11px] text-[#7e879a]">
                  {selectedSource?.label || formatLeadSourceLabel(resolveLeadSourceValue(activeLead))}
                </p>
              </div>
            </div>

            <div className="relative">
              <select
                name="callOutcome"
                defaultValue={activeLead.last_call_outcome || "attempted"}
                className="appearance-none rounded-[16px] border border-[#cad3e5] bg-white px-4 py-3 pr-10 text-sm font-semibold text-[#0d215c] outline-none"
              >
                {CALL_OUTCOMES.map((option) => (
                  <option key={option} value={option}>
                    {formatCallOutcomeLabel(option)}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8d97aa]">
                <ChevronDownIcon />
              </span>
            </div>

            <div className="min-w-[116px]">
              <div className="mb-1 flex justify-between text-[11px] font-bold text-[#8f97aa]">
                <span>1 of {queueCount}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#e9edf4]">
                <div className="h-2 rounded-full bg-[#0d215c]" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          </div>

          <button
            type="submit"
            name="actionMode"
            value="save_next"
            className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-[18px] bg-[#000d39] px-7 text-[18px] font-bold text-white shadow-[0_14px_30px_rgba(13,33,92,0.18)]"
          >
            Next Call
            <ArrowRightIcon />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function CrmCallingLiveSession({
  activeLead,
  activeLeadInteractions = [],
  queuePreview = [],
  sessionHistory = [],
  stages = [],
  sourceOptions = [],
  selectedStageId = "",
  selectedSourceOrigin = "",
  selectedCampaignKey = "",
  campaigns = [],
  todayMetrics,
}) {
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) || null;
  const selectedSource =
    sourceOptions.find((option) => option.value === selectedSourceOrigin) || sourceOptions[0] || null;
  const activeLeadHref = buildCrmDialHref(activeLead);
  const campaignLabel =
    campaigns.find((campaign) => campaign.key === selectedCampaignKey)?.label ||
    [selectedStage?.name, selectedSource?.label].filter(Boolean).join(" · ") ||
    "All open leads";
  const heroTitle = `Campaign: ${campaignLabel}`;
  const heroSubtitle = `Working ${selectedSource?.label || "all sources"} leads in ${selectedStage?.name || "all stages"}. Queue progression stays server-controlled and tel: launch remains external.`;
  const returnTo = buildLivePath({
    campaignKey: selectedCampaignKey,
    stageId: selectedStageId,
    sourceOrigin: selectedSourceOrigin,
    leadId: activeLead.id,
  });
  const visibleQueue = [activeLead, ...queuePreview.filter((lead) => lead?.id && lead.id !== activeLead.id)].slice(0, 5);
  const previousLead =
    sessionHistory.find((entry) => entry.lead?.id && entry.lead.id !== activeLead.id) || null;

  return (
    <div className="space-y-8">
      <HeroCard
        title={heroTitle}
        subtitle={heroSubtitle}
        activeLead={activeLead}
        selectedStageId={selectedStageId}
        selectedSourceOrigin={selectedSourceOrigin}
        selectedCampaignKey={selectedCampaignKey}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.9fr)_360px]">
        <div className="space-y-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Calls Connected" value={todayMetrics?.connectedToday || 0} miniBars={["35%", "55%", "28%", "80%", "100%"]} />
            <KpiCard
              label="Avg. Talk Time"
              value={todayMetrics?.averageTalkTimeLabel || "--"}
              miniBars={["24%", "42%", "92%", "56%", "72%"]}
              hint={todayMetrics?.averageTalkTimeSeconds ? null : "tel: mode"}
            />
            <KpiCard
              label="Conversion (Live)"
              value={`${todayMetrics?.liveConversionRate || 0}%`}
              miniBars={["24%", "18%", "36%", "28%", "64%"]}
            />
            <KpiCard
              label="Leads Remaining"
              value={todayMetrics?.selectedSegmentLeadCount || visibleQueue.length}
              miniBars={["100%", "92%", "84%", "79%", "73%"]}
            />
          </div>

          <QueuePanel activeLead={activeLead} queuePreview={queuePreview} activeLeadHref={activeLeadHref} />
        </div>

        <div className="space-y-8">
          <SessionNotesCard activeLead={activeLead} returnTo={returnTo} />
          <RecentOutcomesCard sessionHistory={sessionHistory} activeLead={activeLead} />
        </div>
      </div>

      <details className="rounded-[28px] border border-[#d8deeb] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <summary className="cursor-pointer list-none text-sm font-bold uppercase tracking-[0.18em] text-[#0d215c]">
          More details
        </summary>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <StageUpdatePanel activeLead={activeLead} stages={stages} returnTo={returnTo} />
          <div className="rounded-[24px] border border-[#e1e6f0] bg-[#fafbfe] px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b95a8]">Lead details</p>
            <div className="mt-3 space-y-3 text-sm text-[#5f6980]">
              <p><span className="font-semibold text-[#0d215c]">Phone:</span> {formatCrmPhoneDisplay(activeLead)}</p>
              <p><span className="font-semibold text-[#0d215c]">Source:</span> {formatLeadSourceLabel(resolveLeadSourceValue(activeLead))}</p>
              <p><span className="font-semibold text-[#0d215c]">Last activity:</span> {formatCrmDateTime(activeLead.updated_at)}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <CrmBadge tone={resolveToneByLeadSource(resolveLeadSourceValue(activeLead))}>
                {formatLeadSourceLabel(resolveLeadSourceValue(activeLead))}
              </CrmBadge>
              {activeLead.last_call_outcome ? (
                <CrmBadge tone="warning">{formatCallOutcomeLabel(activeLead.last_call_outcome)}</CrmBadge>
              ) : null}
            </div>
            {activeLeadInteractions.length ? (
              <div className="mt-4 rounded-[18px] bg-white px-4 py-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b95a8]">Latest entry</p>
                <p className="mt-2 text-sm font-semibold text-[#0d215c]">
                  {activeLeadInteractions[0].summary || formatCallOutcomeLabel(activeLeadInteractions[0].call_outcome)}
                </p>
                {activeLeadInteractions[0].notes ? (
                  <p className="mt-2 text-sm text-[#5f6980]">{activeLeadInteractions[0].notes}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </details>

      <StickySessionBar
        activeLead={activeLead}
        previousLead={previousLead}
        selectedStage={selectedStage}
        selectedSource={selectedSource}
        selectedStageId={selectedStageId}
        selectedSourceOrigin={selectedSourceOrigin}
        selectedCampaignKey={selectedCampaignKey}
        queueCount={visibleQueue.length || 1}
      />
    </div>
  );
}
