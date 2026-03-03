alter table public.user_progress
  add column if not exists lesson_id uuid references public.lessons (id) on delete cascade;

alter table public.user_progress
  drop constraint if exists user_progress_user_id_exercise_id_key;

create unique index if not exists user_progress_user_exercise_global_unique
  on public.user_progress (user_id, exercise_id)
  where lesson_id is null;

create unique index if not exists user_progress_user_exercise_lesson_unique
  on public.user_progress (user_id, exercise_id, lesson_id)
  where lesson_id is not null;

create index if not exists user_progress_user_lesson_idx
  on public.user_progress (user_id, lesson_id, answered_at desc)
  where lesson_id is not null;
