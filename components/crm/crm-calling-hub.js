import Link from "next/link";
import {
  claimNextLeadAction,
  closePausedCallingCampaignAction,
  leaveCallingCampaignAction,
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
  formatPreEnrollmentStatus,
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

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

function buildCampaignHref({
  campaignKey = "",
  stageId = "",
  sourceOrigin = "",
  leadId = "",
  sessionLeadIds = [],
  queueLeadIds = [],
  pausedSessionId = "",
  live = false,
} = {}) {
  const params = new URLSearchParams();
  if (campaignKey) params.set("campaign", campaignKey);
  if (stageId) params.set("stage", stageId);
  if (sourceOrigin) params.set("source", sourceOrigin);
  if (leadId) params.set("lead", leadId);
  if (sessionLeadIds.length) params.set("history", sessionLeadIds.join(","));
  if (queueLeadIds.length) params.set("queue", queueLeadIds.join(","));
  if (pausedSessionId) params.set("pausedSessionId", pausedSessionId);
  const pathname = live ? "/admin/crm/callinghub/live" : "/admin/crm/callinghub";
  return `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 3l7 3.2V12c0 4.8-2.8 7.9-7 9-4.2-1.1-7-4.2-7-9V6.2L12 3z" />
      <path d="M9.5 12.3l1.8 1.8 3.4-4" strokeLinecap="round" strokeLinejoin="round" />
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

function RocketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M13.5 5.5c2.8-1.5 5.8-1.9 5.8-1.9s-.4 3-1.9 5.8l-3.6 3.6-3.9-3.9 3.6-3.6z" />
      <path d="M9.8 9.8L7.4 7.4C5.9 8 4.5 9.1 3.6 10.5l3.2.7" />
      <path d="M14.2 14.2l2.4 2.4c1.4-.9 2.5-2.3 3.1-3.8l-.7-3.2" />
      <path d="M10.5 14.6l-2.7 2.7" strokeLinecap="round" />
      <path d="M7.2 17.9l-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

function CallLogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M7 5h5" strokeLinecap="round" />
      <path d="M7 9h8" strokeLinecap="round" />
      <path d="M7 13h6" strokeLinecap="round" />
      <path d="M17.5 19.5c-4.9-1.8-8.7-5.6-10.5-10.5l2.4-2.4c.3-.3.8-.4 1.2-.2l2.5 1c.5.2.7.7.6 1.2l-.4 2.1c-.1.4.1.8.4 1.1l1.5 1.5c.3.3.7.5 1.1.4l2.1-.4c.5-.1 1 .1 1.2.6l1 2.5c.2.4.1.9-.2 1.2l-2.4 2.4z" strokeLinejoin="round" />
    </svg>
  );
}

function TimeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3 1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.1 2.1 4.9-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.5v5" strokeLinecap="round" />
      <circle cx="12" cy="7.4" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function resolveStatusMessage(searchParams = {}) {
  const entries = [
    ["claimed", "Campaign started safely", "The next eligible lead was opened in the workspace."],
    ["advanced", "Campaign advanced successfully", "The last outcome was saved and the queue moved to the next lead."],
    ["saved", "Campaign progress saved", "Your notes and disposition were saved without leaving the campaign."],
    ["paused", "Campaign paused", "Your lead claim was released and the campaign can be resumed from the launcher."],
    ["stopped", "Campaign stopped", "The live session ended cleanly and the queue is ready for a fresh launch."],
    ["left", "Campaign released safely", "Your queue claim was released and the launcher is ready again."],
    ["empty", "No eligible leads ready", "Adjust the filters or return later when more open leads become due."],
  ];

  for (const [key, title, detail] of entries) {
    if (searchParams?.[key]) {
      return { title, detail };
    }
  }

  return {
    title: "Campaign launcher ready",
    detail: "Choose a stage and a source to claim the next eligible CRM lead safely.",
  };
}

function formatMinutesAgo(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const diffMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
}

function CallingHubBanner({ searchParams, todayMetrics, hasActiveLead }) {
  const message = resolveStatusMessage(searchParams);
  const latestActivity = formatMinutesAgo(todayMetrics?.latestCallAt);
  const leftDetail =
    searchParams?.claimed ||
    searchParams?.advanced ||
    searchParams?.saved ||
    searchParams?.paused ||
    searchParams?.stopped ||
    searchParams?.left ||
    searchParams?.empty
      ? message.detail
      : latestActivity
        ? `Last call activity was ${latestActivity}. ${todayMetrics?.selectedSegmentLeadCount || 0} leads are ready in the current segment.`
        : `${todayMetrics?.selectedSegmentLeadCount || 0} leads are ready in the current segment.`;

  return (
    <div className="rounded-r-2xl border border-[rgba(20,39,79,0.08)] border-l-[4px] border-l-[#0d215c] bg-[#f4f2f8] px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0d215c] shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
            <ShieldIcon />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#0d215c]">
              {hasActiveLead ? "Campaign running safely" : message.title}
            </p>
            <p className="text-xs leading-5 text-[#5b6474]">
              {hasActiveLead
                ? "The queue is holding your current lead while you call, save, or advance."
                : leftDetail}
            </p>
          </div>
        </div>

        <div className="shrink-0 rounded-2xl bg-white/80 px-4 py-3 text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)] lg:min-w-[168px] lg:text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a0a7b5]">Today&apos;s goal</p>
          <p className="mt-1 text-sm font-bold text-[#1b1b1f]">
            {todayMetrics?.callsToday || 0} calls
            <span className="ml-1 text-xs font-normal text-[#8f96a3]">· {todayMetrics?.selectedSegmentLeadCount || 0} ready</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function FieldSelect({ label, name, defaultValue, options, placeholder }) {
  return (
    <label className="space-y-2">
      <span className="pl-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#0d215c]">{label}</span>
      <div className="relative">
        <select
          name={name}
          defaultValue={defaultValue}
          className="w-full appearance-none rounded-xl border border-transparent bg-[#f4f2f8] px-5 py-4 pr-12 text-sm font-semibold text-[#111827] outline-none transition focus:border-[#0d215c]/15 focus:ring-2 focus:ring-[#0d215c]/10"
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value || option.id || option.name} value={option.value || option.id}>
              {option.label || option.name} {option.leadCount != null ? `(${option.leadCount})` : ""}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#7d8798]">
          <ChevronDownIcon />
        </span>
      </div>
    </label>
  );
}

function MetricCard({ icon, accentClass, value, label, hint }) {
  return (
    <div className="rounded-[28px] border border-[rgba(117,118,129,0.12)] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className={joinClasses("mb-3 text-[#0d215c]", accentClass)}>{icon}</div>
      <p className="text-[27px] font-bold tracking-[-0.04em] text-[#0d215c]">{value}</p>
      <p className="mt-1 text-[13px] font-medium text-[#505764]">{label}</p>
      {hint ? <p className="mt-1 text-xs text-[#8f96a3]">{hint}</p> : null}
    </div>
  );
}

function UnfinishedCampaigns({ pausedSessions = [] }) {
  if (!pausedSessions.length) return null;

  return (
    <section className="rounded-[28px] border border-[rgba(117,118,129,0.12)] bg-white px-6 py-6 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[18px] font-bold tracking-[-0.03em] text-[#000d39]">Unfinished Campaigns</h2>
          <p className="mt-1 text-[13px] text-[#5b6474]">
            Resume any paused queue exactly where you left it, or close it to remove it permanently.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full bg-[#f4f2f8] px-3 py-1 text-[12px] font-bold text-[#0d215c]">
          {pausedSessions.length} paused
        </span>
      </div>

      <div className="mt-6 space-y-4">
        {pausedSessions.map((session) => {
          const activeLead = session.active_lead || null;
          const sourceLabel = session.selected_source_origin
            ? formatLeadSourceLabel(session.selected_source_origin)
            : "All sources";
          const resumeHref = buildCampaignHref({
            campaignKey: session.campaign_key,
            stageId: session.selected_stage_id || "",
            sourceOrigin: session.selected_source_origin || "",
            leadId: session.active_lead_id || "",
            sessionLeadIds: Array.isArray(session.session_lead_ids) ? session.session_lead_ids : [],
            queueLeadIds: Array.isArray(session.queue_lead_ids) ? session.queue_lead_ids : [],
            pausedSessionId: session.id,
            live: true,
          });

          return (
            <div key={session.id} className="rounded-[24px] bg-[#f8f7fb] px-5 py-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CrmBadge tone="neutral">{session.selected_stage?.name || "All stages"}</CrmBadge>
                    <CrmBadge tone="accent">{sourceLabel}</CrmBadge>
                    <CrmBadge tone="neutral">{formatMinutesAgo(session.paused_at)}</CrmBadge>
                  </div>
                  <h3 className="text-[17px] font-bold tracking-[-0.03em] text-[#000d39]">
                    {activeLead?.full_name || activeLead?.email || "Paused campaign"}
                  </h3>
                  <p className="text-[13px] leading-6 text-[#5b6474]">
                    Current lead: {activeLead?.email || activeLead?.source_label || "No lead selected"} · Queue size: {(Array.isArray(session.queue_lead_ids) ? session.queue_lead_ids.length : 0) || 1}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={resumeHref}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] bg-[#000d39] px-6 text-[14px] font-bold text-white"
                  >
                    Resume
                  </Link>
                  <form action={closePausedCallingCampaignAction}>
                    <input type="hidden" name="pausedSessionId" value={session.id} />
                    <input type="hidden" name="returnTo" value="/admin/crm/callinghub" />
                    <button className="inline-flex min-h-[48px] items-center justify-center rounded-[18px] border border-[rgba(200,31,26,0.16)] bg-[rgba(200,31,26,0.08)] px-6 text-[14px] font-bold text-[#b42318]">
                      Close Campaign
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorksPanel({ selectedStage, selectedSource, segmentCount, hasActiveLead }) {
  const steps = [
    {
      title: "Select Filters",
      description: "Choose your stage and source to define the exact queue segment you want to work.",
    },
    {
      title: hasActiveLead ? "Lead Is Locked" : "Auto-Open Lead",
      description: hasActiveLead
        ? "Your current lead stays claimed while you work so another operator cannot take it."
        : "The server claims the next eligible lead and opens the workspace automatically.",
    },
    {
      title: "Use Dispositions",
      description: "Mark every call outcome and save notes so the next operator always sees the right context.",
    },
    {
      title: "Exit Anytime",
      description: "Leave the campaign whenever needed. Claim state and next actions stay server-controlled.",
    },
  ];

  return (
    <div className="space-y-6 rounded-[32px] bg-[#f4f2f8] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div>
        <h3 className="flex items-center gap-2 text-[18px] font-bold tracking-[-0.03em] text-[#0d215c]">
          <InfoIcon />
          How it works
        </h3>
      </div>

      <div className="space-y-7">
        {steps.map((step, index) => (
          <div key={step.title} className="flex gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0d215c] text-xs font-bold text-white">
              {index + 1}
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-[#1b1b1f]">{step.title}</h4>
              <p className="mt-1 text-[12px] leading-6 text-[#5b6474]">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/90 bg-white/65 px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.03)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9ca3b1]">Live network status</p>
        <div className="mt-3 flex items-center gap-3">
          <div className={joinClasses("h-2.5 w-2.5 rounded-full", segmentCount > 0 ? "bg-emerald-500" : "bg-amber-400")} />
          <span className="text-[12px] font-semibold text-[#1b1b1f]">
            {segmentCount > 0 ? "Optimized Connection" : "Waiting For Eligible Leads"}
          </span>
        </div>
        <p className="mt-1 text-[10px] text-[#8891a0]">
          {segmentCount > 0
            ? `${segmentCount} ready now · ${selectedStage?.name || "All stages"} · ${selectedSource?.label || "All sources"}`
            : "Adjust the filters to widen the queue or wait for the next due lead."}
        </p>
      </div>
    </div>
  );
}

function LauncherCard({ stages, sourceOptions, selectedStageId, selectedSourceOrigin }) {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-[rgba(117,118,129,0.12)] bg-white px-6 py-7 shadow-[0_24px_60px_rgba(15,23,42,0.06)] sm:px-9 sm:py-9">
      <div className="absolute right-[-4.5rem] top-[-4.5rem] h-64 w-64 rounded-full bg-[#0d215c]/[0.05] blur-3xl" />
      <div className="absolute bottom-[-3rem] left-[-2rem] h-44 w-44 rounded-full bg-[#0d215c]/[0.05] blur-2xl" />

      <div className="relative z-10">
        <h1 className="text-[32px] font-extrabold leading-[0.96] tracking-[-0.05em] text-[#000d39] sm:text-[40px]">
          Ready to scale
          <br />
          your outreach?
        </h1>
        <p className="mt-4 max-w-[38rem] text-[14px] leading-7 text-[#4e5563]">
          Pick a stage and source, then open the next lead directly into the calling workspace. Your workflow is optimized for speed.
        </p>

        <form action={claimNextLeadAction} className="mt-8 space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            <FieldSelect
              label="Pipeline stage"
              name="stageId"
              defaultValue={selectedStageId}
              options={stages}
              placeholder="All stages"
            />
            <FieldSelect
              label="Lead source"
              name="sourceOrigin"
              defaultValue={selectedSourceOrigin}
              options={sourceOptions.filter((option) => option.value)}
              placeholder="All sources"
            />
          </div>

          <button className="inline-flex min-h-[64px] w-full items-center justify-center gap-3 rounded-[20px] bg-[linear-gradient(90deg,#000d39_0%,#0d215c_100%)] px-9 text-[16px] font-extrabold text-white shadow-[0_22px_40px_rgba(13,33,92,0.22)] transition hover:shadow-[0_26px_46px_rgba(13,33,92,0.28)] md:min-w-[280px] md:w-auto">
            Start Campaign
            <RocketIcon />
          </button>
        </form>
      </div>
    </div>
  );
}

function ActiveCampaignCard({
  activeLead,
  selectedStage,
  selectedSource,
  selectedStageId,
  selectedSourceOrigin,
  activeLeadHref,
}) {
  const activeLeadSource = resolveLeadSourceValue(activeLead);
  const returnTo = buildCampaignHref({
    stageId: selectedStageId,
    sourceOrigin: selectedSourceOrigin,
    leadId: activeLead.id,
  });

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-[rgba(117,118,129,0.12)] bg-white px-6 py-7 shadow-[0_24px_60px_rgba(15,23,42,0.06)] sm:px-9 sm:py-9">
      <div className="absolute right-[-4.5rem] top-[-4.5rem] h-64 w-64 rounded-full bg-[#0d215c]/[0.05] blur-3xl" />
      <div className="relative z-10 space-y-8">
        <div className="space-y-4">
          <span className="inline-flex items-center rounded-full border border-[rgba(13,33,92,0.1)] bg-[#eef3ff] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0d215c]">
            Campaign active
          </span>
          <div className="space-y-3">
            <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.04em] text-[#000d39] sm:text-[34px]">
              {activeLead.full_name || activeLead.email || "Unnamed lead"}
            </h1>
            <p className="max-w-[40rem] text-[13px] leading-6 text-[#4e5563]">
              {selectedStage?.name || "All stages"} · {selectedSource?.label || "All sources"} · {formatCrmPhoneDisplay(activeLead)}
              {activeLead.email ? ` · ${activeLead.email}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CrmBadge tone={resolveToneByStatus(activeLead.lead_status)}>{activeLead.lead_status}</CrmBadge>
            <CrmBadge tone="neutral">{activeLead.current_stage?.name || "No stage"}</CrmBadge>
            <CrmBadge tone={resolveToneByLeadSource(activeLeadSource)}>{formatLeadSourceLabel(activeLeadSource)}</CrmBadge>
            <CrmBadge tone="neutral">
              {formatPreEnrollmentStatus(activeLead.current_pre_enrollment_status)}
            </CrmBadge>
          </div>
        </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#f4f2f8] px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#96a0b1]">Phone</p>
              <p className="mt-2 text-[13px] font-semibold text-[#1b1b1f]">{formatCrmPhoneDisplay(activeLead)}</p>
          </div>
          <div className="rounded-2xl bg-[#f4f2f8] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#96a0b1]">Last update</p>
            <p className="mt-2 text-[13px] font-semibold text-[#1b1b1f]">{formatCrmDateTime(activeLead.updated_at)}</p>
          </div>
          <div className="rounded-2xl bg-[#f4f2f8] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#96a0b1]">Next action</p>
            <p className="mt-2 text-[13px] font-semibold text-[#1b1b1f]">
              {activeLead.next_action_at ? formatCrmDateTime(activeLead.next_action_at) : "Now"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <CrmDialAction
            href={activeLeadHref}
            label="Call Lead"
            className="inline-flex min-h-[52px] items-center justify-center rounded-[18px] bg-[linear-gradient(90deg,#000d39_0%,#0d215c_100%)] px-6 text-[14px] font-bold text-white shadow-[0_18px_34px_rgba(13,33,92,0.2)]"
            disabledClassName="inline-flex min-h-[52px] items-center justify-center rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[#f4f2f8] px-6 text-[14px] font-bold text-[#8d95a3]"
            disabledLabel="No phone number"
          />
          <Link
            href={`/admin/crm/leads/${activeLead.id}`}
            className="inline-flex min-h-[52px] items-center justify-center rounded-[18px] border border-[rgba(117,118,129,0.18)] bg-white px-6 text-[14px] font-bold text-[#0d215c]"
          >
            Open Lead Detail
          </Link>
          <form action={leaveCallingCampaignAction}>
            <input type="hidden" name="leadId" value={activeLead.id} />
            <input type="hidden" name="stageId" value={selectedStageId} />
            <input type="hidden" name="sourceOrigin" value={selectedSourceOrigin} />
            <button className="inline-flex min-h-[52px] items-center justify-center rounded-[18px] border border-[rgba(245,158,11,0.16)] bg-[rgba(245,158,11,0.08)] px-6 text-[14px] font-bold text-[#b45309]">
              Leave Campaign
            </button>
          </form>
        </div>

        <form action={submitCallOutcomeAction} className="space-y-5 border-t border-[rgba(117,118,129,0.12)] pt-8">
          <input type="hidden" name="leadId" value={activeLead.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="stageId" value={selectedStageId} />
          <input type="hidden" name="sourceOrigin" value={selectedSourceOrigin} />

          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2">
              <span className="pl-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#0d215c]">Disposition</span>
              <div className="relative">
                <select
                  name="callOutcome"
                  defaultValue={activeLead.last_call_outcome || "attempted"}
                  className="w-full appearance-none rounded-xl border border-transparent bg-[#f4f2f8] px-5 py-4 pr-12 text-[13px] font-semibold text-[#111827] outline-none transition focus:border-[#0d215c]/15 focus:ring-2 focus:ring-[#0d215c]/10"
                >
                  {CALL_OUTCOMES.map((option) => (
                    <option key={option} value={option}>
                      {formatCallOutcomeLabel(option)}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#7d8798]">
                  <ChevronDownIcon />
                </span>
              </div>
            </label>

            <label className="space-y-2">
              <span className="pl-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#0d215c]">Next action at</span>
              <input
                type="datetime-local"
                name="nextActionAt"
                className="w-full rounded-xl border border-transparent bg-[#f4f2f8] px-5 py-4 text-[13px] font-semibold text-[#111827] outline-none transition focus:border-[#0d215c]/15 focus:ring-2 focus:ring-[#0d215c]/10"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="pl-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#0d215c]">Notes</span>
            <textarea
              name="note"
              rows={6}
              placeholder="Capture objections, next steps, and anything the next operator should see."
              className="w-full rounded-[22px] border border-transparent bg-[#f4f2f8] px-5 py-4 text-[13px] leading-7 text-[#111827] outline-none transition focus:border-[#0d215c]/15 focus:ring-2 focus:ring-[#0d215c]/10"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              name="actionMode"
              value="save"
              className="inline-flex min-h-[56px] items-center justify-center rounded-[18px] border border-[rgba(117,118,129,0.18)] bg-white px-7 text-[15px] font-bold text-[#0d215c]"
            >
              Save
            </button>
            <button
              type="submit"
              name="actionMode"
              value="save_next"
              className="inline-flex min-h-[56px] items-center justify-center rounded-[18px] bg-[linear-gradient(90deg,#000d39_0%,#0d215c_100%)] px-7 text-[15px] font-bold text-white shadow-[0_18px_34px_rgba(13,33,92,0.2)]"
            >
              Save and Next
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MoreDetailsPanel({ activeLead, activeLeadInteractions = [] }) {
  if (!activeLead?.id) return null;

  return (
    <details className="rounded-[28px] border border-[rgba(117,118,129,0.12)] bg-white px-6 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <summary className="cursor-pointer list-none text-sm font-bold uppercase tracking-[0.18em] text-[#0d215c]">
        More details
      </summary>
      <div className="mt-5 space-y-3">
        {!activeLeadInteractions.length ? (
          <div className="rounded-2xl border border-dashed border-[rgba(117,118,129,0.18)] bg-[#faf9fc] px-4 py-8 text-center text-sm text-[#64748b]">
            No previous contact history was found for this lead.
          </div>
        ) : (
          activeLeadInteractions.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-[rgba(117,118,129,0.12)] bg-[#faf9fc] px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <CrmBadge tone="accent">{entry.interaction_kind}</CrmBadge>
                {entry.call_outcome ? <CrmBadge tone="warning">{formatCallOutcomeLabel(entry.call_outcome)}</CrmBadge> : null}
                <CrmBadge tone="neutral">{formatCrmDateTime(entry.created_at)}</CrmBadge>
              </div>
              {entry.summary ? <p className="mt-3 text-sm font-semibold text-[#111827]">{entry.summary}</p> : null}
              {entry.notes ? <p className="mt-2 text-sm leading-6 text-[#5b6474]">{entry.notes}</p> : null}
            </div>
          ))
        )}

        <div className="flex justify-end">
          <Link href={`/admin/crm/leads/${activeLead.id}`} className="text-sm font-semibold text-[#0d215c]">
            Open full lead detail
          </Link>
        </div>
      </div>
    </details>
  );
}

export default function CrmCallingHub({
  searchParams = {},
  activeLead,
  activeLeadInteractions = [],
  pausedSessions = [],
  stages = [],
  sourceOptions = [],
  selectedStageId = "",
  selectedSourceOrigin = "",
  todayMetrics = null,
}) {
  const hasActiveLead = Boolean(activeLead?.id);
  const activeLeadHref = buildCrmDialHref(activeLead);
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) || null;
  const selectedSource =
    sourceOptions.find((option) => option.value === selectedSourceOrigin) || sourceOptions[0] || null;

  return (
    <div className="space-y-8">
      <CallingHubBanner searchParams={searchParams} todayMetrics={todayMetrics} hasActiveLead={hasActiveLead} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_360px] xl:items-start">
        <div className="space-y-6">
          {hasActiveLead ? (
            <ActiveCampaignCard
              activeLead={activeLead}
              selectedStage={selectedStage}
              selectedSource={selectedSource}
              selectedStageId={selectedStageId}
              selectedSourceOrigin={selectedSourceOrigin}
              activeLeadHref={activeLeadHref}
            />
          ) : (
            <LauncherCard
              stages={stages}
              sourceOptions={sourceOptions}
              selectedStageId={selectedStageId}
              selectedSourceOrigin={selectedSourceOrigin}
            />
          )}

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={<CallLogIcon />} value={todayMetrics?.callsToday || 0} label="Calls Today" />
            <MetricCard
              icon={<TimeIcon />}
              accentClass="text-[#d77315]"
              value={todayMetrics?.noAnswerCallsToday || 0}
              label="No Answer Calls"
            />
            <MetricCard
              icon={<CheckCircleIcon />}
              accentClass="text-[#586579]"
              value={todayMetrics?.conversionsToday || 0}
              label="Conversions"
            />
          </div>

          <UnfinishedCampaigns pausedSessions={pausedSessions} />
        </div>

        <HowItWorksPanel
          selectedStage={selectedStage}
          selectedSource={selectedSource}
          segmentCount={todayMetrics?.selectedSegmentLeadCount || 0}
          hasActiveLead={hasActiveLead}
        />
      </div>

      {hasActiveLead ? <MoreDetailsPanel activeLead={activeLead} activeLeadInteractions={activeLeadInteractions} /> : null}
    </div>
  );
}
