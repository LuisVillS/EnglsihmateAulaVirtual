import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { autoDeactivateExpiredCommissions, getLimaTodayISO, resolveCommissionStatus } from "@/lib/commissions";
import CommissionsTable from "./table";
import CommissionCreateForm from "./commission-create-form";

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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const { data: adminRecord } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!adminRecord?.id) redirect("/admin/login");

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
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Comisiones</p>
            <h1 className="text-3xl font-semibold">Comisiones</h1>
            <p className="text-sm text-muted">Gestiona horarios, sesiones y alumnos por comision.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/courses/templates"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Plantillas
            </Link>
            <Link
              href="/admin"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Volver al panel
            </Link>
          </div>
        </div>

        <details open className="rounded-2xl border border-border bg-surface p-5">
          <summary className="cursor-pointer text-base font-semibold text-foreground">
            Crear nueva comision
          </summary>
          <div className="mt-4 max-w-3xl">
            <CommissionCreateForm templates={templates} />
          </div>
        </details>

        <CommissionsTable commissions={commissions} />
      </div>
    </section>
  );
}
