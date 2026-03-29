import { NextResponse } from "next/server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { runPreEnrollmentCleanupJob } from "@/lib/jobs/internal-job-handlers";

export async function POST(request) {
  const service = hasServiceRoleClient() ? getServiceSupabaseClient() : null;
  const result = await runPreEnrollmentCleanupJob({ request, service });
  return NextResponse.json(result.body, { status: result.status });
}
