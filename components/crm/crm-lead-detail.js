import Link from "next/link";
import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import { createLeadNoteAction, moveLeadStageAction } from "@/app/admin/crm/actions";
import CrmDialAction from "@/components/crm/crm-dial-action";
import CrmLeadDangerActions from "@/components/crm/crm-lead-danger-actions";
import {
  buildCrmDialHref,
  CrmBadge,
  CrmTagRow,
  formatCallOutcomeLabel,
  formatCrmDate,
  formatCrmDateTime,
  formatCrmLeadSourceSummary,
  formatCurrency,
  formatLeadStatusLabel,
  formatLeadSourceLabel,
  formatCrmPhoneDisplay,
  formatPreEnrollmentStatus,
  deriveLeadSourceTags,
  resolveLeadSourceValue,
  resolveToneByLeadSource,
  resolveToneByStatus,
} from "@/components/crm/crm-ui";

export default function CrmLeadDetail({ data, returnTo }) {
  const { lead, stages, interactions, stageHistory, profile, preEnrollment, payments, stageMap, operatorMap } = data;
  const leadSource = resolveLeadSourceValue(lead);
  const leadDialHref = buildCrmDialHref(lead);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Lead detail"
            title={lead.full_name || lead.email || "Unnamed lead"}
            description="This page keeps the interaction log, payment snapshot, and manual stage control in one place."
            actions={
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/crm/leads"
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
                >
                  Back to leads
                </Link>
                <CrmDialAction
                  href={leadDialHref}
                  label="Launch call"
                  className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#020617]"
                />
                <CrmLeadDangerActions
                  leadId={lead.id}
                  returnTo={returnTo}
                  size="md"
                  archiveLabel="Archive lead"
                  deleteLabel="Delete lead"
                />
              </div>
            }
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Status</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <CrmBadge tone={resolveToneByStatus(lead.lead_status)}>{formatLeadStatusLabel(lead.lead_status)}</CrmBadge>
                <CrmBadge tone="accent">{lead.current_stage?.name || "No stage"}</CrmBadge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CrmBadge tone={resolveToneByLeadSource(leadSource)}>{formatLeadSourceLabel(leadSource)}</CrmBadge>
                <CrmBadge tone="neutral">{lead.source_label || lead.source_type || "Unknown source"}</CrmBadge>
              </div>
              <p className="mt-3 text-xs text-[#64748b]">{formatCrmLeadSourceSummary(lead)}</p>
              <CrmTagRow tags={deriveLeadSourceTags(lead)} className="mt-3" />
            </div>
            <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Revenue snapshot</p>
              <p className="mt-2 text-xl font-semibold text-[#111827]">{formatCurrency(lead.approved_revenue_soles || 0)}</p>
              <p className="mt-1 text-xs text-[#64748b]">Approved payments: {lead.approved_payment_count || 0}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Lead snapshot</p>
              <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4 text-sm text-[#334155]">
                <p><span className="font-semibold text-[#111827]">Email:</span> {lead.email || "No email"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Phone:</span> {formatCrmPhoneDisplay(lead)}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Source:</span> {formatLeadSourceLabel(leadSource)}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Source label:</span> {lead.source_label || "No source label"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Source summary:</span> {formatCrmLeadSourceSummary(lead)}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Site:</span> {lead.host || lead.site_key || "Unknown"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Form:</span> {lead.form_label || lead.form_key || "None"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Page path:</span> {lead.page_path || "None"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Source type:</span> {lead.source_type || "Unknown"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Source origin:</span> {lead.source_origin || "Unknown"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Pre-enrollment ID:</span> {lead.pre_enrollment_id || "None"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Pre-enrollment:</span> {formatPreEnrollmentStatus(lead.current_pre_enrollment_status)}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Next action:</span> {lead.next_action_at ? formatCrmDateTime(lead.next_action_at) : "Now"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Last interaction:</span> {lead.last_interaction_at ? formatCrmDateTime(lead.last_interaction_at) : "None yet"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Profile snapshot</p>
              <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4 text-sm text-[#334155]">
                <p><span className="font-semibold text-[#111827]">Student code:</span> {profile?.student_code || "Not assigned"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Profile status:</span> {profile?.status || "Unknown"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Course level:</span> {profile?.course_level || preEnrollment?.selected_level || "Not set"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Period:</span> {preEnrollment?.period || "Unknown"}</p>
                <p className="mt-2"><span className="font-semibold text-[#111827]">Start month:</span> {preEnrollment?.start_month ? formatCrmDate(preEnrollment.start_month) : "Not set"}</p>
              </div>
            </div>
          </div>
        </AdminCard>

        <AdminCard className="space-y-4">
          <AdminSectionHeader eyebrow="Mutations" title="Server-backed changes" description="Stage changes and notes post through server actions only." />

          <form action={moveLeadStageAction} className="space-y-3 rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] p-4">
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Move to stage</label>
              <select
                name="stageId"
                defaultValue={lead.current_stage_id || ""}
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              >
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Reason</label>
              <input
                type="text"
                name="reason"
                placeholder="Why is the stage changing?"
                className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </div>
            <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
              Save stage
            </button>
          </form>

          <form action={createLeadNoteAction} className="space-y-3 rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] p-4">
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Operator note</label>
              <textarea
                name="note"
                rows={5}
                placeholder="Capture what changed, what was learned, or what should happen next."
                className="w-full rounded-[20px] border border-[rgba(15,23,42,0.1)] bg-white px-3 py-3 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
              />
            </div>
            <button className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]">
              Add note
            </button>
          </form>
        </AdminCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <AdminCard className="space-y-4">
          <AdminSectionHeader eyebrow="Interactions" title="Timeline" description="Notes and call outcomes captured for this lead." />
          <div className="space-y-3">
            {interactions.map((entry) => (
              <div key={entry.id} className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CrmBadge tone="accent">{entry.interaction_kind}</CrmBadge>
                  {entry.call_outcome ? <CrmBadge tone="warning">{formatCallOutcomeLabel(entry.call_outcome)}</CrmBadge> : null}
                  <CrmBadge tone="neutral">{formatCrmDateTime(entry.created_at)}</CrmBadge>
                </div>
                {entry.summary ? <p className="mt-3 text-sm font-semibold text-[#111827]">{entry.summary}</p> : null}
                {entry.notes ? <p className="mt-2 text-sm leading-6 text-[#475569]">{entry.notes}</p> : null}
                {entry.operator_user_id ? (
                  <p className="mt-3 text-xs text-[#64748b]">
                    Operator: {operatorMap.get(entry.operator_user_id)?.full_name || entry.operator_user_id}
                  </p>
                ) : null}
              </div>
            ))}
            {!interactions.length ? (
              <div className="rounded-[20px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[#f8fafc] px-4 py-10 text-center text-sm text-[#64748b]">
                No interactions yet.
              </div>
            ) : null}
          </div>
        </AdminCard>

        <div className="space-y-4">
          <AdminCard className="space-y-4">
            <AdminSectionHeader eyebrow="Payment summary" title="Approved payment history" description="Revenue remains tied to approved payments only." />
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">{formatCrmDate(payment.billing_month)}</p>
                      <p className="text-xs text-[#64748b]">{payment.status}</p>
                    </div>
                    <CrmBadge tone={payment.status === "approved" ? "success" : "neutral"}>
                      {formatCurrency(payment.amount_soles || 0)}
                    </CrmBadge>
                  </div>
                  <p className="mt-2 text-xs text-[#64748b]">
                    Approved at {payment.approved_at ? formatCrmDateTime(payment.approved_at) : "Not approved"}
                  </p>
                </div>
              ))}
              {!payments.length ? (
                <div className="rounded-[20px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[#f8fafc] px-4 py-10 text-center text-sm text-[#64748b]">
                  No payment rows were found for this lead.
                </div>
              ) : null}
            </div>
          </AdminCard>

          <AdminCard className="space-y-4">
            <AdminSectionHeader eyebrow="Stage history" title="Movement log" description="Each explicit UI stage change is stored in CRM stage history." />
            <div className="space-y-3">
              {stageHistory.map((entry) => (
                <div key={entry.id} className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <CrmBadge tone="neutral">{stageMap.get(entry.from_stage_id)?.name || "Start"}</CrmBadge>
                    <span className="text-xs text-[#94a3b8]">to</span>
                    <CrmBadge tone="accent">{stageMap.get(entry.to_stage_id)?.name || "Unknown"}</CrmBadge>
                  </div>
                  <p className="mt-2 text-xs text-[#64748b]">
                    {entry.reason || "No reason recorded"} | {formatCrmDateTime(entry.created_at)}
                  </p>
                </div>
              ))}
              {!stageHistory.length ? (
                <div className="rounded-[20px] border border-dashed border-[rgba(15,23,42,0.12)] bg-[#f8fafc] px-4 py-10 text-center text-sm text-[#64748b]">
                  No stage moves have been recorded yet.
                </div>
              ) : null}
            </div>
          </AdminCard>
        </div>
      </div>
    </div>
  );
}
