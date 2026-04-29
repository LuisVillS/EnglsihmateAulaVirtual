import Link from "next/link";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import BlogPostEditor from "@/components/blog-post-editor";
import { saveBlogPostAction } from "@/app/admin/blog/actions";
import { requireAdminPageAccess } from "@/lib/admin/access";
import { getBlogAdminDb, listBlogCategoriesForAdmin } from "@/lib/blog/admin";

export const metadata = {
  title: "Create Blog Post | Admin",
};

export default async function NewBlogPostPage() {
  const { supabase } = await requireAdminPageAccess();
  const categories = await listBlogCategoriesForAdmin(getBlogAdminDb(supabase));

  return (
    <AdminPage className="mx-auto w-full max-w-7xl space-y-5">
      <AdminPageHeader
        eyebrow="Blog"
        title="Create blog post"
        description="Write Markdown content, add URL-only images, and publish when ready."
        actions={
          <Link
            href="/admin/blog"
            className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]"
          >
            Back to posts
          </Link>
        }
      />
      <BlogPostEditor categories={categories} action={saveBlogPostAction} />
    </AdminPage>
  );
}
