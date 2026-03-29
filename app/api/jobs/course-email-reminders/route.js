import { NextResponse } from "next/server";
import { processUpcomingZoomReminderEmails } from "@/lib/course-email-automations";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { runCourseEmailRemindersJob } from "@/lib/jobs/internal-job-handlers";

export async function POST(request) {
  const service = hasServiceRoleClient() ? getServiceSupabaseClient() : null;
  const result = await runCourseEmailRemindersJob({
    request,
    service,
    runJob: processUpcomingZoomReminderEmails,
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request) {
  const service = hasServiceRoleClient() ? getServiceSupabaseClient() : null;
  const result = await runCourseEmailRemindersJob({
    request,
    service,
    runJob: processUpcomingZoomReminderEmails,
  });
  return NextResponse.json(result.body, { status: result.status });
}
