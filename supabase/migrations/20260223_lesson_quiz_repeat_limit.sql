-- Limit quiz repeats: at most 2 restarts per lesson quiz.

alter table public.lesson_quiz_attempts
  add column if not exists restart_count int;

update public.lesson_quiz_attempts
set restart_count = 0
where restart_count is null;

update public.lesson_quiz_attempts
set restart_count = least(2, greatest(0, restart_count));

alter table public.lesson_quiz_attempts
  alter column restart_count set default 0;

alter table public.lesson_quiz_attempts
  alter column restart_count set not null;

alter table public.lesson_quiz_attempts
  drop constraint if exists lesson_quiz_restart_count_check;

alter table public.lesson_quiz_attempts
  add constraint lesson_quiz_restart_count_check
    check (restart_count >= 0 and restart_count <= 2);
