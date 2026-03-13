-- Duolingo-like module (course editor + session generator + spaced repetition + teacher analytics)
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Profiles: anti-duplicate identity + gamification fields
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists id_document text;

alter table public.profiles
  add column if not exists xp_total int not null default 0;

alter table public.profiles
  add column if not exists current_streak int not null default 0;

alter table public.profiles
  add column if not exists last_streak_at timestamptz;

alter table public.profiles
  add column if not exists student_grade numeric(5, 2);

alter table public.profiles
  drop constraint if exists student_grade_valid;

alter table public.profiles
  add constraint student_grade_valid
    check (student_grade is null or (student_grade >= 0 and student_grade <= 100));

update public.profiles
set id_document = nullif(trim(coalesce(id_document, dni)), '')
where id_document is null
  and dni is not null;

update public.profiles
set student_code = upper(trim(student_code))
where student_code is not null;

with ranked_documents as (
  select
    id,
    row_number() over (partition by id_document order by created_at asc, id asc) as rn
  from public.profiles
  where id_document is not null
    and trim(id_document) <> ''
)
update public.profiles p
set id_document = null
from ranked_documents r
where p.id = r.id
  and r.rn > 1;

create unique index if not exists profiles_id_document_idx
  on public.profiles (id_document)
  where id_document is not null;

-- -----------------------------------------------------------------------------
-- Content model: subjects, lessons, exercises, vocabulary
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_subjects (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  ordering int not null default 1,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null
);

create index if not exists lesson_subjects_order_idx
  on public.lesson_subjects (ordering, created_at);

alter table public.lessons
  add column if not exists subject_id uuid references public.lesson_subjects (id) on delete set null;

alter table public.lessons
  add column if not exists level text;

alter table public.lessons
  add column if not exists ordering int;

alter table public.lessons
  add column if not exists status text;

alter table public.lessons
  add column if not exists updated_at timestamptz;

alter table public.lessons
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.lessons
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

update public.lessons
set ordering = coalesce(ordering, position, 1)
where ordering is null;

update public.lessons
set status = coalesce(status, 'published')
where status is null;

update public.lessons
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.lessons
  alter column ordering set default 1;

alter table public.lessons
  alter column ordering set not null;

alter table public.lessons
  alter column status set default 'draft';

alter table public.lessons
  alter column status set not null;

alter table public.lessons
  alter column updated_at set default now();

alter table public.lessons
  alter column updated_at set not null;

alter table public.lessons
  drop constraint if exists lessons_status_check;

alter table public.lessons
  add constraint lessons_status_check
    check (status in ('draft', 'published', 'archived'));

create index if not exists lessons_status_order_idx
  on public.lessons (status, ordering, created_at);

create index if not exists lessons_subject_idx
  on public.lessons (subject_id, ordering);

alter table public.exercises
  add column if not exists type text;

alter table public.exercises
  add column if not exists content_json jsonb;

alter table public.exercises
  add column if not exists status text;

alter table public.exercises
  add column if not exists ordering int;

alter table public.exercises
  add column if not exists revision int;

alter table public.exercises
  add column if not exists updated_at timestamptz;

alter table public.exercises
  add column if not exists published_at timestamptz;

alter table public.exercises
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.exercises
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

alter table public.exercises
  add column if not exists last_editor uuid references auth.users (id) on delete set null;

update public.exercises
set type = case
  when kind = 'listening' then 'audio_match'
  when kind = 'speaking' then 'cloze'
  when kind = 'multiple_choice' then 'scramble'
  else 'cloze'
end
where type is null;

update public.exercises
set content_json = coalesce(content_json, payload, '{}'::jsonb)
where content_json is null;

update public.exercises
set status = coalesce(status, 'published')
where status is null;

update public.exercises
set ordering = coalesce(ordering, 1)
where ordering is null;

update public.exercises
set revision = coalesce(revision, 1)
where revision is null;

update public.exercises
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

update public.exercises
set published_at = coalesce(published_at, created_at)
where published_at is null
  and status = 'published';

alter table public.exercises
  alter column type set not null;

alter table public.exercises
  alter column content_json set default '{}'::jsonb;

alter table public.exercises
  alter column content_json set not null;

alter table public.exercises
  alter column status set default 'draft';

alter table public.exercises
  alter column status set not null;

alter table public.exercises
  alter column ordering set default 1;

alter table public.exercises
  alter column ordering set not null;

alter table public.exercises
  alter column revision set default 1;

alter table public.exercises
  alter column revision set not null;

alter table public.exercises
  alter column updated_at set default now();

alter table public.exercises
  alter column updated_at set not null;

alter table public.exercises
  drop constraint if exists exercises_type_check;

alter table public.exercises
  add constraint exercises_type_check
    check (type in ('scramble', 'audio_match', 'image_match', 'pairs', 'cloze'));

