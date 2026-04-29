import { NextResponse } from "next/server";
import { requireCrmRouteAccess } from "@/lib/admin/access";
import {
  enqueuePendingCrmAutomationJobs,
  enqueueStageStagnancyFollowUpJobs,
  runCrmAutomationJobs,
} from "@/lib/crm/automations/engine";
import { getServiceSupabaseClient, hasServiceRoleClient } from "@/lib/supabase-service";
import { constantTimeEqual } from "@/lib/security/env";

function parsePositiveInt(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function readRunnerSecret(request) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  return (
    request.headers.get("x-crm-automation-secret") ||
    bearer ||
    ""
  ).trim();
}

function resolveSafeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return String(process.env.CRM_AUTOMATIONS_SAFE_MODE || "true").trim().toLowerCase() !== "false";
  return !["0", "false", "off", "no"].includes(normalized);
}

async function authorizeRunner(request) {
  const expectedSecret = String(process.env.CRM_AUTOMATION_RUN_SECRET || "").trim();
  const providedSecret = readRunnerSecret(request);
  if (expectedSecret && providedSecret && constantTimeEqual(providedSecret, expectedSecret)) {
    return { ok: true, via: "secret" };
  }

  const auth = await requireCrmRouteAccess({ label: "crm-automations-run" });
  if (auth.errorResponse) return auth;

  if (!auth.accessState?.isClassicAdmin && !auth.accessState?.isCrmAdmin) {
    return {
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, via: "session", auth };
}

async function handleRun(request) {
  const authorization = await authorizeRunner(request);
  if (authorization.errorResponse) return authorization.errorResponse;

  if (!hasServiceRoleClient()) {
    return NextResponse.json(
      { error: "CRM automation runner requires SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const limit = parsePositiveInt(url.searchParams.get("limit"), 25);
  const enqueueLimit = parsePositiveInt(url.searchParams.get("enqueueLimit"), 50);
  const stagnancyLimit = parsePositiveInt(url.searchParams.get("stagnancyLimit"), 50);
  const safeMode = resolveSafeMode(url.searchParams.get("safe"));
  const service = getServiceSupabaseClient();

  try {
    const enqueueSummary = await enqueuePendingCrmAutomationJobs(service, {
      limit: enqueueLimit,
    });
    const stagnancySummary = await enqueueStageStagnancyFollowUpJobs(service, {
      limit: stagnancyLimit,
      thresholdHours: 24,
    });
    const runSummary = await runCrmAutomationJobs(service, {
      limit,
      safeMode,
    });

    return NextResponse.json({
      ok: true,
      authorization: authorization.via,
      enqueueSummary,
      stagnancySummary,
      runSummary,
    });
  } catch (error) {
    console.error("[CRM] automation runner failed", error);
    return NextResponse.json(
      { error: error?.message || "CRM automation runner failed." },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return handleRun(request);
}

export async function POST(request) {
  return handleRun(request);
}
