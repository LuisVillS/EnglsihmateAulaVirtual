import { spawnSync } from "node:child_process";

const securityTests = [
  "tests/security-env.test.mjs",
  "tests/calendar-feed-token.test.mjs",
  "tests/student-auth-hardening.test.mjs",
  "tests/job-auth.test.mjs",
  "tests/auth-security.test.mjs",
  "tests/google-calendar-oauth.test.mjs",
  "tests/webhook-security.test.mjs",
];

const result = spawnSync(
  process.execPath,
  [
    "--experimental-default-type=module",
    "--experimental-specifier-resolution=node",
    "--test",
    ...securityTests,
  ],
  {
    stdio: "inherit",
  }
);

if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}
