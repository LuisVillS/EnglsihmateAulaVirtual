import { constantTimeEqual, requireServerEnv } from "../security/env.js";

function readBearerToken(request) {
  const authorization = request?.headers?.get("authorization") || "";
  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !rest.length) {
    return null;
  }

  return rest.join(" ").trim() || null;
}

export function authorizeInternalJobRequest(request, { env = process.env } = {}) {
  let cronSecret;
  try {
    cronSecret = requireServerEnv("CRON_SECRET", { env, label: "CRON_SECRET" });
  } catch {
    return {
      ok: false,
      status: 500,
      body: { error: "Configura CRON_SECRET." },
      reason: "missing-secret",
    };
  }

  const providedToken = readBearerToken(request);
  if (!providedToken || !constantTimeEqual(providedToken, cronSecret)) {
    return {
      ok: false,
      status: 401,
      body: { error: "Unauthorized" },
      reason: "unauthorized",
    };
  }

  return {
    ok: true,
  };
}
