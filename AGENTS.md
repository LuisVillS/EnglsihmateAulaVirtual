# AGENTS.md

## Purpose

This repository is an existing, working EnglishMate application.  
Any AI agent operating in this repo must preserve current functionality while expanding the CRM under the admin surface.

The CRM effort must be executed **milestone by milestone**, with **non-destructive changes**, and with **clear ownership boundaries** across agents.

---

## Repo operating principles

- Treat the current application as production-grade and already working.
- Do **not** delete working files.
- Do **not** remove or break existing routes.
- Do **not** drop existing tables or columns unless the user explicitly approves it.
- Prefer additive changes, wrappers, adapters, compatibility layers, and reversible migrations.
- If replacing logic, keep old behavior compatible until the new behavior is validated.
- Do not silently refactor unrelated parts of the app.
- Do not invent missing repo details; discover them from code first.
- If a flow is unclear, document the uncertainty before changing behavior.
- Update docs in the same milestone where behavior changes.

---

## Locked user decisions

These decisions are fixed unless the user explicitly changes them:

- CRM must live under **`/admin/crm/*`**
- Login entrypoint remains **`/admin/login`**
- `/admin/login` must detect role and redirect accordingly
- CRM-only users can access **CRM pages only**, not the other admin pages
- "Classroom" leads are **pre-enrollment leads**
- A user who starts pre-enrollment becomes a CRM lead
- If the user is not yet approved/paid, that lead remains pending
- The decisive state for converting a lead into won/enrolled is **`approved`**
- The exact source table for pre-enrollment/payment approval is not yet confirmed and must be discovered from the repo
- Calling uses **`tel:` launcher only**
- There is currently **one operator**, but architecture must remain future-safe for more operators
- Statistics must use **actual captured revenue only**
- Do not delete working files

---

## Required planning docs

Before major implementation work, consult these files:

- `/docs/crm/PLAN_M1.md`
- `/docs/crm/PLAN_M2.md`
- `/docs/crm/PLAN_M3.md`
- `/docs/crm/PLAN_M4.md`
- `/docs/crm/PLAN_M5.md`
- `/docs/crm/README_REFERENCE_FOR_CRM.md`

If they do not exist yet, create them before continuing deep implementation.

Also maintain these planning / discovery docs as the work progresses:

- `/docs/crm/crmhub-discovery.md`
- `/docs/crm/crmhub-agent-map.md`
- `/docs/crm/crmhub-file-ownership.md`
- `/docs/crm/crmhub-execution-rules.md`
- `/docs/crm/crmhub-risk-register.md`

---

## Execution order

Work in this order:

1. **Discovery**
2. **Planning**
3. **Milestone execution**
4. **Validation**
5. **Documentation update**

Do not skip directly to implementation without discovery if the relevant flow is unclear.

---

## Milestone policy

Execute **one milestone at a time**.

- Do not start M2 before M1 is implemented and validated.
- Do not start M3 before M2 is implemented and validated.
- Do not start M4 before M3 is implemented and validated.
- Do not start M5 before M4 is implemented and validated.

Each milestone must leave the repo in a working state.

---

## Agent model

Use one orchestrator and specialized agents.

### Orchestrator
Responsibilities:
- milestone sequencing
- conflict resolution
- enforcing non-destructive rules
- cross-agent consistency
- ensuring docs and README stay aligned with changes
- deciding when a milestone is complete enough to continue

### Agent A — Access & Existing Flow Discovery
Responsibilities:
- `/admin/login`
- existing admin role/access logic
- middleware / proxy / auth guard discovery
- `/admin/prematriculas`
- payment approval flow discovery
- pre-enrollment flow discovery
- discovering where and how `approved` is stored and used

### Agent B — Database & Security
Responsibilities:
- CRM schema
- migrations
- RLS
- helper SQL functions
- queue claim / outcome logic
- approval-to-won sync design and implementation
- `crm_admin` / `crm_operator` security model

### Agent C — CRM UI
Responsibilities:
- `/admin/crm/*`
- CRM layout
- Kanban
- Calling Hub
- leads list
- lead detail page
- fast operator workflows

### Agent D — Integrations, Automations, Docs, and Validation
Responsibilities:
- webhook routes
- Meta + Formspree ingestion
- Brevo automations
- statistics page
- mock payloads
- README updates
- docs updates
- validation evidence

---

## File ownership guidance

Avoid cross-agent conflicts.

