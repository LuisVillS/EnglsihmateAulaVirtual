-- Tracking minimo para pruebas por leccion (locked/ready/in_progress/completed)

create table if not exists public.lesson_quiz_attempts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  attempt_status text not null default 'ready'
    check (attempt_status in ('locked', 'ready', 'in_progress', 'completed')),
  current_index int not null default 0,
  completed_count int not null default 0,
  total_exercises int not null default 0,
  correct_count int not null default 0,
  score_percent numeric(5, 2),
  restart_count int not null default 0,
  duration_seconds int,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id),
  constraint lesson_quiz_current_index_check check (current_index >= 0),
  constraint lesson_quiz_completed_count_check check (completed_count >= 0),
  constraint lesson_quiz_total_exercises_check check (total_exercises >= 0),
  constraint lesson_quiz_correct_count_check check (correct_count >= 0),
  constraint lesson_quiz_restart_count_check check (restart_count >= 0 and restart_count <= 2),
  constraint lesson_quiz_duration_check check (duration_seconds is null or duration_seconds >= 0),
  constraint lesson_quiz_score_percent_check check (score_percent is null or (score_percent >= 0 and score_percent <= 100))
);

create index if not exists lesson_quiz_attempts_user_idx
  on public.lesson_quiz_attempts (user_id, updated_at desc);

create index if not exists lesson_quiz_attempts_lesson_idx
  on public.lesson_quiz_attempts (lesson_id, updated_at desc);

alter table public.lesson_quiz_attempts enable row level security;

drop policy if exists "Students read own lesson quiz attempts" on public.lesson_quiz_attempts;
create policy "Students read own lesson quiz attempts" on public.lesson_quiz_attempts
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students write own lesson quiz attempts" on public.lesson_quiz_attempts;
create policy "Students write own lesson quiz attempts" on public.lesson_quiz_attempts
  for insert with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students update own lesson quiz attempts" on public.lesson_quiz_attempts;
create policy "Students update own lesson quiz attempts" on public.lesson_quiz_attempts
  for update using (
    auth.uid() = user_id
    or public.is_admin()
  )
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Admins manage lesson quiz attempts" on public.lesson_quiz_attempts;
create policy "Admins manage lesson quiz attempts" on public.lesson_quiz_attempts
  for all using (public.is_admin())
  with check (public.is_admin());
