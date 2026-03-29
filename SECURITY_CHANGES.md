# Security Changes

## Summary

This hardening pass fixed the reported critical, high, and medium findings without changing page layouts, routes, or visual design.

- Calendar feed tokens now require a dedicated private secret, use versioned signing, reject insecure legacy tokens, and stay bound to the signed user.
- Practice/auth/session flows no longer accept `student_code` as an authentication fallback, and cross-account progress mutations are blocked.
- Internal `/api/jobs/*` routes now require `Authorization: Bearer CRON_SECRET` and fail closed when the secret is missing.
- Password recovery codes are now hashed before storage, are single-use, respect expiration, and are protected by request/verify rate limits.
- Admin password login now locks after 4 failed attempts for 20 minutes.
- Auth and recovery flows now use generic error responses to avoid leaking account existence or role information.
- Webhooks now fail closed when secrets are missing, verify signatures, and dedupe replayed events.
- Auth-generated redirect and email URLs now use trusted canonical server URLs instead of raw request `Origin`/`Host` headers.
- Nearby secret fallback patterns were also removed from Google Calendar OAuth state signing and flipbook session tokens.

## Required Environment Variables

The following server-side env vars are now required for the hardened paths:

- `CALENDAR_FEED_SECRET`
- `CALENDAR_OAUTH_STATE_SECRET`
- `CRON_SECRET`
- `PASSWORD_RECOVERY_SECRET`
- `APP_URL` or `SITE_URL`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `CALENDLY_WEBHOOK_SECRET`
- `FLIPBOOK_SESSION_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

Public `NEXT_PUBLIC_*` values are no longer used as fallbacks for privileged signing or verification in the covered areas.

## Database Migration

Added migration:

- [`supabase/migrations/20260327000100_security_auth_hardening.sql`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/supabase/migrations/20260327000100_security_auth_hardening.sql)

This migration is additive and introduces:

- `public.auth_rate_limits` for admin login lockouts and password recovery throttling
- `attempts` on `public.password_recovery_codes`
- `used_at` on `public.password_recovery_codes`
- `requested_ip` on `public.password_recovery_codes`
- supporting indexes and RLS enablement

## Rollout And Invalidation Notes

- Existing calendar feed tokens signed with the old insecure fallback are intentionally invalid after rollout.
- Existing Google Calendar OAuth states issued before rollout should be treated as expired/invalid.
- Existing password recovery codes issued before rollout should be treated as invalid because codes are now stored and verified as hashes.
- Internal schedulers or cron jobs must send `Authorization: Bearer <CRON_SECRET>`.
- Webhook providers must be configured with the new or existing server-only webhook secrets before deployment.

## Small Intended Behavior Changes

These are expected and intentional:

- Admin login locks for 20 minutes after 4 failed password attempts.
- Password recovery requests and verification use generic responses.
- Password recovery requests and verification are rate-limited by identifier and IP.
- Calendar feed requests fail closed if the signing secret is missing.
- Webhooks fail closed if their secret is missing or the signature is invalid.
- Internal job routes reject unauthenticated or incorrectly signed requests.

## Agent Handoff Notes

### Agent 0

- Built the remediation map and dependency order.
- Flagged nearby insecure secret fallback patterns in Google Calendar OAuth state handling and flipbook session tokens.
- No migrations added in this scope.

### Agent 1

- Hardened calendar feed signing and verification in [`lib/calendar-feed-token.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/calendar-feed-token.js) and [`app/api/calendar/feed/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/calendar/feed/route.js).
- Required env: `CALENDAR_FEED_SECRET`.
- Compatibility impact: legacy insecure feed tokens are rejected after rollout.

### Agent 2

- Removed `student_code` authentication fallback and blocked unauthorized identity/profile mutation paths in the practice/auth/session flows.
- Files changed include [`lib/duolingo/api-auth.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/duolingo/api-auth.js), [`lib/duolingo/student-upsert.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/duolingo/student-upsert.js), [`app/api/auth/student/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/auth/student/route.js), and [`app/api/progress/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/progress/route.js).
- No new env vars or migrations.
- Compatibility impact: unauthenticated `student_code` requests are now rejected.

### Agent 3

- Locked down internal job routes with bearer-token auth and shared verification helpers.
- Files changed include [`lib/jobs/internal-auth.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/jobs/internal-auth.js), [`lib/jobs/internal-job-handlers.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/jobs/internal-job-handlers.js), [`app/api/jobs/course-email-reminders/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/jobs/course-email-reminders/route.js), and [`app/api/jobs/pre-enrollment-cleanup/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/jobs/pre-enrollment-cleanup/route.js).
- Required env: `CRON_SECRET`.
- No migration added.

### Agent 4

- Added admin login lockouts, generic auth/recovery messaging, hashed password recovery codes, and recovery throttling.
- Files changed include [`lib/auth-security.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/auth-security.js), [`lib/password-recovery.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/password-recovery.js), [`app/(auth)/auth-actions.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/(auth)/auth-actions.js), and the security migration.
- Required env: `PASSWORD_RECOVERY_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
- Migration added: [`supabase/migrations/20260327000100_security_auth_hardening.sql`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/supabase/migrations/20260327000100_security_auth_hardening.sql).
- Compatibility impact: old plaintext recovery codes are invalid after rollout.

### Agent 5

- Made Mercado Pago and Calendly webhooks fail closed, verify signatures, and dedupe replayed events.
- Files changed include [`app/api/matricula/payment/mercadopago-webhook/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/matricula/payment/mercadopago-webhook/route.js), [`app/api/study-with-me/calendly-webhook/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/study-with-me/calendly-webhook/route.js), [`lib/webhooks/security.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/webhooks/security.js), [`lib/webhooks/calendly.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/webhooks/calendly.js), and [`lib/webhooks/service.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/webhooks/service.js).
- Required env: `MERCADOPAGO_WEBHOOK_SECRET`, `CALENDLY_WEBHOOK_SECRET`.
- No migration added.

