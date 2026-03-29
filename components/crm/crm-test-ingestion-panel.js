"use client";

import { useActionState } from "react";
import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import { simulateCrmWebhookLeadAction } from "@/app/admin/crm/actions";
import { CrmBadge } from "@/components/crm/crm-ui";

const INITIAL_STATE = {
  success: false,
  error: null,
  provider: null,
  message: null,
};

export default function CrmTestIngestionPanel({ enabled = false, returnTo = "/admin/crm/settings" }) {
  const [state, formAction, pending] = useActionState(simulateCrmWebhookLeadAction, INITIAL_STATE);

  if (!enabled) return null;

  return (
    <AdminCard className="space-y-4">
      <AdminSectionHeader
        eyebrow="Temporary testing"
        title="Lead source simulation"
        description="Create sample WebForm or Meta leads through the real CRM normalization and ingestion flow."
      />

      <div className="rounded-[22px] border border-[rgba(245,158,11,0.18)] bg-[rgba(255,251,235,0.9)] px-4 py-4 text-sm text-[#92400e]">
        <div className="flex flex-wrap items-center gap-2">
          <CrmBadge tone="warning">Temporary</CrmBadge>
          <span>These controls are for admin testing only and are not final production UX.</span>
        </div>
      </div>

      {state?.success || state?.error ? (
        <div
          className={`rounded-[20px] border px-4 py-3 text-sm ${
            state?.success
              ? "border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.08)] text-[#047857]"
              : "border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.08)] text-[#b91c1c]"
          }`}
        >
          {state?.message || state?.error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <form action={formAction} className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] p-4">
          <input type="hidden" name="provider" value="meta" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="noRedirect" value="1" />
          <p className="text-sm font-semibold text-[#111827]">Simulate Meta lead</p>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">
            Creates a sample Meta lead so you can review source tags, canonical phone handling, and pipeline placement.
          </p>
          <button
            disabled={pending}
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Sending..." : "Send Meta sample"}
          </button>
        </form>

        <form action={formAction} className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] p-4">
          <input type="hidden" name="provider" value="web_form" />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="noRedirect" value="1" />
          <p className="text-sm font-semibold text-[#111827]">Simulate WebForm lead</p>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">
            Creates a sample internal WebForm lead so you can inspect site or form identity, canonical phone handling, and CRM detail behavior.
          </p>
          <button
            disabled={pending}
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Sending..." : "Send WebForm sample"}
          </button>
        </form>
      </div>
    </AdminCard>
  );
}
