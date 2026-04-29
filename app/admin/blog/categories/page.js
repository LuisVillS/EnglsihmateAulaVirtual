import Link from "next/link";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import BlogCategoriesManager from "@/components/blog-categories-manager";
import { requireAdminPageAccess } from "@/lib/admin/access";
import { getBlogAdminDb, listBlogCategoriesForAdmin } from "@/lib/blog/admin";

export const metadata = {
  title: "Blog Categories | Admin",
};

export default async function BlogCategoriesPage() {
  const { supabase } = await requireAdminPageAccess();
  const categories = await listBlogCategoriesForAdmin(getBlogAdminDb(supabase));

  return (
    <AdminPage className="mx-auto w-full max-w-7xl space-y-5">
      <AdminPageHeader
        eyebrow="Blog"
        title="Categories"
        description="Manage public category taxonomy. Deleting a category leaves posts uncategorized."
        actions={
          <Link
            href="/admin/blog"
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]"
          >
            Back to posts
          </Link>
        }
      />
      <BlogCategoriesManager categories={categories} />
    </AdminPage>
  );
}
