# CRM Reference

## Locked Direction

- CRM lives under `/admin/crm/*`.
- `/admin/login` remains the shared login entrypoint.
- CRM-only users can access CRM pages only.
- Pre-enrollment leads enter CRM before approval.
- `approved` remains the decisive won/enrolled transition.

## Current Technical References

- Access guards: `lib/admin/access.js`
- CRM auth state: `lib/crm/auth.js`
- CRM Kanban data loader: `app/admin/crm/_data.js`
- CRM stage persistence: `lib/crm/stages.js`
- CRM automation runner: `app/api/crm/automations/run/route.js`
- Internal CRON job pattern: `app/api/jobs/*` and `lib/jobs/internal-auth.js`
