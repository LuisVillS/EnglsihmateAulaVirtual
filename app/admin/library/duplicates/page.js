import AdminLibraryDuplicatesManager from "@/components/admin-library-duplicates-manager";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import { requireAdminLibraryPageAccess } from "@/lib/library/page-access";
import { loadAdminDuplicateGroups } from "@/lib/library/repository";

export const metadata = {
  title: "Duplicados de biblioteca | Admin",
};

export default async function AdminLibraryDuplicatesPage() {
  const { supabase } = await requireAdminLibraryPageAccess();
  const groups = await loadAdminDuplicateGroups({ db: supabase });

  return (
    <AdminPage className="mx-auto w-full max-w-7xl">
      <AdminPageHeader
        eyebrow="Biblioteca"
        title="Resolucion de duplicados"
        description="Compara grupos, elige el canonico y ejecuta la misma resolucion actual con una cola mas clara."
      />
      <div className="rounded-[26px] border border-[rgba(15,23,42,0.08)] bg-white p-4 shadow-[0_16px_32px_rgba(15,23,42,0.05)] sm:p-5">
        <AdminLibraryDuplicatesManager initialGroups={groups} />
      </div>
    </AdminPage>
  );
}
