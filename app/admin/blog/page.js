import Link from "next/link";
import {
  AdminBadge,
  AdminCard,
  AdminEmptyState,
  AdminPage,
  AdminPageHeader,
  AdminSectionHeader,
} from "@/components/admin-page";
import BlogPostRowActions from "@/components/blog-post-row-actions";
import { requireAdminPageAccess } from "@/lib/admin/access";
import {
  getBlogAdminDb,
  listBlogPostsForAdmin,
} from "@/lib/blog/admin";

export const metadata = {
  title: "Blog | Admin",
};

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function statusTone(status) {
  if (status === "published") return "success";
  if (status === "unpublished") return "danger";
  return "warning";
}

function statusLabel(status) {
  if (status === "published") return "Published";
  if (status === "unpublished") return "Unpublished";
  return "Draft";
}

function BlogPostsTable({ title, description, posts, emptyTitle, emptyDescription, tone = "neutral" }) {
  const scrollable = posts.length > 5;

  return (
    <AdminCard className="overflow-hidden p-0">
      <div className="border-b border-[rgba(15,23,42,0.08)] p-5">
        <AdminSectionHeader
          title={title}
          description={description}
          meta={<AdminBadge tone={tone}>{posts.length} posts</AdminBadge>}
        />
      </div>
      {posts.length ? (
        <div className={scrollable ? "max-h-[392px] overflow-y-auto overflow-x-auto" : "overflow-x-auto"}>
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f8fafc] text-left text-[11px] uppercase tracking-[0.18em] text-[#64748b]">
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Slug</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Published</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-b border-[rgba(15,23,42,0.06)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-[#0f172a]">{post.title || "Untitled draft"}</p>
                      {post.status === "unpublished" && post.image_check_error ? (
                        <p className="max-w-md text-xs leading-5 text-[#b91c1c]">{post.image_check_error}</p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#64748b]">{post.slug || "not-set"}</td>
                  <td className="px-4 py-3 text-[#475569]">{post.category?.name || "Uncategorized"}</td>
                  <td className="px-4 py-3 text-[#475569]">{formatDate(post.published_at)}</td>
                  <td className="px-4 py-3 text-[#475569]">{formatDate(post.updated_at)}</td>
                  <td className="px-4 py-3">
                    <BlogPostRowActions post={post} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5">
          <AdminEmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      )}
    </AdminCard>
  );
}

export default async function AdminBlogPage() {
  const { supabase } = await requireAdminPageAccess();
  const db = getBlogAdminDb(supabase);
  let posts = [];
  let errorMessage = "";

  try {
    posts = await listBlogPostsForAdmin(db);
  } catch (error) {
    errorMessage = error?.message || "Failed to load blog posts.";
  }

  const groupedPosts = {
    published: posts.filter((post) => post.status === "published"),
    draft: posts.filter((post) => !post.status || post.status === "draft"),
    unpublished: posts.filter((post) => post.status === "unpublished"),
  };

  return (
    <AdminPage className="mx-auto w-full max-w-7xl space-y-5">
      <AdminPageHeader
        eyebrow="Content"
        title="Blog posts"
        description="Create and manage drafts and published articles for the public marketing blog."
        actions={
          <>
            <Link
              href="/admin/blog/categories"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]"
            >
              Categories
            </Link>
            <Link
              href="/admin/blog/subscribers"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]"
            >
              Subscribers
            </Link>
            <Link
              href="/admin/blog/new"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Create post
            </Link>
          </>
        }
      />

      {errorMessage ? (
        <div className="rounded-2xl border border-[rgba(239,68,68,0.18)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[#b91c1c]">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-5">
        <BlogPostsTable
          title={statusLabel("published")}
          description="Live posts visible to the public blog."
          posts={groupedPosts.published}
          emptyTitle="No published posts"
          emptyDescription="Publish a draft when it is ready to appear publicly."
          tone={statusTone("published")}
        />
        <BlogPostsTable
          title={statusLabel("draft")}
          description="Work-in-progress posts that are not visible publicly."
          posts={groupedPosts.draft}
          emptyTitle="No drafts"
          emptyDescription="Create a new post to start drafting content."
          tone={statusTone("draft")}
        />
        <BlogPostsTable
          title={statusLabel("unpublished")}
          description="Posts removed from the public blog, including automatic image-link failures."
          posts={groupedPosts.unpublished}
          emptyTitle="No unpublished posts"
          emptyDescription="Broken image checks and manual unpublishing will appear here."
          tone={statusTone("unpublished")}
        />
      </div>
    </AdminPage>
  );
}
