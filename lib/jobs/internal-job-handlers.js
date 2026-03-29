import { authorizeInternalJobRequest } from "./internal-auth.js";

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
