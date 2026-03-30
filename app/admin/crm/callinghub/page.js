import { AdminPage } from "@/components/admin-page";
import CrmCallingHub from "@/components/crm/crm-calling-hub";
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
    queueLeadIds: String(params?.queue || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    suspendAutoSelection: true,
  });

  return (
    <AdminPage className="space-y-6">
      <CrmCallingHub
        searchParams={params}
        activeLead={data.activeLead}
        activeLeadInteractions={data.activeLeadInteractions}
        pausedSessions={data.pausedSessions || []}
        stages={data.stageOptions || data.stages || []}
        sourceOptions={data.sourceOptions || []}
        selectedStageId={data.selectedStageId}
        selectedSourceOrigin={data.selectedSourceOrigin}
        todayMetrics={data.todayMetrics}
      />
    </AdminPage>
  );
}
