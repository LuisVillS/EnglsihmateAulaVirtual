import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationSource = readFileSync(
  new URL("../supabase/migrations/20260424000100_security_rls_execute_hardening.sql", import.meta.url),
  "utf8"
);

const automationRunnerSource = readFileSync(
  new URL("../app/api/crm/automations/run/route.js", import.meta.url),
  "utf8"
);

test("hardening migration enforces RLS and revokes broad grants on sensitive tables", () => {
  assert.match(migrationSource, /alter table public\.fixed_admin_emails enable row level security/i);
  assert.match(migrationSource, /alter table public\.fixed_admin_emails force row level security/i);
  assert.match(migrationSource, /revoke all privileges on table public\.fixed_admin_emails from anon/i);
  assert.match(migrationSource, /revoke all privileges on table public\.fixed_admin_emails from authenticated/i);

  assert.match(migrationSource, /alter table public\.password_recovery_codes enable row level security/i);
  assert.match(migrationSource, /alter table public\.password_recovery_codes force row level security/i);
  assert.match(migrationSource, /revoke all privileges on table public\.password_recovery_codes from anon/i);
  assert.match(migrationSource, /revoke all privileges on table public\.password_recovery_codes from authenticated/i);

  assert.match(migrationSource, /alter table public\.auth_rate_limits enable row level security/i);
  assert.match(migrationSource, /alter table public\.auth_rate_limits force row level security/i);
  assert.match(migrationSource, /revoke all privileges on table public\.auth_rate_limits from anon/i);
  assert.match(migrationSource, /revoke all privileges on table public\.auth_rate_limits from authenticated/i);
});

test("hardening migration removes public execute on sensitive security definer functions", () => {
  assert.match(migrationSource, /public\.crm_claim_next_lead\(uuid,integer\)/i);
  assert.match(
    migrationSource,
    /revoke all privileges on function %s from authenticated[\s\S]*grant execute on function %s to service_role/i
  );
  assert.match(migrationSource, /public\.crm_hard_delete_lead\(uuid,uuid,text\)/i);
  assert.match(migrationSource, /public\.handle_new_user\(\)/i);
});

test("automation runner no longer accepts secrets via URL query string", () => {
  assert.match(automationRunnerSource, /constantTimeEqual/);
  assert.doesNotMatch(automationRunnerSource, /searchParams\.get\("secret"\)/);
});
