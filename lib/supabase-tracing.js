import { AsyncLocalStorage } from "node:async_hooks";

const TRACE_STORAGE_KEY = "__englishmateSupabaseTraceStorage";
const TRACE_SEQUENCE_KEY = "__englishmateSupabaseTraceSequence";

function getTraceStorage() {
  if (!globalThis[TRACE_STORAGE_KEY]) {
    globalThis[TRACE_STORAGE_KEY] = new AsyncLocalStorage();
  }
  return globalThis[TRACE_STORAGE_KEY];
}

function nextTraceId() {
  const current = Number(globalThis[TRACE_SEQUENCE_KEY] || 0) || 0;
  const next = current + 1;
  globalThis[TRACE_SEQUENCE_KEY] = next;
  return next;
}

function classifyEndpoint(pathname = "") {
  if (pathname.includes("/auth/")) return "auth";
  if (pathname.includes("/storage/")) return "storage";
  if (pathname.includes("/rest/")) return "rest";
  if (pathname.includes("/realtime/")) return "realtime";
  return "other";
}

function normalizeOperation(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || "";
    const endpointType = classifyEndpoint(pathname);

    if (endpointType === "rest") {
      const match = pathname.match(/\/rest\/v1\/([^/?]+)/i);
      if (match?.[1]) return `${endpointType}:${match[1]}`;
    }

    if (endpointType === "auth") {
      const match = pathname.match(/\/auth\/v1\/([^/?]+)/i);
      if (match?.[1]) return `${endpointType}:${match[1]}`;
    }

    if (endpointType === "storage") {
      const match = pathname.match(/\/storage\/v1\/([^/?]+)/i);
      if (match?.[1]) return `${endpointType}:${match[1]}`;
    }

    return `${endpointType}:${pathname.split("/").filter(Boolean).slice(-2).join("/") || pathname}`;
  } catch {
    return "other:unknown";
  }
}

function isTracingEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.SUPABASE_TRACE_DISABLED !== "1";
}

export function recordSupabaseTrace(entry) {
  if (!isTracingEnabled()) return;

  const storage = getTraceStorage();
  const store = storage.getStore();
  if (!store) return;

  const endpointType = classifyEndpoint(entry.pathname || "");
  const operation = normalizeOperation(entry.url || "");
  const durationMs = Math.max(0, Number(entry.durationMs || 0) || 0);
  const method = String(entry.method || "GET").toUpperCase();

  store.totalRequests += 1;
  store.totalDurationMs += durationMs;
  store.byType[endpointType] = (store.byType[endpointType] || 0) + 1;

  const current = store.byOperation.get(operation) || {
    operation,
    type: endpointType,
    count: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    statuses: new Map(),
    methods: new Map(),
  };

  current.count += 1;
  current.totalDurationMs += durationMs;
  current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
  current.statuses.set(String(entry.status ?? "ERR"), (current.statuses.get(String(entry.status ?? "ERR")) || 0) + 1);
  current.methods.set(method, (current.methods.get(method) || 0) + 1);
  store.byOperation.set(operation, current);
}

function formatSummary(store, durationMs) {
  const orderedOperations = Array.from(store.byOperation.values())
    .sort((left, right) => right.totalDurationMs - left.totalDurationMs)
    .slice(0, 8);

  const lines = [
    `[SupabaseTrace] ${store.label} reqs=${store.totalRequests} auth=${store.byType.auth || 0} rest=${store.byType.rest || 0} storage=${store.byType.storage || 0} other=${(store.byType.realtime || 0) + (store.byType.other || 0)} traceMs=${durationMs} netMs=${Math.round(store.totalDurationMs)}`,
  ];

  for (const operation of orderedOperations) {
    const methods = Array.from(operation.methods.entries()).map(([key, value]) => `${key}x${value}`).join(",");
    const statuses = Array.from(operation.statuses.entries()).map(([key, value]) => `${key}x${value}`).join(",");
    lines.push(
      `  - ${operation.operation} count=${operation.count} totalMs=${Math.round(operation.totalDurationMs)} maxMs=${Math.round(operation.maxDurationMs)} methods=${methods} statuses=${statuses}`
    );
  }

  return lines.join("\n");
}

export async function withSupabaseRequestTrace(label, task) {
  if (!isTracingEnabled()) {
    return task();
  }

  const storage = getTraceStorage();
  const traceId = nextTraceId();
  const startedAt = Date.now();

  return storage.run(
    {
      id: traceId,
      label,
      totalRequests: 0,
      totalDurationMs: 0,
      byType: {
        auth: 0,
        rest: 0,
        storage: 0,
        realtime: 0,
        other: 0,
      },
      byOperation: new Map(),
    },
    async () => {
      const store = storage.getStore();
      try {
        return await task();
      } finally {
        const finishedAt = Date.now();
        console.info(formatSummary(store, finishedAt - startedAt));
      }
    }
  );
}

export function createSupabaseTraceFetch(fetchImpl) {
  return async function tracedSupabaseFetch(input, init) {
    const startedAt = Date.now();
    const requestUrl = typeof input === "string" ? input : input?.url || "";
    const method = init?.method || (typeof input !== "string" ? input?.method : "") || "GET";

    try {
      const response = await fetchImpl(input, init);
      recordSupabaseTrace({
        url: requestUrl,
        pathname: (() => {
          try {
            return new URL(requestUrl).pathname;
          } catch {
            return "";
          }
        })(),
        method,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      recordSupabaseTrace({
        url: requestUrl,
        pathname: (() => {
          try {
            return new URL(requestUrl).pathname;
          } catch {
            return "";
          }
        })(),
        method,
        status: "ERR",
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  };
}
