import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteCourseTemplate } from "@/app/admin/actions";
import {
  AdminBadge,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  AdminSectionHeader,
} from "@/components/admin-page";
import { getFrequencyReference } from "@/lib/course-sessions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
    DAILY: "Diario (L-V)",
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
    <AdminPage className="mx-auto w-full max-w-7xl">
      <AdminPageHeader
        eyebrow="Contenido academico"
        title="Plantillas de curso"
        description="Estructuras reutilizables por nivel y frecuencia, con las mismas rutas y acciones actuales dentro de un indice mas limpio."
        actions={
          <>
            <Link
              href="/admin/courses/templates/new"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Nueva plantilla
            </Link>
            <Link
              href="/admin/commissions"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Ver comisiones
            </Link>
          </>
        }
      />

      {missingTable ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          Falta crear tablas de templates en Supabase. Ejecuta el SQL actualizado.
        </div>
      ) : null}

      <AdminCard className="space-y-4">
        <AdminSectionHeader
          eyebrow="Catalogo"
          title="Biblioteca de plantillas"
          description="Consulta, edita o elimina plantillas manteniendo intacta la logica de sesiones y duracion."
          meta={<AdminBadge tone="accent">{templates.length} plantilla(s)</AdminBadge>}
        />

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(15,23,42,0.08)] text-left text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
                <th className="px-3 py-3 font-semibold">Nivel</th>
                <th className="px-3 py-3 font-semibold">Frecuencia</th>
                <th className="px-3 py-3 font-semibold">Nombre</th>
                <th className="px-3 py-3 font-semibold">Sesiones / mes</th>
                <th className="px-3 py-3 font-semibold">Meses</th>
                <th className="px-3 py-3 font-semibold">Sesiones totales</th>
                <th className="px-3 py-3 font-semibold">Creada</th>
                <th className="px-3 py-3 text-right font-semibold">Acciones</th>
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
                  <tr key={template.id} className="border-b border-[rgba(15,23,42,0.06)] text-[#0f172a] last:border-b-0">
                    <td className="px-3 py-3 font-medium">{template.course_level}</td>
                    <td className="px-3 py-3 text-[#475569]">{formatFrequencyLabel(template.frequency)}</td>
                    <td className="px-3 py-3">{template.template_name || "-"}</td>
                    <td className="px-3 py-3 text-[#475569]">{sessionsPerMonth || "-"}</td>
                    <td className="px-3 py-3 text-[#475569]">{months || "-"}</td>
                    <td className="px-3 py-3 text-[#475569]">{currentTotal || expectedTotal || 0}</td>
                    <td className="px-3 py-3 text-[#475569]">{template.created_at ? template.created_at.slice(0, 10) : "-"}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/courses/templates/${template.id}`}
                          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
                        >
                          Editar
                        </Link>
                        <form action={deleteCourseTemplate}>
                          <input type="hidden" name="templateId" value={template.id} />
                          <button
                            type="submit"
                            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(239,68,68,0.2)] bg-white px-3 text-xs font-semibold text-[#b91c1c] transition hover:bg-[rgba(239,68,68,0.06)]"
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
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-[#64748b]">
                    Aun no hay plantillas creadas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
