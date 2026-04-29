import { NextResponse } from "next/server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { markDigestSubscriberUnsubscribed, normalizeAudienceEmail, verifyDigestUnsubscribeToken } from "@/lib/blog/digest";

function renderHtml({ title, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:40px 16px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:20px;padding:32px;">
      <h1 style="margin:0 0 12px 0;font-size:28px;line-height:34px;">${title}</h1>
      <p style="margin:0;font-size:16px;line-height:26px;color:#475569;">${body}</p>
    </div>
  </body>
</html>`;
}

export async function GET(request) {
  if (!hasServiceRoleClient()) {
    return new NextResponse(
      renderHtml({
        title: "Unavailable",
        body: "The unsubscribe service is not configured yet.",
      }),
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  const url = new URL(request.url);
  const email = normalizeAudienceEmail(url.searchParams.get("email"));
  const token = String(url.searchParams.get("token") || "").trim();

  if (!email || !token || !verifyDigestUnsubscribeToken(email, token)) {
    return new NextResponse(
      renderHtml({
        title: "Invalid link",
        body: "This unsubscribe link is invalid or has expired.",
      }),
      { status: 401, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  try {
    await markDigestSubscriberUnsubscribed(getServiceSupabaseClient(), email, "blog_digest");
    return new NextResponse(
      renderHtml({
        title: "Unsubscribed",
        body: `The address ${email} will no longer receive EnglishMate blog digests.`,
      }),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  } catch (error) {
    return new NextResponse(
      renderHtml({
        title: "Unable to unsubscribe",
        body: error instanceof Error ? error.message : "An unexpected error occurred.",
      }),
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
}
