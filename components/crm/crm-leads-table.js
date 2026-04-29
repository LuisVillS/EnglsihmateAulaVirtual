"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import CrmLeadDangerActions from "@/components/crm/crm-lead-danger-actions";
import FilterPopover, { FilterChipGroup, FilterPopoverSection } from "@/components/filter-popover";
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

function LeadsFilterPopover({ filters, stages, activeFilterCount }) {
  const [searchValue, setSearchValue] = useState(filters?.search || "");
  const [statusValue, setStatusValue] = useState(filters?.leadStatus || "");
  const [stageValue, setStageValue] = useState(filters?.stageId || "");
  const [sourceValue, setSourceValue] = useState(filters?.sourceType || "");

  const sourceOptions = [
    { value: "", label: "All sources" },
    { value: "pre_enrollment", label: "Virtual classroom" },
    { value: "meta", label: "Meta" },
    { value: "web_form", label: "Web forms" },
    { value: "formspree", label: "Formspree (legacy)" },
    { value: "manual", label: "Manual" },
    { value: "other", label: "Other" },
  ];

  const statusOptions = [
    { value: "open", label: "Open" },
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
    { value: "archived", label: "Archived" },
  ];

  const stageOptions = stages.map((stage) => ({
    value: stage.id,
    label: stage.name,
  }));

  return (
    <FilterPopover
      title="Filter Lead List"
      buttonLabel="Filters"
      activeCount={activeFilterCount}
      width={470}
      footer={() => (
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Link
            href="/admin/crm/leads"
            className="inline-flex min-h-12 items-center justify-center rounded-[16px] border border-[rgba(16,52,116,0.14)] px-4 py-3 text-sm font-semibold text-[#103474] transition hover:bg-[#f5f8ff]"
          >
            Clear all
          </Link>
          <button
            type="submit"
            form="crm-leads-filters-form"
            className="inline-flex min-h-12 items-center justify-center rounded-[18px] bg-[#103474] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(16,52,116,0.2)] transition hover:bg-[#0c295a]"
          >
            Apply Filters
          </button>
        </div>
      )}
    >
      <form id="crm-leads-filters-form" method="get" className="space-y-5">
        <input type="hidden" name="status" value={statusValue} />
        <input type="hidden" name="stage" value={stageValue} />
        <input type="hidden" name="source" value={sourceValue} />

        <FilterPopoverSection label="Search" description="Find a lead by name, email, phone, or source.">
          <input
            type="search"
            name="q"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search lead details"
            className="w-full rounded-[16px] border border-[rgba(16,52,116,0.14)] bg-[#fbfcff] px-4 py-3 text-sm text-[#1f2432] placeholder:text-[#97a3ba] focus:border-[#103474] focus:outline-none"
          />
        </FilterPopoverSection>

        <FilterPopoverSection label="Status" description="Choose the pipeline outcome state.">
          <FilterChipGroup options={statusOptions} value={statusValue} onChange={setStatusValue} />
        </FilterPopoverSection>

        <FilterPopoverSection label="Stage" description="Focus the table on a specific pipeline stage.">
          <FilterChipGroup options={stageOptions} value={stageValue} onChange={setStageValue} />
        </FilterPopoverSection>

        <FilterPopoverSection label="Source" description="Filter leads by origin channel.">
          <FilterChipGroup options={sourceOptions.filter((option) => option.value)} value={sourceValue} onChange={setSourceValue} />
        </FilterPopoverSection>
      </form>
    </FilterPopover>
  );
}

export default function CrmLeadsTable({ leads, stages, filters }) {
  const activeFilters = [
    filters?.search ? `Search: ${filters.search}` : null,
    filters?.leadStatus ? `Status: ${filters.leadStatus}` : null,
    filters?.stageName ? `Stage: ${filters.stageName}` : null,
    filters?.sourceType ? `Source: ${formatLeadSourceLabel(filters.sourceType)}` : null,
  ].filter(Boolean);
  const filterStateKey = [
    filters?.search || "",
    filters?.leadStatus || "",
    filters?.stageId || "",
    filters?.sourceType || "",
  ].join("::");

  return (
    <div className="space-y-4">
      <AdminCard className="space-y-4 border-[rgba(16,52,116,0.1)] bg-[rgba(255,255,255,0.95)] backdrop-blur">
        <AdminSectionHeader
          eyebrow="Lead list"
          title="Pipeline table"
          description="Use server-side filters, then jump into the lead detail when you need a full timeline."
          meta={<CrmBadge tone="accent">{leads.length} result(s)</CrmBadge>}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <LeadsFilterPopover
            key={filterStateKey}
            filters={filters}
            stages={stages}
            activeFilterCount={activeFilters.length}
          />

          <div className="text-sm text-[#64748b]">
            Server-side filtering keeps the table and lead counts aligned.
          </div>
        </div>

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
