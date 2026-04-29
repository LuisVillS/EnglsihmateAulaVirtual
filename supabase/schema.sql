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

create table if not exists public.crm_user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  role text not null check (role in ('crm_admin', 'crm_operator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_operator_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  full_name text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_user_roles_role_idx on public.crm_user_roles (role);
create index if not exists crm_user_roles_active_idx on public.crm_user_roles (is_active);
create index if not exists crm_operator_profiles_active_idx on public.crm_operator_profiles (is_active);

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
alter table public.crm_user_roles enable row level security;
alter table public.crm_operator_profiles enable row level security;

create policy "Admin profile self read" on public.admin_profiles
  for select using (auth.uid() = id);

create policy "Admins manage admin profiles" on public.admin_profiles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "CRM user roles self read" on public.crm_user_roles
  for select using (auth.uid() = user_id or public.is_admin());

create policy "CRM user roles admin manage" on public.crm_user_roles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "CRM operator profiles self read" on public.crm_operator_profiles
  for select using (auth.uid() = user_id or public.is_admin());

create policy "CRM operator profiles admin manage" on public.crm_operator_profiles
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

-- CRM core
create table if not exists public.crm_stages (
  id uuid primary key default uuid_generate_v4(),
  stage_key text not null unique,
  name text not null,
  position int not null,
  pipeline_state text not null default 'open'
    check (pipeline_state in ('open', 'won', 'lost')),
  is_active boolean not null default true,
  is_default boolean not null default false,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_stages_pipeline_state_valid check (
    (pipeline_state = 'open' and is_won = false and is_lost = false)
    or (pipeline_state = 'won' and is_won = true and is_lost = false)
    or (pipeline_state = 'lost' and is_won = false and is_lost = true)
  )
);

create table if not exists public.crm_leads (
  id uuid primary key default uuid_generate_v4(),
  source_type text not null
    check (source_type in ('classroom_pre_enrollment', 'meta_lead_ad', 'formspree', 'manual')),
  source_label text,
  user_id uuid references public.profiles (id) on delete set null,
  pre_enrollment_id uuid unique references public.pre_enrollments (id) on delete set null,
  email text,
  full_name text,
  phone text,
  current_stage_id uuid references public.crm_stages (id) on delete set null,
  lead_status text not null default 'open'
    check (lead_status in ('open', 'won', 'lost', 'archived')),
  current_pre_enrollment_status text,
  assigned_operator_user_id uuid references auth.users (id) on delete set null,
  queue_claimed_by_user_id uuid references auth.users (id) on delete set null,
  queue_claimed_at timestamptz,
  queue_claim_expires_at timestamptz,
  last_call_outcome text,
  last_interaction_at timestamptz,
  next_action_at timestamptz,
  approved_revenue_billing_month date,
  approved_revenue_soles int not null default 0,
  approved_payment_count int not null default 0,
  latest_approved_payment_at timestamptz,
  approved_pre_enrollment_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_leads_pre_enrollment_status_valid check (
    current_pre_enrollment_status is null
    or current_pre_enrollment_status in (
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
  ),
  constraint crm_leads_last_call_outcome_valid check (
    last_call_outcome is null
    or last_call_outcome in (
      'attempted',
      'connected',
      'no_answer',
      'voicemail',
      'callback_requested',
      'wrong_number',
      'not_interested'
    )
  ),
  constraint crm_leads_queue_claim_valid check (
    queue_claim_expires_at is null
    or queue_claimed_by_user_id is not null
  ),
  constraint crm_leads_status_timestamps_valid check (
    not (won_at is not null and lost_at is not null)
    and (lead_status <> 'won' or won_at is not null)
    and (lead_status <> 'lost' or lost_at is not null)
  )
);

create table if not exists public.crm_interactions (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  interaction_kind text not null
    check (interaction_kind in ('note', 'call', 'system')),
  direction text not null default 'system'
    check (direction in ('inbound', 'outbound', 'system')),
  operator_user_id uuid references auth.users (id) on delete set null,
  summary text,
  notes text,
  call_outcome text
    check (
      call_outcome is null
      or call_outcome in (
        'attempted',
        'connected',
        'no_answer',
        'voicemail',
        'callback_requested',
        'wrong_number',
        'not_interested'
      )
    ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_stage_history (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  from_stage_id uuid references public.crm_stages (id) on delete set null,
  to_stage_id uuid not null references public.crm_stages (id) on delete cascade,
  changed_by_user_id uuid references auth.users (id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_automations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  trigger_event text not null
    check (trigger_event in ('lead_created', 'lead_stage_changed', 'lead_won')),
  trigger_stage_id uuid references public.crm_stages (id) on delete set null,
  delivery_channel text not null
    check (delivery_channel in ('brevo_email')),
  template_key text,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_automation_jobs (
  id uuid primary key default uuid_generate_v4(),
  automation_id uuid references public.crm_automations (id) on delete set null,
  lead_id uuid references public.crm_leads (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempt_count int not null default 0,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_webhook_events (
  id uuid primary key default uuid_generate_v4(),
  provider text not null,
  event_type text,
  external_event_id text,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_stages_pipeline_idx
  on public.crm_stages (pipeline_state, is_active, position);

create index if not exists crm_leads_status_stage_idx
  on public.crm_leads (lead_status, current_stage_id, created_at);

create index if not exists crm_leads_queue_idx
  on public.crm_leads (lead_status, queue_claim_expires_at, next_action_at, created_at);

create index if not exists crm_leads_user_idx
  on public.crm_leads (user_id, pre_enrollment_id);

create index if not exists crm_leads_operator_idx
  on public.crm_leads (assigned_operator_user_id, queue_claimed_by_user_id);

create index if not exists crm_interactions_lead_idx
  on public.crm_interactions (lead_id, created_at desc);

create index if not exists crm_interactions_operator_idx
  on public.crm_interactions (operator_user_id, created_at desc);

create index if not exists crm_stage_history_lead_idx
  on public.crm_stage_history (lead_id, created_at desc);

create index if not exists crm_automation_jobs_status_idx
  on public.crm_automation_jobs (status, scheduled_for);

create unique index if not exists crm_webhook_events_dedupe_key_idx
  on public.crm_webhook_events (dedupe_key)
  where dedupe_key is not null;

create unique index if not exists crm_webhook_events_provider_event_idx
  on public.crm_webhook_events (provider, external_event_id)
  where external_event_id is not null;

insert into public.crm_stages (
  stage_key,
  name,
  position,
  pipeline_state,
  is_active,
  is_default,
  is_won,
  is_lost
)
values
  ('new_lead', 'New Lead', 100, 'open', true, true, false, false),
  ('attempting_contact', 'Attempting Contact', 200, 'open', true, false, false, false),
  ('qualified', 'Qualified', 300, 'open', true, false, false, false),
  ('won_enrolled', 'Won / Enrolled', 900, 'won', true, false, true, false),
  ('lost_closed', 'Lost / Closed', 1000, 'lost', true, false, false, true)
on conflict (stage_key) do update
  set name = excluded.name,
      position = excluded.position,
      pipeline_state = excluded.pipeline_state,
      is_active = excluded.is_active,
      is_default = excluded.is_default,
      is_won = excluded.is_won,
      is_lost = excluded.is_lost,
      updated_at = now();

create or replace function public.crm_current_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role
  from public.crm_user_roles
  where user_id = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.is_crm_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.crm_user_roles
      where user_id = auth.uid()
        and role = 'crm_admin'
        and is_active = true
    )
$$;

create or replace function public.has_crm_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.crm_user_roles
      where user_id = auth.uid()
        and role in ('crm_admin', 'crm_operator')
        and is_active = true
    )
$$;

create or replace function public.has_crm_manage_access()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.crm_user_roles
      where user_id = auth.uid()
        and role = 'crm_admin'
        and is_active = true
    )
$$;

create or replace function public.crm_stage_key_for_pre_enrollment_status(p_status text)
returns text
language sql
stable
set search_path = public
as $$
  select case upper(coalesce(p_status, ''))
    when 'APPROVED' then 'won_enrolled'
    when 'PAYMENT_SUBMITTED' then 'qualified'
    when 'PAID_AUTO' then 'qualified'
    when 'REJECTED' then 'lost_closed'
    when 'EXPIRED' then 'lost_closed'
    when 'ABANDONED' then 'lost_closed'
    else 'new_lead'
  end
$$;

create or replace function public.crm_lead_status_for_stage_key(p_stage_key text)
returns text
language sql
stable
set search_path = public
as $$
  select case lower(coalesce(p_stage_key, ''))
    when 'won_enrolled' then 'won'
    when 'lost_closed' then 'lost'
    else 'open'
  end
$$;

create or replace function public.crm_revenue_billing_month_for_pre_enrollment(p_pre_enrollment_id uuid)
returns date
language sql
stable
set search_path = public
as $$
  select date_trunc(
    'month',
    coalesce(pe.start_month, cc.start_date, pe.created_at::date)
  )::date
  from public.pre_enrollments pe
  left join public.course_commissions cc
    on cc.id = pe.selected_schedule_id
  where pe.id = p_pre_enrollment_id
$$;

create or replace function public.crm_approved_revenue_snapshot(p_pre_enrollment_id uuid)
returns table (
  billing_month date,
  approved_revenue_soles int,
  approved_payment_count int,
  latest_approved_payment_at timestamptz
)
language sql
stable
set search_path = public
as $$
  with target as (
    select
      pe.user_id as student_id,
      public.crm_revenue_billing_month_for_pre_enrollment(pe.id) as billing_month
    from public.pre_enrollments pe
    where pe.id = p_pre_enrollment_id
  )
  select
    target.billing_month,
    coalesce(sum(pay.amount_soles), 0)::int as approved_revenue_soles,
    count(pay.id)::int as approved_payment_count,
    max(coalesce(pay.approved_at, pay.created_at)) as latest_approved_payment_at
  from target
  left join public.payments pay
    on pay.student_id = target.student_id
   and pay.status = 'approved'
   and pay.billing_month = target.billing_month
  group by target.billing_month
$$;

create or replace function public.crm_upsert_lead_from_pre_enrollment(
  p_pre_enrollment_id uuid,
  p_reason text default 'pre_enrollment_sync',
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pre record;
  v_existing public.crm_leads%rowtype;
  v_stage_key text;
  v_stage_id uuid;
  v_target_stage_id uuid;
  v_target_status text;
  v_now timestamptz := now();
  v_lead_id uuid;
  v_billing_month date;
  v_revenue_soles int := 0;
  v_payment_count int := 0;
  v_latest_payment_at timestamptz := null;
  v_approved_at timestamptz := null;
  v_lost_at timestamptz := null;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'pre_enrollment_sync');
begin
  select
    pe.*,
    pr.email as profile_email,
    pr.full_name as profile_full_name,
    pr.phone as profile_phone
  into v_pre
  from public.pre_enrollments pe
  left join public.profiles pr
    on pr.id = pe.user_id
  where pe.id = p_pre_enrollment_id;

  if not found then
    return null;
  end if;

  v_stage_key := public.crm_stage_key_for_pre_enrollment_status(v_pre.status);
  v_target_status := public.crm_lead_status_for_stage_key(v_stage_key);

  select id
  into v_stage_id
  from public.crm_stages
  where stage_key = v_stage_key
  limit 1;

  select
    snapshot.billing_month,
    snapshot.approved_revenue_soles,
    snapshot.approved_payment_count,
    snapshot.latest_approved_payment_at
  into
    v_billing_month,
    v_revenue_soles,
    v_payment_count,
    v_latest_payment_at
  from public.crm_approved_revenue_snapshot(p_pre_enrollment_id) as snapshot;

  if upper(coalesce(v_pre.status, '')) = 'APPROVED' then
    v_approved_at := coalesce(v_pre.reviewed_at, v_now);
  end if;

  if v_target_status = 'lost' then
    v_lost_at := v_now;
  end if;

  select *
  into v_existing
  from public.crm_leads
  where pre_enrollment_id = p_pre_enrollment_id
  for update;

  if found then
    v_target_stage_id := coalesce(v_stage_id, v_existing.current_stage_id);

    update public.crm_leads
    set source_type = 'classroom_pre_enrollment',
        source_label = coalesce(v_existing.source_label, 'Classroom'),
        user_id = v_pre.user_id,
        email = coalesce(v_pre.profile_email, v_existing.email),
        full_name = coalesce(v_pre.profile_full_name, v_existing.full_name),
        phone = coalesce(v_pre.profile_phone, v_existing.phone),
        current_stage_id = coalesce(v_target_stage_id, v_existing.current_stage_id),
        lead_status = v_target_status,
        current_pre_enrollment_status = v_pre.status,
        approved_revenue_billing_month = v_billing_month,
        approved_revenue_soles = coalesce(v_revenue_soles, 0),
        approved_payment_count = coalesce(v_payment_count, 0),
        latest_approved_payment_at = v_latest_payment_at,
        approved_pre_enrollment_at = coalesce(v_existing.approved_pre_enrollment_at, v_approved_at),
        won_at = case
          when v_target_status = 'won' then coalesce(v_existing.won_at, v_approved_at, v_now)
          else v_existing.won_at
        end,
        lost_at = case
          when v_target_status = 'lost' then coalesce(v_existing.lost_at, v_lost_at)
          when v_target_status = 'won' then null
          else v_existing.lost_at
        end,
        last_synced_at = v_now,
        updated_at = v_now
    where id = v_existing.id
    returning id into v_lead_id;

    if v_existing.current_stage_id is distinct from v_target_stage_id and v_target_stage_id is not null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        v_existing.current_stage_id,
        v_target_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status
        ),
        v_now
      );
    end if;
  else
    insert into public.crm_leads (
      source_type,
      source_label,
      user_id,
      pre_enrollment_id,
      email,
      full_name,
      phone,
      current_stage_id,
      lead_status,
      current_pre_enrollment_status,
      approved_revenue_billing_month,
      approved_revenue_soles,
      approved_payment_count,
      latest_approved_payment_at,
      approved_pre_enrollment_at,
      won_at,
      lost_at,
      last_synced_at,
      created_at,
      updated_at
    )
    values (
      'classroom_pre_enrollment',
      'Classroom',
      v_pre.user_id,
      p_pre_enrollment_id,
      v_pre.profile_email,
      v_pre.profile_full_name,
      v_pre.profile_phone,
      v_stage_id,
      v_target_status,
      v_pre.status,
      v_billing_month,
      coalesce(v_revenue_soles, 0),
      coalesce(v_payment_count, 0),
      v_latest_payment_at,
      v_approved_at,
      case when v_target_status = 'won' then coalesce(v_approved_at, v_now) else null end,
      case when v_target_status = 'lost' then v_lost_at else null end,
      v_now,
      v_now,
      v_now
    )
    returning id into v_lead_id;

    if v_stage_id is not null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        null,
        v_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status
        ),
        v_now
      );
    end if;
  end if;

  return v_lead_id;
end;
$$;

alter table public.crm_stages
  add column if not exists system_key text;

alter table public.crm_stages
  add column if not exists display_name text;

alter table public.crm_stages
  add column if not exists email_template_id text;

alter table public.crm_stages
  add column if not exists ignored_roles jsonb not null default '[]'::jsonb;

alter table public.crm_stages
  add column if not exists initial_delay_hours int not null default 0;

alter table public.crm_stages
  add column if not exists stagnancy_follow_up_enabled boolean not null default false;

alter table public.crm_stages
  add column if not exists follow_up_template_id text;

alter table public.crm_leads
  add column if not exists last_stage_change_at timestamptz;

alter table public.crm_leads
  add column if not exists stage_follow_up_sent_at timestamptz;

alter table public.crm_leads
  add column if not exists stage_follow_up_stage_id uuid references public.crm_stages (id) on delete set null;

update public.crm_stages
set system_key = coalesce(nullif(trim(system_key), ''), stage_key),
    display_name = coalesce(nullif(trim(display_name), ''), name),
    email_template_id = coalesce(nullif(trim(email_template_id), ''), nullif(trim(brevo_template_id), '')),
    ignored_roles = case
      when jsonb_typeof(ignored_roles) = 'array' then ignored_roles
      else '[]'::jsonb
    end,
    initial_delay_hours = greatest(coalesce(initial_delay_hours, 0), 0)
where system_key is null
   or display_name is null
   or email_template_id is distinct from coalesce(nullif(trim(email_template_id), ''), nullif(trim(brevo_template_id), ''))
   or ignored_roles is null
   or jsonb_typeof(ignored_roles) <> 'array'
   or initial_delay_hours is null
   or initial_delay_hours < 0;

update public.crm_leads lead
set last_stage_change_at = coalesce(
      (
        select max(history.created_at)
        from public.crm_stage_history history
        where history.lead_id = lead.id
      ),
      lead.updated_at,
      lead.created_at,
      now()
    )
where lead.last_stage_change_at is null;

create unique index if not exists crm_stages_system_key_idx
  on public.crm_stages (lower(system_key));

create index if not exists crm_leads_stage_change_idx
  on public.crm_leads (current_stage_id, last_stage_change_at);

create index if not exists crm_leads_stage_follow_up_idx
  on public.crm_leads (stage_follow_up_stage_id, stage_follow_up_sent_at);

create or replace function public.crm_sync_stage_compat_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_system_key text;
  v_display_name text;
  v_email_template_id text;
begin
  v_system_key := lower(
    coalesce(
      nullif(trim(new.system_key), ''),
      nullif(trim(new.stage_key), ''),
      nullif(trim(old.system_key), ''),
      nullif(trim(old.stage_key), '')
    )
  );

  if v_system_key is null then
    raise exception 'CRM stages require a stable system_key';
  end if;

  v_display_name := coalesce(
    nullif(trim(new.display_name), ''),
    nullif(trim(new.name), ''),
    nullif(trim(old.display_name), ''),
    nullif(trim(old.name), ''),
    initcap(replace(v_system_key, '_', ' '))
  );

  v_email_template_id := coalesce(
    nullif(trim(new.email_template_id), ''),
    nullif(trim(new.brevo_template_id), ''),
    nullif(trim(old.email_template_id), ''),
    nullif(trim(old.brevo_template_id), '')
  );

  new.system_key := v_system_key;
  new.stage_key := v_system_key;
  new.display_name := v_display_name;
  new.name := v_display_name;
  new.email_template_id := v_email_template_id;
  new.brevo_template_id := v_email_template_id;
  new.ignored_roles := case
    when new.ignored_roles is null or jsonb_typeof(new.ignored_roles) <> 'array' then '[]'::jsonb
    else new.ignored_roles
  end;
  new.initial_delay_hours := greatest(coalesce(new.initial_delay_hours, 0), 0);

  return new;
end;
$$;

drop trigger if exists crm_stages_sync_compat_fields on public.crm_stages;
create trigger crm_stages_sync_compat_fields
before insert or update on public.crm_stages
for each row
execute function public.crm_sync_stage_compat_fields();

create or replace function public.crm_track_stage_change_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.current_stage_id is not null and new.last_stage_change_at is null then
      new.last_stage_change_at := coalesce(new.updated_at, new.created_at, now());
    end if;

    if new.current_stage_id is null then
      new.stage_follow_up_sent_at := null;
      new.stage_follow_up_stage_id := null;
    end if;

    return new;
  end if;

  if new.current_stage_id is distinct from old.current_stage_id then
    new.last_stage_change_at := coalesce(new.updated_at, now());
    new.stage_follow_up_sent_at := null;
    new.stage_follow_up_stage_id := null;
  elsif new.current_stage_id is null then
    new.stage_follow_up_sent_at := null;
    new.stage_follow_up_stage_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists crm_leads_track_stage_change_fields on public.crm_leads;
create trigger crm_leads_track_stage_change_fields
before insert or update on public.crm_leads
for each row
execute function public.crm_track_stage_change_fields();

create table if not exists public.crm_inbound_events (
  id uuid primary key default uuid_generate_v4(),
  provider text not null
    check (provider in ('web_form', 'meta', 'legacy_webhook')),
  event_type text not null,
  source_type text,
  source_provider text,
  site_key text,
  host text,
  form_key text,
  form_label text,
  page_path text,
  external_event_id text,
  external_lead_id text,
  payload_json jsonb not null default '{}'::jsonb,
  headers_json jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending'
    check (validation_status in ('pending', 'valid', 'invalid', 'skipped')),
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processed', 'failed', 'ignored')),
  processing_error text,
  signature_valid boolean,
  turnstile_valid boolean,
  ip_hash text,
  user_agent text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists crm_inbound_events_provider_received_idx
  on public.crm_inbound_events (provider, received_at desc);

create unique index if not exists crm_inbound_events_provider_external_event_idx
  on public.crm_inbound_events (provider, external_event_id)
  where external_event_id is not null;

create index if not exists crm_inbound_events_external_lead_idx
  on public.crm_inbound_events (external_lead_id)
  where external_lead_id is not null;

create index if not exists crm_inbound_events_form_key_idx
  on public.crm_inbound_events (form_key)
  where form_key is not null;

create index if not exists crm_inbound_events_site_key_idx
  on public.crm_inbound_events (site_key)
  where site_key is not null;

create index if not exists crm_inbound_events_processing_status_idx
  on public.crm_inbound_events (processing_status, received_at desc);

alter table public.crm_inbound_events enable row level security;

drop policy if exists "CRM inbound events read" on public.crm_inbound_events;
create policy "CRM inbound events read" on public.crm_inbound_events
  for select using (public.has_crm_access());

drop policy if exists "CRM inbound events manage" on public.crm_inbound_events;
create policy "CRM inbound events manage" on public.crm_inbound_events
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

create table if not exists public.crm_lead_touchpoints (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  inbound_event_id uuid not null references public.crm_inbound_events (id) on delete cascade,
  touch_type text not null,
  source_type text not null,
  source_provider text,
  site_key text,
  host text,
  form_key text,
  form_label text,
  page_path text,
  created_at timestamptz not null default now()
);

create index if not exists crm_lead_touchpoints_lead_idx
  on public.crm_lead_touchpoints (lead_id, created_at desc);

create index if not exists crm_lead_touchpoints_event_idx
  on public.crm_lead_touchpoints (inbound_event_id);

alter table public.crm_lead_touchpoints enable row level security;

drop policy if exists "CRM lead touchpoints read" on public.crm_lead_touchpoints;
create policy "CRM lead touchpoints read" on public.crm_lead_touchpoints
  for select using (public.has_crm_access());

drop policy if exists "CRM lead touchpoints manage" on public.crm_lead_touchpoints;
create policy "CRM lead touchpoints manage" on public.crm_lead_touchpoints
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

alter table public.crm_leads
  drop constraint if exists crm_leads_source_type_check;

alter table public.crm_leads
  add constraint crm_leads_source_type_check
  check (
    source_type in (
      'classroom_pre_enrollment',
      'meta_lead_ad',
      'meta_lead',
      'formspree',
      'web_form',
      'manual'
    )
  );

alter table public.crm_leads
  add column if not exists source_provider text;

alter table public.crm_leads
  add column if not exists source_event_id text;

alter table public.crm_leads
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

alter table public.crm_leads
  add column if not exists raw_source_type text;

alter table public.crm_leads
  add column if not exists raw_source_label text;

alter table public.crm_leads
  add column if not exists raw_source_event_id text;

alter table public.crm_leads
  add column if not exists raw_source_metadata jsonb not null default '{}'::jsonb;

alter table public.crm_leads
  add column if not exists raw_source_payload jsonb not null default '{}'::jsonb;

alter table public.crm_leads
  add column if not exists phone_dialable text;

alter table public.crm_leads
  add column if not exists phone_validation_status text;

alter table public.crm_leads
  add column if not exists phone_validation_reason text;

alter table public.crm_leads
  add column if not exists phone_raw_input text;

alter table public.crm_leads
  add column if not exists site_key text;

alter table public.crm_leads
  add column if not exists host text;

alter table public.crm_leads
  add column if not exists form_key text;

alter table public.crm_leads
  add column if not exists form_label text;

alter table public.crm_leads
  add column if not exists page_path text;

alter table public.crm_leads
  add column if not exists landing_url text;

alter table public.crm_leads
  add column if not exists referrer_url text;

alter table public.crm_leads
  add column if not exists utm_source text;

alter table public.crm_leads
  add column if not exists utm_medium text;

alter table public.crm_leads
  add column if not exists utm_campaign text;

alter table public.crm_leads
  add column if not exists utm_term text;

alter table public.crm_leads
  add column if not exists utm_content text;

alter table public.crm_leads
  add column if not exists first_submission_at timestamptz;

alter table public.crm_leads
  add column if not exists last_submission_at timestamptz;

alter table public.crm_leads
  add column if not exists latest_inbound_event_id uuid references public.crm_inbound_events (id) on delete set null;

alter table public.crm_leads
  add column if not exists external_lead_id text;

alter table public.crm_leads
  add column if not exists meta_page_id text;

alter table public.crm_leads
  add column if not exists meta_form_id text;

alter table public.crm_leads
  add column if not exists meta_ad_id text;

alter table public.crm_leads
  add column if not exists meta_campaign_id text;

create index if not exists crm_leads_source_site_form_idx
  on public.crm_leads (source_type, source_provider, site_key, form_key, created_at desc);

create unique index if not exists crm_leads_source_provider_external_lead_idx
  on public.crm_leads (source_provider, external_lead_id)
  where external_lead_id is not null;

create index if not exists crm_leads_latest_inbound_event_idx
  on public.crm_leads (latest_inbound_event_id)
  where latest_inbound_event_id is not null;

update public.crm_leads
set first_submission_at = coalesce(first_submission_at, created_at),
    last_submission_at = coalesce(last_submission_at, updated_at)
where first_submission_at is null
   or last_submission_at is null;

create or replace function public.crm_sync_approved_pre_enrollment(
  p_pre_enrollment_id uuid,
  p_reason text default 'approved_sync',
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status
  into v_status
  from public.pre_enrollments
  where id = p_pre_enrollment_id;

  if v_status is null then
    return null;
  end if;

  if upper(v_status) <> 'APPROVED' then
    return null;
  end if;

  return public.crm_upsert_lead_from_pre_enrollment(
    p_pre_enrollment_id,
    p_reason,
    p_actor_user_id
  );
end;
$$;

create or replace function public.crm_claim_next_lead(
  p_operator_user_id uuid default null,
  p_claim_timeout_seconds int default 900,
  p_campaign_key text default null,
  p_stage_keys text[] default null,
  p_source_types text[] default null,
  p_source_origins text[] default null
)
returns setof public.crm_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_operator uuid := coalesce(p_operator_user_id, auth.uid());
  v_claim_timeout int := greatest(60, least(coalesce(p_claim_timeout_seconds, 900), 3600));
  v_claimed_id uuid;
begin
  if v_effective_operator is null then
    raise exception 'CRM queue claim requires an operator user id';
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_effective_operator
     and not public.has_crm_manage_access()
     and not public.is_admin() then
    raise exception 'CRM queue claim denied for a different operator';
  end if;

  if not public.has_crm_access() and auth.uid() is not null then
    raise exception 'CRM access denied';
  end if;

  with candidate as (
    select lead.id
    from public.crm_leads lead
    where lead.lead_status = 'open'
      and not exists (
        select 1
        from public.crm_stages stage
        where stage.id = lead.current_stage_id
          and (
            coalesce(stage.is_won, false) = true
            or coalesce(stage.is_lost, false) = true
          )
      )
      and (
        p_stage_keys is null
        or exists (
          select 1
          from public.crm_stages stage_filter
          where stage_filter.id = lead.current_stage_id
            and stage_filter.stage_key = any(p_stage_keys)
        )
      )
      and (
        p_source_types is null
        or lead.source_type = any(p_source_types)
      )
      and (
        p_source_origins is null
        or lead.source_origin = any(p_source_origins)
      )
      and (
        lead.queue_claimed_by_user_id is null
        or lead.queue_claimed_by_user_id = v_effective_operator
        or lead.queue_claim_expires_at is null
        or lead.queue_claim_expires_at <= now()
      )
      and (
        lead.next_action_at is null
        or lead.next_action_at <= now()
      )
    order by
      case when lead.next_action_at is not null then 0 else 1 end,
      lead.next_action_at asc nulls last,
      lead.last_interaction_at asc nulls first,
      lead.created_at asc
    for update of lead skip locked
    limit 1
  )
  update public.crm_leads as target
  set queue_claimed_by_user_id = v_effective_operator,
      queue_claimed_at = now(),
      queue_claim_expires_at = now() + make_interval(secs => v_claim_timeout),
      updated_at = now()
  from candidate
  where target.id = candidate.id
  returning target.id into v_claimed_id;

  if v_claimed_id is null then
    return;
  end if;

  return query
  select *
  from public.crm_leads
  where id = v_claimed_id;
end;
$$;

create or replace function public.crm_submit_call_outcome(
  p_lead_id uuid,
  p_operator_user_id uuid default null,
  p_call_outcome text default 'attempted',
  p_note text default null,
  p_next_action_at timestamptz default null,
  p_release_claim boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns public.crm_interactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_operator uuid := coalesce(p_operator_user_id, auth.uid());
  v_now timestamptz := now();
  v_lead public.crm_leads%rowtype;
  v_interaction public.crm_interactions%rowtype;
  v_call_outcome text := lower(coalesce(nullif(trim(p_call_outcome), ''), 'attempted'));
begin
  if p_lead_id is null then
    raise exception 'CRM call outcome requires a lead id';
  end if;

  if v_effective_operator is null then
    raise exception 'CRM call outcome requires an operator user id';
  end if;

  if v_call_outcome not in (
    'attempted',
    'connected',
    'no_answer',
    'voicemail',
    'callback_requested',
    'wrong_number',
    'not_interested'
  ) then
    raise exception 'Unsupported CRM call outcome: %', v_call_outcome;
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_effective_operator
     and not public.has_crm_manage_access()
     and not public.is_admin() then
    raise exception 'CRM call outcome denied for a different operator';
  end if;

  if not public.has_crm_access() and auth.uid() is not null then
    raise exception 'CRM access denied';
  end if;

  select *
  into v_lead
  from public.crm_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'CRM lead not found';
  end if;

  if v_lead.queue_claimed_by_user_id is not null
     and v_lead.queue_claimed_by_user_id <> v_effective_operator
     and coalesce(v_lead.queue_claim_expires_at, v_now) > v_now
     and not public.has_crm_manage_access()
     and not public.is_admin() then
    raise exception 'CRM lead is currently claimed by another operator';
  end if;

  insert into public.crm_interactions (
    lead_id,
    interaction_kind,
    direction,
    operator_user_id,
    summary,
    notes,
    call_outcome,
    metadata,
    created_at
  )
  values (
    p_lead_id,
    'call',
    'outbound',
    v_effective_operator,
    case v_call_outcome
      when 'connected' then 'Connected call'
      when 'no_answer' then 'No answer'
      when 'voicemail' then 'Voicemail'
      when 'callback_requested' then 'Callback requested'
      when 'wrong_number' then 'Wrong number'
      when 'not_interested' then 'Not interested'
      else 'Call attempted'
    end,
    p_note,
    v_call_outcome,
    coalesce(p_metadata, '{}'::jsonb),
    v_now
  )
  returning * into v_interaction;

  update public.crm_leads
  set last_call_outcome = v_call_outcome,
      last_interaction_at = v_now,
      next_action_at = p_next_action_at,
      queue_claimed_by_user_id = case when coalesce(p_release_claim, true) then null else v_effective_operator end,
      queue_claimed_at = case when coalesce(p_release_claim, true) then null else v_now end,
      queue_claim_expires_at = case
        when coalesce(p_release_claim, true) then null
        else greatest(coalesce(v_lead.queue_claim_expires_at, v_now), v_now)
      end,
      updated_at = v_now
  where id = p_lead_id;

  return v_interaction;
end;
$$;

create or replace function public.crm_sync_lead_from_pre_enrollment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.crm_upsert_lead_from_pre_enrollment(
    new.id,
    'pre_enrollment_trigger',
    null
  );
  return new;
end;
$$;

create or replace function public.crm_sync_leads_from_payment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := coalesce(new.student_id, old.student_id);
  v_row record;
begin
  if v_student_id is null then
    return coalesce(new, old);
  end if;

  for v_row in
    select id
    from public.pre_enrollments
    where user_id = v_student_id
  loop
    perform public.crm_upsert_lead_from_pre_enrollment(
      v_row.id,
      'payments_trigger',
      null
    );
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists crm_pre_enrollments_sync_lead on public.pre_enrollments;
create trigger crm_pre_enrollments_sync_lead
after insert or update of status, step, selected_level, selected_course_type, start_month, selected_schedule_id, payment_submitted_at
on public.pre_enrollments
for each row
execute function public.crm_sync_lead_from_pre_enrollment_trigger();

drop trigger if exists crm_payments_sync_leads on public.payments;
create trigger crm_payments_sync_leads
after insert or update of status, amount_soles, approved_at, billing_month
on public.payments
for each row
execute function public.crm_sync_leads_from_payment_trigger();

drop trigger if exists crm_payments_sync_leads_delete on public.payments;
create trigger crm_payments_sync_leads_delete
after delete
on public.payments
for each row
execute function public.crm_sync_leads_from_payment_trigger();

alter table public.crm_stages enable row level security;
alter table public.crm_leads enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_stage_history enable row level security;
alter table public.crm_automations enable row level security;
alter table public.crm_automation_jobs enable row level security;
alter table public.crm_webhook_events enable row level security;

drop policy if exists "CRM stages read" on public.crm_stages;
create policy "CRM stages read" on public.crm_stages
  for select using (public.has_crm_access());

drop policy if exists "CRM stages manage" on public.crm_stages;
create policy "CRM stages manage" on public.crm_stages
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM leads read" on public.crm_leads;
create policy "CRM leads read" on public.crm_leads
  for select using (public.has_crm_access());

drop policy if exists "CRM leads manage" on public.crm_leads;
create policy "CRM leads manage" on public.crm_leads
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM interactions read" on public.crm_interactions;
create policy "CRM interactions read" on public.crm_interactions
  for select using (public.has_crm_access());

drop policy if exists "CRM interactions insert" on public.crm_interactions;
create policy "CRM interactions insert" on public.crm_interactions
  for insert with check (public.has_crm_access());

drop policy if exists "CRM interactions manage" on public.crm_interactions;
create policy "CRM interactions manage" on public.crm_interactions
  for update using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM stage history read" on public.crm_stage_history;
create policy "CRM stage history read" on public.crm_stage_history
  for select using (public.has_crm_access());

drop policy if exists "CRM stage history manage" on public.crm_stage_history;
create policy "CRM stage history manage" on public.crm_stage_history
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM automations manage" on public.crm_automations;
create policy "CRM automations manage" on public.crm_automations
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM automation jobs manage" on public.crm_automation_jobs;
create policy "CRM automation jobs manage" on public.crm_automation_jobs
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

drop policy if exists "CRM webhook events manage" on public.crm_webhook_events;
create policy "CRM webhook events manage" on public.crm_webhook_events
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

do $$
declare
  v_row record;
begin
  for v_row in
    select id
    from public.pre_enrollments
  loop
    perform public.crm_upsert_lead_from_pre_enrollment(
      v_row.id,
      'm3_backfill',
      null
    );
  end loop;
end;
$$;

alter table public.crm_user_roles
  add column if not exists provisioned_by_user_id uuid references auth.users (id) on delete set null;

alter table public.crm_user_roles
  add column if not exists provisioned_at timestamptz;

alter table public.crm_stages
  add column if not exists brevo_template_code text;

alter table public.crm_stages
  add column if not exists brevo_template_id text;

alter table public.crm_stages
  add column if not exists brevo_template_config jsonb not null default '{}'::jsonb;

alter table public.crm_stages
  add column if not exists archived_at timestamptz;

alter table public.crm_stages
  add column if not exists archived_by_user_id uuid references auth.users (id) on delete set null;

alter table public.crm_stages
  add column if not exists archive_reason text;

alter table public.crm_leads
  add column if not exists source_origin text not null default 'manual';

alter table public.crm_leads
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

alter table public.crm_leads
  add column if not exists archived_at timestamptz;

alter table public.crm_leads
  add column if not exists archived_by_user_id uuid references auth.users (id) on delete set null;

alter table public.crm_leads
  add column if not exists archive_reason text;

do $$
begin
  alter table public.crm_leads drop constraint if exists crm_leads_source_origin_valid;
exception
  when undefined_object then null;
end $$;

alter table public.crm_leads
  add constraint crm_leads_source_origin_valid
  check (source_origin in ('meta', 'formspree', 'pre_enrollment', 'manual', 'other'));

create index if not exists crm_user_roles_provisioned_idx
  on public.crm_user_roles (provisioned_by_user_id);

create index if not exists crm_stages_management_idx
  on public.crm_stages (is_active, archived_at, position);

create index if not exists crm_leads_source_origin_idx
  on public.crm_leads (source_origin, lead_status, created_at);

create index if not exists crm_leads_archive_idx
  on public.crm_leads (lead_status, archived_at, updated_at);

update public.crm_leads
set source_origin = case
  when source_type = 'meta_lead_ad' then 'meta'
  when source_type = 'formspree' then 'formspree'
  when source_type = 'classroom_pre_enrollment' then 'pre_enrollment'
  else coalesce(source_origin, 'manual')
end
where source_origin is null
   or source_origin = 'manual'
   or source_origin not in ('meta', 'formspree', 'pre_enrollment', 'manual', 'other');

create or replace function public.crm_upsert_lead_from_pre_enrollment(
  p_pre_enrollment_id uuid,
  p_reason text default 'pre_enrollment_sync',
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pre record;
  v_existing public.crm_leads%rowtype;
  v_stage_key text;
  v_stage_id uuid;
  v_target_stage_id uuid;
  v_target_status text;
  v_now timestamptz := now();
  v_lead_id uuid;
  v_billing_month date;
  v_revenue_soles int := 0;
  v_payment_count int := 0;
  v_latest_payment_at timestamptz := null;
  v_approved_at timestamptz := null;
  v_lost_at timestamptz := null;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'pre_enrollment_sync');
  v_source_metadata jsonb := '{}'::jsonb;
begin
  select
    pe.*,
    pr.email as profile_email,
    pr.full_name as profile_full_name,
    pr.phone as profile_phone
  into v_pre
  from public.pre_enrollments pe
  left join public.profiles pr on pr.id = pe.user_id
  where pe.id = p_pre_enrollment_id;

  if not found then
    return null;
  end if;

  v_stage_key := public.crm_stage_key_for_pre_enrollment_status(v_pre.status);

  select id
  into v_stage_id
  from public.crm_stages
  where stage_key = v_stage_key
    and is_active = true
  limit 1;

  select
    snapshot.billing_month,
    snapshot.approved_revenue_soles,
    snapshot.approved_payment_count,
    snapshot.latest_approved_payment_at
  into
    v_billing_month,
    v_revenue_soles,
    v_payment_count,
    v_latest_payment_at
  from public.crm_approved_revenue_snapshot(p_pre_enrollment_id) as snapshot;

  if upper(coalesce(v_pre.status, '')) = 'APPROVED' then
    v_approved_at := coalesce(v_pre.reviewed_at, v_now);
  end if;

  select *
  into v_existing
  from public.crm_leads
  where pre_enrollment_id = p_pre_enrollment_id
  for update;

  v_source_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'source_origin', 'pre_enrollment',
      'source_type', 'classroom_pre_enrollment',
      'source_label', 'Classroom',
      'pre_enrollment_id', p_pre_enrollment_id,
      'pre_enrollment_status', v_pre.status,
      'pre_enrollment_step', v_pre.step,
      'selected_level', v_pre.selected_level,
      'selected_frequency', v_pre.selected_frequency,
      'selected_start_time', v_pre.selected_start_time,
      'selected_course_type', v_pre.selected_course_type,
      'start_month', v_pre.start_month,
      'selected_course_id', v_pre.selected_course_id,
      'selected_schedule_id', v_pre.selected_schedule_id,
      'modality', v_pre.modality,
      'price_total', v_pre.price_total,
      'reservation_expires_at', v_pre.reservation_expires_at,
      'terms_accepted_at', v_pre.terms_accepted_at,
      'payment_method', v_pre.payment_method,
      'payment_proof_url', v_pre.payment_proof_url,
      'payment_proof_meta', v_pre.payment_proof_meta,
      'payment_submitted_at', v_pre.payment_submitted_at,
      'mp_payment_id', v_pre.mp_payment_id,
      'mp_status', v_pre.mp_status,
      'reviewed_by', v_pre.reviewed_by,
      'reviewed_at', v_pre.reviewed_at,
      'review_notes', v_pre.review_notes,
      'student_code', v_pre.student_code,
      'period', v_pre.period,
      'profile_email', v_pre.profile_email,
      'profile_full_name', v_pre.profile_full_name,
      'profile_phone', v_pre.profile_phone
    )
  );

  if found then
    v_target_stage_id := coalesce(v_stage_id, v_existing.current_stage_id);
    v_target_status := coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open');

    if v_existing.archived_at is not null then
      v_target_status := 'archived';
    end if;

    update public.crm_leads
    set source_origin = 'pre_enrollment',
        source_type = 'classroom_pre_enrollment',
        source_label = coalesce(v_existing.source_label, 'Classroom'),
        user_id = v_pre.user_id,
        email = coalesce(v_pre.profile_email, v_existing.email),
        full_name = coalesce(v_pre.profile_full_name, v_existing.full_name),
        phone = coalesce(v_pre.profile_phone, v_existing.phone),
        source_metadata = coalesce(v_existing.source_metadata, '{}'::jsonb) || v_source_metadata,
        current_stage_id = case
          when v_existing.archived_at is not null then v_existing.current_stage_id
          else coalesce(v_target_stage_id, v_existing.current_stage_id)
        end,
        lead_status = case
          when v_existing.archived_at is not null then 'archived'
          else v_target_status
        end,
        current_pre_enrollment_status = v_pre.status,
        approved_revenue_billing_month = v_billing_month,
        approved_revenue_soles = coalesce(v_revenue_soles, 0),
        approved_payment_count = coalesce(v_payment_count, 0),
        latest_approved_payment_at = v_latest_payment_at,
        approved_pre_enrollment_at = coalesce(v_existing.approved_pre_enrollment_at, v_approved_at),
        won_at = case
          when v_existing.archived_at is not null then v_existing.won_at
          when v_target_status = 'won' then coalesce(v_existing.won_at, v_approved_at, v_now)
          else v_existing.won_at
        end,
        lost_at = case
          when v_existing.archived_at is not null then v_existing.lost_at
          when v_target_status = 'lost' then coalesce(v_existing.lost_at, v_now)
          else v_existing.lost_at
        end,
        archived_at = v_existing.archived_at,
        archived_by_user_id = v_existing.archived_by_user_id,
        archive_reason = v_existing.archive_reason,
        last_synced_at = v_now,
        updated_at = v_now
    where id = v_existing.id
    returning id into v_lead_id;

    if v_existing.current_stage_id is distinct from v_target_stage_id
       and v_target_stage_id is not null
       and v_existing.archived_at is null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        v_existing.current_stage_id,
        v_target_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status,
          'source_origin', 'pre_enrollment'
        ),
        v_now
      );
    end if;
  else
    insert into public.crm_leads (
      source_type,
      source_label,
      source_origin,
      source_metadata,
      user_id,
      pre_enrollment_id,
      email,
      full_name,
      phone,
      current_stage_id,
      lead_status,
      current_pre_enrollment_status,
      approved_revenue_billing_month,
      approved_revenue_soles,
      approved_payment_count,
      latest_approved_payment_at,
      approved_pre_enrollment_at,
      won_at,
      lost_at,
      archived_at,
      archived_by_user_id,
      archive_reason,
      last_synced_at
    )
    values (
      'classroom_pre_enrollment',
      'Classroom',
      'pre_enrollment',
      v_source_metadata,
      v_pre.user_id,
      p_pre_enrollment_id,
      v_pre.profile_email,
      v_pre.profile_full_name,
      v_pre.profile_phone,
      v_stage_id,
      coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open'),
      v_pre.status,
      v_billing_month,
      coalesce(v_revenue_soles, 0),
      coalesce(v_payment_count, 0),
      v_latest_payment_at,
      v_approved_at,
      v_now,
      v_lost_at,
      null,
      null,
      null,
      v_now
    )
    returning id into v_lead_id;

    if v_stage_id is not null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        null,
        v_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status,
          'source_origin', 'pre_enrollment'
        ),
        v_now
      );
    end if;
  end if;

  return v_lead_id;
