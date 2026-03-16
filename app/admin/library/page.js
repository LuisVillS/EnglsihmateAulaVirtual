import Link from "next/link";
import {
  AdminBadge,
  AdminCard,
  AdminPage,
  AdminPageHeader,
  AdminSectionHeader,
  AdminStatCard,
  AdminStatsGrid,
} from "@/components/admin-page";
import { requireAdminLibraryPageAccess } from "@/lib/library/page-access";
import { isMissingLibraryTableError, loadAdminLibraryOverview } from "@/lib/library/repository";

export const metadata = {
  title: "Biblioteca | Admin",
};

function formatPublishStatus(value, active) {
  if (!active) return "archivado";
  const map = {
    published: "publicado",
    draft: "borrador",
    pending: "pendiente",
  };
  return map[String(value || "").toLowerCase()] || String(value || "publicado");
}

export default async function AdminLibraryPage() {
  const { supabase } = await requireAdminLibraryPageAccess();

  let overview = null;
  let errorMessage = "";

  try {
    overview = await loadAdminLibraryOverview({ db: supabase });
  } catch (error) {
    if (isMissingLibraryTableError(error, "library_books")) {
      errorMessage = "Ejecuta la migracion de biblioteca en Supabase antes de usar esta seccion.";
    } else {
      errorMessage = error?.message || "No se pudo cargar la biblioteca admin.";
    }
  }

  const counts = overview?.counts || {
    published: 0,
    archived: 0,
    staging: 0,
    pendingReview: 0,
    duplicates: 0,
  };

  return (
    <AdminPage className="mx-auto w-full max-w-7xl">
      <AdminPageHeader
        eyebrow="Biblioteca"
        title="Operacion de biblioteca"
        description="Centraliza publicacion, revision de catalogo y resolucion de duplicados sin cambiar las herramientas existentes."
        actions={
          <>
            <Link
              href="/admin/library/import"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Importar y publicar
            </Link>
            <Link
              href="/admin/library/duplicates"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
            >
              Revisar duplicados
            </Link>
          </>
        }
      />

      {errorMessage ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}

      <AdminStatsGrid className="xl:grid-cols-3">
        {[
          { label: "Publicados", value: counts.published, helper: "Visibles para alumnos" },
          { label: "Archivados", value: counts.archived, helper: "Ocultos, pero conservados" },
          { label: "Duplicados", value: counts.duplicates, helper: "Grupos pendientes de revisar" },
        ].map((card) => (
          <AdminStatCard key={card.label} label={card.label} value={card.value} hint={card.helper} />
        ))}
      </AdminStatsGrid>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Catalogo publicado"
            title="Vista rapida del catalogo"
            description="Ultimos libros visibles para alumnos dentro de la biblioteca actual."
            meta={<AdminBadge tone="accent">{(overview?.books || []).length} libro(s)</AdminBadge>}
            actions={
              <Link
                href="/admin/library/import"
                className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
              >
                Publicar mas
              </Link>
            }
          />

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.08)] text-left text-[11px] uppercase tracking-[0.18em] text-[#94a3b8]">
                  <th className="px-3 py-3 font-semibold">Titulo</th>
                  <th className="px-3 py-3 font-semibold">Autor</th>
                  <th className="px-3 py-3 font-semibold">CEFR</th>
                  <th className="px-3 py-3 font-semibold">Estado</th>
                  <th className="px-3 py-3 text-right font-semibold">Accion</th>
                </tr>
              </thead>
              <tbody>
                {(overview?.books || []).slice(0, 8).map((book) => (
                  <tr key={book.id} className="border-b border-[rgba(15,23,42,0.06)] text-[#0f172a] last:border-b-0">
                    <td className="px-3 py-3 font-medium">{book.title}</td>
                    <td className="px-3 py-3 text-[#475569]">{book.authorDisplay || "-"}</td>
                    <td className="px-3 py-3 text-[#475569]">{book.cefrLevel || "-"}</td>
                    <td className="px-3 py-3 text-[#475569]">{formatPublishStatus(book.publishStatus, book.active)}</td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/admin/library/books/${book.id}`}
                        className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 text-xs font-semibold text-[#0f172a] transition hover:border-[rgba(16,52,116,0.18)] hover:bg-[#f8fbff]"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
                {!overview?.books?.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-sm text-[#64748b]">
                      Aun no hay libros publicados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard className="space-y-4">
          <AdminSectionHeader
            eyebrow="Foco operativo"
            title="Prioridades de trabajo"
            description="Puntos de control rapidos para el flujo de publicacion y deduplicacion."
          />

          <div className="space-y-3">
            <div className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
              <p className="text-sm font-semibold text-[#0f172a]">Flujo de publicacion</p>
              <p className="mt-1 text-sm text-[#64748b]">
                Busca en Gutenberg, adjunta un EPUB si hace falta y publica directo al catalogo.
              </p>
            </div>
            <div className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
              <p className="text-sm font-semibold text-[#0f172a]">Cola de duplicados</p>
              <p className="mt-1 text-sm text-[#64748b]">
                {counts.duplicates} grupo(s) detectados para revisar antes de seguir publicando.
              </p>
            </div>
            <div className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[#f8fafc] p-4">
              <p className="text-sm font-semibold text-[#0f172a]">Prioridad de lectura</p>
              <p className="mt-1 text-sm text-[#64748b]">
                El EPUB subido sigue siendo la fuente principal de lectura; Gutenberg queda como metadata.
              </p>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
