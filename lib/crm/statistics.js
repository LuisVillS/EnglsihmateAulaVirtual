import { CRM_LEAD_COLUMNS, listCrmStages } from "@/lib/crm/leads";
import { isMissingCrmObjectError, resolveCrmDb, selectCrmMany } from "@/lib/crm/server";

const CRM_APPROVED_PAYMENT_COLUMNS =
  "id, student_id, billing_month, amount_soles, status, approved_at, created_at";

const CRM_INBOUND_EVENT_COLUMNS =
  "id, provider, event_type, processing_status, received_at, processed_at";
const CRM_WEBHOOK_EVENT_COLUMNS = "id, provider, event_type, status, created_at, processed_at";
const CRM_AUTOMATION_JOB_COLUMNS =
  "id, automation_id, lead_id, status, scheduled_for, started_at, finished_at, attempt_count, error_message, created_at, updated_at";

const DEFAULT_WINDOW_DAYS = 30;

function toIsoDateOnly(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseDateLike(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function startOfDayIso(value) {
  const parsed = parseDateLike(value);
  if (!parsed) return null;
  const copy = new Date(parsed);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function endOfDayIso(value) {
  const parsed = parseDateLike(value);
  if (!parsed) return null;
  const copy = new Date(parsed);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
}

function getApprovedPaymentDate(payment) {
  return (
    payment?.approved_at ||
    payment?.created_at ||
    null
  );
}

function groupPaymentsByBillingMonth(payments) {
  const buckets = new Map();

  for (const payment of payments || []) {
    const billingMonth = toIsoDateOnly(payment?.billing_month) || "unknown";
    const current = buckets.get(billingMonth) || {
      billingMonth,
      paymentCount: 0,
      revenueSoles: 0,
      latestApprovedAt: null,
    };

    current.paymentCount += 1;
    current.revenueSoles += Number(payment?.amount_soles || 0);

    const approvedAt = getApprovedPaymentDate(payment);
    if (approvedAt && (!current.latestApprovedAt || approvedAt > current.latestApprovedAt)) {
      current.latestApprovedAt = approvedAt;
    }

    buckets.set(billingMonth, current);
  }

  return Array.from(buckets.values()).sort((a, b) => String(a.billingMonth).localeCompare(String(b.billingMonth)));
}

function filterPaymentsByWindow(payments, { from, to } = {}) {
  const fromMs = from ? Date.parse(from) : null;
  const toMs = to ? Date.parse(to) : null;

  if (!Number.isFinite(fromMs) && !Number.isFinite(toMs)) {
    return Array.isArray(payments) ? payments : [];
  }

  return (payments || []).filter((payment) => {
    const rawDate = getApprovedPaymentDate(payment);
    if (!rawDate) return false;
    const dateMs = Date.parse(rawDate);
    if (!Number.isFinite(dateMs)) return false;
    if (Number.isFinite(fromMs) && dateMs < fromMs) return false;
    if (Number.isFinite(toMs) && dateMs > toMs) return false;
    return true;
  });
}

function countLeadStatuses(leads) {
  const counts = {
    open: 0,
    won: 0,
    lost: 0,
    archived: 0,
  };

  for (const lead of leads || []) {
    const status = String(lead?.lead_status || "").trim().toLowerCase();
    if (status in counts) {
      counts[status] += 1;
    }
  }

  return counts;
}

function countQueueReadyLeads(leads, now = new Date()) {
  const nowMs = now.getTime();
  return (leads || []).filter((lead) => {
    if (String(lead?.lead_status || "").trim().toLowerCase() !== "open") return false;

    const nextActionAt = lead?.next_action_at ? new Date(lead.next_action_at) : null;
    const claimExpiresAt = lead?.queue_claim_expires_at ? new Date(lead.queue_claim_expires_at) : null;
    const nextActionDue = !nextActionAt || Number.isNaN(nextActionAt.getTime()) || nextActionAt.getTime() <= nowMs;
    const claimAvailable =
      !lead?.queue_claimed_by_user_id ||
      !claimExpiresAt ||
      Number.isNaN(claimExpiresAt.getTime()) ||
      claimExpiresAt.getTime() <= nowMs;

    return nextActionDue && claimAvailable;
  }).length;
}

function buildReleaseReadinessSnapshot({
  stages = [],
  leads = [],
  approvedPayments = [],
  automationJobs = [],
  webhookEvents = [],
} = {}) {
  const openLeads = leads.filter((lead) => String(lead?.lead_status || "").trim().toLowerCase() === "open");
  const failedAutomationJobs = automationJobs.filter((job) => String(job?.status || "").trim().toLowerCase() === "failed");
  const pendingAutomationJobs = automationJobs.filter((job) =>
    ["pending", "processing"].includes(String(job?.status || "").trim().toLowerCase())
  );

  return {
    hasStages: stages.length > 0,
    hasLeads: leads.length > 0,
    hasOpenLeads: openLeads.length > 0,
    hasApprovedPayments: approvedPayments.length > 0,
    hasWebhookActivity: webhookEvents.length > 0,
    hasAutomationJobs: automationJobs.length > 0,
    hasAutomationFailures: failedAutomationJobs.length > 0,
    queueReadyLeads: countQueueReadyLeads(leads),
    failedAutomationJobCount: failedAutomationJobs.length,
    pendingAutomationJobCount: pendingAutomationJobs.length,
    webhookEventCount: webhookEvents.length,
    readyForRelease:
      stages.length > 0 &&
      leads.length > 0 &&
      approvedPayments.length > 0 &&
      failedAutomationJobs.length === 0,
  };
}

async function safeSelectMany(client, table, columns, buildQuery) {
  try {
    return await selectCrmMany(client, table, columns, buildQuery);
  } catch (error) {
    if (isMissingCrmObjectError(error)) return [];
    throw error;
  }
}

export async function loadCrmStatisticsData(client, options = {}) {
  const db = resolveCrmDb(client);
  if (!db?.from) {
    return {
      window: {
        from: null,
        to: null,
      },
      stages: [],
      leads: [],
      approvedPayments: [],
      webhookEvents: [],
      automationJobs: [],
      stageCounts: [],
      leadStatusCounts: {
        open: 0,
        won: 0,
        lost: 0,
        archived: 0,
      },
      paymentBuckets: [],
      totals: {
        leads: 0,
        openLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        archivedLeads: 0,
        queueReadyLeads: 0,
        approvedRevenueSoles: 0,
        approvedPaymentCount: 0,
        webhookEventCount: 0,
        automationJobCount: 0,
      },
      releaseReadiness: buildReleaseReadinessSnapshot(),
    };
  }

  const now = new Date();
  const windowDays = Math.max(1, Number(options.windowDays || DEFAULT_WINDOW_DAYS) || DEFAULT_WINDOW_DAYS);
  const windowEnd = parseDateLike(options.windowEnd || now) || now;
  const windowStart = parseDateLike(options.windowStart) || new Date(windowEnd.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);

  const paymentsFrom = startOfDayIso(windowStart);
  const paymentsTo = endOfDayIso(windowEnd);

  const [stages, leads, approvedPayments, inboundEvents, webhookEventsFallback, automationJobs] = await Promise.all([
    listCrmStages(db),
    safeSelectMany(db, "crm_leads", CRM_LEAD_COLUMNS),
    safeSelectMany(db, "payments", CRM_APPROVED_PAYMENT_COLUMNS, (query) =>
      query.eq("status", "approved").order("billing_month", { ascending: true }).order("created_at", { ascending: true })
    ),
    safeSelectMany(db, "crm_inbound_events", CRM_INBOUND_EVENT_COLUMNS, (query) =>
      query.order("received_at", { ascending: false }).limit(200)
    ),
    safeSelectMany(db, "crm_webhook_events", CRM_WEBHOOK_EVENT_COLUMNS, (query) =>
      query.order("created_at", { ascending: false }).limit(200)
    ),
    safeSelectMany(db, "crm_automation_jobs", CRM_AUTOMATION_JOB_COLUMNS, (query) =>
      query.order("created_at", { ascending: false }).limit(200)
    ),
  ]);

  const webhookEvents = (inboundEvents || []).length
    ? (inboundEvents || []).map((event) => ({
        id: event.id,
        provider: event.provider,
        event_type: event.event_type,
        status: event.processing_status,
        created_at: event.received_at,
        processed_at: event.processed_at,
      }))
    : webhookEventsFallback;

  const filteredPayments = filterPaymentsByWindow(approvedPayments, { from: paymentsFrom, to: paymentsTo });
  const leadStatusCounts = countLeadStatuses(leads);
  const queueReadyLeads = countQueueReadyLeads(leads, now);
  const approvedRevenueSoles = filteredPayments.reduce((sum, payment) => sum + Number(payment?.amount_soles || 0), 0);
  const approvedPaymentCount = filteredPayments.length;

  const stageLeadCounts = stages.map((stage) => ({
    stageId: stage.id,
    stageKey: stage.stage_key,
    stageName: stage.name,
    pipelineState: stage.pipeline_state,
    leadCount: leads.filter((lead) => lead?.current_stage_id === stage.id).length,
  }));

  return {
    window: {
      from: paymentsFrom,
      to: paymentsTo,
    },
    stages,
    leads,
    approvedPayments: filteredPayments,
    webhookEvents,
    automationJobs,
    stageCounts: stageLeadCounts,
    leadStatusCounts,
    paymentBuckets: groupPaymentsByBillingMonth(filteredPayments),
    totals: {
      leads: leads.length,
      openLeads: leadStatusCounts.open,
      wonLeads: leadStatusCounts.won,
      lostLeads: leadStatusCounts.lost,
      archivedLeads: leadStatusCounts.archived,
      queueReadyLeads,
      approvedRevenueSoles,
      approvedPaymentCount,
      webhookEventCount: webhookEvents.length,
      automationJobCount: automationJobs.length,
    },
    releaseReadiness: buildReleaseReadinessSnapshot({
      stages,
      leads,
      approvedPayments: filteredPayments,
      automationJobs,
      webhookEvents,
    }),
  };
}

export async function loadCrmReleaseReadinessData(client, options = {}) {
  const data = await loadCrmStatisticsData(client, options);
  return {
    window: data.window,
    totals: data.totals,
    releaseReadiness: data.releaseReadiness,
    approvedPaymentCount: data.totals.approvedPaymentCount,
    approvedRevenueSoles: data.totals.approvedRevenueSoles,
    latestApprovedPaymentAt: data.approvedPayments.reduce((latest, payment) => {
      const approvedAt = getApprovedPaymentDate(payment);
      if (!approvedAt) return latest;
      if (!latest) return approvedAt;
      return approvedAt > latest ? approvedAt : latest;
    }, null),
  };
}

export { buildReleaseReadinessSnapshot, groupPaymentsByBillingMonth };
