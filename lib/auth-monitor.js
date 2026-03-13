const AUTH_GET_USER_COUNTERS_KEY = "__englishmateAuthGetUserCounters";

function shouldLogAuthGetUser() {
  return process.env.DEBUG_AUTH_GETUSER === "1";
}

function getAuthGetUserCounters() {
  if (!globalThis[AUTH_GET_USER_COUNTERS_KEY]) {
    globalThis[AUTH_GET_USER_COUNTERS_KEY] = new Map();
  }
  return globalThis[AUTH_GET_USER_COUNTERS_KEY];
}

export async function getAuthenticatedUser(supabase, { label = "unknown" } = {}) {
  const result = await supabase.auth.getUser();

  if (shouldLogAuthGetUser()) {
    const counters = getAuthGetUserCounters();
    const nextCount = (counters.get(label) || 0) + 1;
    counters.set(label, nextCount);
    console.info(`[auth.getUser] ${label} -> ${nextCount}`);
  }

  return result;
}
