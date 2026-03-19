import { requireAdminPageAccess } from "@/lib/admin/access";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import { AdminPage } from "@/components/admin-page";
import CommissionsWorkspace from "./commissions-workspace";

export const metadata = {
  title: "Comisiones | Admin",
};

function getMissingColumnFromError(error) {
  const message = String(error?.message || "");
  const couldNotFindMatch = message.match(/could not find the '([^']+)' column/i);
  if (couldNotFindMatch?.[1]) return couldNotFindMatch[1];
  const relationMatch = message.match(/column\s+\w+\.([a-zA-Z0-9_]+)\s+does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];
  const plainMatch = message.match(/column\s+([a-zA-Z0-9_]+)\s+does not exist/i);
  return plainMatch?.[1] || null;
}

export default async function CommissionsPage() {
  const { supabase } = await requireAdminPageAccess();

  await autoDeactivateExpiredCommissions();

  const commissionColumns = [
    "id",
    "course_level",
    "commission_number",
    "start_date",
    "end_date",
    "start_time",
    "end_time",
    "modality_key",
    "days_of_week",
    "status",
    "is_active",
    "created_at",
  ];

  let commissionsData = null;
  let commissionsError = null;
  let selectedColumns = [...commissionColumns];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await supabase
      .from("course_commissions")
      .select(selectedColumns.join(","))
      .order("created_at", { ascending: false });
    commissionsData = result.data;
    commissionsError = result.error;
    if (!commissionsError) break;

    const missingColumn = getMissingColumnFromError(commissionsError);
    if (!missingColumn || !selectedColumns.includes(missingColumn)) break;
    selectedColumns = selectedColumns.filter((column) => column !== missingColumn);
  }

  if (commissionsError) {
    console.error("No se pudieron listar comisiones", commissionsError);
  }

  const { data: enrollmentRows } = await supabase
    .from("profiles")
    .select("commission_id")
    .not("commission_id", "is", null);

  const counts = new Map();
  (enrollmentRows || []).forEach((row) => {
    if (!row?.commission_id) return;
    counts.set(row.commission_id, (counts.get(row.commission_id) || 0) + 1);
  });

  const todayIso = getLimaTodayISO();
  const commissions = (commissionsData || []).map((commission) => ({
    ...commission,
    computed_status: resolveCommissionStatus(commission, todayIso),
    enrolled_count: counts.get(commission.id) || 0,
  }));

  let templateColumns = [
    "id",
    "course_level",
    "frequency",
    "template_name",
    "course_duration_months",
    "class_duration_minutes",
  ];
  let templates = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase
      .from("course_templates")
      .select(templateColumns.join(","))
      .order("course_level", { ascending: true })
      .order("frequency", { ascending: true })
      .order("template_name", { ascending: true });
    if (!result.error) {
      templates = result.data || [];
      break;
    }
    const missingColumn = getMissingColumnFromError(result.error);
    if (!missingColumn || !templateColumns.includes(missingColumn)) {
      console.error("No se pudieron listar plantillas para crear comisiones", result.error);
      break;
    }
    templateColumns = templateColumns.filter((column) => column !== missingColumn);
  }

  return (
    <AdminPage className="space-y-4">
      <CommissionsWorkspace commissions={commissions} templates={templates} />
    </AdminPage>
  );
}
