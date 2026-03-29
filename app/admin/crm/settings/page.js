import Link from "next/link";
import { AdminPage, AdminPageHeader, AdminStatCard, AdminStatsGrid } from "@/components/admin-page";
import CrmStageManagementPanel from "@/components/crm/crm-stage-management";
import { CrmBadge, CrmNotice } from "@/components/crm/crm-ui";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCrmSettingsData } from "@/app/admin/crm/_data";

export const metadata = {
  title: "CRM Settings | EnglishMate",
};

export default async function CrmSettingsPage({ searchParams }) {
  const params = (await Promise.resolve(searchParams)) || {};
  const { supabase, context } = await requireCrmPageAccess();
  const data = await loadCrmSettingsData(supabase);

  const canEditStages = Boolean(context?.isClassicAdmin || context?.isCrmAdmin);
  const activeStages = data.stages.filter((stage) => stage.is_active).length;
  const activeAutomations = data.automations.filter((automation) => automation.is_active).length;
  const activeOperators = data.operators.filter((operator) => operator.is_active).length;
  const defaultStages = data.stages.filter((stage) => stage.is_default).length;

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="CRM"
        title="Pipeline settings"
        description="Manage CRM stages, reordering, activation, stage-level Brevo template IDs, and source ignore rules from one admin surface."
        actions={
          <>
            <Link
              href="/admin/crm/operators"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Open operators
            </Link>
            <Link
              href="/admin/crm"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Back to CRM
            </Link>
          </>
        }
      />
      <CrmNotice searchParams={params} />

      <AdminStatsGrid>
        <AdminStatCard label="Active stages" value={activeStages} hint="Visible in Kanban and pipeline views." />
        <AdminStatCard label="Default stages" value={defaultStages} hint="One active default stage is recommended." />
        <AdminStatCard label="Auto-send stages" value={activeAutomations} hint="Active stages with a Brevo template ID." />
        <AdminStatCard label="Active operators" value={activeOperators} hint="CRM users currently marked active." />
      </AdminStatsGrid>

      <div className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4 text-sm text-[#475569]">
        <div className="flex flex-wrap items-center gap-2">
          <CrmBadge tone="accent">Safe archive</CrmBadge>
          <span>Deactivation is the safe archive path for stages; no destructive stage delete is exposed here.</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Link
          href="/admin/crm/settings/integrations"
          className="group rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-[0_18px_38px_rgba(15,23,42,0.05)] transition hover:-translate-y-[1px] hover:border-[rgba(16,52,116,0.16)] hover:shadow-[0_22px_44px_rgba(16,52,116,0.08)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#111827]">Integrations setup</p>
              <p className="mt-1 text-sm text-[#64748b]">
                Copy the webhook URLs and review what stays in Meta or Formspree versus what the CRM stores.
              </p>
            </div>
            <span className="rounded-full bg-[#eef3ff] px-2.5 py-1 text-[11px] font-semibold text-[#103474] transition group-hover:bg-[#103474] group-hover:text-white">
              Open
            </span>
          </div>
        </Link>
      </div>

      <CrmStageManagementPanel
        stages={data.stages}
        canEdit={canEditStages}
        returnTo="/admin/crm/settings"
      />
    </AdminPage>
  );
}
