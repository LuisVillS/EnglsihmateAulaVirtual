import { NextResponse } from "next/server";
import { requireAdminRouteAccess } from "@/lib/admin/access";
import { getBlogAdminDb, listBlogSubscribersForAdmin } from "@/lib/blog/admin";

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET() {
  const auth = await requireAdminRouteAccess({ label: "api-admin-blog-subscribers-export" });
  if (auth.errorResponse) return auth.errorResponse;

  const rows = await listBlogSubscribersForAdmin(getBlogAdminDb(auth.supabase));
  const headers = [
    "email",
    "status",
    "source",
    "lead_source",
    "lead_type",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "landing_url",
    "page_path",
    "referrer_url",
    "subscribed_at",
  ];
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="blog-subscribers.csv"',
    },
  });
}
