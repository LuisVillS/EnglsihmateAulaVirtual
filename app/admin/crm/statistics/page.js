import Link from "next/link";
import {
  AdminBadge,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  AdminSectionHeader,
  AdminStatCard,
  AdminStatsGrid,
} from "@/components/admin-page";
import { CrmBadge } from "@/components/crm/crm-ui";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCrmStatisticsData } from "@/lib/crm/statistics";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return "None";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const metadata = {
  title: "CRM Statistics | EnglishMate",
};

export default async function CrmStatisticsPage() {
  const { supabase } = await requireCrmPageAccess();
  const statistics = await loadCrmStatisticsData(supabase);
  const readiness = statistics.releaseReadiness;

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="CRM"
        title="Statistics"
        description="Release-facing CRM metrics, webhook activity, automation health, and captured revenue sourced only from approved payments."
        actions={
          <>
            <Link
              href="/admin/crm"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Back to CRM
            </Link>
            <Link
              href="/api/crm/automations/run?safe=1"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Safe automation run
            </Link>
          </>
        }
      />

      <AdminStatsGrid>
        <AdminStatCard label="Approved revenue" value={formatCurrency(statistics.totals.approvedRevenueSoles)} hint="Approved payments only." />
        <AdminStatCard label="Approved payments" value={statistics.totals.approvedPaymentCount} hint="Windowed captured-payment count." />
        <AdminStatCard label="Inbound events" value={statistics.totals.webhookEventCount} hint="Latest recorded CRM inbound events." />
        <AdminStatCard label="Automation jobs" value={statistics.totals.automationJobCount} hint="Latest CRM automation job rows." />
      </AdminStatsGrid>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Release readiness"
            title="Current ship snapshot"
              description="A CRM release is only considered ready when stages, leads, approved revenue, and automation health all align."
            meta={
              <CrmBadge tone={readiness.readyForRelease ? "success" : "warning"}>
                {readiness.readyForRelease ? "Ready" : "Needs follow-up"}
              </CrmBadge>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Leads</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <AdminBadge tone="accent">{statistics.totals.leads} total</AdminBadge>
                <AdminBadge tone="neutral">{statistics.totals.queueReadyLeads} queue ready</AdminBadge>
                <AdminBadge tone="success">{statistics.totals.wonLeads} won</AdminBadge>
              </div>
            </div>
            <div className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Automations</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <AdminBadge tone={readiness.hasAutomationFailures ? "danger" : "success"}>
                  {readiness.failedAutomationJobCount} failed
                </AdminBadge>
                <AdminBadge tone="warning">{readiness.pendingAutomationJobCount} pending</AdminBadge>
              </div>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-[#475569]">
            <li>Stages present: {readiness.hasStages ? "yes" : "no"}</li>
            <li>Lead activity present: {readiness.hasLeads ? "yes" : "no"}</li>
            <li>Approved payments present: {readiness.hasApprovedPayments ? "yes" : "no"}</li>
            <li>Inbound activity present: {readiness.hasWebhookActivity ? "yes" : "no"}</li>
            <li>Automation jobs present: {readiness.hasAutomationJobs ? "yes" : "no"}</li>
          </ul>
        </AdminCard>

        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Pipeline"
            title="Stage distribution"
            description="Lead counts per active CRM stage."
          />
          <div className="space-y-3">
            {statistics.stageCounts.map((item) => (
              <div
                key={item.stageId}
                className="flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[#111827]">{item.stageName}</p>
                  <p className="text-xs text-[#64748b]">{item.pipelineState}</p>
                </div>
                <CrmBadge tone="accent">{item.leadCount}</CrmBadge>
              </div>
            ))}
          </div>
        </AdminCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Revenue"
            title="Approved payment buckets"
            description="Billing-month summary sourced only from approved payments inside the current statistics window."
          />
          <div className="space-y-3">
            {statistics.paymentBuckets.map((bucket) => (
              <div key={bucket.billingMonth} className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#111827]">{bucket.billingMonth}</p>
                    <p className="text-xs text-[#64748b]">{bucket.paymentCount} approved payment(s)</p>
                  </div>
                  <CrmBadge tone="success">{formatCurrency(bucket.revenueSoles)}</CrmBadge>
                </div>
                <p className="mt-2 text-xs text-[#64748b]">Latest approval: {formatDateTime(bucket.latestApprovedAt)}</p>
              </div>
            ))}
          </div>
        </AdminCard>

        <div className="space-y-4">
          <AdminCard className="space-y-4">
            <AdminSectionHeader
              eyebrow="Inbound"
              title="Latest CRM inbound events"
              description="Recent web-form or Meta provider events and their processing lifecycle."
            />
            <div className="space-y-3">
              {(statistics.webhookEvents || []).slice(0, 6).map((event) => (
                <div key={event.id} className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <CrmBadge tone="accent">{event.provider}</CrmBadge>
                    <CrmBadge tone="neutral">{event.event_type || "event"}</CrmBadge>
                    <CrmBadge tone={event.status === "failed" ? "danger" : event.status === "processed" ? "success" : "warning"}>
                      {event.status}
                    </CrmBadge>
                  </div>
                  <p className="mt-2 text-xs text-[#64748b]">
                    Created {formatDateTime(event.created_at)} | Processed {formatDateTime(event.processed_at)}
                  </p>
                </div>
              ))}
            </div>
          </AdminCard>

          <AdminCard className="space-y-4">
            <AdminSectionHeader
              eyebrow="Automations"
              title="Latest job execution"
              description="Recent CRM automation jobs and their asynchronous delivery state."
            />
            <div className="space-y-3">
              {(statistics.automationJobs || []).slice(0, 6).map((job) => (
                <div key={job.id} className="rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <CrmBadge tone="accent">{job.status}</CrmBadge>
                    <CrmBadge tone="neutral">Attempts {job.attempt_count || 0}</CrmBadge>
                  </div>
                  <p className="mt-2 text-xs text-[#64748b]">
                    Scheduled {formatDateTime(job.scheduled_for)} | Finished {formatDateTime(job.finished_at)}
                  </p>
                  {job.error_message ? <p className="mt-2 text-xs text-[#b91c1c]">{job.error_message}</p> : null}
                </div>
              ))}
            </div>
          </AdminCard>
        </div>
      </div>
    </AdminPage>
  );
}
