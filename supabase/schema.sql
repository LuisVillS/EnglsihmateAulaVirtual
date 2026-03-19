-- Enable required extensions
create extension if not exists "uuid-ossp";

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'non_student' check (role in ('admin', 'student', 'non_student')),
  status text not null default 'pre_registered' check (status in ('pre_registered', 'enrolled')),
  password_set boolean not null default false,
  invited boolean not null default false,
  dni text,
  phone text,
  birth_date date,
  email_verified_at timestamptz,
  student_code text unique,
  course_level text,
  level_number int,
  student_grade numeric(5, 2),
  is_premium boolean not null default false,
  start_month date,
  enrollment_date date not null default (now()::date),
  preferred_hour smallint,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  invited boolean not null default false,
  password_set boolean not null default false,
  dni text,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_profiles_email_idx on public.admin_profiles (email);

alter table public.admin_profiles
  add column if not exists dni text;

alter table public.profiles
  add column if not exists dni text;

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles
  add column if not exists birth_date date;

alter table public.profiles
  add column if not exists email_verified_at timestamptz;

alter table public.profiles
  add column if not exists student_code text;

alter table public.profiles
  add column if not exists course_level text;

alter table public.profiles
  add column if not exists level_number int;

alter table public.profiles
  add column if not exists student_grade numeric(5, 2);

alter table public.profiles
  add column if not exists is_premium boolean not null default false;

alter table public.profiles
  add column if not exists start_month date;

alter table public.profiles
  add column if not exists enrollment_date date not null default (now()::date);

alter table public.profiles
  add column if not exists preferred_hour smallint;

alter table public.profiles
  add column if not exists status text not null default 'enrolled';

alter table public.profiles
  alter column status set default 'pre_registered';

alter table public.profiles
  drop constraint if exists profiles_role_valid;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_valid
    check (
      role in ('admin', 'student', 'non_student')
    );

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_valid
    check (
      status in ('pre_registered', 'enrolled')
    );

alter table public.profiles
  add constraint course_level_valid
    check (
      course_level is null or course_level in (
        'BASICO A1',
        'BASICO A2',
        'INTERMEDIO B1',
        'INTERMEDIO B2',
        'AVANZADO C1'
      )
    );

alter table public.profiles
  add constraint level_number_valid
    check (
      level_number is null or (level_number >= 1 and level_number <= 3)
    );

alter table public.profiles
  drop constraint if exists student_grade_valid;

alter table public.profiles
  add constraint student_grade_valid
    check (
      student_grade is null or (student_grade >= 0 and student_grade <= 100)
    );

alter table public.profiles
  add constraint preferred_hour_valid
    check (
      preferred_hour is null
      or (
        preferred_hour >= 360
        and preferred_hour <= 1410
        and (preferred_hour % 30) = 0
      )
    );

create unique index if not exists profiles_student_code_idx on public.profiles (student_code) where student_code is not null;

update public.profiles
set enrollment_date = coalesce(enrollment_date, created_at::date)
where enrollment_date is null;

update public.profiles
set level_number = coalesce(level_number, 1)
where level_number is null;

update public.profiles
set is_premium = coalesce(is_premium, false)
where is_premium is null;

update public.profiles
set status = coalesce(status, 'enrolled')
where status is null;

update public.profiles
set preferred_hour = null
where preferred_hour is not null
  and (preferred_hour < 360 or preferred_hour > 1410 or preferred_hour % 30 <> 0);

insert into public.admin_profiles (id, email, full_name, invited, password_set, created_at)
select id, email, full_name, invited, password_set, created_at
from public.profiles
where role = 'admin'
on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      invited = excluded.invited,
      password_set = excluded.password_set,
      created_at = excluded.created_at;

delete from public.profiles where role = 'admin';

update public.profiles
set role = case
  when role = 'admin' then 'admin'
  when role = 'student' then 'student'
  else 'non_student'
end;

update public.profiles
set role = 'student',
    status = 'enrolled'
where role <> 'admin'
  and (
    status = 'enrolled'
    or course_level is not null
  );

update public.profiles
set role = 'non_student',
    status = 'pre_registered'
where role <> 'admin'
  and status = 'pre_registered'
  and course_level is null;

alter table public.profiles
  drop constraint if exists profiles_role_status_consistency;

alter table public.profiles
  add constraint profiles_role_status_consistency
    check (
      role = 'admin'
      or (role = 'student' and status = 'enrolled')
      or (role = 'non_student' and status = 'pre_registered')
    );

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger as $$
declare
  account_type text := lower(coalesce(new.raw_user_meta_data->>'account_type', ''));