### Agent 6

- Replaced untrusted header-based URL generation with canonical server URL resolution in auth-related flows.
- Files changed include [`lib/google-calendar-oauth.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/google-calendar-oauth.js), [`app/api/account/request-login-otp/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/account/request-login-otp/route.js), [`app/api/account/register/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/account/register/route.js), [`app/api/account/resend-code/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/account/resend-code/route.js), [`app/profile/actions.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/profile/actions.js), [`app/api/calendar/google/connect/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/calendar/google/connect/route.js), and [`app/api/calendar/google/callback/route.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/app/api/calendar/google/callback/route.js).
- Required env: `APP_URL` or `SITE_URL`, and now `CALENDAR_OAUTH_STATE_SECRET`.
- No migration added.

### Agent 7

- Added server-side env guards in [`lib/security/env.js`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/lib/security/env.js).
- Removed insecure secret fallbacks in covered flows and nearby helpers, including flipbook session token signing.
- Required envs are listed above.
- No migration added.

### Agent 8

- Consolidated security-focused automated coverage and nearby-pattern verification.
- Added or updated tests in [`tests/security-env.test.mjs`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/tests/security-env.test.mjs), [`tests/calendar-feed-token.test.mjs`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/tests/calendar-feed-token.test.mjs), [`tests/student-auth-hardening.test.mjs`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/tests/student-auth-hardening.test.mjs), [`tests/job-auth.test.mjs`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/tests/job-auth.test.mjs), [`tests/auth-security.test.mjs`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/tests/auth-security.test.mjs), [`tests/google-calendar-oauth.test.mjs`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/tests/google-calendar-oauth.test.mjs), and [`tests/webhook-security.test.mjs`](/C:/Users/luise/OneDrive/Escritorio/EnglishmateApp/tests/webhook-security.test.mjs).
- No migration added.

## Validation

Validated with:

- targeted `eslint` on all touched security files
- targeted Node tests for the hardened security flows
- full `npm test` after integrating the new security runner

The hardening was scoped to preserve existing routes, UI structure, and visual appearance while tightening privileged behaviors.
