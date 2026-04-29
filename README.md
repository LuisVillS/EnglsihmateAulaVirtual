# EnglishMateApp

Private English-learning platform built with Next.js App Router and Supabase. The repository currently contains:

- A student web app with dashboard, course access, academic path, practice arena, flashcards, competitions, calendar, enrollment, and library reading.
- An admin area for students, commissions, templates, exercises, flashcards, blog management, library management, Discord linking, pre-enrollments, and teacher analytics.
- A Supabase schema and migration history that power most of the product behavior.
- A separate Python Discord bot under `bot/`.

## Stack

- Next.js 16
- React 19
- Tailwind CSS 4
- Supabase SSR + Supabase JS
- Cloudflare R2 / S3-compatible storage
- EPUB / flipbook reader stack: `epubjs`, `@intity/epub-js`, `page-flip`

## Main app areas

### Public and auth-facing routes

- `/` redirects authenticated users to `/app`, `/admin`, `/admin/crm`, or `/app/matricula` depending on access role/status.
- `/login` student login.
- `/admin/login` shared admin entrypoint for classic admins and CRM-role users.
- `/account/register` and `/api/account/*` account registration and verification flows.
- `/auth/callback` auth callback route.
- `/prematricula` and `/prematricula/checkout` pre-enrollment flow.

### Student routes

- `/app` student dashboard.
- `/app/curso` active course workspace.
- `/app/practice` practice arena / Duolingo-like session flow.
- `/app/flashcards` flashcard area.
- `/app/competition` weekly competition area.
- `/app/leaderboard` rankings.
- `/app/calendario` student calendar.
- `/app/library` library browser.
- `/app/library/book/[slug]` library detail page.
- `/app/library/flipbook/[slug]` primary in-app reader.
- `/app/ruta-academica` academic path.
- `/app/matricula` enrollment workspace for non-student or pending users.
- `/profile` profile and security settings.

### Admin routes

- `/admin` admin dashboard.
- `/admin/crm` CRM overview and control room.
- `/admin/crm/kanban` CRM stage board with server-backed stage moves.
- `/admin/crm/callinghub` CRM queue surface with dropdown-based stage and source filters, a focused campaign workspace, `tel:` launch only, and server-backed outcomes.
- `/admin/crm/leads` CRM lead list with filters and server-backed navigation.
- `/admin/crm/leads/[id]` CRM lead detail with timeline, payment summary, stage moves, and note capture.
- `/admin/crm/statistics` CRM release-facing reporting, webhook health, and automation visibility.
- `/admin/blog` blog posts list with draft/published management.
- `/admin/blog/new` blog post creation.
- `/admin/blog/[id]` blog post editor with Markdown content and URL-based images.
- `/admin/blog/categories` blog category management.
- `/admin/blog/subscribers` blog subscriber list and CSV export.
- `/admin/panel` operations panel.
- `/admin/students` student management and CSV import/export.
- `/admin/commissions` commission management.
- `/admin/courses` and `/admin/courses/templates` course/template management.
- `/admin/exercises` exercise library.
- `/admin/flashcards` flashcard management.
- `/admin/library` library ingestion, staging, duplicate review, and publishing.
- `/admin/teacher-dashboard` teacher analytics.
- `/admin/discord` Discord linking/admin tools.
- `/admin/prematriculas` pre-enrollment review.
- `/admin/seed` demo data/bootstrap actions.

### API route groups

Under `app/api` the repo currently exposes route groups for:

- `account`
- `admin`
- `auth`
- `calendar`
- `crm`
- `flashcards`
- `jobs`
- `library`
- `matricula`
- `payments`
- `progress`
- `r2`
- `session`
- `study-with-me`

CRM-specific API endpoints currently include:

- `/api/leads/submit`
- `/api/webhooks/meta/leads`
- `/api/crm/webhooks/meta`
- `/api/crm/automations/run`
- `/api/crm/simulate/meta`
- `/api/crm/simulate/web-form`
- `/api/admin/blog/subscribers/export`
- `/api/jobs/blog-weekly-digest`

## Important directories

