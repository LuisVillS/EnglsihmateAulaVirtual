import Link from "next/link";
import { headers } from "next/headers";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import CrmIntegrationsPanel from "@/components/crm/crm-integrations-panel";
import { requireCrmPageAccess } from "@/lib/admin/access";

export const metadata = {
  title: "CRM Integrations | EnglishMate",
};

async function resolveBaseUrl() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin.replace(/\/$/, "");

  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  if (!host) return "";

  const proto = requestHeaders.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`.replace(/\/$/, "");
}

export default async function CrmIntegrationsPage() {
  await requireCrmPageAccess();
  const baseUrl = await resolveBaseUrl();

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="CRM"
        title="Integrations setup"
        description="Use the internal WebForm endpoint for public lead capture and configure Meta against the verified webhook plus lead-retrieval flow."
        actions={
          <>
            <Link
              href="/admin/crm/settings"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Back to settings
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

      <CrmIntegrationsPanel
        webFormEndpointUrl={`${baseUrl}/api/leads/submit`}
        metaWebhookUrl={`${baseUrl}/api/webhooks/meta/leads`}
        turnstileSiteKeyConfigured={Boolean(String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim())}
        turnstileSecretConfigured={Boolean(String(process.env.TURNSTILE_SECRET_KEY || "").trim())}
        metaVerifyTokenConfigured={Boolean(String(process.env.META_WEBHOOK_VERIFY_TOKEN || "").trim())}
        metaAppSecretConfigured={Boolean(String(process.env.META_APP_SECRET || "").trim())}
        metaPageAccessTokenConfigured={Boolean(String(process.env.META_PAGE_ACCESS_TOKEN || "").trim())}
      />
    </AdminPage>
  );
}
