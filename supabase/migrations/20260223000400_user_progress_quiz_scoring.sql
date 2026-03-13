-- Add per-exercise quiz tracking fields used by lesson quiz UX/scoring.

alter table public.user_progress
  add column if not exists wrong_attempts int;

alter table public.user_progress
  add column if not exists final_status text;

alter table public.user_progress
  add column if not exists score_awarded numeric(6, 2);

alter table public.user_progress
  add column if not exists answered_at timestamptz;

update public.user_progress
set wrong_attempts = greatest(0, least(3, coalesce(attempts, 1) - 1))
where wrong_attempts is null;

update public.user_progress
set final_status = case
  when is_correct then 'passed'
  else 'failed'
end
where final_status is null;

update public.user_progress
set score_awarded = 0
where score_awarded is null;

alter table public.user_progress
  alter column wrong_attempts set default 0;

alter table public.user_progress
  alter column wrong_attempts set not null;

alter table public.user_progress
  alter column score_awarded set default 0;

alter table public.user_progress
  alter column score_awarded set not null;

alter table public.user_progress
  drop constraint if exists user_progress_wrong_attempts_check;

alter table public.user_progress
  add constraint user_progress_wrong_attempts_check
    check (wrong_attempts >= 0 and wrong_attempts <= 3);

alter table public.user_progress
  drop constraint if exists user_progress_final_status_check;

alter table public.user_progress
  add constraint user_progress_final_status_check
    check (final_status is null or final_status in ('passed', 'failed'));

alter table public.user_progress
  drop constraint if exists user_progress_score_awarded_check;

alter table public.user_progress
  add constraint user_progress_score_awarded_check
    check (score_awarded >= 0 and score_awarded <= 100);

create index if not exists user_progress_user_status_idx
  on public.user_progress (user_id, final_status, answered_at desc);
