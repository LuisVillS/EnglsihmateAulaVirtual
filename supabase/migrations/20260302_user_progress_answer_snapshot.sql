-- Store per-exercise answer detail used by lesson quiz results.

alter table public.user_progress
  add column if not exists answer_snapshot jsonb;
