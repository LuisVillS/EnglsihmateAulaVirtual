import { notFound } from "next/navigation";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import CrmLeadDetail from "@/components/crm/crm-lead-detail";
import { CrmNotice } from "@/components/crm/crm-ui";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCrmLeadDetailData } from "@/app/admin/crm/_data";

export const metadata = {
  title: "CRM Lead Detail | EnglishMate",
};

export default async function CrmLeadDetailPage({ params: paramsPromise, searchParams }) {
  const params = await paramsPromise;
  const query = (await Promise.resolve(searchParams)) || {};
  const { supabase } = await requireCrmPageAccess();
  const data = await loadCrmLeadDetailData(supabase, params?.id);

  if (!data?.lead?.id) {
    notFound();
  }

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="CRM"
        title="Lead detail"
        description="Inspect the full CRM context for one classroom lead and persist manual updates through server actions."
      />
      <CrmNotice searchParams={query} />
      <CrmLeadDetail data={data} returnTo={`/admin/crm/leads/${data.lead.id}`} />
    </AdminPage>
  );
}
