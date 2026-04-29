import { authorizeInternalJobRequest } from "./internal-auth.js";
import { enqueueStageStagnancyFollowUpJobs, runCrmAutomationJobs } from "@/lib/crm/automations/engine";
import { runWeeklyBlogDigest } from "@/lib/blog/digest";

export async function runCourseEmailRemindersJob({
  request,
  env,
  service,
  runJob,
} = {}) {
  try {
    const authorization = authorizeInternalJobRequest(request, { env });
    if (!authorization.ok) {
      return authorization;
    }

    if (!service) {
      return {
        ok: false,
        status: 500,
        body: { error: "Configura SUPABASE_SERVICE_ROLE_KEY." },
        reason: "missing-service-role",
      };
    }

    if (typeof runJob !== "function") {
      return {
        ok: false,
        status: 500,
        body: { error: "Configura SUPABASE_SERVICE_ROLE_KEY." },
        reason: "missing-service-role",
      };
    }

    const summary = await runJob({ service });
    return {
      ok: true,
      status: 200,
      body: { ok: true, ...summary },
    };
  } catch (error) {
    console.error("[Jobs] course-email-reminders", error);
    const message = error instanceof Error ? error.message : "No se pudieron procesar recordatorios.";
    return {
      ok: false,
      status: 500,
      body: { error: message },
      reason: "job-error",
    };
  }
}

export async function runPreEnrollmentCleanupJob({ request, env, service, now = new Date() } = {}) {
  try {
    const authorization = authorizeInternalJobRequest(request, { env });
    if (!authorization.ok) {
      return authorization;
    }

    if (!service) {
      return {
        ok: false,
        status: 500,
        body: { error: "Configura SUPABASE_SERVICE_ROLE_KEY." },
        reason: "missing-service-role",
      };
    }

    await service
      .from("email_verification_tokens")
      .delete()
      .lt("expires_at", now.toISOString());

    await service
      .from("pre_enrollments")
      .update({
        status: "EXPIRED",
        reservation_expires_at: null,
        updated_at: now.toISOString(),
      })
      .eq("status", "RESERVED")
      .lt("reservation_expires_at", now.toISOString());

    const abandonedThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await service
      .from("pre_enrollments")
      .update({ status: "ABANDONED", updated_at: now.toISOString() })
      .in("status", ["EMAIL_VERIFIED", "IN_PROGRESS"])
      .lt("updated_at", abandonedThreshold);

    return {
      ok: true,
      status: 200,
      body: { ok: true },
    };
  } catch (error) {
    console.error("[Cleanup] pre-enrollment", error);
    return {
      ok: false,
      status: 500,
      body: { error: "No se pudo limpiar." },
      reason: "job-error",
    };
  }
}

export async function runCrmStageStagnancyJob({
  request,
  env,
  service,
  limit = 50,
  safeMode = String(process.env.CRM_AUTOMATIONS_SAFE_MODE || "true").trim().toLowerCase() !== "false",
} = {}) {
  try {
    const authorization = authorizeInternalJobRequest(request, { env });
    if (!authorization.ok) {
      return authorization;
    }

    if (!service) {
      return {
        ok: false,
        status: 500,
        body: { error: "Configura SUPABASE_SERVICE_ROLE_KEY." },
        reason: "missing-service-role",
      };
    }

    const enqueueSummary = await enqueueStageStagnancyFollowUpJobs(service, {
      limit,
      thresholdHours: 24,
    });
    const runSummary = await runCrmAutomationJobs(service, {
      limit,
      safeMode,
    });

    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        enqueueSummary,
        runSummary,
      },
    };
  } catch (error) {
    console.error("[Jobs] crm-stage-stagnancy", error);
    const message = error instanceof Error ? error.message : "No se pudieron procesar los seguimientos CRM.";
    return {
      ok: false,
      status: 500,
      body: { error: message },
      reason: "job-error",
    };
  }
}

export async function runBlogWeeklyDigestJob({
  request,
  env,
  service,
  now = new Date(),
} = {}) {
  try {
    const authorization = authorizeInternalJobRequest(request, { env });
    if (!authorization.ok) {
      return authorization;
    }

    if (!service) {
      return {
        ok: false,
        status: 500,
        body: { error: "Configura SUPABASE_SERVICE_ROLE_KEY." },
        reason: "missing-service-role",
      };
    }

    const url = new URL(request.url);
    const force = ["1", "true", "yes"].includes(String(url.searchParams.get("force") || "").trim().toLowerCase());
    const dryRun = ["1", "true", "yes"].includes(String(url.searchParams.get("dry") || "").trim().toLowerCase());
    const summary = await runWeeklyBlogDigest({
      service,
      env,
      now,
      force,
      dryRun,
    });

    return {
      ok: true,
      status: 200,
      body: { ok: true, ...summary },
    };
  } catch (error) {
    console.error("[Jobs] blog-weekly-digest", error);
    const message = error instanceof Error ? error.message : "No se pudo procesar el digest semanal del blog.";
    return {
      ok: false,
      status: 500,
      body: { error: message },
      reason: "job-error",
    };
  }
}
