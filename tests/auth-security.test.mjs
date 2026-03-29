import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_LOGIN_LOCK_MESSAGE,
  GENERIC_RECOVERY_CODE_MESSAGE,
  getAdminLoginLockState,
  hashRecoveryCode,
  recordFailedAdminLogin,
} from "../lib/auth-security.js";

const originalFetch = global.fetch;
const sentEmails = [];

process.env.PASSWORD_RECOVERY_SECRET = process.env.PASSWORD_RECOVERY_SECRET || "password-recovery-test-secret";
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || "brevo-api-key";
process.env.BREVO_SMTP_USER = process.env.BREVO_SMTP_USER || "smtp-user";
process.env.BREVO_SMTP_PASSWORD = process.env.BREVO_SMTP_PASSWORD || "smtp-password";
process.env.BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST || "smtp.example.com";
process.env.BREVO_SMTP_PORT = process.env.BREVO_SMTP_PORT || "587";
process.env.BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "noreply@example.com";

global.fetch = async (url, options = {}) => {
  if (String(url).includes("api.brevo.com")) {
    sentEmails.push(JSON.parse(String(options.body || "{}")));
    return {
      ok: true,
      json: async () => ({}),
      text: async () => "",
    };
  }

  throw new Error(`Unexpected fetch in auth-security test: ${url}`);
};

const passwordRecoveryModule = await import("../lib/password-recovery.js");
const {
  requestPasswordRecovery,
  verifyRecoveryCodeAndResetPassword,
} = passwordRecoveryModule;

test.after(() => {
  global.fetch = originalFetch;
});

function createThenable(executor) {
  return {
    then(resolve, reject) {
      return Promise.resolve().then(executor).then(resolve, reject);
    },
    catch(reject) {
      return Promise.resolve().then(executor).catch(reject);
    },
    finally(onFinally) {
      return Promise.resolve().then(executor).finally(onFinally);
    },
  };
}

function createSecurityService({
  profiles = [],
  adminProfiles = [],
  passwordRecoveryCodes = [],
  authRateLimits = [],
} = {}) {
  const state = {
    profiles: profiles.map((row) => ({ ...row })),
    admin_profiles: adminProfiles.map((row) => ({ ...row })),
    password_recovery_codes: passwordRecoveryCodes.map((row) => ({ ...row })),
    auth_rate_limits: authRateLimits.map((row) => ({ ...row })),
    authUpdates: [],
  };

  function matches(row, filters) {
    return filters.every(({ column, value }) => row?.[column] === value);
  }

  function applyUpdate(table, filters, payload) {
    let updated = 0;
    state[table] = state[table].map((row) => {
      if (!matches(row, filters)) return row;
      updated += 1;
      return { ...row, ...payload };
    });
    return { data: updated, error: null };
  }

  function createMutationBuilder(table, payload, mode) {
    const filters = [];
    const executor = () => {
      if (mode === "update") {
        return applyUpdate(table, filters, payload);
      }

      if (mode === "delete") {
        const before = state[table].length;
        state[table] = state[table].filter((row) => !matches(row, filters));
        return { data: before - state[table].length, error: null };
      }

      return { data: null, error: null };
    };

    const builder = createThenable(executor);
    builder.eq = (column, value) => {
      filters.push({ column, value });
      return builder;
    };
    return builder;
  }

  function createSelectBuilder(table) {
    const filters = [];
    let orderColumn = null;
    let orderAscending = true;
    let maxRows = null;

    return {
      select() {
        return this;
      },
      eq(column, value) {
        filters.push({ column, value });
        return this;
      },
      order(column, options = {}) {
        orderColumn = column;
        orderAscending = options.ascending !== false;
        return this;
      },
      limit(value) {
        maxRows = Number(value) || null;
        return this;
      },
      maybeSingle: async () => {
        let rows = state[table].filter((row) => matches(row, filters));
        if (orderColumn) {
          rows = rows.sort((left, right) => {
            const leftValue = left?.[orderColumn];
            const rightValue = right?.[orderColumn];
            if (leftValue === rightValue) return 0;
            const direction = orderAscending ? 1 : -1;
            return leftValue > rightValue ? direction : -direction;
          });
        }
        if (maxRows != null) {
          rows = rows.slice(0, maxRows);
        }
        return { data: rows[0] ? { ...rows[0] } : null, error: null };
      },
    };
  }

  return {
    state,
    auth: {
      admin: {
        async updateUserById(id, payload) {
          state.authUpdates.push({ id, payload });
          return { data: { user: { id } }, error: null };
        },
      },
    },
    from(table) {
      return {
        ...createSelectBuilder(table),
        insert: async (payload) => {
          const row = { ...payload };
          state[table].push(row);
          return { data: row, error: null };
        },
        upsert: async (payload, options = {}) => {
          const conflictKey = String(options.onConflict || "scope_key").split(",")[0];
          const index = state[table].findIndex((row) => row?.[conflictKey] === payload?.[conflictKey]);
          if (index >= 0) {
            state[table][index] = { ...state[table][index], ...payload };
          } else {
            state[table].push({ ...payload });
          }
          return { data: payload, error: null };
        },
        update(payload) {
          return createMutationBuilder(table, payload, "update");
        },
        delete() {
          return createMutationBuilder(table, null, "delete");
        },
      };
    },
  };
}

