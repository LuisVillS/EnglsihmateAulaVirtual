-- Teacher dashboard: manual skill is Speaking (Listening remains auto-calculated from exercises).
alter table public.student_skill_overrides
  add column if not exists speaking_value_0_100 numeric(5, 2);

update public.student_skill_overrides
set speaking_value_0_100 = listening_value_0_100
where speaking_value_0_100 is null
  and listening_value_0_100 is not null;

alter table public.student_skill_overrides
  alter column listening_value_0_100 drop not null;

alter table public.student_skill_overrides
  drop constraint if exists student_skill_overrides_speaking_check;

alter table public.student_skill_overrides
  add constraint student_skill_overrides_speaking_check
    check (speaking_value_0_100 is null or (speaking_value_0_100 >= 0 and speaking_value_0_100 <= 100));

comment on column public.student_skill_overrides.speaking_value_0_100
  is 'Manual speaking score (0-100) set by admin/teacher.';

comment on column public.student_skill_overrides.listening_value_0_100
  is 'Deprecated legacy column. Listening is now auto-calculated from exercises.';
