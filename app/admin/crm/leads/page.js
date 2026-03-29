import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import CrmLeadsTable from "@/components/crm/crm-leads-table";
import { CrmNotice } from "@/components/crm/crm-ui";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCrmLeadsPageData } from "@/app/admin/crm/_data";

export const metadata = {
  title: "CRM Leads | EnglishMate",
};

export default async function CrmLeadsPage({ searchParams }) {
  const params = (await Promise.resolve(searchParams)) || {};
  const { supabase } = await requireCrmPageAccess();
  const filters = {
    search: params?.q?.toString() || "",
    leadStatus: params?.status?.toString() || "",
    stageId: params?.stage?.toString() || "",
    sourceType: params?.source?.toString() || "",
  };
  const data = await loadCrmLeadsPageData(supabase, filters);
  const stageName = data.stages.find((stage) => stage.id === filters.stageId)?.name || "";
  const returnQuery = new URLSearchParams();
  if (filters.search) returnQuery.set("q", filters.search);
  if (filters.leadStatus) returnQuery.set("status", filters.leadStatus);
  if (filters.stageId) returnQuery.set("stage", filters.stageId);
  if (filters.sourceType) returnQuery.set("source", filters.sourceType);
  const returnTo = returnQuery.toString() ? `/admin/crm/leads?${returnQuery.toString()}` : "/admin/crm/leads";

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="CRM"
        title="Lead list"
        description="Filter the CRM pipeline by stage, status, and search terms from one compact table."
      />
      <CrmNotice searchParams={params} />
      <CrmLeadsTable leads={data.leads} stages={data.stages} filters={{ ...filters, stageName, returnTo }} />
    </AdminPage>
  );
}
