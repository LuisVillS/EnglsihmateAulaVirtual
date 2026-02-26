import { NextResponse } from "next/server";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { processUpcomingZoomReminderEmails } from "@/lib/course-email-automations";

async function handleReminderJob() {
  try {
    if (!hasServiceRoleClient()) {
      return NextResponse.json({ error: "Configura SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
    }

    const service = getServiceSupabaseClient();
    const summary = await processUpcomingZoomReminderEmails({ service });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[Jobs] course-email-reminders", error);
    const message = error instanceof Error ? error.message : "No se pudieron procesar recordatorios.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return handleReminderJob();
}

export async function GET() {
  return handleReminderJob();
}
