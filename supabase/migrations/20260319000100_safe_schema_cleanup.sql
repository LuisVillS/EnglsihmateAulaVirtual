-- Safe cleanup pass based on repo-wide dependency audit on 2026-03-19.
-- Only removes schema objects with no meaningful app/bot/SQL runtime references.

drop table if exists public.audit_events;

alter table public.profiles
  drop column if exists first_name,
  drop column if exists last_name,
  drop column if exists country,
  drop column if exists last_streak_at;

alter table public.admin_profiles
  drop column if exists first_name,
  drop column if exists last_name,
  drop column if exists country;