alter table public.exercises
  drop constraint if exists exercises_status_check;

alter table public.exercises
  add constraint exercises_status_check
    check (status in ('draft', 'published', 'archived', 'deleted'));

alter table public.exercises
  drop constraint if exists exercises_content_json_object_check;

alter table public.exercises
  add constraint exercises_content_json_object_check
    check (jsonb_typeof(content_json) = 'object');

alter table public.exercises
  add column if not exists skill_tag text;

update public.exercises
set skill_tag = case
  when type = 'audio_match' then 'speaking'
  when type in ('image_match', 'pairs') then 'reading'
  else 'grammar'
end
where skill_tag is null;

alter table public.exercises
  alter column skill_tag set default 'grammar';

alter table public.exercises
  alter column skill_tag set not null;

alter table public.exercises
  drop constraint if exists exercises_skill_tag_check;

alter table public.exercises
  add constraint exercises_skill_tag_check
    check (skill_tag in ('speaking', 'reading', 'grammar'));

create index if not exists exercises_lesson_status_order_idx
  on public.exercises (lesson_id, status, ordering, created_at);

create index if not exists exercises_type_status_idx
  on public.exercises (type, status);

create index if not exists exercises_skill_tag_idx
  on public.exercises (skill_tag, status, type);

create table if not exists public.vocabulary (
  id uuid primary key default uuid_generate_v4(),
  word_target text not null,
  word_native text not null,
  category text,
  language_pair text,
  level text,
  tags text[] not null default '{}'::text[],
  image_url text,
  audio_url text,
  audio_key text,
  audio_provider text,
  audio_voice_id text,
  audio_model text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  unique (word_target, word_native, language_pair)
);

create index if not exists vocabulary_word_idx
  on public.vocabulary (word_target, word_native);

create index if not exists vocabulary_status_idx
  on public.vocabulary (status, category, level);

create unique index if not exists vocabulary_audio_key_idx
  on public.vocabulary (audio_key)
  where audio_key is not null;

create table if not exists public.exercise_vocabulary (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  vocab_id uuid not null references public.vocabulary (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (exercise_id, vocab_id)
);

create index if not exists exercise_vocabulary_vocab_idx
  on public.exercise_vocabulary (vocab_id, exercise_id);

-- -----------------------------------------------------------------------------
-- Learning progress + spaced repetition + audio cache
-- -----------------------------------------------------------------------------
create table if not exists public.user_progress (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  is_correct boolean not null default false,
  attempts int not null default 1,
  last_practiced timestamptz not null default now(),
  interval_days int not null default 1,
  ease_factor numeric(3, 2) not null default 2.5,
  next_due_at timestamptz not null default now(),
  last_quality int not null default 0,
  times_seen int not null default 0,
  times_correct int not null default 0,
  streak_count int not null default 0,
  wrong_attempts int not null default 0,
  final_status text,
  score_awarded numeric(6, 2) not null default 0,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_id),
  constraint user_progress_attempts_check check (attempts >= 1),
  constraint user_progress_interval_days_check check (interval_days >= 1),
  constraint user_progress_ease_factor_check check (ease_factor >= 1.3 and ease_factor <= 2.8),
  constraint user_progress_quality_check check (last_quality >= 0 and last_quality <= 5),
  constraint user_progress_wrong_attempts_check check (wrong_attempts >= 0 and wrong_attempts <= 3),
  constraint user_progress_final_status_check check (final_status is null or final_status in ('passed', 'failed')),
  constraint user_progress_score_awarded_check check (score_awarded >= 0 and score_awarded <= 100)
);

create index if not exists user_progress_user_due_idx
  on public.user_progress (user_id, next_due_at);

create index if not exists user_progress_user_recent_idx
  on public.user_progress (user_id, last_practiced desc);

create index if not exists user_progress_exercise_idx
  on public.user_progress (exercise_id, is_correct);

create table if not exists public.audio_cache (
  id uuid primary key default uuid_generate_v4(),
  audio_key text not null unique,
  provider text not null default 'elevenlabs',
  language text not null,
  voice_id text not null,
  model_id text,
  normalized_text text not null,
  r2_key text,
  audio_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audio_cache_provider_voice_idx
  on public.audio_cache (provider, voice_id);

-- -----------------------------------------------------------------------------
-- Student-focused grading + skill history
-- -----------------------------------------------------------------------------
create table if not exists public.student_skill_overrides (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  level text not null,
  listening_value_0_100 numeric(5, 2) not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, level),
  constraint student_skill_overrides_listening_check
    check (listening_value_0_100 >= 0 and listening_value_0_100 <= 100)
);

create index if not exists student_skill_overrides_user_idx
  on public.student_skill_overrides (user_id, updated_at desc);

