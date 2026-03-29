import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import CrmCallingHub from "@/components/crm/crm-calling-hub";
import { CrmNotice } from "@/components/crm/crm-ui";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCallingHubData } from "@/app/admin/crm/_data";

export const metadata = {
  title: "Calling Hub | EnglishMate CRM",
};

export default async function CrmCallingHubPage({ searchParams }) {
  const params = (await Promise.resolve(searchParams)) || {};
  const { supabase, user } = await requireCrmPageAccess();
  const data = await loadCallingHubData(supabase, {
    operatorUserId: user.id,
    selectedLeadId: params?.lead?.toString() || "",
    campaignKey: params?.campaign?.toString() || "",
    selectedStageId: params?.stage?.toString() || "",
    selectedSourceOrigin: params?.source?.toString() || "",
  });

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="CRM"
        title="Calling Hub"
        description="Choose a stage and source, start the queue, launch the `tel:` call, and keep the workspace focused on the active lead."
      />
      <CrmNotice searchParams={params} />
      <CrmCallingHub
        activeLead={data.activeLead}
        activeLeadInteractions={data.activeLeadInteractions}
        stages={data.stageOptions || data.stages || []}
        sourceOptions={data.sourceOptions || []}
        selectedStageId={data.selectedStageId}
        selectedSourceOrigin={data.selectedSourceOrigin}
      />
    </AdminPage>
  );
}
