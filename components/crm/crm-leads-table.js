import Link from "next/link";
import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import CrmLeadDangerActions from "@/components/crm/crm-lead-danger-actions";
import {
  CrmBadge,
  CrmTagRow,
  formatCrmPhoneDisplay,
  formatCrmDateTime,
  formatCrmLeadSourceSummary,
  formatCurrency,
  formatLeadSourceLabel,
  formatPreEnrollmentStatus,
  deriveLeadSourceTags,
  resolveLeadSourceValue,
  resolveToneByLeadSource,
  resolveToneByStatus,
} from "@/components/crm/crm-ui";

export default function CrmLeadsTable({ leads, stages, filters }) {
  const activeFilters = [
    filters?.search ? `Search: ${filters.search}` : null,
    filters?.leadStatus ? `Status: ${filters.leadStatus}` : null,
    filters?.stageName ? `Stage: ${filters.stageName}` : null,
    filters?.sourceType ? `Source: ${formatLeadSourceLabel(filters.sourceType)}` : null,
  ].filter(Boolean);

  const sourceOptions = [
    { value: "", label: "All sources" },
    { value: "pre_enrollment", label: "Virtual classroom" },
    { value: "meta", label: "Meta" },
    { value: "web_form", label: "Web forms" },
    { value: "formspree", label: "Formspree (legacy)" },
    { value: "manual", label: "Manual" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-4">
      <AdminCard className="space-y-4 border-[rgba(16,52,116,0.1)] bg-[rgba(255,255,255,0.95)] backdrop-blur">
        <AdminSectionHeader
          eyebrow="Lead list"
          title="Pipeline table"
          description="Use server-side filters, then jump into the lead detail when you need a full timeline."
          meta={<CrmBadge tone="accent">{leads.length} result(s)</CrmBadge>}
        />

        <form method="get" className="grid gap-3 lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_auto]">
          <input
            type="search"
            name="q"
            defaultValue={filters?.search || ""}
            placeholder="Search name, email, phone, or source"
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          />
          <select
            name="status"
            defaultValue={filters?.leadStatus || ""}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="archived">Archived</option>
          </select>
          <select
            name="stage"
            defaultValue={filters?.stageId || ""}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          >
            <option value="">All stages</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <select
            name="source"
            defaultValue={filters?.sourceType || ""}
            className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
          >
            {sourceOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
              Apply
            </button>
            <Link
              href="/admin/crm/leads"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Clear
            </Link>
          </div>
        </form>

        {activeFilters.length ? (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((item) => (
              <CrmBadge key={item} tone="neutral">
                {item}
              </CrmBadge>
            ))}
          </div>
        ) : null}
      </AdminCard>

      <AdminCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-[#0f172a]">
            <thead>
              <tr className="bg-[#f8fafc] text-left text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
                <th className="px-4 py-3 font-semibold">Lead</th>
                <th className="px-4 py-3 font-semibold">Pipeline</th>
                <th className="px-4 py-3 font-semibold">Revenue</th>
                <th className="px-4 py-3 font-semibold">Follow-up</th>
                <th className="px-4 py-3 text-right font-semibold">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const leadSource = resolveLeadSourceValue(lead);
                return (
                  <tr key={lead.id} className="border-t border-[rgba(15,23,42,0.08)] align-top">
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium text-[#111827]">{lead.full_name || lead.email || "Unnamed lead"}</p>
                      <p className="text-xs text-[#64748b]">
                        {lead.email || "No email"}
                        {lead.phone ? ` | ${formatCrmPhoneDisplay(lead)}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <CrmBadge tone={resolveToneByLeadSource(leadSource)}>
                          {formatLeadSourceLabel(leadSource)}
                        </CrmBadge>
                        <CrmBadge tone="neutral">{lead.source_label || lead.source_type || "Unknown source"}</CrmBadge>
                      </div>
                      <p className="text-xs text-[#64748b]">{formatCrmLeadSourceSummary(lead)}</p>
                      <CrmTagRow tags={deriveLeadSourceTags(lead)} className="pt-1" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <CrmBadge tone="accent">{lead.current_stage?.name || "No stage"}</CrmBadge>
                        <CrmBadge tone={resolveToneByStatus(lead.lead_status)}>{lead.lead_status}</CrmBadge>
                      </div>
                      <p className="text-xs text-[#64748b]">{formatPreEnrollmentStatus(lead.current_pre_enrollment_status)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium text-[#111827]">{formatCurrency(lead.approved_revenue_soles || 0)}</p>
                      <p className="text-xs text-[#64748b]">Approved payments: {lead.approved_payment_count || 0}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-xs text-[#64748b]">Next action</p>
                      <p className="font-medium text-[#111827]">{lead.next_action_at ? formatCrmDateTime(lead.next_action_at) : "Now"}</p>
                      <p className="text-xs text-[#64748b]">Updated {formatCrmDateTime(lead.updated_at)}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/admin/crm/leads/${lead.id}`}
                        className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
                      >
                        Open detail
                      </Link>
                      <CrmLeadDangerActions
                        leadId={lead.id}
                        returnTo={filters?.returnTo || "/admin/crm/leads"}
                        size="sm"
                      />
                    </div>
                  </td>
                  </tr>
                );
              })}
              {!leads.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#64748b]">
                    No CRM leads match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
