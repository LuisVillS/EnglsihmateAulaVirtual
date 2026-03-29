import Link from "next/link";
import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import {
  CrmBadge,
  CrmMetric,
  CrmSectionLink,
  formatCrmPhoneDisplay,
  formatCrmDateTime,
  formatCrmLeadSourceSummary,
  formatCurrency,
  formatLeadSourceLabel,
  formatLeadStatusLabel,
  formatPreEnrollmentStatus,
  resolveLeadSourceValue,
  resolveToneByLeadSource,
  resolveToneByStatus,
} from "@/components/crm/crm-ui";

export default function CrmDashboard({ dashboard }) {
  const stageCounts = new Map();
  for (const lead of dashboard?.leads || []) {
    const key = lead?.current_stage?.name || "Unassigned";
    stageCounts.set(key, (stageCounts.get(key) || 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CrmMetric label="Open leads" value={dashboard?.totals?.open || 0} hint="Pending classroom conversion." />
        <CrmMetric label="Won leads" value={dashboard?.totals?.won || 0} hint="Decisive state: approved." />
        <CrmMetric
          label="Captured revenue"
          value={formatCurrency(dashboard?.totals?.revenue || 0)}
          hint="Approved payments only."
        />
        <CrmMetric label="Queue ready" value={dashboard?.totals?.queueReady || 0} hint="Due and claimable right now." />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Fast lanes"
            title="Operator shortcuts"
            description="Jump straight into the three highest-frequency flows."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <CrmSectionLink
              href="/admin/crm/callinghub"
              label="Calling Hub"
              meta="Claim the next due lead and save outcomes without leaving the screen."
            />
            <CrmSectionLink
              href="/admin/crm/kanban"
              label="Kanban"
              meta="Move leads across stages while keeping server-side persistence."
            />
            <CrmSectionLink
              href="/admin/crm/leads"
              label="Lead list"
              meta="Filter the full pipeline and open detailed lead histories."
            />
            <CrmSectionLink
              href="/admin/crm/settings"
              label="Pipeline settings"
              meta="Manage stages, reordering, and stage-level template mappings."
            />
            <CrmSectionLink
              href="/admin/crm/settings/integrations"
              label="Integrations"
              meta="Review webhook URLs, secret handling, manual setup steps, and CRM test tools."
            />
            <CrmSectionLink
              href="/admin/crm/operators"
              label="Operators"
              meta="Create call agents who can sign in through the CRM login entrypoint."
            />
          </div>
        </AdminCard>

        <AdminCard className="space-y-4">
          <AdminSectionHeader eyebrow="Pipeline" title="Stage load" description="Current lead distribution by active CRM stage." />
          <div className="space-y-3">
            {dashboard?.stages?.map((stage) => (
              <div
                key={stage.id}
                className="flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[#111827]">{stage.name}</p>
                  <p className="text-xs text-[#64748b]">{stage.pipeline_state}</p>
                </div>
                <CrmBadge
                  tone={stage.pipeline_state === "won" ? "success" : stage.pipeline_state === "lost" ? "danger" : "accent"}
                >
                  {stageCounts.get(stage.name) || 0}
                </CrmBadge>
              </div>
            ))}
          </div>
        </AdminCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Latest activity"
            title="Recent leads"
            description="Fresh records entering or moving through the classroom CRM flow."
          />
          <div className="space-y-3">
            {(dashboard?.recentLeads || []).map((lead) => {
              const leadSource = resolveLeadSourceValue(lead);
              return (
                <Link
                  key={lead.id}
                  href={`/admin/crm/leads/${lead.id}`}
                  className="flex flex-col gap-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4 transition hover:border-[rgba(16,52,116,0.16)] hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#111827]">{lead.full_name || lead.email || "Unnamed lead"}</p>
                    <p className="text-xs text-[#64748b]">
                      {lead.email || "No email"}
                      {lead.phone ? ` | ${formatCrmPhoneDisplay(lead)}` : ""}
                    </p>
                    <p className="text-xs text-[#64748b]">
                      {lead.current_stage?.name || "No stage"} | {formatPreEnrollmentStatus(lead.current_pre_enrollment_status)}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <CrmBadge tone={resolveToneByLeadSource(leadSource)}>
                        {formatLeadSourceLabel(leadSource)}
                      </CrmBadge>
                      <CrmBadge tone="neutral">{lead.source_label || lead.source_type || "Unknown source"}</CrmBadge>
                    </div>
                    <p className="text-xs text-[#64748b]">{formatCrmLeadSourceSummary(lead)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CrmBadge tone={resolveToneByStatus(lead.lead_status)}>
                      {formatLeadStatusLabel(lead.lead_status)}
                    </CrmBadge>
                    <CrmBadge tone="neutral">{formatCrmDateTime(lead.updated_at)}</CrmBadge>
                  </div>
                </Link>
              );
            })}
          </div>
        </AdminCard>

        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Revenue"
            title="Recently won"
            description="Approved classroom leads and their captured payment snapshot."
          />
          <div className="space-y-3">
            {(dashboard?.recentWon || []).map((lead) => (
              <div key={lead.id} className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#111827]">{lead.full_name || lead.email || "Unnamed lead"}</p>
                    <p className="text-xs text-[#64748b]">{formatCurrency(lead.approved_revenue_soles || 0)}</p>
                  </div>
                  <CrmBadge tone="success">Won</CrmBadge>
                </div>
                <p className="mt-2 text-xs text-[#64748b]">
                  Approved payments: {lead.approved_payment_count || 0} | Last approval{" "}
                  {formatCrmDateTime(lead.latest_approved_payment_at)}
                </p>
              </div>
            ))}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
