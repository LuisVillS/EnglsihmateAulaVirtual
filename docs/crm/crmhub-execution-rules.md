# CRM Hub Execution Rules

## Rules

- Prefer additive migrations and compatibility layers.
- Keep `stage_key` behavior working while introducing `system_key` and `display_name`.
- Do not move CRM outside `/admin/crm/*`.
- Do not replace the existing CRM automation runner when extending it.
- Use the internal `/api/jobs/*` CRON auth pattern for scheduled work where practical.
- Update docs in the same milestone as the code change.
