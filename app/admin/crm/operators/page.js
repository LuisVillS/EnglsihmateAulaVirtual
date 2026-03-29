import Link from "next/link";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import CrmOperatorsPanel from "@/components/crm/crm-operators-panel";
import { CrmNotice } from "@/components/crm/crm-ui";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCrmOperatorsData } from "@/app/admin/crm/_data";

export const metadata = {
  title: "CRM Operators | EnglishMate",
};

export default async function CrmOperatorsPage({ searchParams }) {
  const params = (await Promise.resolve(searchParams)) || {};
  const { supabase, context } = await requireCrmPageAccess();
  const data = await loadCrmOperatorsData(supabase);
  const canEdit = Boolean(context?.isCrmAdmin || context?.isClassicAdmin);

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="CRM"
        title="Operators"
        description="Create call agent users for the CRM and keep their operator profile data in one place."
        actions={
          <>
            <Link
              href="/admin/crm/settings"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Pipeline settings
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
      <CrmOperatorsPanel operators={data.operators} canEdit={canEdit} />
    </AdminPage>
  );
}
