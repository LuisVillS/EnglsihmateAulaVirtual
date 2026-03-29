import Link from "next/link";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import CrmKanbanBoard from "@/components/crm/crm-kanban-board";
import { CrmNotice } from "@/components/crm/crm-ui";
import { requireCrmPageAccess } from "@/lib/admin/access";
import { loadCrmKanbanData } from "@/app/admin/crm/_data";

export const metadata = {
  title: "CRM Kanban | EnglishMate",
};

export default async function CrmKanbanPage({ searchParams }) {
  const params = (await Promise.resolve(searchParams)) || {};
  const { supabase } = await requireCrmPageAccess();
  const search = params?.q?.toString() || "";
  const leadStatus = params?.status?.toString() || "";
  const sourceType = params?.source?.toString() || "";
  const data = await loadCrmKanbanData(supabase, { search, leadStatus, sourceType });
  const boardSnapshotKey = [
    search,
    leadStatus,
    sourceType,
    (data.stages || []).map((stage) => `${stage.id}:${stage.position}:${stage.updated_at}`).join("|"),
    (data.leads || []).map((lead) => `${lead.id}:${lead.updated_at}:${lead.current_stage_id || ""}`).join("|"),
  ].join("::");
  const returnQuery = new URLSearchParams();
  if (search) returnQuery.set("q", search);
  if (leadStatus) returnQuery.set("status", leadStatus);
  if (sourceType) returnQuery.set("source", sourceType);
  const returnTo = returnQuery.toString() ? `/admin/crm/kanban?${returnQuery.toString()}` : "/admin/crm/kanban";

  return (
    <AdminPage className="space-y-4">
      <AdminPageHeader
        eyebrow="CRM"
        title="Kanban"
        description="Move classroom leads across CRM stages with server-backed persistence."
      />
      <form method="get" className="grid gap-3 rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_18px_34px_rgba(15,23,42,0.05)] lg:grid-cols-[1.1fr_0.8fr_0.8fr_auto]">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search name, email, phone, or source"
          className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
        />
        <select
          name="status"
          defaultValue={leadStatus}
          className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="won">Won</option>
          <option value="lost">Lost</option>
        </select>
        <select
          name="source"
          defaultValue={sourceType}
          className="w-full rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2.5 text-sm text-[#0f172a] focus:border-[#103474] focus:outline-none"
        >
          <option value="">All sources</option>
          <option value="pre_enrollment">Virtual classroom</option>
          <option value="meta">Meta</option>
          <option value="formspree">Formspree</option>
          <option value="manual">Manual</option>
          <option value="other">Other</option>
        </select>
        <div className="flex gap-2">
          <button className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]">
            Apply
          </button>
          <Link
            href="/admin/crm/kanban"
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
          >
            Clear
          </Link>
        </div>
      </form>
      <CrmNotice searchParams={params} />
      <CrmKanbanBoard key={boardSnapshotKey} stages={data.stages} leads={data.leads} returnTo={returnTo} />
    </AdminPage>
  );
}
