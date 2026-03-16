begin;

alter table public.exercises
  add column if not exists practice_enabled boolean not null default true;

alter table public.exercises
  add column if not exists ranked_allowed boolean not null default false;

alter table public.exercises
  add column if not exists difficulty_score smallint;

alter table public.exercises
  add column if not exists estimated_time_sec int;

alter table public.exercises
  add column if not exists practice_weight numeric(5, 2) not null default 1;

alter table public.exercises
  add column if not exists theme_tags text[] not null default '{}'::text[];

alter table public.exercises
  add column if not exists scenario_tags text[] not null default '{}'::text[];

update public.exercises
set practice_enabled = coalesce(practice_enabled, true)
where practice_enabled is null;

update public.exercises
set ranked_allowed = coalesce(ranked_allowed, false)
where ranked_allowed is null;

update public.exercises
set practice_weight = coalesce(practice_weight, 1)
where practice_weight is null;

update public.exercises
set theme_tags = '{}'::text[]
where theme_tags is null;

update public.exercises
set scenario_tags = '{}'::text[]
where scenario_tags is null;

update public.exercises
set estimated_time_sec = greatest(
  30,
  least(
    900,
    coalesce(
      nullif((content_json ->> 'estimated_time_sec')::int, null),
      nullif((content_json ->> 'estimated_time_minutes')::int, null) * 60,
      90
    )
  )
)
where estimated_time_sec is null;

alter table public.exercises
  alter column estimated_time_sec set default 90;

alter table public.exercises
  alter column estimated_time_sec set not null;

alter table public.exercises
  drop constraint if exists exercises_difficulty_score_check;

alter table public.exercises
  add constraint exercises_difficulty_score_check
    check (difficulty_score is null or (difficulty_score >= 1 and difficulty_score <= 5));

alter table public.exercises
  drop constraint if exists exercises_estimated_time_sec_check;

alter table public.exercises
  add constraint exercises_estimated_time_sec_check
    check (estimated_time_sec >= 15 and estimated_time_sec <= 1800);

alter table public.exercises
  drop constraint if exists exercises_practice_weight_check;

alter table public.exercises
  add constraint exercises_practice_weight_check
    check (practice_weight > 0 and practice_weight <= 10);

alter table public.exercises
  drop constraint if exists exercises_theme_tags_array_check;

alter table public.exercises
  add constraint exercises_theme_tags_array_check
    check (theme_tags is not null);

alter table public.exercises
  drop constraint if exists exercises_scenario_tags_array_check;

alter table public.exercises
  add constraint exercises_scenario_tags_array_check
    check (scenario_tags is not null);

create index if not exists exercises_practice_idx
  on public.exercises (practice_enabled, status, skill_tag, cefr_level, category_id);

create index if not exists exercises_estimated_time_idx
  on public.exercises (estimated_time_sec, practice_weight);

create index if not exists exercises_theme_tags_idx
  on public.exercises using gin (theme_tags);

create index if not exists exercises_scenario_tags_idx
  on public.exercises using gin (scenario_tags);

create table if not exists public.user_gamification_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lifetime_xp int not null default 0,
  practice_xp int not null default 0,
  practice_sessions_completed int not null default 0,
  perfect_sessions int not null default 0,
  timed_challenges_completed int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_gamification_profiles_lifetime_xp_check check (lifetime_xp >= 0),
  constraint user_gamification_profiles_practice_xp_check check (practice_xp >= 0),
  constraint user_gamification_profiles_sessions_completed_check check (practice_sessions_completed >= 0),
  constraint user_gamification_profiles_perfect_sessions_check check (perfect_sessions >= 0),
  constraint user_gamification_profiles_timed_completed_check check (timed_challenges_completed >= 0)
);

insert into public.user_gamification_profiles (
  user_id,
  lifetime_xp,
  practice_xp
)
select
  p.id,
  greatest(coalesce(p.xp_total, 0), 0),
  greatest(coalesce(p.xp_total, 0), 0)
from public.profiles p
on conflict (user_id) do update
set lifetime_xp = greatest(public.user_gamification_profiles.lifetime_xp, excluded.lifetime_xp),
    practice_xp = greatest(public.user_gamification_profiles.practice_xp, excluded.practice_xp),
    updated_at = now();

create index if not exists user_gamification_profiles_xp_idx
  on public.user_gamification_profiles (lifetime_xp desc, updated_at desc);

