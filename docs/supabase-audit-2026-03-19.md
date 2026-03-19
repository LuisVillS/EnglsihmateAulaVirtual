# Supabase Audit - 2026-03-19

This audit compares the live Supabase project currently used by the app and bot against the repo schema and code references.

## Scope

- Live data audit of the active Supabase project
- Repo schema review of `supabase/schema.sql` and `supabase/migrations/*`
- Code-reference scan across `app`, `bot`, `components`, `lib`, and `tests`

## Immediate Discord Finding

Live `profiles` data currently has 2 student rows with `discord_user_id` set and `discord_username = null`.

Observed state:
- `discord_user_id` is present for 2 students
- `discord_connected_at` is present for those 2 students
- `discord_username` is null for both

Likely cause:
- The Discord provider identity does not always expose a stable username field in the values currently being read by the app
- The app was previously capable of looking "linked" while the `profiles` mapping was incomplete

Related app fix already applied:
- `app/app/discord/page.js` now writes `discord_user_id`, `discord_username`, and `discord_connected_at` back into `profiles` when identity data is available
- The page now treats "linked" as the saved `profiles` mapping, not only the OAuth identity

## Live Schema Inventory

The repo declares 62 public tables across the base schema and migrations.

Live populated core tables:
- `profiles` (5)
- `admin_profiles` (1)
- `courses` (6)
- `units` (6)
- `lessons` (16)
- `exercises` (11)
- `course_commissions` (4)
- `course_templates` (1)
- `template_sessions` (44)
- `template_session_items` (20)
- `flashcards` (3)
- `template_session_flashcards` (3)
- `pre_enrollments` (3)
- `payments` (2)
- `course_sessions` (176)
- `session_items` (95)
- `session_flashcards` (12)
- `password_recovery_codes` (3)
- `user_progress` (90)
- `audio_cache` (3)
- `student_skill_overrides` (1)
- `student_course_grades` (1)
- `lesson_quiz_attempts` (13)
- `exercise_categories` (9)
- `library_books` (2)
- `library_book_aliases` (4)
- `library_book_reads` (415)
- `library_book_user_state` (4)
- `library_book_sources` (4)
- `library_flipbook_layout_profiles` (1)
- `library_flipbook_manifests` (2)
- `library_flipbook_pages` (2877)
- `library_flipbook_user_state` (4)
- `user_gamification_profiles` (5)
- `practice_sessions` (21)
- `practice_session_items` (103)
- `user_flashcard_progress` (3)
- `flashcard_game_sessions` (7)
- `flashcard_game_events` (15)
- `competition_weeks` (1)
- `weekly_leagues` (1)
- `weekly_league_memberships` (3)
- `weekly_quest_definitions` (5)
- `weekly_quest_progress` (15)

Live empty tables:
- `course_enrollments`
- `email_verification_tokens`
- `audit_events`
- `study_with_me_sessions`
- `google_calendar_connections`
- `email_log`
- `lesson_subjects`
- `vocabulary`
- `exercise_vocabulary`
- `student_level_history`
- `library_book_notes`
- `flashcard_decks`
- `flashcard_deck_items`
- `weekly_rank_snapshots`

## Schema Drift

The repo contains migrations for library tables that are not present in the live database:
- `library_book_staging`
- `library_book_favorites`
- `library_import_jobs`

This is a real schema drift problem. Either:
- those migrations were never applied to production, or
- those tables were dropped manually later without corresponding migration cleanup

This should be resolved before doing destructive cleanup work.

## Columns With Strong Signs Of Redundancy

These columns are currently always null in live data and show little evidence of active use.

### High-confidence review candidates

`profiles`
- `first_name`
- `last_name`
- `country`
- `level_number`
- `id_document`
- `last_streak_at`

`admin_profiles`
- `first_name`
- `last_name`
- `country`
- `dni`

`lessons`
- `subject_id`
- `level`
- `created_by`
- `updated_by`

`exercises`
- `r2_key`
- `difficulty_score`

`payments`
- `receipt_url`

`course_sessions`
- `zoom_link`
- `live_link`
- `recording_link`
- `recording_passcode`
- `recording_published_at`

`session_items`
- `storage_key`

### Most obvious duplication

`profiles`
- `full_name` is populated
- `first_name` and `last_name` are fully unused in current live data

`admin_profiles`
- same pattern: `full_name` present, `first_name` and `last_name` unused

If the app does not need separate name parts for sorting or personalization, these are strong candidates for removal.

## Tables With Low Confidence Value

These are not safe to delete blindly, but they deserve product-level review.

### Probably dead or legacy

- `audit_events`
  - 0 live rows
  - no meaningful code references found
- `fixed_admin_emails`
  - 1 live row
  - no meaningful app/bot references found
- `email_verification_tokens`
  - 0 live rows
  - likely superseded by Supabase auth flows

### Dormant feature scaffolding

- `study_with_me_sessions`
- `google_calendar_connections`
- `email_log`
- `student_level_history`
- `weekly_rank_snapshots`
- `library_book_notes`

These are empty today, but they map cleanly to feature areas. They should be deleted only if those features are formally abandoned.