create table if not exists public.student_level_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  level text not null,
  started_at timestamptz,
  completed_at timestamptz,
  final_grade_0_100 numeric(5, 2) not null default 0,
  final_speaking_0_100 numeric(5, 2) not null default 0,
  final_reading_0_100 numeric(5, 2) not null default 0,
  final_grammar_0_100 numeric(5, 2) not null default 0,
  final_listening_0_100 numeric(5, 2) not null default 0,
  notes text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, level),
  constraint student_level_history_grade_check
    check (final_grade_0_100 >= 0 and final_grade_0_100 <= 100),
  constraint student_level_history_speaking_check
    check (final_speaking_0_100 >= 0 and final_speaking_0_100 <= 100),
  constraint student_level_history_reading_check
    check (final_reading_0_100 >= 0 and final_reading_0_100 <= 100),
  constraint student_level_history_grammar_check
    check (final_grammar_0_100 >= 0 and final_grammar_0_100 <= 100),
  constraint student_level_history_listening_check
    check (final_listening_0_100 >= 0 and final_listening_0_100 <= 100)
);

create index if not exists student_level_history_user_idx
  on public.student_level_history (user_id, completed_at desc, updated_at desc);

create table if not exists public.student_course_grades (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  level text not null,
  admin_grade_0_100 numeric(5, 2) not null,
  comment text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, level),
  constraint student_course_grades_admin_grade_check
    check (admin_grade_0_100 >= 0 and admin_grade_0_100 <= 100)
);

create index if not exists student_course_grades_user_idx
  on public.student_course_grades (user_id, updated_at desc);

-- -----------------------------------------------------------------------------
-- RLS updates for published-only learning content + progress
-- -----------------------------------------------------------------------------
alter table public.lesson_subjects enable row level security;
alter table public.vocabulary enable row level security;
alter table public.exercise_vocabulary enable row level security;
alter table public.user_progress enable row level security;
alter table public.audio_cache enable row level security;
alter table public.student_skill_overrides enable row level security;
alter table public.student_level_history enable row level security;
alter table public.student_course_grades enable row level security;

drop policy if exists "Public read lessons" on public.lessons;
create policy "Published lessons read" on public.lessons
  for select using (
    status = 'published'
    or public.is_admin()
  );

drop policy if exists "Public read exercises" on public.exercises;
create policy "Published exercises read" on public.exercises
  for select using (
    status = 'published'
    or public.is_admin()
  );

drop policy if exists "Published lesson subjects read" on public.lesson_subjects;
create policy "Published lesson subjects read" on public.lesson_subjects
  for select using (
    status = 'published'
    or public.is_admin()
  );

drop policy if exists "Admins manage lesson subjects" on public.lesson_subjects;
create policy "Admins manage lesson subjects" on public.lesson_subjects
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Published vocabulary read" on public.vocabulary;
create policy "Published vocabulary read" on public.vocabulary
  for select using (
    status = 'published'
    or public.is_admin()
  );

drop policy if exists "Admins manage vocabulary" on public.vocabulary;
create policy "Admins manage vocabulary" on public.vocabulary
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Published exercise vocabulary read" on public.exercise_vocabulary;
create policy "Published exercise vocabulary read" on public.exercise_vocabulary
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.exercises e
      where e.id = exercise_vocabulary.exercise_id
        and e.status = 'published'
    )
  );

drop policy if exists "Admins manage exercise vocabulary" on public.exercise_vocabulary;
create policy "Admins manage exercise vocabulary" on public.exercise_vocabulary
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own duolingo progress" on public.user_progress;
create policy "Students read own duolingo progress" on public.user_progress
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students write own duolingo progress" on public.user_progress;
create policy "Students write own duolingo progress" on public.user_progress
  for insert with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Students update own duolingo progress" on public.user_progress;
create policy "Students update own duolingo progress" on public.user_progress
  for update using (
    auth.uid() = user_id
    or public.is_admin()
  )
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Admins manage user progress" on public.user_progress;
create policy "Admins manage user progress" on public.user_progress
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins read audio cache" on public.audio_cache;
create policy "Admins read audio cache" on public.audio_cache
  for select using (public.is_admin());

drop policy if exists "Admins manage audio cache" on public.audio_cache;
create policy "Admins manage audio cache" on public.audio_cache
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own skill overrides" on public.student_skill_overrides;
create policy "Students read own skill overrides" on public.student_skill_overrides
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Admins manage skill overrides" on public.student_skill_overrides;
create policy "Admins manage skill overrides" on public.student_skill_overrides
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own level history" on public.student_level_history;
create policy "Students read own level history" on public.student_level_history
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Admins manage level history" on public.student_level_history;
create policy "Admins manage level history" on public.student_level_history
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Students read own course grades" on public.student_course_grades;
create policy "Students read own course grades" on public.student_course_grades
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

