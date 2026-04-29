import { AdminPage } from "@/components/admin-page";
import CrmKanbanPipeline from "@/components/crm/crm-kanban-pipeline";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCrmKanbanData } from "@/app/admin/crm/_data";

export const metadata = {
  title: "CRM Kanban | EnglishMate",
};

export default async function CrmKanbanPage({ searchParams }) {
  const params = (await Promise.resolve(searchParams)) || {};
  const { supabase, context } = await requireCrmPageAccess();
  const search = params?.q?.toString() || "";
  const leadStatus = params?.status?.toString() || "";
  const sourceType = params?.source?.toString() || "";
  const data = await loadCrmKanbanData(supabase, { search, leadStatus, sourceType });
  const boardSnapshotKey = [
    search,
    leadStatus,
    sourceType,
    (data.stages || []).map((stage) => `${stage.id}:${stage.position}:${stage.updated_at}`).join("|"),
    (data.leads || []).map((lead) => `${lead.id}:${lead.updated_at}:${lead.current_stage_id || ""}:${lead.latest_note || ""}`).join("|"),
  ].join("::");
  const returnQuery = new URLSearchParams();
  if (search) returnQuery.set("q", search);
  if (leadStatus) returnQuery.set("status", leadStatus);
  if (sourceType) returnQuery.set("source", sourceType);
  const returnTo = returnQuery.toString() ? `/admin/crm/kanban?${returnQuery.toString()}` : "/admin/crm/kanban";

  return (
    <AdminPage className="space-y-8 pb-8">
      <CrmKanbanPipeline
        key={boardSnapshotKey}
        stages={data.stages}
        leads={data.leads}
        summaryMetrics={data.summaryMetrics}
        templateOptions={data.templateOptions}
        canManageStages={Boolean(context?.isClassicAdmin || context?.isCrmAdmin)}
        returnTo={returnTo}
        searchParams={params}
      />
    </AdminPage>
  );
}