begin
  if account_type = 'admin' then
    insert into public.admin_profiles (id, email, full_name, invited, password_set, created_at)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', null),
      true,
      false,
      now()
    )
    on conflict (id) do update
      set email = excluded.email,
          full_name = excluded.full_name;
    return new;
  end if;

  insert into public.profiles (id, email, full_name, role, status, password_set, invited, created_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    'non_student',
    'pre_registered',
    false,
    false,
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Helper function to check admin role
alter table public.admin_profiles enable row level security;

create policy "Admin profile self read" on public.admin_profiles
  for select using (auth.uid() = id);

create policy "Admins manage admin profiles" on public.admin_profiles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where id = auth.uid()
  );
$$;

create or replace function public.is_student()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'student'
  );
$$;

-- Courses
create table if not exists public.courses (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  level text,
  description text,
  created_at timestamptz not null default now()
);

-- Units
create table if not exists public.units (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  position int default 1,
  created_at timestamptz not null default now()
);

-- Lessons
create table if not exists public.lessons (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid not null references public.units (id) on delete cascade,
  title text not null,
  description text,
  position int default 1,
  created_at timestamptz not null default now()
);

-- Exercises
create table if not exists public.exercises (
  id uuid primary key default uuid_generate_v4(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  kind text not null check (kind in ('listening', 'speaking', 'multiple_choice')),
  prompt text,
  payload jsonb not null default '{}'::jsonb,
  r2_key text,
  created_at timestamptz not null default now()
);

-- Course enrollments
create table if not exists public.course_enrollments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);

-- Course commissions
create table if not exists public.course_commissions (
  id uuid primary key default uuid_generate_v4(),
  course_level text not null check (
    course_level in (
      'BASICO A1',
      'BASICO A2',
      'INTERMEDIO B1',
      'INTERMEDIO B2',
      'AVANZADO C1'
    )
  ),
  commission_number int not null,
  start_month date not null default (date_trunc('month', now())::date),
  duration_months int not null default 4,
  start_date date not null,
  end_date date not null,
  modality_key text not null check (modality_key in ('DAILY', 'MWF', 'LMV', 'TT', 'SAT')),
  days_of_week smallint[] not null default '{}'::smallint[],
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  unique (course_level, commission_number)
);

create index if not exists course_commissions_level_idx on public.course_commissions (course_level, is_active);
create index if not exists course_commissions_dates_idx on public.course_commissions (start_date, end_date);

alter table public.course_commissions
  add column if not exists start_month date;

alter table public.course_commissions
  add column if not exists duration_months int not null default 4;

update public.course_commissions
set start_month = coalesce(start_month, start_date, date_trunc('month', now())::date)
where start_month is null;

update public.course_commissions
set duration_months = coalesce(duration_months, 4)
where duration_months is null;

alter table public.course_commissions
  add column if not exists status text;

update public.course_commissions
set status = case
  when status in ('active', 'inactive', 'archived') then status
  when is_active = true then 'active'
  else 'inactive'
end;

alter table public.course_commissions
  alter column status set not null;

alter table public.course_commissions
  drop constraint if exists course_commissions_status_check;

alter table public.course_commissions
  add constraint course_commissions_status_check
    check (status in ('active', 'inactive', 'archived'));

alter table public.course_commissions
  alter column start_month set not null;

alter table public.course_commissions
  alter column duration_months set not null;

alter table public.course_commissions
  drop constraint if exists course_commissions_duration_months_check;

alter table public.course_commissions
  add constraint course_commissions_duration_months_check
    check (duration_months >= 1 and duration_months <= 24);

alter table public.profiles
  add column if not exists commission_id uuid references public.course_commissions (id) on delete set null;

alter table public.profiles
  add column if not exists commission_assigned_at timestamptz;

alter table public.profiles
  add column if not exists modality_key text;

alter table public.profiles
  add column if not exists discord_user_id text;

alter table public.profiles
  add column if not exists discord_username text;

alter table public.profiles
  add column if not exists discord_connected_at timestamptz;

create unique index if not exists profiles_discord_user_id_idx
  on public.profiles (discord_user_id)
  where discord_user_id is not null;

alter table public.profiles
  drop constraint if exists profiles_modality_key_check;

alter table public.profiles
  add constraint profiles_modality_key_check
    check (
      modality_key is null
      or modality_key in ('DAILY', 'MWF', 'LMV', 'TT', 'SAT')
    );

-- Course templates (estructura reusable por nivel+frecuencia)
create table if not exists public.course_templates (
  id uuid primary key default uuid_generate_v4(),
  course_level text not null check (
    course_level in (
      'BASICO A1',
      'BASICO A2',
      'INTERMEDIO B1',
      'INTERMEDIO B2',
      'AVANZADO C1'
    )
  ),
  frequency text not null check (frequency in ('DAILY', 'MWF', 'TT', 'SAT')),
  template_name text,
  created_at timestamptz not null default now(),
  unique (course_level, frequency)
);

