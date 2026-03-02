-- Preserve the best historical quiz score while keeping the current attempt score separately.

alter table public.lesson_quiz_attempts
  add column if not exists attempt_score_percent numeric(6, 2);

update public.lesson_quiz_attempts
set attempt_score_percent = coalesce(attempt_score_percent, score_percent, 0)
where attempt_score_percent is null;

alter table public.lesson_quiz_attempts
  alter column attempt_score_percent set default 0;

alter table public.lesson_quiz_attempts
  alter column attempt_score_percent set not null;

alter table public.lesson_quiz_attempts
  drop constraint if exists lesson_quiz_attempt_score_percent_check;

alter table public.lesson_quiz_attempts
  add constraint lesson_quiz_attempt_score_percent_check
    check (attempt_score_percent >= 0 and attempt_score_percent <= 100);
