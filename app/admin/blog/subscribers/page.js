import Link from "next/link";
import { AdminBadge, AdminCard, AdminEmptyState, AdminPage, AdminPageHeader } from "@/components/admin-page";
import { requireAdminPageAccess } from "@/lib/admin/access";
import { getBlogAdminDb, listBlogSubscribersForAdmin } from "@/lib/blog/admin";

export const metadata = {
  title: "Blog Subscribers | Admin",
};

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export default async function BlogSubscribersPage() {
  const { supabase } = await requireAdminPageAccess();
  const subscribers = await listBlogSubscribersForAdmin(getBlogAdminDb(supabase));

  return (
    <AdminPage className="mx-auto w-full max-w-7xl space-y-5">
      <AdminPageHeader
        eyebrow="Blog"
        title="Subscribers"
        description="Review blog newsletter subscribers. Email is the dedupe key and source fields stay mapped to blog."
        actions={
          <>
            <Link
              href="/api/admin/blog/subscribers/export"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-[#103474] px-4 text-sm font-semibold text-white transition hover:bg-[#0c295a]"
            >
              Export CSV
            </Link>
            <Link
              href="/admin/blog"
              className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-[rgba(15,23,42,0.1)] bg-white px-4 text-sm font-semibold text-[#0f172a] transition hover:bg-[#f8fbff]"
            >
              Back to posts
            </Link>
          </>
        }
      />

      <AdminCard className="overflow-hidden p-0">
        {subscribers.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(15,23,42,0.08)] bg-[#f8fafc] text-left text-[11px] uppercase tracking-[0.18em] text-[#64748b]">
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">UTM source</th>
                  <th className="px-4 py-3 font-semibold">Landing URL</th>
                  <th className="px-4 py-3 font-semibold">Subscribed</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="border-b border-[rgba(15,23,42,0.06)] last:border-0">
                    <td className="px-4 py-3 font-semibold text-[#0f172a]">{subscriber.email}</td>
                    <td className="px-4 py-3">
                      <AdminBadge tone={subscriber.status === "subscribed" ? "success" : "warning"}>
                        {subscriber.status}
                      </AdminBadge>
                    </td>
                    <td className="px-4 py-3 text-[#475569]">{subscriber.utm_source || "-"}</td>
                    <td className="max-w-md truncate px-4 py-3 text-[#475569]">{subscriber.landing_url || subscriber.page_path || "-"}</td>
                    <td className="px-4 py-3 text-[#475569]">{formatDate(subscriber.subscribed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5">
            <AdminEmptyState title="No subscribers yet" description="Subscribers captured by the public site will appear here." />
          </div>
        )}
      </AdminCard>
    </AdminPage>
  );
}