end;
$$;

create or replace function public.crm_submit_call_outcome(
  p_lead_id uuid,
  p_operator_user_id uuid default null,
  p_call_outcome text default 'attempted',
  p_note text default null,
  p_next_action_at timestamptz default null,
  p_release_claim boolean default true,
  p_metadata jsonb default '{}'::jsonb
)
returns public.crm_interactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_operator uuid := coalesce(p_operator_user_id, auth.uid());
  v_now timestamptz := now();
  v_lead public.crm_leads%rowtype;
  v_interaction public.crm_interactions%rowtype;
  v_call_outcome text := lower(coalesce(nullif(trim(p_call_outcome), ''), 'attempted'));
begin
  if p_lead_id is null then
    raise exception 'CRM call outcome requires a lead id';
  end if;

  if v_effective_operator is null then
    raise exception 'CRM call outcome requires an operator user id';
  end if;

  if v_call_outcome not in (
    'attempted',
    'connected',
    'no_answer',
    'voicemail',
    'callback_requested',
    'wrong_number',
    'not_interested'
  ) then
    raise exception 'Invalid CRM call outcome: %', v_call_outcome;
  end if;

  if not public.has_crm_access() and auth.uid() is not null then
    raise exception 'CRM access denied';
  end if;

  select *
  into v_lead
  from public.crm_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'CRM lead not found';
  end if;

  if v_lead.lead_status = 'archived' or v_lead.archived_at is not null then
    raise exception 'Archived CRM leads cannot receive call outcomes';
  end if;

  if v_lead.queue_claimed_by_user_id is not null
     and v_lead.queue_claimed_by_user_id <> v_effective_operator
     and coalesce(v_lead.queue_claim_expires_at, v_now) > v_now
     and not public.has_crm_manage_access()
     and not public.is_admin() then
    raise exception 'CRM lead is currently claimed by another operator';
  end if;

  insert into public.crm_interactions (
    lead_id,
    interaction_kind,
    direction,
    operator_user_id,
    summary,
    notes,
    call_outcome,
    metadata,
    created_at
  )
  values (
    p_lead_id,
    'call',
    'outbound',
    v_effective_operator,
    coalesce(nullif(trim(p_note), ''), initcap(replace(v_call_outcome, '_', ' '))),
    nullif(trim(p_note), ''),
    v_call_outcome,
    coalesce(p_metadata, '{}'::jsonb),
    v_now
  )
  returning * into v_interaction;

  update public.crm_leads
  set last_call_outcome = v_call_outcome,
      last_interaction_at = v_now,
      next_action_at = p_next_action_at,
      queue_claimed_by_user_id = case when coalesce(p_release_claim, true) then null else v_effective_operator end,
      queue_claimed_at = case when coalesce(p_release_claim, true) then null else v_now end,
      queue_claim_expires_at = case
        when coalesce(p_release_claim, true) then null
        else greatest(coalesce(v_lead.queue_claim_expires_at, v_now), v_now)
      end,
      updated_at = v_now
  where id = p_lead_id;

  return v_interaction;