### Practice and flashcard future-state tables

- `flashcard_decks`
- `flashcard_deck_items`
- `vocabulary`
- `exercise_vocabulary`
- `lesson_subjects`

These are empty now, but they align with the current training/practice architecture. They are better classified as "not yet used enough" than "dead".

## Functional Observations

### Identity and student records

- `profiles` is the canonical student record for the app and bot
- Discord linkage is correctly stored on `profiles`, not in a separate mapping table
- `discord_username` is currently optional in practice because the identity provider data is not always filled

### Academic structure

- `course_commissions` is the effective classroom/cohort table
- Discord role naming should continue deriving from course plus commission timing, not from timetable
- `course_enrollments` currently has 0 rows and appears secondary to the commission-based assignment model

### Lessons and exercises

- `lessons`, `exercises`, `course_sessions`, and `session_items` are active and should be kept
- Some legacy metadata columns exist with no live usage

### Practice and progression

- `user_progress`, `practice_sessions`, `practice_session_items`, and `user_gamification_profiles` are active
- Many `practice_sessions` remain active/incomplete, which suggests abandoned sessions are normal and a cleanup/archive job may be useful

### Library

- The EnglishMate library feature is active
- The missing library tables in production need to be reconciled with migrations before any cleanup

## Dependency-Checked Cleanup Outcome

After a repo-wide reference scan, only a small subset qualified as safe removal without further refactors.

### Safe to remove now

These are detached from current app code, bot code, and SQL runtime behavior:
- `audit_events`
- `profiles.first_name`
- `profiles.last_name`
- `profiles.country`
- `profiles.last_streak_at`
- `admin_profiles.first_name`
- `admin_profiles.last_name`
- `admin_profiles.country`

Implemented as migration:
- `supabase/migrations/20260319000100_safe_schema_cleanup.sql`

### Not safe to remove yet

These looked suspicious in live data, but they are still referenced somewhere meaningful:
- `profiles.level_number`
- `profiles.id_document`
- `admin_profiles.dni`
- `email_verification_tokens`
- `course_enrollments`
- `study_with_me_sessions`
- `google_calendar_connections`
- `email_log`
- `student_level_history`
- `flashcard_decks`
- `flashcard_deck_items`
- `vocabulary`
- `exercise_vocabulary`
- `lesson_subjects`
- `lessons.subject_id`
- `lessons.created_by`
- `lessons.updated_by`
- `exercises.r2_key`
- `exercises.difficulty_score`
- `payments.receipt_url`
- `course_sessions.zoom_link`
- `course_sessions.live_link`
- `course_sessions.recording_link`
- `course_sessions.recording_passcode`
- `course_sessions.recording_published_at`
- `session_items.storage_key`
- `fixed_admin_emails`

## Recommended Cleanup Plan

### Phase 1: Safe consistency fixes

1. Resolve schema drift between repo and live DB
2. Backfill `discord_username` when provider data is available
3. Apply the safe cleanup migration and treat `full_name` as the canonical person-name field

### Phase 2: Remove or deprecate obvious leftovers

Candidates to remove after code confirmation:
- `audit_events`
- `fixed_admin_emails`
- `email_verification_tokens`
- always-null lesson metadata columns
- always-null course session media columns if that feature is not planned

### Phase 3: Product decision cleanup

Keep or remove only after confirming roadmap:
- `study_with_me_sessions`
- `google_calendar_connections`
- `email_log`
- `student_level_history`
- `weekly_rank_snapshots`
- `library_book_notes`
- `flashcard_decks`
- `flashcard_deck_items`
- `vocabulary`
- `exercise_vocabulary`
- `lesson_subjects`

## Practical Recommendations

- Treat `profiles.full_name` as the current canonical name unless you intentionally want split names
- Keep `discord_username` nullable; do not make it required
- Add a small maintenance job for stale `practice_sessions` that never complete
- Prefer removing unused columns before dropping whole feature tables
- Clean schema drift before doing any optimization migration

## Scaling Notes

The main future scaling pressure is on `profiles`, not on the practice tables yet.

Reason:
- many current app flows filter students by `commission_id`
- the admin student listing searches `full_name`, `email`, `dni`, and `student_code` with `ILIKE`
- the student listing RPC also resolves the latest pre-enrollment per user by `created_at desc`

Optimization migration prepared:
- `supabase/migrations/20260319000200_scaling_indexes.sql`

That migration adds:
- `profiles (commission_id)` for commission-based student lookups
- `profiles (course_level, created_at desc)` and `profiles (preferred_hour, created_at desc)` for filtered student listings
- trigram GIN indexes on `profiles.full_name`, `profiles.email`, `profiles.dni`, and `profiles.student_code` for admin search
- `pre_enrollments (user_id, created_at desc)` for latest-status lookups

## No Destructive Changes Applied In This Audit

This audit added conservative cleanup and index migrations but did not apply them to the database from this workspace.

The only app-side fix already made during this investigation was:
- `app/app/discord/page.js`

That change improves Discord linkage consistency between the web app and the bot.