- `app/`: App Router pages, layouts, and API handlers.
- `components/`: UI components, including the flipbook reader stack in `components/flipbook/`.
- `lib/`: business logic and integrations.
- `lib/duolingo/`: practice session generation, evaluation, spaced repetition, analytics.
- `lib/library/`: library auth, repository, embed, TTS, EPUB source handling.
- `lib/flipbook-core/` and `lib/flipbook-services/`: manifest generation, pagination, progress, session tokens.
- `supabase/`: schema, migrations, and local Supabase config.
- `tests/`: custom Node-based test runner and domain tests.
- `scripts/`: maintenance scripts.
- `bot/`: separate Python Discord bot.
- `docs/`: operational notes and audits.

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Expose on local network:

```bash
npm run dev:lan
```

Production build:

```bash
npm run build
npm run start
```

Production build on local network:

```bash
npm run build
npm run start:lan
```

Lint:

```bash
npm run lint
```

Tests:

```bash
npm test
```

Notes:

- `npm test` runs `tests/run-duolingo-tests.mjs`, a custom Node assertion suite. It is not configured as Jest or Vitest.
- `playwright` is installed as a dependency, but no standard Playwright test directory is currently wired into `package.json`.

## Environment variables

The app will not boot correctly without Supabase env vars. `lib/supabase-server.js` throws if they are missing.

Minimum app variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DEFAULT_ADMIN_EMAIL=...
```

Common mail / auth / storage variables used across the repo:

```bash
BREVO_API_KEY=...
BREVO_SMTP_USER=...
BREVO_SMTP_PASSWORD=...
BREVO_SMTP_HOST=...
BREVO_SMTP_PORT=...
BREVO_SENDER_EMAIL=...
BREVO_SENDER_NAME=...
BREVO_TEMPLATE_RECOVERY_ID=...
BREVO_TEMPLATE_WELCOME_ID=...
BREVO_TEMPLATE_ENROLLMENT_ID=...

R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
NEXT_PUBLIC_R2_PUBLIC_BASE_URL=...

NEXT_PUBLIC_SITE_URL=...
FLIPBOOK_SESSION_SECRET=...
```

Transactional email sends use Brevo templates and now validate that the recipient email domain has MX records before calling Brevo, so obvious typo domains fail immediately instead of producing later soft bounces.

CRM webhook and automation variables:

```bash
TURNSTILE_SECRET_KEY=...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
META_APP_ID=...
META_APP_SECRET=...
META_WEBHOOK_VERIFY_TOKEN=...
META_PAGE_ACCESS_TOKEN=...
META_GRAPH_API_VERSION=...

CRM_META_WEBHOOK_SECRET=...
CRM_AUTOMATION_RUN_SECRET=...
CRM_AUTOMATIONS_SAFE_MODE=true
CRON_SECRET=...