end;
$$;

do $$
declare
  v_row record;
begin
  for v_row in
    select id
    from public.pre_enrollments
  loop
    perform public.crm_upsert_lead_from_pre_enrollment(
      v_row.id,
      'm4_source_metadata_backfill',
      null
    );
  end loop;
end;
$$;

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

alter table public.profiles
  add column if not exists phone_country_code text;

alter table public.profiles
  add column if not exists phone_national_number text;

alter table public.profiles
  add column if not exists phone_e164 text;

alter table public.crm_leads
  add column if not exists phone_country_code text;

alter table public.crm_leads
  add column if not exists phone_national_number text;

alter table public.crm_leads
  add column if not exists phone_e164 text;

create index if not exists profiles_phone_e164_idx
  on public.profiles (phone_e164)
  where phone_e164 is not null;

create index if not exists crm_leads_phone_e164_idx
  on public.crm_leads (phone_e164)
  where phone_e164 is not null;

create table if not exists public.crm_deleted_leads (
  id uuid primary key default uuid_generate_v4(),
  original_lead_id uuid not null,
  source_type text,
  source_origin text,
  user_id uuid,
  pre_enrollment_id uuid,
  email text,
  full_name text,
  phone text,
  phone_country_code text,
  phone_national_number text,
  phone_e164 text,
  lead_status text,
  deleted_at timestamptz not null default now(),
  deleted_by_user_id uuid references auth.users (id) on delete set null,
  delete_reason text,
  snapshot jsonb not null default '{}'::jsonb
);