test("admin login locks after four failed attempts for twenty minutes", async () => {
  const service = createSecurityService();
  const now = new Date("2026-03-27T12:00:00.000Z");

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const result = await recordFailedAdminLogin({
      email: "admin@example.com",
      ipAddress: "203.0.113.20",
      service,
      now,
    });
    assert.equal(result.locked, attempt === 4);
  }

  const lockedState = await getAdminLoginLockState({
    email: "admin@example.com",
    service,
    now: new Date("2026-03-27T12:10:00.000Z"),
  });
  assert.equal(lockedState.locked, true);

  const expiredState = await getAdminLoginLockState({
    email: "admin@example.com",
    service,
    now: new Date("2026-03-27T12:21:00.000Z"),
  });
  assert.equal(expiredState.locked, false);
});

test("password recovery stores only a hashed code and preserves generic success", async () => {
  sentEmails.length = 0;
  const service = createSecurityService({
    profiles: [
      {
        id: "student-1",
        email: "student@example.com",
        full_name: "Alice Student",
        invited: true,
        password_set: true,
      },
    ],
  });

  const result = await requestPasswordRecovery("student@example.com", {
    service,
    requestIp: "198.51.100.10",
    now: new Date("2026-03-27T13:00:00.000Z"),
  });

  assert.deepEqual(result, { email: "student@example.com" });
  assert.equal(sentEmails.length, 1);

  const rawCode = sentEmails[0]?.params?.code;
  const storedRow = service.state.password_recovery_codes[0];

  assert.match(rawCode, /^\d{6}$/);
  assert.notEqual(storedRow.code, rawCode);
  assert.equal(storedRow.code, hashRecoveryCode("student@example.com", rawCode));
  assert.equal(storedRow.requested_ip, "198.51.100.10");
  assert.equal(storedRow.used, false);
  assert.equal(storedRow.used_at, null);
});

test("password recovery request does not reveal whether the account exists", async () => {
  sentEmails.length = 0;
  const service = createSecurityService();

  const result = await requestPasswordRecovery("missing@example.com", {
    service,
    requestIp: "198.51.100.11",
    now: new Date("2026-03-27T13:05:00.000Z"),
  });

  assert.deepEqual(result, { email: "missing@example.com" });
  assert.equal(sentEmails.length, 0);
  assert.equal(service.state.password_recovery_codes.length, 0);
});

test("repeated invalid recovery codes trigger the lockout window", async () => {
  const email = "student@example.com";
  const service = createSecurityService({
    profiles: [
      {
        id: "student-1",
        email,
        full_name: "Alice Student",
        invited: true,
        password_set: true,
      },
    ],
    passwordRecoveryCodes: [
      {
        id: "recovery-1",
        email,
        code: hashRecoveryCode(email, "123456"),
        expires_at: "2026-03-27T13:20:00.000Z",
        used: false,
        used_at: null,
        requested_ip: "198.51.100.12",
        created_at: "2026-03-27T13:10:00.000Z",
      },
    ],
  });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(
      () =>
        verifyRecoveryCodeAndResetPassword(
          {
            email,
            code: "654321",
            newPassword: "new-password-1",
          },
          {
            service,
            requestIp: "198.51.100.12",
            now: new Date("2026-03-27T13:12:00.000Z"),
          }
        ),
      new Error(GENERIC_RECOVERY_CODE_MESSAGE)
    );
  }

  await assert.rejects(
    () =>
      verifyRecoveryCodeAndResetPassword(
        {
          email,
          code: "654321",
          newPassword: "new-password-1",
        },
        {
          service,
          requestIp: "198.51.100.12",
          now: new Date("2026-03-27T13:12:00.000Z"),
        }
      ),
    new Error(ADMIN_LOGIN_LOCK_MESSAGE)
  );

  const lockRecord = service.state.auth_rate_limits.find((row) =>
    row.scope_key.includes("password-recovery-verify:email")
  );
  assert.ok(lockRecord?.locked_until);
});

test("valid recovery consumes the hashed code and updates the password", async () => {
  sentEmails.length = 0;
  const service = createSecurityService({
    adminProfiles: [
      {
        id: "admin-1",
        email: "admin@example.com",
        full_name: "Admin User",
        invited: true,
        password_set: true,
      },
    ],
  });

  await requestPasswordRecovery("admin@example.com", {
    service,
    requestIp: "203.0.113.44",
    now: new Date("2026-03-27T14:00:00.000Z"),
  });

  const rawCode = sentEmails[0]?.params?.code;
  const result = await verifyRecoveryCodeAndResetPassword(
    {
      email: "admin@example.com",
      code: rawCode,
      newPassword: "secure-password-2",
    },
    {
      service,
      requestIp: "203.0.113.44",
      now: new Date("2026-03-27T14:05:00.000Z"),
    }
  );

  assert.deepEqual(result, { email: "admin@example.com" });
  assert.equal(service.state.authUpdates.length, 1);
  assert.deepEqual(service.state.authUpdates[0], {
    id: "admin-1",
    payload: {
      password: "secure-password-2",
      email_confirm: true,
    },
  });

  const recoveryRow = service.state.password_recovery_codes[0];
  assert.equal(recoveryRow.used, true);
  assert.ok(recoveryRow.used_at);
});
