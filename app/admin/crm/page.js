import Link from "next/link";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import CrmDashboard from "@/components/crm/crm-dashboard";
import CrmTestIngestionPanel from "@/components/crm/crm-test-ingestion-panel";
import { CrmNotice } from "@/components/crm/crm-ui";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCrmDashboardData } from "@/app/admin/crm/_data";

export const metadata = {
  title: "CRM | EnglishMate",
};

export default async function CrmHomePage({ searchParams }) {
  const params = (await Promise.resolve(searchParams)) || {};
  const { supabase, context } = await requireCrmPageAccess();
  const dashboard = await loadCrmDashboardData(supabase);

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="CRM"
        title="Control room"
        description="Work the classroom lead pipeline from one CRM surface: review the board, claim the next lead, and keep enrolled revenue grounded in approved payments."
        actions={
          <>
            <Link
              href="/admin/crm/callinghub"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Open calling hub
            </Link>
            <Link
              href="/admin/crm/kanban"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Open Kanban
            </Link>
            <Link
              href="/admin/crm/settings"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Pipeline settings
            </Link>
            <Link
              href="/admin/crm/settings/integrations"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Integrations
            </Link>
            <Link
              href="/admin/crm/operators"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Operators
            </Link>
            {context?.isClassicAdmin ? (
              <Link
                href="/admin"
                className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
              >
                Back to admin
              </Link>
            ) : null}
          </>
        }
      />
      <CrmNotice searchParams={params} />
      <CrmTestIngestionPanel enabled={Boolean(context?.isClassicAdmin || context?.isCrmAdmin)} returnTo="/admin/crm" />
      <CrmDashboard dashboard={dashboard} />
    </AdminPage>
  );
}