alter table public.crm_deleted_leads enable row level security;

drop policy if exists "CRM deleted leads read" on public.crm_deleted_leads;
create policy "CRM deleted leads read" on public.crm_deleted_leads
  for select using (public.has_crm_manage_access());

drop policy if exists "CRM deleted leads manage" on public.crm_deleted_leads;
create policy "CRM deleted leads manage" on public.crm_deleted_leads
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

create unique index if not exists crm_deleted_leads_original_lead_idx
  on public.crm_deleted_leads (original_lead_id);

create index if not exists crm_deleted_leads_deleted_at_idx
  on public.crm_deleted_leads (deleted_at desc);

create index if not exists crm_deleted_leads_phone_e164_idx
  on public.crm_deleted_leads (phone_e164)
  where phone_e164 is not null;

create or replace function public.crm_phone_digits(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '\D', '', 'g'), '')
$$;

create or replace function public.crm_normalize_phone_country_code(p_value text)
returns text
language sql
immutable
as $$
  select case
    when public.crm_phone_digits(p_value) is null then null
    when length(public.crm_phone_digits(p_value)) between 1 and 3 then '+' || public.crm_phone_digits(p_value)
    else null
  end
$$;

create or replace function public.crm_normalize_phone_e164(p_value text)
returns text
language sql
immutable
as $$
  with prepared as (
    select
      nullif(btrim(coalesce(p_value, '')), '') as raw_value,
      public.crm_phone_digits(
        case
          when coalesce(p_value, '') ~ '^\s*00' then substr(coalesce(p_value, ''), 3)
          else p_value
        end
      ) as digits
  )
  select case
    when raw_value is null or digits is null then null
    when not (raw_value ~ '^\s*\+' or raw_value ~ '^\s*00') then null
    when length(digits) between 8 and 15 then '+' || digits
    else null
  end
  from prepared