drop policy if exists "Admins manage course grades" on public.student_course_grades;
create policy "Admins manage course grades" on public.student_course_grades
  for all using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Template class slide requirements + exercise lifecycle cleanup
-- -----------------------------------------------------------------------------
alter table public.template_sessions
  add column if not exists class_slide_url text;

alter table public.template_sessions
  add column if not exists class_slide_title text;

alter table public.template_sessions
  add column if not exists additional_slides jsonb;

update public.template_sessions
set additional_slides = '[]'::jsonb
where additional_slides is null
   or jsonb_typeof(additional_slides) <> 'array';

alter table public.template_sessions
  alter column additional_slides set default '[]'::jsonb;

alter table public.template_sessions
  alter column additional_slides set not null;

alter table public.template_sessions
  drop constraint if exists template_sessions_additional_slides_array_check;

alter table public.template_sessions
  add constraint template_sessions_additional_slides_array_check
    check (jsonb_typeof(additional_slides) = 'array');

create or replace function public.gc_orphan_archived_exercises()
returns table (deleted_count int, kept_with_history_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_rows int := 0;
  kept_rows int := 0;
begin
  with kept_history as (
    select e.id
    from public.exercises e
    where e.status in ('archived', 'deleted')
      and not exists (
        select 1
        from public.template_session_items tsi
        where tsi.exercise_id = e.id
      )
      and not exists (
        select 1
        from public.session_items si
        where si.exercise_id = e.id
      )
      and not exists (
        select 1
        from public.lessons l
        where l.id = e.lesson_id
          and l.status in ('draft', 'published')
      )
      and exists (
        select 1
        from public.user_progress up
        where up.exercise_id = e.id
      )
  )
  select count(*)::int
  into kept_rows
  from kept_history;

  delete from public.exercises e
  where e.status in ('archived', 'deleted')
    and not exists (
      select 1
      from public.template_session_items tsi
      where tsi.exercise_id = e.id
    )
    and not exists (
      select 1
      from public.session_items si
      where si.exercise_id = e.id
    )
    and not exists (
      select 1
      from public.lessons l
      where l.id = e.lesson_id
        and l.status in ('draft', 'published')
    )
    and not exists (
      select 1
      from public.user_progress up
      where up.exercise_id = e.id
    );

  get diagnostics deleted_rows = row_count;
  return query select deleted_rows, kept_rows;
end;
$$;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    -- pg_cron puede no estar disponible en todos los entornos
    null;
  end;

  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    if not exists (
      select 1
      from cron.job
      where jobname = 'gc_orphan_archived_exercises_daily'
    ) then
      perform cron.schedule(
        'gc_orphan_archived_exercises_daily',
        '15 3 * * *',
        'select public.gc_orphan_archived_exercises();'
      );
    end if;
  end if;
exception when others then
  null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixed admin(s): always keep specific email(s) as admin
-- -----------------------------------------------------------------------------
create table if not exists public.fixed_admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.fixed_admin_emails (email)
values ('luisvill99sa@gmail.com')
on conflict (email) do nothing;

create or replace function public.sync_fixed_admins_from_auth()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_profiles (id, email, full_name, invited, password_set, created_at)
  select
    u.id,
    lower(trim(u.email)),
    coalesce(u.raw_user_meta_data->>'full_name', u.email),
    true,
    true,
    now()
  from auth.users u
  join public.fixed_admin_emails f
    on lower(trim(u.email)) = lower(trim(f.email))
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.admin_profiles.full_name),
        invited = true,
        password_set = true;
end;
$$;

create or replace function public.handle_fixed_admin_on_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.fixed_admin_emails f
    where lower(trim(f.email)) = lower(trim(new.email))
  ) then
    insert into public.admin_profiles (id, email, full_name, invited, password_set, created_at)
    values (
      new.id,
      lower(trim(new.email)),
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      true,
      true,
      now()
    )
    on conflict (id) do update
      set email = excluded.email,
          full_name = coalesce(excluded.full_name, public.admin_profiles.full_name),
          invited = true,
          password_set = true;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_fixed_admin on auth.users;
create trigger on_auth_user_fixed_admin
after insert or update of email, raw_user_meta_data on auth.users
for each row
execute function public.handle_fixed_admin_on_auth_user();

create or replace function public.prevent_fixed_admin_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.fixed_admin_emails f
    where lower(trim(f.email)) = lower(trim(old.email))
  ) then
    raise exception 'No puedes eliminar un fixed admin: %', old.email;
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_fixed_admin_delete_tg on public.admin_profiles;
create trigger prevent_fixed_admin_delete_tg
before delete on public.admin_profiles
for each row
execute function public.prevent_fixed_admin_delete();

select public.sync_fixed_admins_from_auth();