create table if not exists public.practice_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null default 'mixed_review',
  status text not null default 'active',
  source_context text,
  filters jsonb not null default '{}'::jsonb,
  session_size int not null default 10,
  total_items int not null default 0,
  answered_items int not null default 0,
  correct_items int not null default 0,
  accuracy_rate numeric(5, 2) not null default 0,
  xp_earned int not null default 0,
  time_limit_sec int,
  time_spent_sec int,
  recommended_next_mode text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_sessions_mode_check
    check (mode in ('quick', 'topic', 'weakness', 'mixed_review', 'timed', 'scenario', 'direct')),
  constraint practice_sessions_status_check
    check (status in ('active', 'completed', 'abandoned')),
  constraint practice_sessions_filters_object_check
    check (jsonb_typeof(filters) = 'object'),
  constraint practice_sessions_session_size_check
    check (session_size >= 1 and session_size <= 30),
  constraint practice_sessions_total_items_check
    check (total_items >= 0 and total_items <= 30),
  constraint practice_sessions_answered_items_check
    check (answered_items >= 0 and answered_items <= 30),
  constraint practice_sessions_correct_items_check
    check (correct_items >= 0 and correct_items <= 30),
  constraint practice_sessions_accuracy_rate_check
    check (accuracy_rate >= 0 and accuracy_rate <= 100),
  constraint practice_sessions_xp_earned_check
    check (xp_earned >= 0),
  constraint practice_sessions_time_limit_check
    check (time_limit_sec is null or (time_limit_sec >= 30 and time_limit_sec <= 3600)),
  constraint practice_sessions_time_spent_check
    check (time_spent_sec is null or time_spent_sec >= 0)
);

create index if not exists practice_sessions_user_status_idx
  on public.practice_sessions (user_id, status, started_at desc);

create index if not exists practice_sessions_user_completed_idx
  on public.practice_sessions (user_id, completed_at desc)
  where completed_at is not null;

create table if not exists public.practice_session_items (
  id uuid primary key default uuid_generate_v4(),
  practice_session_id uuid not null references public.practice_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position int not null,
  source_reason text not null default 'new',
  exercise_type text,
  skill_tag text,
  cefr_level text,
  category_id uuid references public.exercise_categories (id) on delete set null,
  answer_snapshot jsonb,
  attempts int,
  is_correct boolean,
  xp_earned int not null default 0,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_session_id, position),
  constraint practice_session_items_source_reason_check
    check (source_reason in ('new', 'review', 'weakness', 'challenge', 'scenario', 'class')),
  constraint practice_session_items_attempts_check
    check (attempts is null or (attempts >= 1 and attempts <= 5)),
  constraint practice_session_items_xp_earned_check
    check (xp_earned >= 0),
  constraint practice_session_items_answer_snapshot_object_check
    check (answer_snapshot is null or jsonb_typeof(answer_snapshot) = 'object')
);

create index if not exists practice_session_items_session_idx
  on public.practice_session_items (practice_session_id, position);

create index if not exists practice_session_items_exercise_idx
  on public.practice_session_items (exercise_id, answered_at desc);

create index if not exists practice_session_items_reason_idx
  on public.practice_session_items (source_reason, skill_tag, cefr_level);

alter table public.user_gamification_profiles enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_session_items enable row level security;

drop policy if exists "Students read own gamification profile" on public.user_gamification_profiles;
create policy "Students read own gamification profile" on public.user_gamification_profiles
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students write own gamification profile" on public.user_gamification_profiles;
create policy "Students write own gamification profile" on public.user_gamification_profiles
  for insert with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students update own gamification profile" on public.user_gamification_profiles;
create policy "Students update own gamification profile" on public.user_gamification_profiles
  for update using (
    auth.uid() = user_id
    or public.is_admin()
  )
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Admins manage gamification profiles" on public.user_gamification_profiles;
create policy "Admins manage gamification profiles" on public.user_gamification_profiles
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own practice sessions" on public.practice_sessions;
create policy "Students read own practice sessions" on public.practice_sessions
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students insert own practice sessions" on public.practice_sessions;
create policy "Students insert own practice sessions" on public.practice_sessions
  for insert with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students update own practice sessions" on public.practice_sessions;
create policy "Students update own practice sessions" on public.practice_sessions
  for update using (
    auth.uid() = user_id
    or public.is_admin()
  )
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Admins manage practice sessions" on public.practice_sessions;
create policy "Admins manage practice sessions" on public.practice_sessions
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own practice session items" on public.practice_session_items;
create policy "Students read own practice session items" on public.practice_session_items
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.practice_sessions ps
      where ps.id = practice_session_items.practice_session_id
        and ps.user_id = auth.uid()
    )
  );

drop policy if exists "Students insert own practice session items" on public.practice_session_items;
create policy "Students insert own practice session items" on public.practice_session_items
  for insert with check (
    public.is_admin()
    or exists (
      select 1
      from public.practice_sessions ps
      where ps.id = practice_session_items.practice_session_id
        and ps.user_id = auth.uid()
    )
  );

drop policy if exists "Students update own practice session items" on public.practice_session_items;
create policy "Students update own practice session items" on public.practice_session_items
  for update using (
    public.is_admin()
    or exists (
      select 1
      from public.practice_sessions ps
      where ps.id = practice_session_items.practice_session_id
        and ps.user_id = auth.uid()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1
      from public.practice_sessions ps
      where ps.id = practice_session_items.practice_session_id
        and ps.user_id = auth.uid()
    )
  );

drop policy if exists "Admins manage practice session items" on public.practice_session_items;
create policy "Admins manage practice session items" on public.practice_session_items
  for all using (public.is_admin())
  with check (public.is_admin());

commit;
