const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function normalizeFreeText(value) {
  const normalized = value?.toString().trim();
  return normalized || null;
}

export function hasTurnstileServerConfig() {
  return Boolean(normalizeFreeText(process.env.TURNSTILE_SECRET_KEY));
}

export async function verifyTurnstileToken({
  token,
  remoteIp = null,
  idempotencyKey = null,
} = {}) {
  const secret = normalizeFreeText(process.env.TURNSTILE_SECRET_KEY);
  if (!secret) {
    return {
      ok: false,
      reason: "missing_turnstile_secret",
      result: null,
    };
  }

  const responseToken = normalizeFreeText(token);
  if (!responseToken) {
    return {
      ok: false,
      reason: "missing_turnstile_token",
      result: null,
    };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", responseToken);
  if (normalizeFreeText(remoteIp)) {
    body.set("remoteip", remoteIp);
  }
  if (normalizeFreeText(idempotencyKey)) {
    body.set("idempotency_key", idempotencyKey);
  }

  const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const success = Boolean(payload?.success);
  return {
    ok: success,
    reason: success ? null : (payload?.["error-codes"] || []).join(",") || "turnstile_verification_failed",
    result: payload,
  };
}
