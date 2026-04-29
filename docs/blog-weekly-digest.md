# Blog Weekly Digest

This repo now includes a server-side weekly blog digest job that sends app-generated HTML through Brevo.

## Route

- `GET/POST /api/jobs/blog-weekly-digest`
- Auth: bearer `CRON_SECRET`
- Optional query params:
  - `force=1` to run outside Monday/Saturday
  - `dry=1` to build the run without actually sending email

## Schedule

- Scheduled days: Monday and Saturday
- Timezone: `BLOG_DIGEST_TIMEZONE`, default `America/Lima`
- No send happens when there are no newly published posts since the last successful digest run

## Audience rules

Current repo-safe audience rules:

- include `blog_subscribers` where `status = 'subscribed'`
- include student emails from the admin student export flow
- include CRM leads where `lead_status = 'open'`
- dedupe by normalized email (`lower(trim(email))`)
- suppress globally when the email appears in `blog_subscribers` with `status = 'unsubscribed'`

The repo does not currently expose a dedicated marketing-consent field that can be enforced safely across all three sources, so this first version uses only rules that are already represented in the data model.

## Delivery model

- The app builds the digest HTML itself
- Brevo is used only as the sender/delivery provider
- Each recipient gets:
  - a generated HTML digest
  - a plain-text fallback
  - a signed unsubscribe link

## Required env

```bash
CRON_SECRET=...
BREVO_API_KEY=...
BREVO_SMTP_USER=...
BREVO_SMTP_PASSWORD=...
BREVO_SMTP_HOST=...
BREVO_SMTP_PORT=...
BREVO_SENDER_EMAIL=...
APP_URL=https://admin.example.com
BLOG_PUBLIC_BASE_URL=https://www.example.com
```

Recommended optional env:

```bash
BLOG_DIGEST_UNSUBSCRIBE_SECRET=...
BLOG_DIGEST_TIMEZONE=America/Lima
BLOG_DIGEST_POST_LIMIT=5
BLOG_DIGEST_SUBJECT=...
```

`BLOG_PUBLIC_BASE_URL` should point to the public marketing site because digest article links are built against that host.

## Persistence

Digest runs are stored in `public.blog_digest_runs`.

The table records:

- digest key per Monday/Saturday slot
- send status
- post ids included
- recipient counts
- partial failures

This keeps the job idempotent per schedule slot and makes no-post / partial-failure cases auditable.
