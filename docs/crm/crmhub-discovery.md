# CRM Hub Discovery

## Confirmed Flows

- Stage backend logic already uses the stable `stage_key` field in SQL functions such as `crm_stage_key_for_pre_enrollment_status` and `crm_lead_status_for_stage_key`.
- Pre-enrollment and payment approvals sync into CRM through:
  - `crm_upsert_lead_from_pre_enrollment`
  - `crm_sync_approved_pre_enrollment`
  - `crm_sync_lead_from_pre_enrollment_trigger`
  - `crm_sync_leads_from_payment_trigger`
- External WebForm/Meta ingestion may merge only into open non-student leads. If a matching email or phone belongs only to a won/approved/revenue-bearing lead, ingestion creates a fresh open lead in `new_lead` instead of reusing the won/enrolled record.
- Current CRM stage-enter emails are synced through `app/admin/crm/actions.js` into `crm_automations`.
- Current CRM automation delivery runs through `app/api/crm/automations/run/route.js`.
- The repo already has a hardened CRON job pattern under `/api/jobs/*` using `CRON_SECRET`.

## Current Kanban Gaps

- The pipeline card currently sums stored lead revenue instead of the requested projected pipeline formula.
- Stage headers expose a three-dots button but no editing modal.
- Stage rows do not yet persist `display_name`, `system_key`, ignored roles, delay hours, or stagnancy follow-up settings.
- Leads do not yet track `last_stage_change_at` or stage-level stagnancy follow-up delivery state.

## Rename-Safe Direction

- Existing `stage_key` is already the stable slug for backend logic.
- Current milestone adds explicit `system_key` and `display_name` fields while keeping `stage_key` and `name` synchronized for backward compatibility.
