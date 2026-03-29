"use client";

import { useState } from "react";
import { AdminCard, AdminSectionHeader } from "@/components/admin-page";
import { CrmBadge } from "@/components/crm/crm-ui";

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex min-h-9 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function StatusBadge({ ok, okLabel = "Configured", missingLabel = "Missing" }) {
  return <CrmBadge tone={ok ? "success" : "warning"}>{ok ? okLabel : missingLabel}</CrmBadge>;
}

function EndpointCard({ title, description, endpointUrl, notes, children }) {
  return (
    <div className="space-y-4 rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[#111827]">{title}</p>
        <p className="text-xs text-[#64748b]">{description}</p>
      </div>

      <div className="rounded-[18px] border border-[rgba(16,52,116,0.1)] bg-[#f8fbff] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Endpoint</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="break-all rounded-2xl bg-white px-3 py-2 text-sm text-[#103474]">{endpointUrl}</code>
          <CopyButton value={endpointUrl} label="Copy URL" />
        </div>
      </div>

      {children}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#94a3b8]">Setup notes</p>
        <ul className="space-y-2 text-sm leading-6 text-[#475569]">
          {notes.map((item) => (
            <li key={item} className="rounded-[16px] border border-[rgba(15,23,42,0.06)] bg-[#fcfdff] px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function CrmIntegrationsPanel({
  webFormEndpointUrl,
  metaWebhookUrl,
  turnstileSiteKeyConfigured = false,
  turnstileSecretConfigured = false,
  metaVerifyTokenConfigured = false,
  metaAppSecretConfigured = false,
  metaPageAccessTokenConfigured = false,
}) {
  return (
    <AdminCard className="space-y-4">
      <AdminSectionHeader
        eyebrow="Integrations"
        title="WebForm and Meta setup"
        description="Public lead capture now uses the internal WebForm pipeline. Meta remains a provider-specific webhook plus lead-retrieval connector."
      />

      <div className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#fcfdff] px-4 py-4 text-sm text-[#475569]">
        <div className="flex flex-wrap items-center gap-2">
          <CrmBadge tone="accent">Internal pipeline</CrmBadge>
          <span>Formspree is deprecated. Public forms should post to the internal endpoint and include Turnstile tokens plus stable form metadata.</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <EndpointCard
          title="Internal WebForm"
          description="Use this endpoint for public forms on englishmate.com.pe and virtual.englishmate.com.pe."
          endpointUrl={webFormEndpointUrl}
          notes={[
            "Public forms must POST JSON to this endpoint with site_key, form_key, form_label, and page_path.",
            "Cloudflare Turnstile is mandatory and validated server-side before CRM normalization runs.",
            "The active registration flow already uses the same first-party CRM web-form pipeline for lead capture.",
            "Per-site and per-form identity is stored in CRM so the operator can distinguish submissions without relying on external tools.",
          ]}
        >
          <div className="flex flex-wrap gap-2">
            <StatusBadge ok={turnstileSiteKeyConfigured} okLabel="Turnstile site key" missingLabel="Missing site key" />
            <StatusBadge ok={turnstileSecretConfigured} okLabel="Turnstile secret" missingLabel="Missing secret" />
          </div>
        </EndpointCard>

        <EndpointCard
          title="Meta Lead Ads"
          description="Webhook verification plus provider-side lead retrieval for leadgen notifications."
          endpointUrl={metaWebhookUrl}
          notes={[
            "Configure the Meta webhook callback with this URL and the META_WEBHOOK_VERIFY_TOKEN value.",
            "The POST path validates X-Hub-Signature-256 using META_APP_SECRET before processing the event.",
            "Webhook notifications are stored raw first, then the app retrieves full lead details using META_PAGE_ACCESS_TOKEN and leadgen_id.",
            "Keep existing callback URLs stable by pointing Meta at the explicit webhook path shown here.",
          ]}
        >
          <div className="flex flex-wrap gap-2">
            <StatusBadge ok={metaVerifyTokenConfigured} okLabel="Verify token" missingLabel="Missing verify token" />
            <StatusBadge ok={metaAppSecretConfigured} okLabel="App secret" missingLabel="Missing app secret" />
            <StatusBadge ok={metaPageAccessTokenConfigured} okLabel="Page access token" missingLabel="Missing page token" />
          </div>
        </EndpointCard>
      </div>
    </AdminCard>
  );
}