create index if not exists course_templates_level_frequency_idx
  on public.course_templates (course_level, frequency);

create table if not exists public.template_sessions (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.course_templates (id) on delete cascade,
  month_index int not null,
  session_in_month int not null,
  session_in_cycle int not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (template_id, month_index, session_in_month)
);

create index if not exists template_sessions_template_idx
  on public.template_sessions (template_id, month_index, session_in_month);

alter table public.template_sessions
  add column if not exists month_index int;

alter table public.template_sessions
  add column if not exists session_in_month int;

alter table public.template_sessions
  add column if not exists session_in_cycle int;

update public.template_sessions
set month_index = coalesce(month_index, 1)
where month_index is null;

update public.template_sessions
set session_in_month = coalesce(session_in_month, session_in_cycle, 1)
where session_in_month is null;

with ordered_rows as (
  select
    ts.id,
    row_number() over (
      partition by ts.template_id
      order by ts.month_index asc, ts.session_in_month asc, ts.created_at asc, ts.id asc
    ) as row_idx
  from public.template_sessions ts
)
update public.template_sessions ts
set session_in_cycle = coalesce(ts.session_in_cycle, ordered_rows.row_idx)
from ordered_rows
where ordered_rows.id = ts.id;

alter table public.template_sessions
  alter column month_index set not null;

alter table public.template_sessions
  alter column session_in_month set not null;

alter table public.template_sessions
  alter column session_in_cycle set not null;

alter table public.template_sessions
  drop constraint if exists template_sessions_template_id_session_in_cycle_key;

alter table public.template_sessions
  drop constraint if exists template_sessions_template_id_month_index_session_in_month_key;

create unique index if not exists template_sessions_template_month_session_idx
  on public.template_sessions (template_id, month_index, session_in_month);

create unique index if not exists template_sessions_template_cycle_idx
  on public.template_sessions (template_id, session_in_cycle);

alter table public.template_sessions
  drop constraint if exists template_sessions_month_index_check;

alter table public.template_sessions
  add constraint template_sessions_month_index_check
    check (month_index >= 1);

alter table public.template_sessions
  drop constraint if exists template_sessions_session_in_month_check;

alter table public.template_sessions
  add constraint template_sessions_session_in_month_check
    check (session_in_month >= 1);

alter table public.template_sessions
  drop constraint if exists template_sessions_session_in_cycle_check;

alter table public.template_sessions
  add constraint template_sessions_session_in_cycle_check
    check (session_in_cycle >= 1);