$$;

create or replace function public.crm_infer_phone_country_code(p_value text)
returns text
language sql
immutable
as $$
  with prepared as (
    select case
      when coalesce(p_value, '') ~ '^\s*00' then public.crm_phone_digits(substr(coalesce(p_value, ''), 3))
      when coalesce(p_value, '') ~ '^\s*\+' then public.crm_phone_digits(p_value)
      else null
    end as digits
  )
  select '+' || candidate.country_code
  from prepared
  join lateral (
    select country_code
    from unnest(array[
      '998', '995', '994', '593', '592', '591', '598', '597', '596', '595', '594',
      '58', '57', '56', '55', '54', '53', '52', '51', '49', '48', '47', '46', '45',
      '44', '43', '41', '40', '39', '34', '33', '32', '31', '30', '27', '20', '7', '1'
    ]) as country_code
    where prepared.digits like country_code || '%'
    order by length(country_code) desc, country_code asc
    limit 1
  ) candidate on true
$$;

create or replace function public.crm_phone_digits_look_fake(p_value text)
returns boolean
language sql
immutable
as $$
  with prepared as (
    select coalesce(public.crm_phone_digits(p_value), '') as digits
  )
  select
    digits = ''
    or length(digits) < 6
    or length(digits) > 15
    or digits ~ '^(\d)\1+$'
    or (length(digits) >= 6 and left('0123456789012345', length(digits)) = digits)
    or (length(digits) >= 6 and left('9876543210987654', length(digits)) = digits)
    or (length(digits) >= 6 and length(digits) % 2 = 0 and repeat(left(digits, 2), length(digits) / 2) = digits)
    or (length(digits) >= 6 and length(digits) % 3 = 0 and repeat(left(digits, 3), length(digits) / 3) = digits)
  from prepared
$$;

create or replace function public.crm_phone_parts(
  p_raw_phone text default null,
  p_country_code text default null,
  p_national_number text default null,
  p_phone_e164 text default null
)
returns table (
  phone_country_code text,
  phone_national_number text,
  phone_e164 text,
  is_valid boolean,
  validation_reason text
)
language plpgsql
immutable
as $$
declare
  v_explicit_country_code text := public.crm_normalize_phone_country_code(p_country_code);
  v_explicit_e164 text := public.crm_normalize_phone_e164(p_phone_e164);
  v_raw_phone text := nullif(btrim(coalesce(p_raw_phone, '')), '');
  v_raw_international_digits text;
  v_national_digits text := public.crm_phone_digits(p_national_number);
  v_full_digits text;
  v_country_digits text;
begin
  if v_explicit_e164 is not null then
    phone_e164 := v_explicit_e164;
    phone_country_code := coalesce(v_explicit_country_code, public.crm_infer_phone_country_code(v_explicit_e164));
    if phone_country_code is not null then
      phone_national_number := public.crm_phone_digits(v_explicit_e164);
      phone_national_number := substr(
        phone_national_number,
        length(replace(phone_country_code, '+', '')) + 1
      );
    end if;
  end if;

  if phone_country_code is null then
    phone_country_code := v_explicit_country_code;
  end if;

  if v_raw_phone ~ '^\s*\+' then
    v_raw_international_digits := public.crm_phone_digits(v_raw_phone);
  elsif v_raw_phone ~ '^\s*00' then
    v_raw_international_digits := public.crm_phone_digits(substr(v_raw_phone, 3));
  else
    v_raw_international_digits := null;
  end if;

  if phone_country_code is null and v_raw_international_digits is not null then
    phone_country_code := public.crm_infer_phone_country_code('+' || v_raw_international_digits);
  end if;

  if phone_national_number is null then
    if v_national_digits is not null then
      phone_national_number := v_national_digits;
    elsif v_raw_international_digits is not null and phone_country_code is not null then
      v_country_digits := replace(phone_country_code, '+', '');
      if v_raw_international_digits like v_country_digits || '%' then
        phone_national_number := substr(v_raw_international_digits, length(v_country_digits) + 1);
      else
        phone_national_number := v_raw_international_digits;
      end if;
    else
      phone_national_number := public.crm_phone_digits(v_raw_phone);
    end if;
  end if;

  if phone_national_number is not null then
    phone_national_number := public.crm_phone_digits(phone_national_number);
  end if;

  if phone_national_number is null then
    is_valid := false;
    validation_reason := case
      when v_raw_phone is null and v_explicit_e164 is null then null
      else 'missing_national_number'
    end;
    phone_e164 := null;
    return next;
    return;
  end if;

  if length(phone_national_number) < 6 or length(phone_national_number) > 12 then
    is_valid := false;
    validation_reason := 'invalid_national_number_length';
    phone_e164 := null;
    return next;
    return;
  end if;

  if public.crm_phone_digits_look_fake(phone_national_number) then
    is_valid := false;
    validation_reason := 'fake_national_number';
    phone_e164 := null;
    return next;
    return;
  end if;

  if phone_country_code is null then
    is_valid := false;
    validation_reason := 'missing_country_code';
    phone_e164 := null;
    return next;
    return;
  end if;

  v_full_digits := replace(phone_country_code, '+', '') || phone_national_number;
  if length(v_full_digits) < 8 or length(v_full_digits) > 15 then
    is_valid := false;
    validation_reason := 'invalid_e164_length';
    phone_e164 := null;
    return next;
    return;
  end if;

  if public.crm_phone_digits_look_fake(v_full_digits) then
    is_valid := false;
    validation_reason := 'fake_full_number';
    phone_e164 := null;
    return next;
    return;
  end if;

  phone_e164 := '+' || v_full_digits;
  is_valid := true;
  validation_reason := null;
  return next;
end;
$$;

create or replace function public.crm_apply_phone_fields()
returns trigger
language plpgsql
as $$
declare
  v_parts record;
begin
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');

  select *
  into v_parts
  from public.crm_phone_parts(
    new.phone,
    new.phone_country_code,
    new.phone_national_number,
    new.phone_e164
  );

  new.phone_country_code := v_parts.phone_country_code;
  new.phone_national_number := v_parts.phone_national_number;
  new.phone_e164 := v_parts.phone_e164;

  return new;
end;
$$;

drop trigger if exists profiles_apply_phone_fields on public.profiles;
create trigger profiles_apply_phone_fields
before insert or update of phone, phone_country_code, phone_national_number, phone_e164
on public.profiles
for each row
execute function public.crm_apply_phone_fields();

