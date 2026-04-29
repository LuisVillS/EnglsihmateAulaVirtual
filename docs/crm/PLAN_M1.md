# CRM Plan M1

## Scope

- Discovery of the existing admin login, CRM access rules, pre-enrollment flow, and approval sync path.
- Confirmation that CRM remains under `/admin/crm/*`.

## Status

- Completed discovery in code.
- `/admin/login` remains the entrypoint.
- CRM routes already exist under `/admin/crm/*`.
- `approved` is still the decisive conversion state through the pre-enrollment and payment sync flow.

## Validation

- Confirm admin and CRM route access through `lib/admin/access.js`.
- Confirm pre-enrollment sync through the CRM SQL functions and triggers.
