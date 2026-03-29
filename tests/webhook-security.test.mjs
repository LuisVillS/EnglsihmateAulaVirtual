import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { STUDY_WITH_ME_SESSION_MINUTES } from "../lib/webhooks/calendly.js";
import {
  verifyCalendlyWebhookSignature,
  verifyLegacyWebhookSecret,
  verifyMercadoPagoWebhookSignature,
} from "../lib/webhooks/security.js";
const mercadopagoModule = await import("../app/api/matricula/payment/mercadopago-webhook/route.js");
const calendlyModule = await import("../app/api/study-with-me/calendly-webhook/route.js");

const handleMercadoPagoWebhook = mercadopagoModule.handleMercadoPagoWebhook;
const handleCalendlyWebhook = calendlyModule.handleCalendlyWebhook;

function createJsonRequest(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createMercadoPagoSignature({ secret, dataId, requestId, timestamp = Math.floor(Date.now() / 1000) }) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${timestamp},v1=${v1}`;
}

function createCalendlySignature({ secret, rawBody, timestamp = Math.floor(Date.now() / 1000) }) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

test("mercado pago signature helper validates the official manifest", () => {
  const secret = "mp-webhook-secret";
  const signatureHeader = createMercadoPagoSignature({
    secret,
    dataId: "pay-1",
    requestId: "req-1",
  });

  const verified = verifyMercadoPagoWebhookSignature({
    signatureHeader,
    requestId: "req-1",
    dataId: "pay-1",
    secret,
  });

  assert.equal(verified.valid, true);
  assert.equal(verified.dataId, "pay-1");
});

test("calendly signature helper validates the raw body payload", () => {
  const secret = "calendly-secret";
  const rawBody = JSON.stringify({ event: "invitee.created" });
  const signatureHeader = createCalendlySignature({
    secret,
    rawBody,
  });

  const verified = verifyCalendlyWebhookSignature({
    signatureHeader,
    rawBody,
    secret,
  });

  assert.equal(verified.valid, true);
});

test("legacy webhook secret helper validates header and query secrets", () => {
  const request = new Request("http://localhost/api/webhook?secret=legacy-secret", {
    method: "POST",
    headers: {
      "x-webhook-secret": "legacy-secret",
    },
  });

  const verified = verifyLegacyWebhookSecret({
    request,
    expectedSecret: "legacy-secret",
    headerNames: ["x-webhook-secret"],
    queryParamNames: ["secret"],
  });

  assert.equal(verified.valid, true);
});

function createMercadoPagoService(initialRow = null) {
  const state = {
    row: initialRow ? { ...initialRow } : null,
    updates: [],
  };
  const query = {
    column: null,
    value: null,
  };

  return {
    state,
    from(table) {
      assert.equal(table, "pre_enrollments");
      return {
        select() {
          return this;
        },
        eq(column, value) {
          query.column = column;
          query.value = value;
          return this;
        },
        maybeSingle: async () => ({
          data: state.row && state.row[stateColumnMatch(query.column)] === query.value ? { ...state.row } : null,
          error: null,
        }),
        update(payload) {
          state.updates.push(payload);
          state.row = state.row ? { ...state.row, ...payload } : { ...payload };
          return {
            eq: async () => ({ data: null, error: null }),
          };
        },
      };
    },
  };
}

function stateColumnMatch(column) {
  return column || "id";
}

function createCalendlyService({ student = null, sessions = [] } = {}) {
  const state = {
    student: student ? { ...student } : null,
    sessions: sessions.map((row) => ({ ...row })),
    writes: [],
  };

  function findSession(column, value) {
    return state.sessions.find((row) => row?.[column] === value) || null;
  }

  return {
    state,
    from(table) {
      if (table === "profiles") {
        const query = { column: null, value: null };
        return {
          select() {
            return this;
          },
          eq(column, value) {
            query.column = column;
            query.value = value;
            return this;
          },
          maybeSingle: async () => ({
            data: state.student && state.student[query.column] === query.value ? { ...state.student } : null,
            error: null,
          }),
        };
      }

      assert.equal(table, "study_with_me_sessions");
      const query = { column: null, value: null };
      return {
        select() {
          return this;
        },
        eq(column, value) {
          query.column = column;
          query.value = value;
          return this;
        },
        maybeSingle: async () => ({
          data: findSession(query.column, query.value) ? { ...findSession(query.column, query.value) } : null,
          error: null,
        }),
        update(payload) {
          state.writes.push({ op: "update", payload });
          return {
            eq: async (column, value) => {
              state.sessions = state.sessions.map((row) =>
                row?.[column] === value ? { ...row, ...payload } : row
              );
              return { data: null, error: null };
            },
          };
        },
        upsert(payload, options = {}) {
          state.writes.push({ op: "upsert", payload, options });
          const conflictColumn = String(options.onConflict || "calendly_event_uri").includes("calendly_event_uri")
            ? "calendly_event_uri"
            : "calendly_invitee_uri";
          const conflictValue = payload?.[conflictColumn];
          const index = state.sessions.findIndex((row) => row?.[conflictColumn] === conflictValue);
          if (index >= 0) {
            state.sessions[index] = { ...state.sessions[index], ...payload };
          } else {
            state.sessions.push({ ...payload });
          }
          return { data: payload, error: null };
        },
        insert(payload) {
          state.writes.push({ op: "insert", payload });
          state.sessions.push({ ...payload });
          return { data: payload, error: null };
        },
      };
    },
  };
}

test("mercado pago webhook fails closed when secret is missing", async () => {
  const request = createJsonRequest("http://localhost/api/matricula/payment/mercadopago-webhook", {
    pre_enrollment_id: "pre-1",
  });

  const response = await handleMercadoPagoWebhook(request, { env: {} });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /MERCADOPAGO_WEBHOOK_SECRET/);
});

test("mercado pago webhook rejects invalid signatures", async () => {
  const secret = "mp-webhook-secret";
  const requestId = "req-123";
  const payload = {
    pre_enrollment_id: "pre-1",
    data: { id: "pay-1", status: "approved" },
    status: "approved",
  };
  const request = createJsonRequest("http://localhost/api/matricula/payment/mercadopago-webhook", payload, {
    "x-request-id": requestId,
    "x-signature": "ts=1710000000,v1=deadbeef",
  });

  const service = createMercadoPagoService();
  const response = await handleMercadoPagoWebhook(request, {
    env: { MERCADOPAGO_WEBHOOK_SECRET: secret },
    service,
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.match(body.error, /Firma invalida/);
  assert.equal(service.state.updates.length, 0);
});

test("mercado pago webhook accepts a valid signed payment event", async () => {
  const secret = "mp-webhook-secret";
  const requestId = "req-456";
  const payload = {
    pre_enrollment_id: "pre-1",
    data: { id: "pay-1", status: "approved" },
    status: "approved",
  };
  const signature = createMercadoPagoSignature({
    secret,
    dataId: "pay-1",
    requestId,
  });
  const request = createJsonRequest("http://localhost/api/matricula/payment/mercadopago-webhook", payload, {
    "x-request-id": requestId,
    "x-signature": signature,
  });

  const service = createMercadoPagoService({
    id: "pre-1",
    mp_payment_id: null,
    mp_status: "LINK_SHARED",
    status: "PAYMENT_SUBMITTED",
  });
  const response = await handleMercadoPagoWebhook(request, {
    env: { MERCADOPAGO_WEBHOOK_SECRET: secret },
    service,
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(service.state.updates.length, 1);
  assert.equal(service.state.row.mp_payment_id, "pay-1");
  assert.equal(service.state.row.status, "PAID_AUTO");
});

test("mercado pago webhook dedupes replayed approved events", async () => {
  const secret = "mp-webhook-secret";
  const requestId = "req-789";
  const payload = {
    pre_enrollment_id: "pre-1",
    data: { id: "pay-1", status: "approved" },
    status: "approved",
  };
  const signature = createMercadoPagoSignature({
    secret,
    dataId: "pay-1",
    requestId,
  });
  const request = createJsonRequest("http://localhost/api/matricula/payment/mercadopago-webhook", payload, {
    "x-request-id": requestId,
    "x-signature": signature,
  });

  const service = createMercadoPagoService({
    id: "pre-1",
    mp_payment_id: "pay-1",
    mp_status: "approved",
    status: "PAID_AUTO",
    payment_submitted_at: "2026-03-27T12:00:00.000Z",
  });
  const response = await handleMercadoPagoWebhook(request, {
    env: { MERCADOPAGO_WEBHOOK_SECRET: secret },
    service,
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, deduped: true });
  assert.equal(service.state.updates.length, 0);
});

test("calendly webhook fails closed when secret is missing", async () => {
  const request = createJsonRequest("http://localhost/api/study-with-me/calendly-webhook", {
    event: "invitee.created",
    payload: {},
  });

  const response = await handleCalendlyWebhook(request, { env: {} });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /CALENDLY_WEBHOOK_SECRET/);
});

test("calendly webhook rejects invalid signatures", async () => {
  const rawBody = JSON.stringify({
    event: "invitee.created",
    payload: {
      invitee: {
        email: "student@example.com",
        uri: "invitee-1",
      },
      event: {
        uri: "event-1",
      },
      start_time: "2026-03-27T12:00:00.000Z",
      end_time: "2026-03-27T12:30:00.000Z",
    },
  });
  const request = new Request("http://localhost/api/study-with-me/calendly-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "calendly-webhook-signature": "t=1710000000,v1=deadbeef",
    },
    body: rawBody,
  });

  const service = createCalendlyService({
    student: {
      id: "student-1",
      email: "student@example.com",
      role: "student",
      commission_id: "commission-1",
    },
  });
  const response = await handleCalendlyWebhook(request, {
    env: { CALENDLY_WEBHOOK_SECRET: "calendly-secret" },
    service,
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.match(body.error, /Firma invalida/);
  assert.equal(service.state.writes.length, 0);
});

test("calendly webhook accepts a valid created invite", async () => {
  const payload = {
    event: "invitee.created",
    payload: {
      invitee: {
        email: "student@example.com",
        uri: "invitee-1",
      },
      event: {
        uri: "event-1",
      },
      start_time: "2026-03-27T12:00:00.000Z",
      end_time: "2026-03-27T12:30:00.000Z",
    },
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = "calendly-secret";
  const signature = createCalendlySignature({
    secret,
    rawBody,
    timestamp,
  });
  const request = new Request("http://localhost/api/study-with-me/calendly-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "calendly-webhook-signature": signature,
    },
    body: rawBody,
  });

  const service = createCalendlyService({
    student: {
      id: "student-1",
      email: "student@example.com",
      role: "student",
      commission_id: "commission-1",
    },
  });
  const response = await handleCalendlyWebhook(request, {
    env: { CALENDLY_WEBHOOK_SECRET: secret },
    service,
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(service.state.writes.length, 1);
  assert.equal(service.state.sessions[0].status, "scheduled");
  assert.equal(service.state.sessions[0].calendly_event_uri, "event-1");
});

test("calendly webhook dedupes replayed invite events", async () => {
  const payload = {
    event: "invitee.created",
    payload: {
      invitee: {
        email: "student@example.com",
        uri: "invitee-1",
      },
      event: {
        uri: "event-1",
      },
      start_time: "2026-03-27T12:00:00.000Z",
      end_time: "2026-03-27T12:30:00.000Z",
    },
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = "calendly-secret";
  const signature = createCalendlySignature({
    secret,
    rawBody,
    timestamp,
  });
  const request = new Request("http://localhost/api/study-with-me/calendly-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "calendly-webhook-signature": signature,
    },
    body: rawBody,
  });

  const service = createCalendlyService({
    student: {
      id: "student-1",
      email: "student@example.com",
      role: "student",
      commission_id: "commission-1",
    },
    sessions: [
      {
        id: "session-1",
        status: "scheduled",
        starts_at: "2026-03-27T12:00:00.000Z",
        ends_at: "2026-03-27T12:30:00.000Z",
        calendly_event_uri: "event-1",
        calendly_invitee_uri: "invitee-1",
      },
    ],
  });
  const response = await handleCalendlyWebhook(request, {
    env: { CALENDLY_WEBHOOK_SECRET: secret },
    service,
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { ok: true, deduped: true, status: "scheduled" });
  assert.equal(service.state.writes.length, 0);
});

test("calendly webhook enforces the expected session duration", async () => {
  const payload = {
    event: "invitee.created",
    payload: {
      invitee: {
        email: "student@example.com",
        uri: "invitee-1",
      },
      event: {
        uri: "event-1",
      },
      start_time: "2026-03-27T12:00:00.000Z",
      end_time: "2026-03-27T12:15:00.000Z",
    },
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = "calendly-secret";
  const signature = createCalendlySignature({
    secret,
    rawBody,
    timestamp,
  });
  const request = new Request("http://localhost/api/study-with-me/calendly-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "calendly-webhook-signature": signature,
    },
    body: rawBody,
  });

  const service = createCalendlyService({
    student: {
      id: "student-1",
      email: "student@example.com",
      role: "student",
      commission_id: "commission-1",
    },
  });
  const response = await handleCalendlyWebhook(request, {
    env: { CALENDLY_WEBHOOK_SECRET: secret },
    service,
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Duracion invalida/);
  assert.equal(STUDY_WITH_ME_SESSION_MINUTES, 30);
});
