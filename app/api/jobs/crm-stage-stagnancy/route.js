import { NextResponse } from "next/server";
import { runCrmStageStagnancyJob } from "@/lib/jobs/internal-job-handlers";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";

function parsePositiveInt(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function resolveSafeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return String(process.env.CRM_AUTOMATIONS_SAFE_MODE || "true").trim().toLowerCase() !== "false";
  }
  return !["0", "false", "off", "no"].includes(normalized);
}

async function handleRequest(request) {
  const service = hasServiceRoleClient() ? getServiceSupabaseClient() : null;
  const url = new URL(request.url);
  const result = await runCrmStageStagnancyJob({
    request,
    service,
    limit: parsePositiveInt(url.searchParams.get("limit"), 50),
    safeMode: resolveSafeMode(url.searchParams.get("safe")),
  });
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request) {
  return handleRequest(request);
}

export async function POST(request) {
  return handleRequest(request);
}
