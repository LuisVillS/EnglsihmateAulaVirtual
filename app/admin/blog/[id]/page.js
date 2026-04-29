import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage, AdminPageHeader } from "@/components/admin-page";
import BlogPostEditor from "@/components/blog-post-editor";
import { saveBlogPostAction } from "@/app/admin/blog/actions";
import { requireAdminPageAccess } from "@/lib/admin/access";
import {
  getBlogAdminDb,
  listBlogCategoriesForAdmin,
  selectBlogPostForAdmin,
} from "@/lib/blog/admin";

export const metadata = {
  title: "Edit Blog Post | Admin",
};

export default async function EditBlogPostPage({ params: paramsPromise }) {
  const params = await paramsPromise;
  const { supabase } = await requireAdminPageAccess();
  const db = getBlogAdminDb(supabase);
  const [post, categories] = await Promise.all([
    selectBlogPostForAdmin(db, params?.id),
    listBlogCategoriesForAdmin(db),
  ]);

  if (!post?.id) notFound();

  return (
    <AdminPage className="mx-auto w-full max-w-7xl space-y-5">
      <AdminPageHeader
        eyebrow="Blog"
        title={`Edit: ${post.title}`}
        description="Drafts stay private. Published posts become visible to the public marketing blog."
        actions={
          <>
            <Link
              href="/admin/blog"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]"
            >
              Back to posts
            </Link>
            {post.status === "published" ? (
              <Link
                href={`/blog/${post.slug}`}
                target="_blank"
                className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
              >
                View public post
              </Link>
            ) : null}
          </>
        }
      />
      <BlogPostEditor post={post} categories={categories} action={saveBlogPostAction} />
    </AdminPage>
  );
}
