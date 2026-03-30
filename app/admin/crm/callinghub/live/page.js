import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin-page";
import CrmCallingSession from "@/components/crm/crm-calling-session";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCallingHubData } from "@/app/admin/crm/_data";

export const metadata = {
  title: "Live Calling Session | EnglishMate CRM",
};

export default async function CrmCallingSessionPage({ searchParams }) {
  const params = (await Promise.resolve(searchParams)) || {};
  const { supabase, user } = await requireCrmPageAccess();
  const data = await loadCallingHubData(supabase, {
    operatorUserId: user.id,
    selectedLeadId: params?.lead?.toString() || "",
    campaignKey: params?.campaign?.toString() || "",
    selectedStageId: params?.stage?.toString() || "",
    selectedSourceOrigin: params?.source?.toString() || "",
    sessionLeadIds: String(params?.history || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    queueLeadIds: String(params?.queue || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  });

  if (!data.activeLead?.id) {
    const launcherParams = new URLSearchParams();
    if (data.selectedStageId) launcherParams.set("stage", data.selectedStageId);
    if (data.selectedSourceOrigin) launcherParams.set("source", data.selectedSourceOrigin);
    redirect(`/admin/crm/callinghub${launcherParams.toString() ? `?${launcherParams.toString()}` : ""}`);
  }

  return (
    <AdminPage className="space-y-6 pb-28">
      <CrmCallingSession
        searchParams={params}
        activeLead={data.activeLead}
        activeLeadInteractions={data.activeLeadInteractions}
        queuePreview={data.queuePreview}
        sessionHistory={data.sessionHistory}
        stages={data.stageOptions || data.stages || []}
        selectedStageId={data.selectedStageId}
        selectedSourceOrigin={data.selectedSourceOrigin}
        todayMetrics={data.todayMetrics}
        latestLeadNote={data.latestLeadNote}
        noteSaved={String(params?.saved || "") === "1"}
        sessionLeadIds={data.sessionLeadIds || []}
        queueLeadIds={data.queueLeadIds || []}
        pausedSessionId={params?.pausedSessionId?.toString() || ""}
      />
    </AdminPage>
  );
}