# Optional pattern for CRM automation template lookup
BREVO_TEMPLATE_<TEMPLATE_KEY>_ID=...
```

Blog digest variables:

```bash
BLOG_PUBLIC_BASE_URL=...
BLOG_DIGEST_UNSUBSCRIBE_SECRET=...
BLOG_DIGEST_TIMEZONE=America/Lima
BLOG_DIGEST_POST_LIMIT=5
BLOG_DIGEST_SUBJECT=...
```

There are additional feature-specific variables in the codebase for external integrations. Before enabling a new flow, search the relevant route or library module and document any new env var here in the same change.

## Supabase

The database is central to the app. The repo includes:

- Base schema: `supabase/schema.sql`
- Migrations: `supabase/migrations/*.sql`
- Local config: `supabase/config.toml`

Recent migration history shows active development across:

- student roles and enrollment
- Duolingo-like practice
- flashcards and competitions
- library ingestion and flipbook reading
- schema cleanup and scaling indexes
- CRM role storage, CRM core tables, queue claim RPCs, approval sync, and approved-payment revenue rollups

CRM-specific notes:

- `crm_roles` migration adds the additive CRM role tables used by `/admin/login` and `/admin/crm`.
- `crm_core` migration adds the CRM lead/stage/interactions/automation/webhook tables plus row-level security.
- The web-form/Meta ingestion migration adds `crm_inbound_events` for raw event storage plus `crm_lead_touchpoints` for submission history and expands `crm_leads` with source/site/form/page attribution fields.
- `/admin/crm` is the CRM control room and links into Kanban, Calling Hub, and lead management.
- The CRM expansion also covers operator settings, stage management, stage-to-template Brevo template ID mapping, source-aware Brevo ignore rules, lead source visibility, safe archive/delete behavior, and drag-and-drop stage movement in the CRM UI.
- CRM lead ingestion preserves external raw source metadata when the matching database columns exist, including Meta, internal WebForm, classroom/pre-enrollment, and manual sources.
- CRM external ingestion now also preserves canonical phone candidates when possible, including `phone_country_code`, `phone_national_number`, `phone_e164`, `phone_dialable`, and phone validation metadata if the destination columns exist.
- CRM lead ingestion now deduplicates by phone number and merges additional source tags onto the same canonical lead, up to three source tags per lead.
- CRM automation delivery can switch to a stage-triggered Brevo template when a lead enters a configured stage, while still honoring source-aware ignore rules and the generic template lookup rules.
- CRM stages now keep a stable `system_key` plus a user-facing `display_name`, so stage renames in Kanban do not break automation or filtering logic.
- `/admin/crm/kanban` now supports per-stage modal editing for the display name, initial email template, ignored roles, initial delay hours, and a 24-hour stagnancy follow-up template.
- The 24-hour CRM stage stagnancy follow-up can be scheduled through `/api/jobs/crm-stage-stagnancy` using the existing `CRON_SECRET` job-auth pattern.
- `/admin/crm/statistics` reports approved revenue, webhook activity, automation job health, and release-readiness signals.
- Queue ownership is server-controlled through SQL using `FOR UPDATE SKIP LOCKED`.
- The Calling Hub uses `tel:` launch only; call outcomes stay manual and are persisted through server actions.
- The Calling Hub now opens with dropdown selectors for stage and source, then transitions into a focused campaign workspace instead of exposing separate `Current lead`, `Context`, and `Queue preview` panels as the main experience.
- `/admin/crm/kanban` now uses optimistic stage moves and bottom-positioned horizontal board navigation so the board stays responsive without wrapping or redirect churn.
- CRM cards now keep only approved source tags plus the `Student` tag visible so merged acquisition history stays readable without internal status chips.
- Public web-form intake is handled by `/api/leads/submit`, which validates Turnstile server-side, stores raw inbound events before normalizing CRM leads, and preserves `site_key` identity for `main_site` and `virtual_site`.
- Public web-form and Meta intake merge only into open non-student CRM leads; matches against won/approved/revenue-bearing records create a fresh open lead in `new_lead` instead of placing the new submission under Won / Enrolled.
- Meta lead intake is handled by `/api/webhooks/meta/leads`, which supports `GET` verification, `POST` webhook intake, signature validation, raw event storage, and Graph API lead retrieval by `leadgen_id`.
- The CRM home surface exposes temporary admin-only Meta and internal WebForm lead-simulation buttons for source-preview testing.
- `/admin/crm/settings/integrations` now provides a low-code integrations setup page with webhook URLs, secret-status visibility, accepted header names, and admin setup guidance for Meta and the internal WebForm flow.
- Any CRM integrations/configuration area should stay minimal and only expose setup that the repo can actually support without code changes.
- CRM dialing should use the canonical dialable phone value when available so links render as `tel:+<countrycode><number>`.
- Pre-registration now uses a split country-code and national-number selector, with browser-locale country preselection and Peru fallback.
- `/account/register` now shows only flag plus country code in the selector, and the shared selector generates flags at runtime instead of relying on stored glyph literals.
- `/app/matricula` now treats the Yape or Plin payer phone as Peru-only, hides the country selector there, and can prefill it from the account phone when the account phone is already Peruvian.
- Classroom and CRM phone writes now converge on canonical `phone_country_code`, `phone_national_number`, and `phone_e164` fields while keeping the legacy raw `phone` column for compatibility.
- CRM lead delete is a hard delete of the live row with a tombstone snapshot stored in `crm_deleted_leads` for audit and recovery context.
- `/admin/crm/kanban` now keeps all stages in one horizontal row with sideways scroll and still uses drag-and-drop as the primary movement pattern.
- Calling Hub now supports campaign selection, leave-campaign flow, Save, and Save and Next while still using `tel:` launch only.
- Approval-to-won synchronization is tied to the discovered pre-enrollment approval path where `pre_enrollments.status = 'APPROVED'` and `payments.status = 'approved'`.
- CRM revenue fields are derived from approved payment records only.
- CRM webhook ingestion is now split between public intake routes and compatibility routes: `/api/leads/submit` for internal WebForm intake, `/api/webhooks/meta/leads` for Meta webhook verification and lead retrieval, and `app/api/crm/webhooks/*` for compatibility.
- Temporary admin-only CRM simulation routes exist at `app/api/crm/simulate/*` for Meta and internal WebForm source preview/testing.
- CRM automation delivery is asynchronous, Brevo-backed, and can be exercised through `/api/crm/automations/run` in safe mode.

Blog-specific notes:

- `blog_categories`, `blog_posts`, and `blog_subscribers` are managed from `/admin/blog` using server-side admin actions.
- Blog writes are guarded by admin access and use the Supabase service role only on the server; browser code must not receive `SUPABASE_SERVICE_ROLE_KEY`.
- Public blog reads should use only active categories and posts where `status = 'published'`; drafts remain admin-only.
- Blog images are URL-only for now, including external image URLs and R2 URLs. Supabase Storage uploads are intentionally not part of the current blog editor.
- `/admin/blog` separates posts into Published, Draft, and Unpublished tables. Published posts with broken image URLs are moved to `unpublished` automatically and show the image-check reason in the UI.
- The blog editor supports a richer Markdown toolbar with toggle-aware bold, italics, underline, strikethrough, highlight, headings, lists, quotes, links, external images, safe inline color/font-size spans, dividers, and YouTube/Vimeo `@[video](url)` embeds. Common shortcuts include Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+K, and Ctrl+Alt+1/2/3.
- `/api/jobs/blog-weekly-digest` sends a Monday/Saturday blog digest through Brevo using app-generated HTML, skips empty weeks, dedupes blog subscribers + students + CRM open leads by normalized email, and records each run in `blog_digest_runs`.
- The digest unsubscribe link writes back to `blog_subscribers.status = 'unsubscribed'`, which acts as the global suppression source for future blog digests.

Useful command:

```bash
npm run supabase:repair-history
```

## Reader and library

The current primary reader route is:

- `/app/library/flipbook/[slug]`

Supporting API endpoints include:

- `/api/library/books/[slug]/flipbook-manifest`
- `/api/library/books/[slug]/flipbook-pages`
- `/api/library/books/[slug]/flipbook-progress`
- `/api/library/books/[slug]/asset`
- `/api/library/books/[slug]/tts`

The older EPUB/read routes still exist as redirect surfaces, but the maintained in-app reading experience is the flipbook stack.

## Discord bot

The `bot/` directory contains a separate Python Discord bot with commands and services for verification, practice, member sync, and role sync. It has its own environment/config surface and should be treated as a separate runtime from the Next.js app.

## Known operational characteristics

- The app is heavily coupled to Supabase tables, policies, and service-role-backed server actions.
- `app/layout.js` ensures a default admin user during root layout execution.
- Route coverage is broader than the older project description: payments, pre-enrollment, calendar feeds, library/flipbook, flashcards, and competition features are active in the codebase.
- Local secret-bearing files such as `.env.local` and files under `bot/` should remain out of version control and out of shared documentation.

## README maintenance

This README should be updated in the same pull request whenever a code change affects any of the following:

- scripts in `package.json`
- routes under `app/`
- API groups under `app/api/`
- required environment variables
- setup, deployment, or operational behavior
- major feature areas or directory responsibilities

Practical rule: if a change would make a fresh developer run the wrong command, miss a required env var, or look in the wrong route/module, update this file before merging.