create table if not exists public.template_session_items (
  id uuid primary key default uuid_generate_v4(),
  template_session_id uuid not null references public.template_sessions (id) on delete cascade,
  type text not null check (type in ('slides', 'link', 'file', 'exercise', 'video', 'flashcards')),
  title text not null,
  url text not null,
  exercise_id uuid references public.exercises (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists template_session_items_session_idx
  on public.template_session_items (template_session_id, created_at);

create index if not exists template_session_items_exercise_idx
  on public.template_session_items (exercise_id, template_session_id)
  where exercise_id is not null;

alter table public.template_session_items
  drop constraint if exists template_session_items_type_check;

alter table public.template_session_items
  add constraint template_session_items_type_check
    check (type in ('slides', 'link', 'file', 'exercise', 'video', 'flashcards'));

alter table public.template_session_items
  add column if not exists exercise_id uuid references public.exercises (id) on delete set null;

create table if not exists public.flashcards (
  id uuid primary key default uuid_generate_v4(),
  word text not null,
  meaning text not null,
  image_url text not null,
  accepted_answers jsonb not null default '[]'::jsonb,
  audio_url text,
  audio_r2_key text,
  audio_provider text not null default 'elevenlabs',
  voice_id text,
  elevenlabs_config jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.flashcards
  add column if not exists accepted_answers jsonb not null default '[]'::jsonb;

alter table public.flashcards
  add column if not exists audio_url text;

alter table public.flashcards
  add column if not exists audio_r2_key text;

alter table public.flashcards
  add column if not exists audio_provider text not null default 'elevenlabs';

alter table public.flashcards
  add column if not exists voice_id text;

alter table public.flashcards
  add column if not exists elevenlabs_config jsonb;

alter table public.flashcards
  add column if not exists updated_at timestamptz not null default now();

update public.flashcards
set accepted_answers = '[]'::jsonb
where accepted_answers is null
   or jsonb_typeof(accepted_answers) <> 'array';

alter table public.flashcards
  drop constraint if exists flashcards_accepted_answers_array_check;

alter table public.flashcards
  add constraint flashcards_accepted_answers_array_check
    check (jsonb_typeof(accepted_answers) = 'array');

create index if not exists flashcards_word_idx
  on public.flashcards (word);

create index if not exists flashcards_meaning_idx
  on public.flashcards (meaning);

create table if not exists public.template_session_flashcards (
  id uuid primary key default uuid_generate_v4(),
  template_session_id uuid not null references public.template_sessions (id) on delete cascade,
  flashcard_id uuid references public.flashcards (id) on delete restrict,
  word text,
  meaning text,
  image_url text,
  card_order integer not null default 1,
  accepted_answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.template_session_flashcards
  add column if not exists flashcard_id uuid references public.flashcards (id) on delete restrict;

alter table public.template_session_flashcards
  add column if not exists image_url text;

alter table public.template_session_flashcards
  alter column word drop not null;

alter table public.template_session_flashcards
  alter column meaning drop not null;

alter table public.template_session_flashcards
  alter column image_url drop not null;

alter table public.template_session_flashcards
  add column if not exists card_order integer not null default 1;

alter table public.template_session_flashcards
  add column if not exists accepted_answers jsonb not null default '[]'::jsonb;

alter table public.template_session_flashcards
  add column if not exists updated_at timestamptz not null default now();

alter table public.template_session_flashcards
  drop constraint if exists template_session_flashcards_accepted_answers_array_check;

alter table public.template_session_flashcards
  add constraint template_session_flashcards_accepted_answers_array_check
    check (jsonb_typeof(accepted_answers) = 'array');

create index if not exists template_session_flashcards_session_idx
  on public.template_session_flashcards (template_session_id, card_order, created_at);

create index if not exists template_session_flashcards_flashcard_idx
  on public.template_session_flashcards (flashcard_id, template_session_id);

-- Pre-enrollments (pre-matricula)
create table if not exists public.pre_enrollments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  student_code text,
  period text not null,
  status text not null,
  step text not null,
  selected_level text,
  selected_frequency text,
  selected_start_time text,
  selected_course_type text,
  start_month date,
  selected_course_id uuid references public.courses (id) on delete set null,
  selected_schedule_id uuid,
  modality text,
  price_total numeric(10, 2),
  reservation_expires_at timestamptz,
  terms_accepted_at timestamptz,
  payment_method text,
  payment_proof_url text,
  payment_proof_meta jsonb not null default '{}'::jsonb,
  payment_submitted_at timestamptz,
  mp_payment_id text,
  mp_status text,
  reviewed_by uuid references public.admin_profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);

alter table public.pre_enrollments
  add column if not exists student_code text;

alter table public.pre_enrollments
  add column if not exists selected_start_time text;

alter table public.pre_enrollments
  add column if not exists selected_course_type text;

alter table public.pre_enrollments
  add column if not exists start_month date;

alter table public.pre_enrollments
  add constraint pre_enrollments_status_valid
    check (
      status in (
        'PENDING_EMAIL_VERIFICATION',
        'EMAIL_VERIFIED',
        'IN_PROGRESS',
        'RESERVED',
        'PAYMENT_SUBMITTED',
        'PAID_AUTO',
        'APPROVED',
        'REJECTED',
        'EXPIRED',
        'ABANDONED'
      )
    );

alter table public.pre_enrollments
  add constraint pre_enrollments_step_valid
    check (
      step in (
        'ACCOUNT_CREATED',
        'COURSE_SELECTION',
        'TERMS',
        'PRECONFIRMATION',
        'PAYMENT'
      )
    );

alter table public.pre_enrollments
  add constraint pre_enrollments_payment_method_valid
    check (
      payment_method is null
      or payment_method in ('YAPE_PLIN', 'MERCADOPAGO')
    );

create index if not exists pre_enrollments_user_idx on public.pre_enrollments (user_id);
create index if not exists pre_enrollments_status_idx on public.pre_enrollments (status);
create index if not exists pre_enrollments_step_idx on public.pre_enrollments (step);
create unique index if not exists pre_enrollments_student_code_idx on public.pre_enrollments (student_code) where student_code is not null;

-- Email verification tokens (OTP)
create table if not exists public.email_verification_tokens (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_tokens_user_idx on public.email_verification_tokens (user_id);
create index if not exists email_verification_tokens_active_idx on public.email_verification_tokens (user_id, expires_at);

-- Audit events
create table if not exists public.audit_events (
  id uuid primary key default uuid_generate_v4(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  pre_enrollment_id uuid references public.pre_enrollments (id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Monthly payments
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  billing_month date not null,
  amount_soles int not null,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'approved', 'rejected')),
  approved_at timestamptz,
  approved_screen_seen boolean not null default false,
  approved_screen_seen_at timestamptz,
  receipt_url text,
  created_at timestamptz not null default now(),
  unique (student_id, billing_month)
);

alter table public.payments add column if not exists approved_at timestamptz;
alter table public.payments add column if not exists approved_screen_seen boolean not null default false;
alter table public.payments add column if not exists approved_screen_seen_at timestamptz;

create index if not exists payments_student_idx on public.payments (student_id);
create index if not exists payments_month_idx on public.payments (billing_month);

-- Study With Me sessions (1:1 premium)
create table if not exists public.study_with_me_sessions (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  commission_id uuid references public.course_commissions (id) on delete set null,
  week_start date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  source text not null default 'manual' check (source in ('manual', 'calendly_webhook', 'admin')),
  calendly_event_uri text unique,
  calendly_invitee_uri text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_with_me_sessions_duration_30_check
    check (extract(epoch from (ends_at - starts_at)) = 1800)
);

alter table public.study_with_me_sessions
  add column if not exists commission_id uuid references public.course_commissions (id) on delete set null;

alter table public.study_with_me_sessions
  add column if not exists week_start date;

alter table public.study_with_me_sessions
  add column if not exists starts_at timestamptz;

alter table public.study_with_me_sessions
  add column if not exists ends_at timestamptz;

alter table public.study_with_me_sessions
  add column if not exists status text not null default 'scheduled';

alter table public.study_with_me_sessions
  add column if not exists source text not null default 'manual';

alter table public.study_with_me_sessions
  add column if not exists calendly_event_uri text;

alter table public.study_with_me_sessions
  add column if not exists calendly_invitee_uri text;

alter table public.study_with_me_sessions
  add column if not exists updated_at timestamptz not null default now();

alter table public.study_with_me_sessions
  drop constraint if exists study_with_me_sessions_status_check;

alter table public.study_with_me_sessions
  add constraint study_with_me_sessions_status_check
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show'));

alter table public.study_with_me_sessions
  drop constraint if exists study_with_me_sessions_source_check;

alter table public.study_with_me_sessions
  add constraint study_with_me_sessions_source_check
    check (source in ('manual', 'calendly_webhook', 'admin'));

alter table public.study_with_me_sessions
  drop constraint if exists study_with_me_sessions_duration_30_check;

alter table public.study_with_me_sessions
  add constraint study_with_me_sessions_duration_30_check
    check (extract(epoch from (ends_at - starts_at)) = 1800);

create index if not exists study_with_me_sessions_student_idx
  on public.study_with_me_sessions (student_id, starts_at desc);

create index if not exists study_with_me_sessions_week_idx
  on public.study_with_me_sessions (week_start, status);

create unique index if not exists study_with_me_sessions_student_week_unique
  on public.study_with_me_sessions (student_id, week_start)
  where status in ('scheduled', 'completed', 'no_show');

-- Google Calendar OAuth connections
create table if not exists public.google_calendar_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  calendar_id text not null default 'primary',
  google_user_email text,
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'Bearer',
  scope text,
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('ok', 'error')),
  last_sync_error text
);

alter table public.google_calendar_connections
  add column if not exists provider text not null default 'google';

alter table public.google_calendar_connections
  add column if not exists calendar_id text not null default 'primary';

alter table public.google_calendar_connections
  add column if not exists google_user_email text;

alter table public.google_calendar_connections
  add column if not exists access_token text;

alter table public.google_calendar_connections
  add column if not exists refresh_token text;

alter table public.google_calendar_connections
  add column if not exists token_type text not null default 'Bearer';

alter table public.google_calendar_connections
  add column if not exists scope text;

alter table public.google_calendar_connections
  add column if not exists expires_at timestamptz;

alter table public.google_calendar_connections
  add column if not exists connected_at timestamptz not null default now();

alter table public.google_calendar_connections
  add column if not exists updated_at timestamptz not null default now();

alter table public.google_calendar_connections
  add column if not exists last_sync_at timestamptz;

alter table public.google_calendar_connections
  add column if not exists last_sync_status text;

alter table public.google_calendar_connections
  add column if not exists last_sync_error text;

update public.google_calendar_connections
set provider = 'google'
where provider is null;

update public.google_calendar_connections
set calendar_id = coalesce(calendar_id, 'primary')
where calendar_id is null;

update public.google_calendar_connections
set token_type = coalesce(token_type, 'Bearer')
where token_type is null;

alter table public.google_calendar_connections
  alter column provider set not null;

alter table public.google_calendar_connections
  alter column calendar_id set not null;

alter table public.google_calendar_connections
  alter column token_type set not null;

alter table public.google_calendar_connections
  drop constraint if exists google_calendar_connections_provider_check;

alter table public.google_calendar_connections
  add constraint google_calendar_connections_provider_check
    check (provider = 'google');

alter table public.google_calendar_connections
  drop constraint if exists google_calendar_connections_last_sync_status_check;

alter table public.google_calendar_connections
  add constraint google_calendar_connections_last_sync_status_check
    check (last_sync_status is null or last_sync_status in ('ok', 'error'));

create index if not exists google_calendar_connections_sync_idx
  on public.google_calendar_connections (last_sync_at desc);

-- Course sessions (contenido por dia)
create table if not exists public.course_sessions (
  id uuid primary key default uuid_generate_v4(),
  commission_id uuid not null references public.course_commissions (id) on delete cascade,
  cycle_month date,
  session_index int,
  session_in_cycle int,
  session_date date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  kind text not null default 'class',
  status text not null default 'scheduled',
  day_label text,
  zoom_link text,
  live_link text,
  recording_link text,
  recording_passcode text,
  recording_published_at timestamptz,
  live_link_source text not null default 'manual' check (live_link_source in ('manual', 'auto')),
  recording_link_source text not null default 'manual' check (recording_link_source in ('manual', 'auto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (commission_id, session_date)
);

alter table public.course_sessions
  add column if not exists cycle_month date;

alter table public.course_sessions
  add column if not exists session_index int;

alter table public.course_sessions
  add column if not exists session_in_cycle int;

alter table public.course_sessions
  add column if not exists starts_at timestamptz;

alter table public.course_sessions
  add column if not exists ends_at timestamptz;

alter table public.course_sessions
  add column if not exists kind text not null default 'class';

alter table public.course_sessions
  add column if not exists status text not null default 'scheduled';

alter table public.course_sessions
  add column if not exists live_link text;

alter table public.course_sessions
  add column if not exists recording_link text;

alter table public.course_sessions
  add column if not exists zoom_link text;

alter table public.course_sessions
  add column if not exists recording_passcode text;

alter table public.course_sessions
  add column if not exists recording_published_at timestamptz;

alter table public.course_sessions
  add column if not exists live_link_source text not null default 'manual';

alter table public.course_sessions
  add column if not exists recording_link_source text not null default 'manual';

alter table public.course_sessions
  add column if not exists updated_at timestamptz not null default now();

alter table public.course_sessions
  drop constraint if exists course_sessions_live_link_source_check;

alter table public.course_sessions
  add constraint course_sessions_live_link_source_check
    check (live_link_source in ('manual', 'auto'));

alter table public.course_sessions
  drop constraint if exists course_sessions_recording_link_source_check;

alter table public.course_sessions
  add constraint course_sessions_recording_link_source_check
    check (recording_link_source in ('manual', 'auto'));

alter table public.course_sessions
  drop constraint if exists course_sessions_kind_check;

alter table public.course_sessions
  add constraint course_sessions_kind_check
    check (kind in ('class'));

alter table public.course_sessions
  drop constraint if exists course_sessions_status_check;

alter table public.course_sessions
  add constraint course_sessions_status_check
    check (status in ('scheduled', 'completed', 'cancelled'));

alter table public.course_sessions
  drop constraint if exists course_sessions_recording_requires_passcode_check;

alter table public.course_sessions
  add constraint course_sessions_recording_requires_passcode_check
    check (recording_link is null or nullif(btrim(recording_passcode), '') is not null);

update public.course_sessions
set zoom_link = live_link
where zoom_link is null
  and live_link is not null;

create index if not exists course_sessions_commission_idx on public.course_sessions (commission_id, session_date);
create index if not exists course_sessions_cycle_month_idx on public.course_sessions (commission_id, cycle_month, session_in_cycle);
create unique index if not exists course_sessions_commission_starts_at_idx
  on public.course_sessions (commission_id, starts_at)
  where starts_at is not null;

create table if not exists public.email_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null references public.course_sessions (id) on delete cascade,
  email_type text not null check (email_type in ('zoom_reminder', 'recording_published')),
  template_id int not null,
  sent_at timestamptz,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_id, email_type)
);

alter table public.email_log
  add column if not exists user_id uuid references public.profiles (id) on delete cascade;

alter table public.email_log
  add column if not exists session_id uuid references public.course_sessions (id) on delete cascade;

alter table public.email_log
  add column if not exists email_type text;

alter table public.email_log
  add column if not exists template_id int;

alter table public.email_log
  add column if not exists sent_at timestamptz;

alter table public.email_log
  add column if not exists status text not null default 'processing';

alter table public.email_log
  add column if not exists error_message text;

alter table public.email_log
  add column if not exists created_at timestamptz not null default now();

alter table public.email_log
  add column if not exists updated_at timestamptz not null default now();

update public.email_log
set status = case
  when status in ('processing', 'sent', 'failed') then status
  else 'failed'
end;

update public.email_log
set template_id = coalesce(template_id, 0);

alter table public.email_log
  alter column template_id set not null;

alter table public.email_log
  drop constraint if exists email_log_email_type_check;

alter table public.email_log
  add constraint email_log_email_type_check
    check (email_type in ('zoom_reminder', 'recording_published'));

alter table public.email_log
  drop constraint if exists email_log_status_check;

alter table public.email_log
  add constraint email_log_status_check
    check (status in ('processing', 'sent', 'failed'));

create unique index if not exists email_log_user_session_type_idx
  on public.email_log (user_id, session_id, email_type);

create index if not exists email_log_session_status_idx
  on public.email_log (session_id, email_type, status);

create table if not exists public.session_items (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.course_sessions (id) on delete cascade,
  type text not null check (type in ('file', 'exercise', 'recording', 'live_link', 'link', 'note', 'slides', 'flashcards')),
  title text not null,
  url text,
  exercise_id uuid references public.exercises (id) on delete set null,
  storage_key text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.session_items
  add column if not exists storage_key text;

alter table public.session_items
  add column if not exists exercise_id uuid references public.exercises (id) on delete set null;

alter table public.session_items
  add column if not exists note text;

alter table public.session_items
  add column if not exists updated_at timestamptz not null default now();

alter table public.session_items
  drop constraint if exists session_items_type_check;

alter table public.session_items
  add constraint session_items_type_check
    check (type in ('file', 'exercise', 'recording', 'live_link', 'link', 'note', 'slides', 'video', 'flashcards'));

create index if not exists session_items_session_idx on public.session_items (session_id, created_at);

create index if not exists session_items_exercise_idx
  on public.session_items (exercise_id, session_id)
  where exercise_id is not null;

create table if not exists public.session_flashcards (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.course_sessions (id) on delete cascade,
  flashcard_id uuid references public.flashcards (id) on delete restrict,
  word text,
  meaning text,
  image_url text,
  card_order integer not null default 1,
  accepted_answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.session_flashcards
  add column if not exists flashcard_id uuid references public.flashcards (id) on delete restrict;

alter table public.session_flashcards
  add column if not exists image_url text;

alter table public.session_flashcards
  alter column word drop not null;

alter table public.session_flashcards
  alter column meaning drop not null;

alter table public.session_flashcards
  alter column image_url drop not null;

alter table public.session_flashcards
  add column if not exists card_order integer not null default 1;

alter table public.session_flashcards
  add column if not exists accepted_answers jsonb not null default '[]'::jsonb;

alter table public.session_flashcards
  add column if not exists updated_at timestamptz not null default now();

alter table public.session_flashcards
  drop constraint if exists session_flashcards_accepted_answers_array_check;

alter table public.session_flashcards
  add constraint session_flashcards_accepted_answers_array_check
    check (jsonb_typeof(accepted_answers) = 'array');

create index if not exists session_flashcards_session_idx
  on public.session_flashcards (session_id, card_order, created_at);

create index if not exists session_flashcards_flashcard_idx
  on public.session_flashcards (flashcard_id, session_id);

drop table if exists public.password_reset_codes;

create table if not exists public.password_recovery_codes (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists password_recovery_codes_email_idx on public.password_recovery_codes (email);
create index if not exists password_recovery_codes_active_idx on public.password_recovery_codes (email, used, expires_at);

-- RLS policies
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_commissions enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;
alter table public.exercises enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.pre_enrollments enable row level security;
alter table public.email_verification_tokens enable row level security;
alter table public.audit_events enable row level security;
alter table public.payments enable row level security;
alter table public.study_with_me_sessions enable row level security;
alter table public.google_calendar_connections enable row level security;
alter table public.course_sessions enable row level security;
alter table public.email_log enable row level security;
alter table public.session_items enable row level security;
alter table public.flashcards enable row level security;
alter table public.session_flashcards enable row level security;
alter table public.course_templates enable row level security;
alter table public.template_sessions enable row level security;
alter table public.template_session_items enable row level security;
alter table public.template_session_flashcards enable row level security;

create policy "Profiles are self readable" on public.profiles
  for select using (auth.uid() = id);

create policy "Profiles self update" on public.profiles
  for update using (auth.uid() = id);

create policy "Admins manage profiles" on public.profiles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Public read courses" on public.courses
  for select using (true);

drop policy if exists "Public read commissions" on public.course_commissions;
create policy "Public read commissions" on public.course_commissions
  for select using (true);

create policy "Public read units" on public.units
  for select using (true);

create policy "Public read lessons" on public.lessons
  for select using (true);

create policy "Public read exercises" on public.exercises
  for select using (true);

create policy "Admins manage courses" on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage commissions" on public.course_commissions;
create policy "Admins manage commissions" on public.course_commissions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage units" on public.units
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage lessons" on public.lessons
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage exercises" on public.exercises
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage course templates" on public.course_templates;
create policy "Admins manage course templates" on public.course_templates
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Authenticated users read flashcards library" on public.flashcards;
create policy "Authenticated users read flashcards library" on public.flashcards
  for select to authenticated
  using (true);

drop policy if exists "Admins manage flashcards library" on public.flashcards;
create policy "Admins manage flashcards library" on public.flashcards
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage template sessions" on public.template_sessions;
create policy "Admins manage template sessions" on public.template_sessions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage template session items" on public.template_session_items;
create policy "Admins manage template session items" on public.template_session_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage template session flashcards" on public.template_session_flashcards;
create policy "Admins manage template session flashcards" on public.template_session_flashcards
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read course sessions" on public.course_sessions;
create policy "Students read course sessions" on public.course_sessions
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.commission_id = course_sessions.commission_id
    )
  );

drop policy if exists "Admins manage course sessions" on public.course_sessions;
create policy "Admins manage course sessions" on public.course_sessions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read session items" on public.session_items;
create policy "Students read session items" on public.session_items
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.course_sessions cs
      join public.profiles p on p.commission_id = cs.commission_id
      where cs.id = session_items.session_id
        and p.id = auth.uid()
    )
  );

drop policy if exists "Admins manage session items" on public.session_items;
create policy "Admins manage session items" on public.session_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read session flashcards" on public.session_flashcards;
create policy "Students read session flashcards" on public.session_flashcards
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.course_sessions cs
      join public.profiles p on p.commission_id = cs.commission_id
      where cs.id = session_flashcards.session_id
        and p.id = auth.uid()
    )
  );