### Agent A
Owns / may edit:
- auth discovery docs
- route discovery docs
- access-flow notes
- minimal auth-related wiring only when assigned by milestone

### Agent B
Owns / may edit:
- `supabase/migrations/*`
- SQL helper functions
- database policies
- `lib/crm/*` data/security modules
- approval-sync backend logic

### Agent C
Owns / may edit:
- `app/admin/crm/*`
- `components/crm/*`
- UI-related client/server components for CRM only

### Agent D
Owns / may edit:
- `app/api/crm/*`
- webhook and automation code
- statistics routes/pages if assigned
- docs
- README
- mock/test assets

### Shared caution
Files involving auth, middleware, or global admin routing are high-risk.  
Only touch them when the milestone requires it, and document the reason.

---

## CRM architecture direction

The CRM must be built as an admin sub-surface:

- `/admin/crm`
- `/admin/crm/kanban`
- `/admin/crm/callinghub`
- `/admin/crm/leads`
- `/admin/crm/leads/[id]`
- `/admin/crm/statistics`
- `/admin/crm/settings`
- `/admin/crm/operators`
- `/admin/crm/automations`

Do not create a separate top-level `/crm/*` app unless the user explicitly changes direction.

---

## Auth and access expectations

- `/admin/login` remains the login entrypoint.
- CRM-only users must authenticate there.
- After login:
  - CRM-only operator → `/admin/crm`
  - CRM admin → `/admin/crm`
  - classic admin → existing admin destination
- CRM-only users must be blocked from classic admin surfaces outside `/admin/crm/*`.
- Do not rely only on client-side guards.
- Use the repo’s existing auth and session patterns wherever possible.

---

## Data model direction

Preferred CRM tables include:

- `crm_stages`
- `crm_leads`
- `crm_interactions`
- `crm_automations`
- `crm_user_roles`
- `crm_operator_profiles`
- `crm_webhook_events`

Optional supporting tables may include:
- `crm_stage_history`
- `crm_automation_jobs`

Use a **relational interactions table** rather than JSON-only lead logs unless there is a strong repo-specific reason not to.

---

## Queue and calling direction

Calling uses `tel:` only.

Implications:
- the app does not know true call completion state
- call outcomes are manually confirmed by the operator
- the Calling Hub must optimize for speed and minimal clicks
- queue logic should still be future-safe for multiple operators

Preferred queue design:
- SQL function or controlled server-side claim flow
- use `FOR UPDATE SKIP LOCKED` or equivalent safe locking approach
- do not implement next-lead claiming purely in client state

---

## Approval-to-won sync direction

The business rule is:

- pre-enrollment creates or updates a CRM lead
- pending users remain pending until the relevant flow becomes `approved`
- `approved` is the decisive state for won/enrolled conversion

Important:
- do not guess the source table
- first discover the actual pre-enrollment/payment approval path in the repo
- document the discovered source in `/docs/crm/crmhub-discovery.md`
- then connect CRM to the real approval event

---

## Webhooks and automations direction

Preferred CRM API and integration surfaces:
- `app/api/crm/*` for webhook-style endpoints inside the Next.js app
- CRM-focused backend modules inside `lib/crm/*`

Preferred ingestion targets:
- Meta Lead Ads
- Formspree

Preferred automation direction:
- stage-based Brevo transactional sends
- asynchronous / non-blocking
- dedupe-safe
- testable with mocks or sandbox behavior

---

## Validation expectations

Every milestone must include validation.

Minimum expected validation:
- lint
- available test command(s)
- focused manual route checks
- no breakage of existing auth/admin/student flows
- docs updated where behavior changed

If the repo does not contain strong automated tests for a new area, add focused validation where practical rather than skipping validation entirely.

---

## Documentation policy

Whenever behavior changes, update the relevant docs in the same milestone.

Always keep the following aligned:
- implementation
- README
- milestone doc(s)
- discovery doc(s)
- risk register if new risks are introduced

Do not leave docs for “later”.

---

## If uncertain

When uncertainty exists:
1. inspect the repo
2. document what was found
3. document what is still unclear
4. choose the safest additive implementation path
5. avoid destructive assumptions

---

## Definition of good execution

Good execution means:
- existing functionality preserved
- milestone boundaries respected
- changes are traceable and documented
- new CRM code is isolated and maintainable
- risk is reduced, not increased
- the repo stays runnable after each milestone