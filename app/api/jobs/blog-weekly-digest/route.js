import { NextResponse } from "next/server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { runBlogWeeklyDigestJob } from "@/lib/jobs/internal-job-handlers";

async function handleRequest(request) {
  const service = hasServiceRoleClient() ? getServiceSupabaseClient() : null;
  const result = await runBlogWeeklyDigestJob({
    request,
    service,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request) {
  return handleRequest(request);
}

export async function POST(request) {
  return handleRequest(request);
}