drop policy if exists "Admins manage session flashcards" on public.session_flashcards;
create policy "Admins manage session flashcards" on public.session_flashcards
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Students read enrollments" on public.course_enrollments
  for select using (auth.uid() = user_id or public.is_admin());

create policy "Admins manage enrollments" on public.course_enrollments
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Users read own pre-enrollments" on public.pre_enrollments
  for select using (auth.uid() = user_id or public.is_admin());

create policy "Users update own pre-enrollments" on public.pre_enrollments
  for update using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy "Admins manage pre-enrollments" on public.pre_enrollments
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage email verification tokens" on public.email_verification_tokens
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage audit events" on public.audit_events
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage email log" on public.email_log;
create policy "Admins manage email log" on public.email_log
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Students read own payments" on public.payments
  for select using (auth.uid() = student_id or public.is_admin());

create policy "Students create own payments" on public.payments
  for insert with check (auth.uid() = student_id or public.is_admin());

create policy "Students update own payments" on public.payments
  for update using (auth.uid() = student_id or public.is_admin())
  with check (auth.uid() = student_id or public.is_admin());

create policy "Admins manage payments" on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Students read own Study With Me sessions" on public.study_with_me_sessions;
create policy "Students read own Study With Me sessions" on public.study_with_me_sessions
  for select using (auth.uid() = student_id or public.is_admin());

drop policy if exists "Admins manage Study With Me sessions" on public.study_with_me_sessions;
create policy "Admins manage Study With Me sessions" on public.study_with_me_sessions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users read own google calendar connection" on public.google_calendar_connections;
create policy "Users read own google calendar connection" on public.google_calendar_connections
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Admins manage google calendar connections" on public.google_calendar_connections;
create policy "Admins manage google calendar connections" on public.google_calendar_connections
  for all using (public.is_admin()) with check (public.is_admin());

-- Backfill profiles email/role metadata
update public.profiles as p
set email = u.email
from auth.users u
where p.id = u.id
  and (p.email is distinct from u.email);

insert into public.admin_profiles (id, email, full_name, invited, password_set, created_at)
select
  u.id,
  lower(u.email),
  coalesce(p.full_name, u.raw_user_meta_data->>'full_name'),
  true,
  coalesce(p.password_set, false),
  coalesce(p.created_at, now())
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = 'luisvill99sa@gmail.com'
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.admin_profiles.full_name),
      invited = true;

alter table public.exercises
  drop constraint if exists exercises_type_check;

alter table public.exercises
  add constraint exercises_type_check
    check (type in ('scramble', 'audio_match', 'reading_exercise', 'image_match', 'pairs', 'cloze'));