drop trigger if exists crm_leads_apply_phone_fields on public.crm_leads;
create trigger crm_leads_apply_phone_fields
before insert or update of phone, phone_country_code, phone_national_number, phone_e164
on public.crm_leads
for each row
execute function public.crm_apply_phone_fields();

update public.profiles as profile
set phone_country_code = parts.phone_country_code,
    phone_national_number = parts.phone_national_number,
    phone_e164 = parts.phone_e164
from (
  select
    source_profile.id,
    parts.phone_country_code,
    parts.phone_national_number,
    parts.phone_e164
  from public.profiles as source_profile
  cross join lateral public.crm_phone_parts(
    source_profile.phone,
    source_profile.phone_country_code,
    source_profile.phone_national_number,
    source_profile.phone_e164
  ) as parts
) as parts
where profile.id = parts.id
  and (
    profile.phone is not null
    or profile.phone_country_code is not null
    or profile.phone_national_number is not null
    or profile.phone_e164 is not null
  );

update public.crm_leads as lead
set phone_country_code = parts.phone_country_code,
    phone_national_number = parts.phone_national_number,
    phone_e164 = parts.phone_e164
from (
  select
    source_lead.id,
    parts.phone_country_code,
    parts.phone_national_number,
    parts.phone_e164
  from public.crm_leads as source_lead
  cross join lateral public.crm_phone_parts(
    source_lead.phone,
    source_lead.phone_country_code,
    source_lead.phone_national_number,
    source_lead.phone_e164
  ) as parts
) as parts
where lead.id = parts.id
  and (
    lead.phone is not null
    or lead.phone_country_code is not null
    or lead.phone_national_number is not null
    or lead.phone_e164 is not null
  );

create or replace function public.crm_can_delete_lead(p_actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles admin_profile
    where admin_profile.id = p_actor_user_id
  )
  or exists (
    select 1
    from public.crm_user_roles role
    where role.user_id = p_actor_user_id
      and role.is_active = true
      and role.role in ('crm_admin', 'crm_operator')
  )
$$;

create or replace function public.crm_capture_deleted_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_text text := nullif(current_setting('crm.delete_actor_user_id', true), '');
  v_actor_user_id uuid := case when v_actor_text is null then auth.uid() else v_actor_text::uuid end;
  v_reason text := coalesce(nullif(current_setting('crm.delete_reason', true), ''), 'deleted');
  v_snapshot jsonb := '{}'::jsonb;
begin
  select jsonb_build_object(
    'lead', to_jsonb(old),
    'interactions', coalesce((
      select jsonb_agg(to_jsonb(interaction_row) order by interaction_row.created_at desc)
      from public.crm_interactions interaction_row
      where interaction_row.lead_id = old.id
    ), '[]'::jsonb),
    'stage_history', coalesce((
      select jsonb_agg(to_jsonb(history_row) order by history_row.created_at desc)
      from public.crm_stage_history history_row
      where history_row.lead_id = old.id
    ), '[]'::jsonb),
    'automation_jobs', coalesce((
      select jsonb_agg(to_jsonb(job_row) order by job_row.created_at desc)
      from public.crm_automation_jobs job_row
      where job_row.lead_id = old.id
    ), '[]'::jsonb)
  )
  into v_snapshot;

  insert into public.crm_deleted_leads (
    original_lead_id,
    source_type,
    source_origin,
    user_id,
    pre_enrollment_id,
    email,
    full_name,
    phone,
    phone_country_code,
    phone_national_number,
    phone_e164,
    lead_status,
    deleted_at,
    deleted_by_user_id,
    delete_reason,
    snapshot
  )
  values (
    old.id,
    old.source_type,
    old.source_origin,
    old.user_id,
    old.pre_enrollment_id,
    old.email,
    old.full_name,
    old.phone,
    old.phone_country_code,
    old.phone_national_number,
    old.phone_e164,
    old.lead_status,
    now(),
    v_actor_user_id,
    v_reason,
    v_snapshot
  )
  on conflict (original_lead_id) do update
    set deleted_at = excluded.deleted_at,
        deleted_by_user_id = coalesce(excluded.deleted_by_user_id, public.crm_deleted_leads.deleted_by_user_id),
        delete_reason = coalesce(excluded.delete_reason, public.crm_deleted_leads.delete_reason),
        snapshot = excluded.snapshot;

  return old;
end;
$$;

drop trigger if exists crm_leads_capture_deleted_lead on public.crm_leads;
create trigger crm_leads_capture_deleted_lead
before delete
on public.crm_leads
for each row
execute function public.crm_capture_deleted_lead();

create or replace function public.crm_hard_delete_lead(
  p_lead_id uuid,
  p_actor_user_id uuid default null,
  p_reason text default null
)
returns public.crm_deleted_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_actor uuid := coalesce(p_actor_user_id, auth.uid());
  v_deleted public.crm_deleted_leads%rowtype;
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'deleted');
begin
  if p_lead_id is null then
    raise exception 'CRM lead delete requires a lead id';
  end if;

  if v_effective_actor is not null and not public.crm_can_delete_lead(v_effective_actor) then
    raise exception 'CRM lead delete denied';
  end if;

  perform set_config('crm.delete_actor_user_id', coalesce(v_effective_actor::text, ''), true);
  perform set_config('crm.delete_reason', v_reason, true);

  delete from public.crm_leads
  where id = p_lead_id;

  select *
  into v_deleted
  from public.crm_deleted_leads
  where original_lead_id = p_lead_id;

  if not found then
    return null;
  end if;

  return v_deleted;
end;
$$;

create or replace function public.crm_upsert_lead_from_pre_enrollment(
  p_pre_enrollment_id uuid,
  p_reason text default 'pre_enrollment_sync',
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pre record;
  v_existing public.crm_leads%rowtype;
  v_stage_key text;
  v_stage_id uuid;
  v_target_stage_id uuid;
  v_target_status text;
  v_now timestamptz := now();
  v_lead_id uuid;
  v_billing_month date;
  v_revenue_soles int := 0;
  v_payment_count int := 0;
  v_latest_payment_at timestamptz := null;
  v_approved_at timestamptz := null;
  v_lost_at timestamptz := null;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'pre_enrollment_sync');
  v_source_metadata jsonb := '{}'::jsonb;
begin
  select
    pe.*,
    pr.email as profile_email,
    pr.full_name as profile_full_name,
    pr.phone as profile_phone,
    pr.phone_country_code as profile_phone_country_code,
    pr.phone_national_number as profile_phone_national_number,
    pr.phone_e164 as profile_phone_e164
  into v_pre
  from public.pre_enrollments pe
  left join public.profiles pr on pr.id = pe.user_id
  where pe.id = p_pre_enrollment_id;

  if not found then
    return null;
  end if;

  v_stage_key := public.crm_stage_key_for_pre_enrollment_status(v_pre.status);

  select id
  into v_stage_id
  from public.crm_stages
  where stage_key = v_stage_key
    and is_active = true
  limit 1;

  select
    snapshot.billing_month,
    snapshot.approved_revenue_soles,
    snapshot.approved_payment_count,
    snapshot.latest_approved_payment_at
  into
    v_billing_month,
    v_revenue_soles,
    v_payment_count,
    v_latest_payment_at
  from public.crm_approved_revenue_snapshot(p_pre_enrollment_id) as snapshot;

  if upper(coalesce(v_pre.status, '')) = 'APPROVED' then
    v_approved_at := coalesce(v_pre.reviewed_at, v_now);
  end if;

  select *
  into v_existing
  from public.crm_leads
  where pre_enrollment_id = p_pre_enrollment_id
  for update;

  v_source_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'source_origin', 'pre_enrollment',
      'source_type', 'classroom_pre_enrollment',
      'source_label', 'Classroom',
      'pre_enrollment_id', p_pre_enrollment_id,
      'pre_enrollment_status', v_pre.status,
      'pre_enrollment_step', v_pre.step,
      'selected_level', v_pre.selected_level,
      'selected_frequency', v_pre.selected_frequency,
      'selected_start_time', v_pre.selected_start_time,
      'selected_course_type', v_pre.selected_course_type,
      'start_month', v_pre.start_month,
      'selected_course_id', v_pre.selected_course_id,
      'selected_schedule_id', v_pre.selected_schedule_id,
      'modality', v_pre.modality,
      'price_total', v_pre.price_total,
      'reservation_expires_at', v_pre.reservation_expires_at,
      'terms_accepted_at', v_pre.terms_accepted_at,
      'payment_method', v_pre.payment_method,
      'payment_proof_url', v_pre.payment_proof_url,
      'payment_proof_meta', v_pre.payment_proof_meta,
      'payment_submitted_at', v_pre.payment_submitted_at,
      'mp_payment_id', v_pre.mp_payment_id,
      'mp_status', v_pre.mp_status,
      'reviewed_by', v_pre.reviewed_by,
      'reviewed_at', v_pre.reviewed_at,
      'review_notes', v_pre.review_notes,
      'student_code', v_pre.student_code,
      'period', v_pre.period,
      'profile_email', v_pre.profile_email,
      'profile_full_name', v_pre.profile_full_name,
      'profile_phone', v_pre.profile_phone,
      'profile_phone_country_code', v_pre.profile_phone_country_code,
      'profile_phone_national_number', v_pre.profile_phone_national_number,
      'profile_phone_e164', v_pre.profile_phone_e164
    )
  );

  if found then
    v_target_stage_id := coalesce(v_stage_id, v_existing.current_stage_id);
    v_target_status := coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open');

    if v_existing.archived_at is not null then
      v_target_status := 'archived';
    end if;

    update public.crm_leads
    set source_origin = 'pre_enrollment',
        source_type = 'classroom_pre_enrollment',
        source_label = coalesce(v_existing.source_label, 'Classroom'),
        user_id = v_pre.user_id,
        email = coalesce(v_pre.profile_email, v_existing.email),
        full_name = coalesce(v_pre.profile_full_name, v_existing.full_name),
        phone = coalesce(v_pre.profile_phone, v_existing.phone),
        phone_country_code = coalesce(v_pre.profile_phone_country_code, v_existing.phone_country_code),
        phone_national_number = coalesce(v_pre.profile_phone_national_number, v_existing.phone_national_number),
        phone_e164 = coalesce(v_pre.profile_phone_e164, v_existing.phone_e164),
        source_metadata = coalesce(v_existing.source_metadata, '{}'::jsonb) || v_source_metadata,
        current_stage_id = case
          when v_existing.archived_at is not null then v_existing.current_stage_id
          else coalesce(v_target_stage_id, v_existing.current_stage_id)
        end,
        lead_status = case
          when v_existing.archived_at is not null then 'archived'
          else v_target_status
        end,
        current_pre_enrollment_status = v_pre.status,
        approved_revenue_billing_month = v_billing_month,
        approved_revenue_soles = coalesce(v_revenue_soles, 0),
        approved_payment_count = coalesce(v_payment_count, 0),
        latest_approved_payment_at = v_latest_payment_at,
        approved_pre_enrollment_at = coalesce(v_existing.approved_pre_enrollment_at, v_approved_at),
        won_at = case
          when v_existing.archived_at is not null then v_existing.won_at
          when v_target_status = 'won' then coalesce(v_existing.won_at, v_approved_at, v_now)
          else v_existing.won_at
        end,
        lost_at = case
          when v_existing.archived_at is not null then v_existing.lost_at
          when v_target_status = 'lost' then coalesce(v_existing.lost_at, v_now)
          else v_existing.lost_at
        end,
        archived_at = v_existing.archived_at,
        archived_by_user_id = v_existing.archived_by_user_id,
        archive_reason = v_existing.archive_reason,
        last_synced_at = v_now,
        updated_at = v_now
    where id = v_existing.id
    returning id into v_lead_id;

    if v_existing.current_stage_id is distinct from v_target_stage_id
       and v_target_stage_id is not null
       and v_existing.archived_at is null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        v_existing.current_stage_id,
        v_target_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status,
          'source_origin', 'pre_enrollment'
        ),
        v_now
      );
    end if;
  else
    insert into public.crm_leads (
      source_type,
      source_label,
      source_origin,
      source_metadata,
      user_id,
      pre_enrollment_id,
      email,
      full_name,
      phone,
      phone_country_code,
      phone_national_number,
      phone_e164,
      current_stage_id,
      lead_status,
      current_pre_enrollment_status,
      approved_revenue_billing_month,
      approved_revenue_soles,
      approved_payment_count,
      latest_approved_payment_at,
      approved_pre_enrollment_at,
      won_at,
      lost_at,
      archived_at,
      archived_by_user_id,
      archive_reason,
      last_synced_at
    )
    values (
      'classroom_pre_enrollment',
      'Classroom',
      'pre_enrollment',
      v_source_metadata,
      v_pre.user_id,
      p_pre_enrollment_id,
      v_pre.profile_email,
      v_pre.profile_full_name,
      v_pre.profile_phone,
      v_pre.profile_phone_country_code,
      v_pre.profile_phone_national_number,
      v_pre.profile_phone_e164,
      v_stage_id,
      coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open'),
      v_pre.status,
      v_billing_month,
      coalesce(v_revenue_soles, 0),
      coalesce(v_payment_count, 0),
      v_latest_payment_at,
      v_approved_at,
      v_now,
      v_lost_at,
      null,
      null,
      null,
      v_now
    )
    returning id into v_lead_id;

    if v_stage_id is not null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        null,
        v_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status,
          'source_origin', 'pre_enrollment'
        ),
        v_now
      );
    end if;
  end if;

  return v_lead_id;
