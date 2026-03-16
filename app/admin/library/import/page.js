import AdminLibraryImportManager from "@/components/admin-library-import-manager";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import { requireAdminLibraryPageAccess } from "@/lib/library/page-access";

export const metadata = {
  title: "Importar libros | Admin",
};

export default async function AdminLibraryImportPage() {
  await requireAdminLibraryPageAccess();

  return (
    <AdminPage className="mx-auto w-full max-w-7xl">
      <AdminPageHeader
        eyebrow="Biblioteca"
        title="Importar desde Gutenberg"
        description="Busca metadata, revisa candidatos, adjunta EPUB y publica sin cambiar el flujo real de importacion."
      />
      <div className="rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_16px_32px_rgba(15,23,42,0.05)] sm:p-5">
        <AdminLibraryImportManager />
      </div>
    </AdminPage>
  );
}
