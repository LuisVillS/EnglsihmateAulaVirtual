# CRM Hub Risk Register

## External intake merging into won/enrolled leads

- Status: Mitigated in code.
- Risk: Public WebForm/Meta submissions can share email or phone with an existing won/enrolled CRM lead. If ingestion dedupes into that closed lead, the new submission appears under Won / Enrolled even though approval/payment did not happen.
- Mitigation: External ingestion now merges only into open non-student leads. Won/approved/revenue-bearing matches are not merge candidates, so a new open lead is created in `new_lead`; approval sync and manual Kanban movement remain the allowed won paths.

## Active Risks

1. Stage rename regressions if any automation still depends on `name`.
   Mitigation: keep a stable `system_key`/`stage_key` path and audit automation references.

2. Duplicate or looping stagnancy emails.
   Mitigation: persist per-lead follow-up sent markers tied to the current stage and reset them only on stage change.

3. Cron auth drift between CRM automation routes and internal job routes.
   Mitigation: keep scheduled execution on the hardened `/api/jobs/*` pattern.

4. Missing template catalog for dropdown UI.
   Mitigation: build options from configured Brevo env IDs plus existing CRM stage/automation template IDs.