end;
$$;


create table if not exists public.crm_lead_source_tags (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.crm_leads (id) on delete cascade,
  source_key text not null,
  source_origin text not null,
  source_type text,
  source_label text,
  source_provider text,
  source_event_id text,
  source_metadata jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  occurrence_count int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_lead_source_tags_occurrence_positive check (occurrence_count > 0)
);

create unique index if not exists crm_lead_source_tags_lead_key_idx
  on public.crm_lead_source_tags (lead_id, source_key);

create index if not exists crm_lead_source_tags_lead_idx
  on public.crm_lead_source_tags (lead_id, last_seen_at desc);

create index if not exists crm_lead_source_tags_origin_idx
  on public.crm_lead_source_tags (source_origin, source_type);

alter table public.crm_lead_source_tags enable row level security;

drop policy if exists "CRM lead source tags read" on public.crm_lead_source_tags;
create policy "CRM lead source tags read" on public.crm_lead_source_tags
  for select using (public.has_crm_access());

drop policy if exists "CRM lead source tags manage" on public.crm_lead_source_tags;
create policy "CRM lead source tags manage" on public.crm_lead_source_tags
  for all using (public.has_crm_manage_access()) with check (public.has_crm_manage_access());

create or replace function public.crm_normalize_lead_source_origin(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(nullif(btrim(coalesce(p_value, '')), '')) in ('classroom_pre_enrollment', 'registration') then 'pre_enrollment'
    when lower(nullif(btrim(coalesce(p_value, '')), '')) = 'meta_lead_ad' then 'meta'
    when lower(nullif(btrim(coalesce(p_value, '')), '')) in ('meta', 'formspree', 'pre_enrollment', 'manual', 'other') then lower(nullif(btrim(coalesce(p_value, '')), ''))
    when lower(nullif(btrim(coalesce(p_value, '')), '')) is null then null
    else 'other'
  end
$$;

create or replace function public.crm_build_lead_source_key(
  p_source_origin text,
  p_source_type text default null,
  p_source_provider text default null,
  p_source_label text default null
)
returns text
language sql
immutable
set search_path = public
as $$
  select concat_ws(
    ':',
    coalesce(public.crm_normalize_lead_source_origin(p_source_origin), 'other'),
    coalesce(nullif(lower(btrim(coalesce(p_source_type, ''))), ''), 'unknown'),
    coalesce(nullif(lower(btrim(coalesce(p_source_provider, ''))), ''), 'unknown')
  )
$$;

create or replace function public.crm_upsert_lead_source_tag(
  p_lead_id uuid,
  p_source_origin text,
  p_source_type text default null,
  p_source_label text default null,
  p_source_provider text default null,
  p_source_event_id text default null,
  p_source_metadata jsonb default '{}'::jsonb,
  p_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_origin text := coalesce(public.crm_normalize_lead_source_origin(p_source_origin), 'other');
  v_source_type text := nullif(btrim(coalesce(p_source_type, '')), '');
  v_source_label text := nullif(btrim(coalesce(p_source_label, '')), '');
  v_source_provider text := nullif(btrim(coalesce(p_source_provider, '')), '');
  v_source_event_id text := nullif(btrim(coalesce(p_source_event_id, '')), '');
  v_source_key text := public.crm_build_lead_source_key(v_source_origin, v_source_type, v_source_provider, v_source_label);
  v_now timestamptz := now();
  v_existing public.crm_lead_source_tags%rowtype;
  v_tag_count int := 0;
  v_tag_id uuid;
begin
  if p_lead_id is null then
    raise exception 'CRM lead source tag requires a lead id';
  end if;

  select *
  into v_existing
  from public.crm_lead_source_tags
  where lead_id = p_lead_id
    and source_key = v_source_key
  for update;

  if found then
    update public.crm_lead_source_tags
    set source_origin = v_source_origin,
        source_type = coalesce(v_source_type, source_type),
        source_label = coalesce(v_source_label, source_label),
        source_provider = coalesce(v_source_provider, source_provider),
        source_event_id = coalesce(v_source_event_id, source_event_id),
        source_metadata = coalesce(v_existing.source_metadata, '{}'::jsonb) || coalesce(p_source_metadata, '{}'::jsonb),
        is_primary = case when p_is_primary then true else v_existing.is_primary end,
        occurrence_count = v_existing.occurrence_count + 1,
        last_seen_at = v_now,
        updated_at = v_now
    where id = v_existing.id
    returning id into v_tag_id;

    if p_is_primary then
      update public.crm_lead_source_tags
      set is_primary = false,
          updated_at = v_now
      where lead_id = p_lead_id
        and id <> v_tag_id;
    end if;

    return v_tag_id;
  end if;

  select count(*) into v_tag_count
  from public.crm_lead_source_tags
  where lead_id = p_lead_id;

  if v_tag_count >= 3 then
    return null;
  end if;

  if p_is_primary then
    update public.crm_lead_source_tags
    set is_primary = false,
        updated_at = v_now
    where lead_id = p_lead_id;
  end if;

  insert into public.crm_lead_source_tags (
    lead_id,
    source_key,
    source_origin,
    source_type,
    source_label,
    source_provider,
    source_event_id,
    source_metadata,
    is_primary,
    occurrence_count,
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  )
  values (
    p_lead_id,
    v_source_key,
    v_source_origin,
    v_source_type,
    v_source_label,
    v_source_provider,
    v_source_event_id,
    coalesce(p_source_metadata, '{}'::jsonb),
    coalesce(p_is_primary, false),
    1,
    v_now,
    v_now,
    v_now,
    v_now
  )
  returning id into v_tag_id;

  return v_tag_id;
end;
$$;

create or replace function public.crm_find_lead_by_phone(p_phone text)
returns uuid
language sql
stable
set search_path = public
as $$
  select id
  from public.crm_leads
  where coalesce(phone_e164, phone) = public.crm_normalize_phone_e164(p_phone)
     or phone = public.crm_normalize_phone_e164(p_phone)
  order by case when lead_status = 'open' then 0 else 1 end, updated_at desc
  limit 1
$$;

update public.crm_leads
set source_origin = coalesce(source_origin, public.crm_normalize_lead_source_origin(source_type)),
    source_type = coalesce(source_type, case
      when source_origin = 'pre_enrollment' then 'classroom_pre_enrollment'
      when source_origin = 'meta' then 'meta_lead_ad'
      when source_origin = 'formspree' then 'formspree'
      else null
    end),
    source_label = coalesce(source_label, case
      when source_origin = 'pre_enrollment' then 'Classroom'
      when source_origin = 'meta' then 'Meta'
      when source_origin = 'formspree' then 'Formspree'
      else null
    end)
where source_origin is not null
   or source_type is not null;

insert into public.crm_lead_source_tags (
  lead_id,
  source_key,
  source_origin,
  source_type,
  source_label,
  source_provider,
  source_event_id,
  source_metadata,
  is_primary,
  occurrence_count,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
)
select
  lead.id,
  public.crm_build_lead_source_key(
    coalesce(lead.source_origin, public.crm_normalize_lead_source_origin(lead.source_type)),
    lead.source_type,
    coalesce(
      nullif(lead.source_metadata ->> 'source_provider', ''),
      nullif(lead.source_metadata ->> 'provider', ''),
      nullif(lead.source_metadata ->> 'source', '')
    ),
    lead.source_label
  ),
  coalesce(public.crm_normalize_lead_source_origin(lead.source_origin), public.crm_normalize_lead_source_origin(lead.source_type), 'other'),
  lead.source_type,
  lead.source_label,
  coalesce(
    nullif(lead.source_metadata ->> 'source_provider', ''),
    nullif(lead.source_metadata ->> 'provider', ''),
    nullif(lead.source_metadata ->> 'source', '')
  ),
  coalesce(
    nullif(lead.source_metadata ->> 'source_event_id', ''),
    nullif(lead.source_metadata ->> 'event_id', ''),
    nullif(lead.source_metadata ->> 'leadgen_id', ''),
    nullif(lead.source_metadata ->> 'submission_id', '')
  ),
  coalesce(lead.source_metadata, '{}'::jsonb),
  true,
  1,
  coalesce(lead.created_at, now()),
  coalesce(lead.updated_at, now()),
  coalesce(lead.created_at, now()),
  coalesce(lead.updated_at, now())
from public.crm_leads lead
where lead.source_origin is not null
   or lead.source_type is not null
on conflict (lead_id, source_key) do nothing;

create or replace function public.crm_claim_next_lead(
  p_operator_user_id uuid default null,
  p_claim_timeout_seconds int default 900,
  p_campaign_key text default null,
  p_stage_id uuid default null,
  p_stage_key text default null,
  p_stage_keys text[] default null,
  p_source_type text default null,
  p_source_types text[] default null,
  p_source_origin text default null,
  p_source_origins text[] default null
)
returns setof public.crm_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_operator uuid := coalesce(p_operator_user_id, auth.uid());
  v_claim_timeout int := greatest(60, least(coalesce(p_claim_timeout_seconds, 900), 3600));
  v_claimed_id uuid;
begin
  if v_effective_operator is null then
    raise exception 'CRM queue claim requires an operator user id';
  end if;

  if auth.uid() is not null
     and auth.uid() <> v_effective_operator
     and not public.has_crm_manage_access()
     and not public.is_admin() then
    raise exception 'CRM queue claim denied for a different operator';
  end if;

  if not public.has_crm_access() and auth.uid() is not null then
    raise exception 'CRM access denied';
  end if;

  with candidate as (
    select lead.id
    from public.crm_leads lead
    where lead.lead_status = 'open'
      and not exists (
        select 1
        from public.crm_stages stage
        where stage.id = lead.current_stage_id
          and (
            coalesce(stage.is_won, false) = true
            or coalesce(stage.is_lost, false) = true
          )
      )
      and (
        p_stage_id is null
        or lead.current_stage_id = p_stage_id
      )
      and (
        p_stage_key is null
        or exists (
          select 1
          from public.crm_stages stage_filter
          where stage_filter.id = lead.current_stage_id
            and stage_filter.stage_key = p_stage_key
        )
      )
      and (
        p_stage_keys is null
        or exists (
          select 1
          from public.crm_stages stage_filter
          where stage_filter.id = lead.current_stage_id
            and stage_filter.stage_key = any(p_stage_keys)
        )
      )
      and (
        p_source_type is null
        or lead.source_type = p_source_type
      )
      and (
        p_source_types is null
        or lead.source_type = any(p_source_types)
      )
      and (
        p_source_origin is null
        or lead.source_origin = p_source_origin
      )
      and (
        p_source_origins is null
        or lead.source_origin = any(p_source_origins)
      )
      and (
        lead.queue_claimed_by_user_id is null
        or lead.queue_claimed_by_user_id = v_effective_operator
        or lead.queue_claim_expires_at is null
        or lead.queue_claim_expires_at <= now()
      )
      and (
        lead.next_action_at is null
        or lead.next_action_at <= now()
      )
    order by
      case when lead.next_action_at is not null then 0 else 1 end,
      lead.next_action_at asc nulls last,
      lead.last_interaction_at asc nulls first,
      lead.created_at asc
    for update of lead skip locked
    limit 1
  )
  update public.crm_leads as target
  set queue_claimed_by_user_id = v_effective_operator,
      queue_claimed_at = now(),
      queue_claim_expires_at = now() + make_interval(secs => v_claim_timeout),
      updated_at = now()
  from candidate
  where target.id = candidate.id
  returning target.id into v_claimed_id;

  if v_claimed_id is null then
    return;
  end if;

  return query
  select *
  from public.crm_leads
  where id = v_claimed_id;
end;
$$;

create or replace function public.crm_upsert_lead_from_pre_enrollment(
  p_pre_enrollment_id uuid,
  p_reason text default 'pre_enrollment_sync',
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pre record;
  v_existing public.crm_leads%rowtype;
  v_stage_key text;
  v_stage_id uuid;
  v_target_stage_id uuid;
  v_target_status text;
  v_now timestamptz := now();
  v_lead_id uuid;
  v_billing_month date;
  v_revenue_soles int := 0;
  v_payment_count int := 0;
  v_latest_payment_at timestamptz := null;
  v_approved_at timestamptz := null;
  v_lost_at timestamptz := null;
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'pre_enrollment_sync');
  v_source_metadata jsonb := '{}'::jsonb;
  v_phone_e164 text := null;
begin
  select
    pe.*,
    pr.email as profile_email,
    pr.full_name as profile_full_name,
    pr.phone as profile_phone,
    pr.phone_country_code as profile_phone_country_code,
    pr.phone_national_number as profile_phone_national_number,
    pr.phone_e164 as profile_phone_e164
  into v_pre
  from public.pre_enrollments pe
  left join public.profiles pr on pr.id = pe.user_id
  where pe.id = p_pre_enrollment_id;

  if not found then
    return null;
  end if;

  v_stage_key := public.crm_stage_key_for_pre_enrollment_status(v_pre.status);

  select id
  into v_stage_id
  from public.crm_stages
  where stage_key = v_stage_key
    and is_active = true
  limit 1;

  select
    snapshot.billing_month,
    snapshot.approved_revenue_soles,
    snapshot.approved_payment_count,
    snapshot.latest_approved_payment_at
  into
    v_billing_month,
    v_revenue_soles,
    v_payment_count,
    v_latest_payment_at
  from public.crm_approved_revenue_snapshot(p_pre_enrollment_id) as snapshot;

  if upper(coalesce(v_pre.status, '')) = 'APPROVED' then
    v_approved_at := coalesce(v_pre.reviewed_at, v_now);
  end if;

  v_phone_e164 := coalesce(v_pre.profile_phone_e164, public.crm_normalize_phone_e164(v_pre.profile_phone));

  select *
  into v_existing
  from public.crm_leads
  where pre_enrollment_id = p_pre_enrollment_id
     or (
       v_phone_e164 is not null
       and (phone_e164 = v_phone_e164 or phone = v_phone_e164)
     )
  order by
    case when pre_enrollment_id = p_pre_enrollment_id then 0 else 1 end,
    case when lead_status = 'open' then 0 else 1 end,
    updated_at desc
  limit 1
  for update;

  v_source_metadata := jsonb_strip_nulls(
    jsonb_build_object(
      'source_origin', 'pre_enrollment',
      'source_type', 'classroom_pre_enrollment',
      'source_label', 'Classroom',
      'pre_enrollment_id', p_pre_enrollment_id,
      'pre_enrollment_status', v_pre.status,
      'pre_enrollment_step', v_pre.step,
      'selected_level', v_pre.selected_level,
      'selected_frequency', v_pre.selected_frequency,
      'selected_start_time', v_pre.selected_start_time,
      'selected_course_type', v_pre.selected_course_type,
      'start_month', v_pre.start_month,
      'selected_course_id', v_pre.selected_course_id,
      'selected_schedule_id', v_pre.selected_schedule_id,
      'modality', v_pre.modality,
      'price_total', v_pre.price_total,
      'reservation_expires_at', v_pre.reservation_expires_at,
      'terms_accepted_at', v_pre.terms_accepted_at,
      'payment_method', v_pre.payment_method,
      'payment_proof_url', v_pre.payment_proof_url,
      'payment_proof_meta', v_pre.payment_proof_meta,
      'payment_submitted_at', v_pre.payment_submitted_at,
      'mp_payment_id', v_pre.mp_payment_id,
      'mp_status', v_pre.mp_status,
      'reviewed_by', v_pre.reviewed_by,
      'reviewed_at', v_pre.reviewed_at,
      'review_notes', v_pre.review_notes,
      'student_code', v_pre.student_code,
      'period', v_pre.period,
      'profile_email', v_pre.profile_email,
      'profile_full_name', v_pre.profile_full_name,
      'profile_phone', v_pre.profile_phone,
      'profile_phone_country_code', v_pre.profile_phone_country_code,
      'profile_phone_national_number', v_pre.profile_phone_national_number,
      'profile_phone_e164', v_pre.profile_phone_e164
    )
  );

  if found then
    v_target_stage_id := coalesce(v_stage_id, v_existing.current_stage_id);
    v_target_status := coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open');

    if v_existing.archived_at is not null then
      v_target_status := 'archived';
    end if;

    update public.crm_leads
    set source_origin = coalesce(v_existing.source_origin, 'pre_enrollment'),
        source_type = coalesce(v_existing.source_type, 'classroom_pre_enrollment'),
        source_label = coalesce(v_existing.source_label, 'Classroom'),
        user_id = coalesce(v_existing.user_id, v_pre.user_id),
        email = coalesce(v_existing.email, v_pre.profile_email),
        full_name = coalesce(v_existing.full_name, v_pre.profile_full_name),
        phone = coalesce(v_existing.phone, v_pre.profile_phone, v_phone_e164),
        phone_country_code = coalesce(v_existing.phone_country_code, v_pre.profile_phone_country_code),
        phone_national_number = coalesce(v_existing.phone_national_number, v_pre.profile_phone_national_number),
        phone_e164 = coalesce(v_existing.phone_e164, v_pre.profile_phone_e164, v_phone_e164),
        source_metadata = coalesce(v_existing.source_metadata, v_source_metadata),
        current_stage_id = case
          when v_existing.archived_at is not null then v_existing.current_stage_id
          else coalesce(v_target_stage_id, v_existing.current_stage_id)
        end,
        lead_status = case
          when v_existing.archived_at is not null then 'archived'
          else v_target_status
        end,
        current_pre_enrollment_status = v_pre.status,
        approved_revenue_billing_month = v_billing_month,
        approved_revenue_soles = coalesce(v_revenue_soles, 0),
        approved_payment_count = coalesce(v_payment_count, 0),
        latest_approved_payment_at = v_latest_payment_at,
        approved_pre_enrollment_at = coalesce(v_existing.approved_pre_enrollment_at, v_approved_at),
        won_at = case
          when v_existing.archived_at is not null then v_existing.won_at
          when v_target_status = 'won' then coalesce(v_existing.won_at, v_approved_at, v_now)
          else v_existing.won_at
        end,
        lost_at = case
          when v_existing.archived_at is not null then v_existing.lost_at
          when v_target_status = 'lost' then coalesce(v_existing.lost_at, v_now)
          else v_existing.lost_at
        end,
        archived_at = v_existing.archived_at,
        archived_by_user_id = v_existing.archived_by_user_id,
        archive_reason = v_existing.archive_reason,
        last_synced_at = v_now,
        updated_at = v_now
    where id = v_existing.id
    returning id into v_lead_id;

    perform public.crm_upsert_lead_source_tag(
      v_lead_id,
      'pre_enrollment',
      'classroom_pre_enrollment',
      'Classroom',
      null,
      null,
      v_source_metadata,
      false
    );

    if v_existing.current_stage_id is distinct from v_target_stage_id
       and v_target_stage_id is not null
       and v_existing.archived_at is null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        v_existing.current_stage_id,
        v_target_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status,
          'source_origin', 'pre_enrollment'
        ),
        v_now
      );
    end if;
  else
    insert into public.crm_leads (
      source_type,
      source_label,
      source_origin,
      source_metadata,
      user_id,
      pre_enrollment_id,
      email,
      full_name,
      phone,
      phone_country_code,
      phone_national_number,
      phone_e164,
      current_stage_id,
      lead_status,
      current_pre_enrollment_status,
      approved_revenue_billing_month,
      approved_revenue_soles,
      approved_payment_count,
      latest_approved_payment_at,
      approved_pre_enrollment_at,
      won_at,
      lost_at,
      archived_at,
      archived_by_user_id,
      archive_reason,
      last_synced_at
    )
    values (
      'classroom_pre_enrollment',
      'Classroom',
      'pre_enrollment',
      v_source_metadata,
      v_pre.user_id,
      p_pre_enrollment_id,
      v_pre.profile_email,
      v_pre.profile_full_name,
      v_pre.profile_phone,
      v_pre.profile_phone_country_code,
      v_pre.profile_phone_national_number,
      v_pre.profile_phone_e164,
      v_stage_id,
      coalesce(public.crm_lead_status_for_stage_key(v_stage_key), 'open'),
      v_pre.status,
      v_billing_month,
      coalesce(v_revenue_soles, 0),
      coalesce(v_payment_count, 0),
      v_latest_payment_at,
      v_approved_at,
      v_now,
      v_lost_at,
      null,
      null,
      null,
      v_now
    )
    returning id into v_lead_id;

    perform public.crm_upsert_lead_source_tag(
      v_lead_id,
      'pre_enrollment',
      'classroom_pre_enrollment',
      'Classroom',
      null,
      null,
      v_source_metadata,
      true
    );

    if v_stage_id is not null then
      insert into public.crm_stage_history (
        lead_id,
        from_stage_id,
        to_stage_id,
        changed_by_user_id,
        reason,
        metadata,
        created_at
      )
      values (
        v_lead_id,
        null,
        v_stage_id,
        p_actor_user_id,
        v_reason,
        jsonb_build_object(
          'pre_enrollment_id', p_pre_enrollment_id,
          'pre_enrollment_status', v_pre.status,
          'source_origin', 'pre_enrollment'
        ),
        v_now
      );
    end if;
  end if;

  return v_lead_id;
end;
$$;
