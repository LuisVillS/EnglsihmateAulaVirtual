-- Indexes added from query-pattern audit on 2026-03-19.
-- Focus areas:
-- 1. student/admin listings and search on profiles
-- 2. commission-based student lookups
-- 3. latest pre-enrollment lookups per user

create extension if not exists "pg_trgm";

create index if not exists profiles_commission_idx
  on public.profiles (commission_id)
  where commission_id is not null;

create index if not exists profiles_course_level_created_idx
  on public.profiles (course_level, created_at desc)
  where course_level is not null;

create index if not exists profiles_preferred_hour_created_idx
  on public.profiles (preferred_hour, created_at desc)
  where preferred_hour is not null;

create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);

create index if not exists profiles_full_name_trgm_idx
  on public.profiles using gin (full_name gin_trgm_ops);

create index if not exists profiles_email_trgm_idx
  on public.profiles using gin (email gin_trgm_ops);

create index if not exists profiles_dni_trgm_idx
  on public.profiles using gin (dni gin_trgm_ops)
  where dni is not null;

create index if not exists profiles_student_code_trgm_idx
  on public.profiles using gin (student_code gin_trgm_ops)
  where student_code is not null;

create index if not exists pre_enrollments_user_created_idx
  on public.pre_enrollments (user_id, created_at desc);
