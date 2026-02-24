import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { deleteCourseTemplate } from "@/app/admin/actions";
import { getFrequencyReference } from "@/lib/course-sessions";

export const metadata = {
  title: "Plantillas de curso | Admin",
};

function getMissingTableName(error) {
  const message = String(error?.message || "");
  const relationMatch = message.match(/relation\s+"([^"]+)"/i);
  if (relationMatch?.[1]) return relationMatch[1];
  return null;
}

function formatFrequencyLabel(value) {
  const map = {
    DAILY: "Daily (L-V)",
    MWF: "Interdiario 1 (LMV)",
    TT: "Interdiario 2 (MJ)",
    SAT: "Sabatinos",
  };
  return map[value] || value || "-";
}

export default async function CourseTemplatesPage() {
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

  let missingTable = false;
  const { data: templatesRows, error: templatesError } = await supabase
    .from("course_templates")
    .select("id, course_level, frequency, template_name, created_at")
    .order("course_level", { ascending: true })
    .order("frequency", { ascending: true });

  if (templatesError) {
    if (getMissingTableName(templatesError)?.endsWith("course_templates")) {
      missingTable = true;
    } else {
      console.error("No se pudo listar plantillas de curso", templatesError);
    }
  }

  const templates = templatesRows || [];
  const templateIds = templates.map((row) => row.id);
  let sessionsCountByTemplate = new Map();
  if (templateIds.length && !missingTable) {
    const { data: sessionsRows, error: sessionsError } = await supabase
      .from("template_sessions")
      .select("id, template_id")
      .in("template_id", templateIds);
    if (!sessionsError) {
      sessionsCountByTemplate = (sessionsRows || []).reduce((acc, row) => {
        acc.set(row.template_id, (acc.get(row.template_id) || 0) + 1);
        return acc;
      }, new Map());
    }
  }

  return (
    <section className="relative min-h-screen overflow-hidden bg-background px-6 py-10 text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-primary/25 blur-[140px]" />
        <div className="absolute bottom-0 right-16 h-80 w-80 rounded-full bg-accent/15 blur-[160px]" />
      </div>
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted">Admin / Plantillas</p>
            <h1 className="text-3xl font-semibold">Plantillas de curso</h1>
            <p className="text-sm text-muted">
              Define estructura y material reusable por nivel + frecuencia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/courses/templates/new"
              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-2"
            >
              + Nueva plantilla
            </Link>
            <Link
              href="/admin/commissions"
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
            >
              Volver a comisiones
            </Link>
          </div>
        </div>

        {missingTable ? (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            Falta crear tablas de templates en Supabase. Ejecuta el SQL actualizado.
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Nivel</th>
                  <th className="px-3 py-2">Frecuencia</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Sesiones/mes</th>
                  <th className="px-3 py-2">Meses</th>
                  <th className="px-3 py-2">Sesiones total</th>
                  <th className="px-3 py-2">Creada</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => {
                  const metrics = getFrequencyReference(template.frequency);
                  const sessionsPerMonth = metrics?.sessionsPerMonth || 0;
                  const months = metrics?.months || 0;
                  const expectedTotal = sessionsPerMonth * months;
                  const currentTotal = sessionsCountByTemplate.get(template.id) || 0;
                  return (
                    <tr key={template.id} className="border-t border-border text-foreground">
                      <td className="px-3 py-2">{template.course_level}</td>
                      <td className="px-3 py-2">{formatFrequencyLabel(template.frequency)}</td>
                      <td className="px-3 py-2">{template.template_name || "-"}</td>
                      <td className="px-3 py-2">{sessionsPerMonth || "-"}</td>
                      <td className="px-3 py-2">{months || "-"}</td>
                      <td className="px-3 py-2">{currentTotal || expectedTotal || 0}</td>
                      <td className="px-3 py-2">{template.created_at ? template.created_at.slice(0, 10) : "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/admin/courses/templates/${template.id}`}
                            className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-surface-2"
                          >
                            Editar
                          </Link>
                          <form action={deleteCourseTemplate}>
                            <input type="hidden" name="templateId" value={template.id} />
                            <button
                              type="submit"
                              className="rounded-full border border-danger/50 px-3 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
                            >
                              Eliminar
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!templates.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
                      Aun no hay plantillas creadas.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
